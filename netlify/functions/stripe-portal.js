import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { requireClerkAuth } from "./_clerkAuth.js";
import { resolveTenantIdForOrg } from "./_subscriptionGate.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function baseUrl(request) {
  return (
    process.env.ENROLLGEN_APP_URL ||
    process.env.SITE_URL ||
    process.env.URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  try {
    const supabase = getSupabase();
    const tenantId = await resolveTenantIdForOrg(supabase, auth.orgId);
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;

    if (!subscription?.stripe_customer_id) {
      return json(404, {
        error: "No Stripe customer found",
        detail: "Start a subscription before opening the billing portal.",
      });
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl(request)}/?billing=portal`,
    });

    return json(200, { url: portalSession.url });
  } catch (error) {
    console.error("[stripe-portal] failed:", error);
    return json(500, { error: "Unable to create billing portal session", detail: error.message });
  }
};

export const config = { path: "/api/stripe-portal" };
