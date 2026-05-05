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

function priceIdForPlan(plan) {
  if (plan === "starter") return process.env.STRIPE_STARTER_PRICE_ID;
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  return "";
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const plan = body.plan === "starter" || body.plan === "pro" ? body.plan : "";
  const seats = Math.max(1, Math.min(250, Number.parseInt(body.seats, 10) || 1));
  const priceId = priceIdForPlan(plan);

  if (!plan || !priceId) {
    return json(400, {
      error: "Invalid checkout request",
      detail: "plan must be starter or pro, and the matching Stripe price env var must be configured.",
    });
  }

  try {
    const supabase = getSupabase();
    const tenantId = await resolveTenantIdForOrg(supabase, auth.orgId);
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const appUrl = baseUrl(request);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id } : {}),
      line_items: [{ price: priceId, quantity: seats }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      client_reference_id: tenantId,
      metadata: {
        tenant_id: tenantId,
        clerk_org_id: auth.orgId || "",
        plan,
        seats: String(seats),
      },
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          clerk_org_id: auth.orgId || "",
          plan,
          seats: String(seats),
        },
      },
    });

    return json(200, { url: session.url, session_id: session.id });
  } catch (error) {
    console.error("[stripe-checkout] failed:", error);
    return json(500, { error: "Unable to create checkout session", detail: error.message });
  }
};

export const config = { path: "/api/stripe-checkout" };
