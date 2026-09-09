import { createClient } from '@supabase/supabase-js';
import { requireClerkAuth } from './_clerkAuth.js';
import { resolveTenantIdForOrg, requireActiveSubscription, requirePlan } from './_subscriptionGate.js';
import { validSkipCounter, recordSkipCounter } from './_copilotSkipCounter.js';

// Telemetry only: deliberately does not import or invoke an LLM client.
export default async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;
  let body;
  try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (!validSkipCounter(body)) return new Response('Invalid skip counter', { status: 400 });
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const tenantId = await resolveTenantIdForOrg(supabase, auth.orgId);
    const subscription = await requireActiveSubscription(supabase, tenantId);
    if (subscription.response) return subscription.response;
    const plan = requirePlan(subscription, 'pro');
    if (plan.response) return plan.response;
    await recordSkipCounter(supabase, tenantId, auth.userId, body);
    return new Response(null, { status: 204 });
  } catch {
    console.warn('[copilot] skip counter telemetry unavailable');
    return new Response('Telemetry unavailable', { status: 503 });
  }
};
