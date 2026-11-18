// Operator screens for the exchange (spec sections 8 and 9; session S8b).
// Only an administrator of the deployment's own tenant reaches these, and only
// with PING_PLATFORM_ENABLED and PING_EXCHANGE_ENABLED on. The action and
// input allowlists live in telephony/src/ping/operatorOps.js; every write is
// audited in admin_action_log before it runs.
import { serverRequest } from '../../telephony/src/lib/adminActions.js';
import { resolveCallAccessIdentity, evidenceFailure } from './_evidenceAccess.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { getSupabase } from './_tenantSettings.js';
import { json, readRequest, portalAudit, portalFailure, isOperator } from './_pingPortal.js';
import { runOperatorAction } from '../../telephony/src/ping/operatorOps.js';

export function createPingOperatorHandler({ authenticate = requireClerkAuth, getDb = getSupabase,
  resolveIdentity = resolveCallAccessIdentity, enabled = name => featureEnabled(name), profile = deploymentProfile } = {}) {
  return async request => {
    for (const flag of ['PING_PLATFORM_ENABLED', 'PING_EXCHANGE_ENABLED']) if (!enabled(flag)) return disabledResponse(flag);
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    const db = getDb();
    let identity; try { identity = await resolveIdentity(db, auth); } catch (error) { return evidenceFailure(error); }
    if (!isOperator(identity, enabled, profile())) return json({ error: 'Forbidden' }, 403);
    try {
      const { action, input } = await readRequest(request);
      const [status, body] = await runOperatorAction({ db, operatorTenant: identity.tenant.id, actor: identity.auth.userId,
        audit: portalAudit(db, identity, 'ping_operator') }, action, input, { method: request.method, enabled });
      return json(body, status);
    } catch (error) { return portalFailure(error); }
  };
}

export default serverRequest('ping-operator', createPingOperatorHandler());
