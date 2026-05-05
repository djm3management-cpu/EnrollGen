import { requireClerkAuth } from "./_clerkAuth.js";
import {
  findTenantByOrg,
  getSupabase,
  isAdminAuth,
  json,
  postJsonWithTimeout,
  readFirst,
  safeText,
  validateWebhookUrl,
} from "./_tenantSettings.js";

function resolveWebhookUrl(body, tenant) {
  const provided = readFirst(body, ["ghl_webhook_url", "ghlWebhookUrl", "webhook_url"]);
  return safeText(provided.value) || tenant?.ghl_webhook_url || "";
}

function buildTestPayload(body, tenant, auth) {
  const providedPayload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  return {
    event: "enrollgen.webhook_test",
    source: "EnrollGen Tenant Settings",
    test: true,
    tenant_id: tenant.id,
    agency: tenant.agency_display_name || tenant.name,
    clerk_org_id: tenant.clerk_org_id,
    requested_by: auth.userId,
    sent_at: new Date().toISOString(),
    ...providedPayload,
  };
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  if (!auth.orgId) {
    return json(400, {
      error: "Missing Clerk organization",
      detail: "Select an organization before testing a CRM webhook.",
    });
  }

  if (!isAdminAuth(auth)) {
    return json(403, {
      error: "Forbidden",
      detail: "Only organization admins can test CRM webhooks.",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  try {
    const supabase = getSupabase();
    const tenant = await findTenantByOrg(supabase, auth.orgId);
    if (!tenant) {
      return json(404, {
        error: "Tenant not found",
        detail: "Create tenant settings before testing a CRM webhook.",
      });
    }

    const webhookUrl = validateWebhookUrl(resolveWebhookUrl(body, tenant));
    const payload = buildTestPayload(body, tenant, auth);
    const response = await postJsonWithTimeout(webhookUrl, payload, 10000);
    const responseText = await response.text();

    return json(200, {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      webhook_url: webhookUrl,
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
