// Buyer API under /api/buyer/v1 (spec section 8.4; session S8a). Server to
// server, authenticated by a per-tenant buyer key in x-api-key. Every request
// is admitted per key and checked for one scope by buyer_api_admit; every
// query runs through a buyer_* routine that derives the tenant from the key
// id, so a key can never read or change another tenant's rows. Every input is
// checked against an explicit allowlist and unknown fields are 400. Write
// calls are audited in the database, including rejected ones. Script approval
// is operator only and has no endpoint here. One structured event per request;
// no caller data is logged.
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { createLogger } from '../lib/logger.js';
import { limitsFor } from '../lib/admission.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import {
  Invalid, fail, isObject, keyStore, scorecardQuery, monthQuery, listCampaigns, updateCampaign, setCampaignPaused, scorecard, usage, invoiceLines,
  retentionAlerts, ackAlert, screenerScripts, createScreenerDraft,
} from '../ping/buyerOps.js';

export {
  BUYER_SCOPES, CAMPAIGN_PATCH_FIELDS, SCORECARD_GROUPS, campaignPatch, scriptDraft, scorecardQuery, monthQuery,
} from '../ping/buyerOps.js';

const defaultLogger = createLogger('telephony', 'buyerv1');

/** Only the listed query parameters, each at most once. */
function query(req, allowed) {
  const raw = req.query || {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) fail(`unknown query parameter ${key.slice(0, 64)}`);
    if (typeof value !== 'string') fail(`${key} must be given once`);
  }
  return raw;
}

/** GET and action endpoints take no body. */
function noBody(req) {
  if (req.body !== undefined && !(isObject(req.body) && Object.keys(req.body).length === 0)) fail('no body expected');
}

/** The request-level rejection of a write call, or null. */
function precheck(work) {
  try { work(); return null; } catch (error) { if (!(error instanceof Invalid)) throw error; return error.message; }
}

// Endpoint table: method, path, scope, extra feature flag, handler. The
// handler returns [status, body]. The operations live in ping/buyerOps.js and
// run against keyStore, whose routines derive the tenant from the key id.
const ENDPOINTS = [
  { method: 'get', path: '/api/buyer/v1/campaigns', scope: 'campaigns:read',
    async run({ req, store }) { query(req, []); noBody(req); return listCampaigns(store); } },
  { method: 'patch', path: '/api/buyer/v1/campaigns/:id', scope: 'campaigns:write',
    run: ({ req, store }) => updateCampaign(store, req.params.id, req.body, precheck(() => query(req, []))) },
  ...[['pause', true], ['resume', false]].map(([action, paused]) => ({
    method: 'post', path: `/api/buyer/v1/campaigns/:id/${action}`, scope: 'campaigns:write',
    run: ({ req, store }) => setCampaignPaused(store, req.params.id, paused, precheck(() => { query(req, []); noBody(req); })),
  })),
  { method: 'get', path: '/api/buyer/v1/scorecard', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, store }) { const raw = query(req, ['from', 'to', 'group']); scorecardQuery(raw); noBody(req); return scorecard(store, raw); } },
  { method: 'get', path: '/api/buyer/v1/usage', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, store }) { const raw = query(req, ['month']); monthQuery(raw); noBody(req); return usage(store, raw); } },
  { method: 'get', path: '/api/buyer/v1/invoice-lines', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, store }) { const raw = query(req, ['month']); monthQuery(raw); noBody(req); return invoiceLines(store, raw); } },
  { method: 'get', path: '/api/buyer/v1/retention-alerts', scope: 'reports:read',
    async run({ req, store }) { const raw = query(req, ['status', 'limit']); noBody(req); return retentionAlerts(store, raw); } },
  { method: 'post', path: '/api/buyer/v1/retention-alerts/:id/ack', scope: 'alerts:write',
    run: ({ req, store }) => ackAlert(store, req.params.id, precheck(() => { query(req, []); noBody(req); })) },
  { method: 'get', path: '/api/buyer/v1/screener-scripts', scope: 'campaigns:read', feature: 'PING_SCREENER_ENABLED',
    async run({ req, store }) { const raw = query(req, ['campaign_id']); noBody(req); return screenerScripts(store, raw); } },
  { method: 'post', path: '/api/buyer/v1/screener-scripts', scope: 'screener:write', feature: 'PING_SCREENER_ENABLED',
    run: ({ req, store }) => createScreenerDraft(store, req.body, precheck(() => query(req, []))) },
];

export const BUYER_ROUTES = Object.freeze(ENDPOINTS.map(({ method, path, scope, feature }) =>
  Object.freeze({ method, path, scope, feature: feature ?? null })));

export function createBuyerV1Router({
  db,
  enabled = name => featureEnabled(name),
  admissionLimit = () => limitsFor('buyerApi').minute,
  log = event => defaultLogger.info(JSON.stringify(event)),
} = {}) {
  const router = Router();
  for (const endpoint of ENDPOINTS) {
    router[endpoint.method](endpoint.path, async (req, res) => {
      const started = Date.now();
      let keyId = null;
      const reply = (status, body) => {
        log({ event: 'buyer_v1_request', status, method: endpoint.method.toUpperCase(), route: endpoint.path,
          key_id: keyId, error: body.error ?? null, latency_ms: Date.now() - started });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(status).json(body);
      };
      for (const feature of ['PING_PLATFORM_ENABLED', endpoint.feature].filter(Boolean)) {
        if (!enabled(feature)) return reply(503, { status: 'disabled', feature });
      }
      const key = req.header('x-api-key');
      if (!key || key.length > 512) return reply(401, { error: 'unauthorized' });
      try {
        const hash = createHash('sha256').update(key).digest('hex');
        const gate = await db().rpc('buyer_api_admit', { p_key_hash: hash, p_scope: endpoint.scope, p_limit: admissionLimit() });
        if (gate.error || !gate.data) return reply(503, { error: 'admission_unavailable' });
        if (gate.data.status === 'disabled') return reply(503, { status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
        if (!gate.data.authorized) return reply(401, { error: 'unauthorized' });
        keyId = gate.data.key_id;
        if (!gate.data.allowed) {
          const retryAfter = Math.max(1, Math.ceil(Number(gate.data.retry_after) || 60));
          res.setHeader('Retry-After', String(retryAfter));
          return reply(429, { error: 'admission_limited', retry_after: retryAfter });
        }
        if (gate.data.scope_ok !== true) return reply(403, { error: 'insufficient_scope', required_scope: endpoint.scope });
        // Every routine takes the key id, never a tenant: the database derives it.
        const rpc = async (name, args) => {
          const { data, error } = await db().rpc(name, { p_key: keyId, ...args });
          if (error) throw new Error('buyer_routine_failed');
          return data;
        };
        const [status, body] = await endpoint.run({ req, store: keyStore(rpc) });
        return reply(status, body);
      } catch (error) {
        if (error instanceof Invalid) return reply(400, { error: 'invalid_request', detail: error.message });
        return reply(503, { error: 'unavailable' });
      }
    });
  }
  return router;
}

let defaultRouter;
/** Lazily bound to the service client so importing this module has no side effects. */
export async function buyerV1Router() {
  if (defaultRouter) return defaultRouter;
  const { supabase } = await import('../supabase.js');
  defaultRouter = createBuyerV1Router({ db: () => supabase });
  return defaultRouter;
}
