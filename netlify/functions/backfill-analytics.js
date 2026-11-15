import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
const logger=createLogger('netlify','backfill_analytics');
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import {
  getSupabase,
  processTenant,
} from "./nightly-analytics.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DEPLOYMENT_TENANT_ID = deploymentProfile().tenantId;
const DEPLOYMENT_ORG_ID = deploymentProfile().organizationId;

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isAuthorized(request) {
  const secret = process.env.BACKFILL_SECRET || process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return false;
  return request.headers.get("x-backfill-secret") === secret
    || request.headers.get("x-knowledge-update-secret") === secret;
}



async function findDeploymentTenant(supabase) {
 const {data,error}=await supabase.from('tenants').select('id,name,agency_display_name,clerk_org_id').eq('id',DEPLOYMENT_TENANT_ID).eq('clerk_org_id',DEPLOYMENT_ORG_ID).maybeSingle();
 if(error)throw error;return data;
}

export default serverRequest('backfill-analytics',async (request) => {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  try {
    const supabase = getSupabase();
    const tenant = await findDeploymentTenant(supabase);

    if (!tenant) {
      return json(404, {
        ok: false,
        error: "Deployment tenant not found",
      });
    }

    const result = await processTenant(supabase, tenant);

    return json(200, {
      ok: true,
      tenant,
      result,
    });
  } catch {
    logger.error("backfill_analytics_failed", 'request_failed');
    return json(500, {
      ok: false,
      error: 'request_failed',
    });
  }
});
