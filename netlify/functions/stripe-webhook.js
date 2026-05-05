import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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

function toIso(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function stripeStatusToSubscriptionStatus(status) {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  return "inactive";
}

function planFromPrice(priceId, fallback = "starter") {
  if (priceId && priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId && priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  return fallback === "pro" ? "pro" : "starter";
}

function seatCountFromSubscription(subscription, fallbackSeats) {
  const item = subscription?.items?.data?.[0];
  return Number(item?.quantity || fallbackSeats || 1);
}

async function findTenantIdForStripeSubscription(supabase, subscriptionId) {
  if (!subscriptionId) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("tenant_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) throw error;
  return data?.tenant_id || null;
}

async function upsertSubscriptionFromStripe(supabase, subscription, overrides = {}) {
  const firstItem = subscription?.items?.data?.[0];
  const metadata = {
    ...(subscription?.metadata || {}),
    ...(overrides.metadata || {}),
  };
  const tenantId =
    overrides.tenantId ||
    metadata.tenant_id ||
    await findTenantIdForStripeSubscription(supabase, subscription?.id);

  if (!tenantId) {
    console.warn("[stripe-webhook] missing tenant_id for subscription", subscription?.id);
    return;
  }

  const plan = metadata.plan || planFromPrice(firstItem?.price?.id, overrides.plan);
  const seatCount = seatCountFromSubscription(subscription, metadata.seats || overrides.seats);

  const row = {
    tenant_id: tenantId,
    stripe_customer_id: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null,
    stripe_subscription_id: subscription.id,
    plan,
    status: stripeStatusToSubscriptionStatus(subscription.status),
    seat_count: seatCount,
    current_period_start: toIso(subscription.current_period_start),
    current_period_end: toIso(subscription.current_period_end),
    trial_ends_at: toIso(subscription.trial_end),
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "tenant_id" });

  if (error) throw error;
}

async function handleCheckoutCompleted(stripe, supabase, session) {
  if (session.mode !== "subscription" || !session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(
    typeof session.subscription === "string" ? session.subscription : session.subscription.id
  );

  await upsertSubscriptionFromStripe(supabase, subscription, {
    tenantId: session.metadata?.tenant_id || session.client_reference_id || null,
    plan: session.metadata?.plan,
    seats: session.metadata?.seats,
    metadata: session.metadata || {},
  });
}

async function markSubscriptionStatus(supabase, subscriptionId, status) {
  if (!subscriptionId) return;

  const { error } = await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) throw error;
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return json(500, { error: "STRIPE_WEBHOOK_SECRET is not configured" });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe-webhook] signature verification failed:", error.message);
    return json(400, { error: "Invalid Stripe signature" });
  }

  try {
    const supabase = getSupabase();

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(stripe, supabase, event.data.object);
    }

    if (event.type === "customer.subscription.updated") {
      await upsertSubscriptionFromStripe(supabase, event.data.object);
    }

    if (event.type === "customer.subscription.deleted") {
      await markSubscriptionStatus(supabase, event.data.object.id, "canceled");
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      await markSubscriptionStatus(supabase, subscriptionId, "past_due");
    }

    return json(200, { received: true });
  } catch (error) {
    console.error("[stripe-webhook] handler failed:", error);
    return json(500, { error: "Stripe webhook failed", detail: error.message });
  }
};

export const config = { path: "/api/stripe-webhook" };
