// Netlify Function: /api/cms-plans?zip=33601
// Queries your plan database (Supabase example below)

import { createClient } from "@supabase/supabase-js";
import { requireClerkAuth } from "./_clerkAuth.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async (req) => {
  const auth = await requireClerkAuth(req);
  if (auth.response) {
    return auth.response;
  }

  const url = new URL(req.url);
  const zip = url.searchParams.get("zip");

  if (!zip || !/^\d{5}$/.test(zip)) {
    return new Response(
      JSON.stringify({ error: "Valid 5-digit zip required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Lookup county FIPS from zip (use the zip_county table)
  const { data: zipData } = await supabase
    .from("zip_county")
    .select("county_fips, state")
    .eq("zip", zip)
    .limit(1)
    .single();

  if (!zipData) {
    return new Response(JSON.stringify({ error: "Zip not found", zip }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get plans available in this county
  const { data: plans } = await supabase
    .from("ma_plans")
    .select("*")
    .eq("county_fips", zipData.county_fips)
    .order("premium", { ascending: true });

  console.log("Authenticated Clerk user:", auth.userId, "zip:", zip);

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
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
};

export const config = { path: "/api/cms-plans" };
