// Buyer portal screens for the exchange (spec section 8.4; session S8b). The
// signed-in agency administrator works on their own tenant only: the tenant
// comes from the verified identity, never from input. The operations are the
// buyer API's (telephony/src/ping/buyerOps.js) on a tenant bound store.
import { serverRequest } from '../../telephony/src/lib/adminActions.js';
import { resolveCallAccessIdentity, evidenceFailure } from './_evidenceAccess.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';
import { featureEnabled, disabledResponse } from '../../telephony/src/lib/deploymentFeatures.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { getSupabase } from './_tenantSettings.js';
import { json, readRequest, portalAudit, portalFailure, PortalInputError, isOperator } from './_pingPortal.js';
import {
  Invalid, tenantStore, listCampaigns, updateCampaign, setCampaignPaused, scorecard, usage, invoiceLines,
  retentionAlerts, ackAlert, screenerScripts, createScreenerDraft, SCRIPT_FIELDS,
} from '../../telephony/src/ping/buyerOps.js';

const only = (input, allowed) => {
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Invalid(`unknown field ${key.slice(0, 64)}`);
  return input;
};
/** A write's request level rejection, passed to the operation so it is audited. */
const precheck = work => { try { work(); return null; } catch (error) { if (error instanceof Invalid) return error.message; throw error; } };

// Action allowlist: method, extra feature, run(ctx, input) -> [status, body].
export const BUYER_ACTIONS = Object.freeze({
  context: { method: 'GET', run: async ({ operator, enabled, timezone }, input) => {
    only(input, []);
    return [200, { operator, timezone, features: {
      scorecard: enabled('PING_SCORECARD_ENABLED'), screener: enabled('PING_SCREENER_ENABLED'),
      retention: enabled('PING_RETENTION_ALERTS_ENABLED'), exchange: enabled('PING_EXCHANGE_ENABLED') } }];
  } },
  campaigns: { method: 'GET', run: ({ store }, input) => { only(input, []); return listCampaigns(store); } },
  scorecard: { method: 'GET', feature: 'PING_SCORECARD_ENABLED',
    run: ({ store }, input) => scorecard(store, only(input, ['from', 'to', 'group'])) },
  usage: { method: 'GET', feature: 'PING_SCORECARD_ENABLED', run: ({ store }, input) => usage(store, only(input, ['month'])) },
  invoice_lines: { method: 'GET', feature: 'PING_SCORECARD_ENABLED',
    run: ({ store }, input) => invoiceLines(store, only(input, ['month'])) },
  alerts: { method: 'GET', run: ({ store }, input) => retentionAlerts(store, only(input, ['status', 'limit'])) },
  scripts: { method: 'GET', feature: 'PING_SCREENER_ENABLED',
    run: ({ store }, input) => screenerScripts(store, only(input, ['campaign_id'])) },
  campaign_update: { method: 'POST',
    run: ({ store }, input) => updateCampaign(store, input.id, input.patch, precheck(() => only(input, ['id', 'patch']))) },
  campaign_pause: { method: 'POST',
    run: ({ store }, input) => setCampaignPaused(store, input.id, true, precheck(() => only(input, ['id']))) },
  campaign_resume: { method: 'POST',
    run: ({ store }, input) => setCampaignPaused(store, input.id, false, precheck(() => only(input, ['id']))) },
  alert_ack: { method: 'POST', run: ({ store }, input) => ackAlert(store, input.id, precheck(() => only(input, ['id']))) },
  script_draft: { method: 'POST', feature: 'PING_SCREENER_ENABLED',
    run: ({ store }, input) => createScreenerDraft(store, input,
      precheck(() => only(input, ['campaign_id', ...SCRIPT_FIELDS, 'disclaimer', 'voice']))) },
});

export function createPingBuyerHandler({ authenticate = requireClerkAuth, getDb = getSupabase,
  resolveIdentity = resolveCallAccessIdentity, enabled = name => featureEnabled(name), profile = deploymentProfile } = {}) {
  return async request => {
    if (!enabled('PING_PLATFORM_ENABLED')) return disabledResponse('PING_PLATFORM_ENABLED');
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    const db = getDb();
    let identity; try { identity = await resolveIdentity(db, auth); } catch (error) { return evidenceFailure(error); }
    if (!identity.admin) return json({ error: 'Forbidden' }, 403);
    try {
      const { action, input } = await readRequest(request);
      const entry = Object.hasOwn(BUYER_ACTIONS, action) ? BUYER_ACTIONS[action] : null;
      if (!entry) throw new PortalInputError('unknown action');
      if (entry.method !== request.method) return json({ error: 'Method not allowed' }, 405);
      if (entry.feature && !enabled(entry.feature)) return disabledResponse(entry.feature);
      const store = tenantStore(db, { tenantId: identity.tenant.id, actor: identity.auth.userId,
        audit: portalAudit(db, identity, 'ping_buyer') });
      const [status, body] = await entry.run({ store, operator: isOperator(identity, enabled, profile()), enabled, timezone: profile().timezone }, input);
      return json(body, status);
    } catch (error) {
      if (error instanceof Invalid) return json({ error: 'invalid_request', detail: error.message }, 400);
      return portalFailure(error);
    }
  };
}

export default serverRequest('ping-buyer', createPingBuyerHandler());
