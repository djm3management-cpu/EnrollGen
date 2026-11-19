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
import { attestationView, ATTESTATION_COLUMNS } from '../../telephony/src/ping/attestations.js';

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
      retention: enabled('PING_RETENTION_ALERTS_ENABLED'), exchange: enabled('PING_EXCHANGE_ENABLED'),
      ...(enabled('SOURCE_ATTESTATIONS_ENABLED') ? { attestations: true } : {}),
      ...(enabled('GOLD_STANDARDS_METRICS_ENABLED') ? { gold_standards: true } : {}) } }];
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
  // Spec v5: attestation status of the publishers that can reach this
  // tenant's campaigns (its own sources and active exchange routes). Read only.
  sources: { method: 'GET', feature: 'SOURCE_ATTESTATIONS_ENABLED', run: async ({ db, tenantId }, input) => {
    only(input, []);
    const checked = ({ data, error }) => { if (error) throw new Error('buyer_store_failed'); return data || []; };
    const campaigns = checked(await db.from('ping_campaigns').select('id,name,source_id,require_source_attestations').eq('tenant_id', tenantId).order('name'));
    const routed = campaigns.length ? checked(await db.from('exchange_routes').select('source_id').in('campaign_id', campaigns.map(c => c.id)).eq('active', true)) : [];
    const ids = [...new Set([...campaigns.map(c => c.source_id), ...routed.map(r => r.source_id)].filter(Boolean))];
    const sources = ids.length ? checked(await db.from('lead_sources').select(ATTESTATION_COLUMNS).in('id', ids).order('name')) : [];
    return [200, { sources: sources.map(source => { const view = attestationView(source); delete view.attestation_document_ref; return view; }),
      campaigns: campaigns.map(({ id, name, require_source_attestations: required }) => ({ id, name, require_source_attestations: required })) }];
  } },
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
      const [status, body] = await entry.run({ store, operator: isOperator(identity, enabled, profile()), enabled, timezone: profile().timezone,
        db, tenantId: identity.tenant.id }, input);
      return json(body, status);
    } catch (error) {
      if (error instanceof Invalid) return json({ error: 'invalid_request', detail: error.message }, 400);
      return portalFailure(error);
    }
  };
}

export default serverRequest('ping-buyer', createPingBuyerHandler());
