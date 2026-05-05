import { requireClerkAuth } from "./_clerkAuth.js";
import { createClient } from "@supabase/supabase-js";
import {
  logUsageRecord,
  requireActiveSubscription,
  requirePlan,
  resolveTenantIdForOrg,
} from "./_subscriptionGate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const DEFAULT_TTL_SECONDS = 60;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) {
    return auth.response;
  }

  const supabase = getSupabase();
  const tenantId = await resolveTenantIdForOrg(supabase, auth.orgId);
  const subscription = await requireActiveSubscription(supabase, tenantId);
  if (subscription.response) return subscription.response;

  const planGate = requirePlan(subscription, "pro");
  if (planGate.response) return planGate.response;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "Server configuration error",
      detail: "Set DEEPGRAM_API_KEY in Netlify environment variables.",
    });
  }

  const response = await fetch(DEEPGRAM_GRANT_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: DEFAULT_TTL_SECONDS }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("Deepgram token grant failed:", response.status, payload);
    return json(502, { error: "Deepgram token grant failed" });
  }

  await logUsageRecord(supabase, tenantId, "deepgram_minutes", Math.ceil(DEFAULT_TTL_SECONDS / 60), {
    endpoint: "deepgram-token",
    ttl_seconds: DEFAULT_TTL_SECONDS,
    user_id: auth.userId,
  });

  return json(200, {
    access_token: payload.access_token,
    expires_in: payload.expires_in,
  });
};

export const config = { path: "/api/deepgram-token" };
