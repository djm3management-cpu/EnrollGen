import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
const logger=createLogger('netlify','cms_plans');
// Netlify Function: /api/cms-plans?zip=33601
// Queries your plan database (Supabase example below)

import { createSupabaseClient as createClient, supabasePublishableKey } from "../../integrations/supabase.js";
import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function getSupabase() {
  const { SUPABASE_URL } = process.env;
  const publicKey = supabasePublishableKey();
  if (!SUPABASE_URL || !publicKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY)");
  }

  return createClient(SUPABASE_URL, publicKey);
}

export default serverRequest('cms-plans',async (req) => {
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
  } catch {
    logger.error("cms_plans_cms_plans_configuration_error", 'request_failed');
    return json(500, {
      error: "Server configuration error",
      detail: "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify environment variables.",
    });
  }

  // Resolve the ZIP through the shared Census county crosswalk.
  const { data: zipData, error: zipError } = await supabase
    .from("zip_county_crosswalk")
    .select("county_fips, state_code")
    .eq("zip", zip)
    .limit(1)
    .single();

  if (zipError && zipError.code !== "PGRST116") {
    logger.error("cms_plans_cms_plans_zip_lookup_failed", zipError);
    return json(502, { error: "Plan lookup failed" });
  }

  if (!zipData) {
    return json(404, { error: "Zip not found", zip });
  }

  // Get plans available in this county
  const { data: plans, error: plansError } = await supabase
    .from("cms_plans_py2027")
    .select("*")
    .eq("county_fips", zipData.county_fips)
    .eq("plan_year", 2027)
    .order("monthly_premium", { ascending: true });

  if (plansError) {
    logger.error("cms_plans_cms_plans_plan_lookup_failed", plansError);
    return json(502, { error: "Plan lookup failed" });
  }

  return new Response(
    JSON.stringify({
      source: "cms-database",
      zip,
      state: zipData.state_code,
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
});

export const config = { path: "/api/cms-plans" };
