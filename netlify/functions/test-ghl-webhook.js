import {resolveCallAccessIdentity,EvidenceError} from './_evidenceAccess.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from "./_clerkAuth.js";
import {
  getSupabase,
  json,
  postJsonWithTimeout,
  validateWebhookUrl,
} from "./_tenantSettings.js";

function resolveWebhookUrl() { return deploymentProfile().ghl.postCallUrl; }

function buildTestPayload(body, tenant, auth) {
  const providedPayload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  const safePayload=Object.fromEntries(Object.entries(providedPayload).filter(([key])=>!['tenant_id','actor','role','requested_by'].includes(key)));
  return {
    ...safePayload,
    event: "enrollgen.webhook_test",
    source: "EnrollGen Tenant Settings",
    test: true,
    tenant_id: tenant.id,
    agency: tenant.agency_display_name || tenant.name,
    clerk_org_id: tenant.clerk_org_id,
    requested_by: auth.userId,
    sent_at: new Date().toISOString(),
  };
}

export default async (request) => {
  if (!featureEnabled('GHL_ENABLED')) return disabledResponse('GHL_ENABLED');
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

  try {
    const supabase = getSupabase();
    const identity = await resolveCallAccessIdentity(supabase,auth);
    if(!identity.admin)throw new EvidenceError(403,'Administrator required.');
    const tenant = identity.tenant;

    const webhookUrl = validateWebhookUrl(resolveWebhookUrl(body, tenant));
    const payload = buildTestPayload(body, tenant, auth);
    const response = await postJsonWithTimeout(webhookUrl, payload, 10000);
    const responseText = await response.text();

    return json(200, {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,

      response_body: responseText.slice(0, 1000),
    });
  } catch (error) {
    console.error("[test-ghl-webhook] failed:", error);
    const timedOut = error?.name === "AbortError";
    return json(timedOut ? 504 : 500, {
      error: timedOut ? "Webhook test timed out" : "Webhook test failed",
      detail: error.message || String(error),
    });
  }
};

export const config = { path: "/api/test-ghl-webhook" };
