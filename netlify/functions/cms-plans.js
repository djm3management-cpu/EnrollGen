// Netlify Function: /api/cms-plans?zip=33601
// Queries your plan database (Supabase example below)

import { createClient } from "@supabase/supabase-js";
import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function getSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export default async (req) => {
  const auth = await requireClerkAuth(req);
  if (auth.response) {
    return auth.response;
  }

  const url = new URL(req.url);
  const zip = url.searchParams.get("zip");

  if (!zip || !/^\d{5}$/.test(zip)) {
    return json(400, { error: "Valid 5-digit zip required" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (error) {
    console.error("cms-plans configuration error:", error);
    return json(500, {
      error: "Server configuration error",
      detail: "Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify environment variables.",
    });
  }

  // Lookup county FIPS from zip (use the zip_county table)
  const { data: zipData, error: zipError } = await supabase
    .from("zip_county")
    .select("county_fips, state")
    .eq("zip", zip)
    .limit(1)
    .single();

  if (zipError && zipError.code !== "PGRST116") {
    console.error("cms-plans zip lookup failed:", zipError);
    return json(502, { error: "Plan lookup failed" });
  }

  if (!zipData) {
    return json(404, { error: "Zip not found", zip });
  }

  // Get plans available in this county
  const { data: plans, error: plansError } = await supabase
    .from("ma_plans")
    .select("*")
    .eq("county_fips", zipData.county_fips)
    .order("premium", { ascending: true });

  if (plansError) {
    console.error("cms-plans plan lookup failed:", plansError);
    return json(502, { error: "Plan lookup failed" });
  }

  return new Response(
    JSON.stringify({
      source: "cms-database",
      zip,
      state: zipData.state,
      county_fips: zipData.county_fips,
      plans: plans || [],
      count: plans?.length || 0,
    }),
    {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
};

export const config = { path: "/api/cms-plans" };
