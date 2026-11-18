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

const defaultLogger = createLogger('telephony', 'buyerv1');

export const BUYER_SCOPES = Object.freeze(['campaigns:read', 'campaigns:write', 'reports:read', 'alerts:write',
  'screener:write']);
export const CAMPAIGN_PATCH_FIELDS = Object.freeze(['active', 'staffed_hours_override', 'daily_budget_calls',
  'exchange_daily_cap', 'exchange_hourly_cap', 'retention_mode', 'screener_mode', 'performance_routing']);
export const SCORECARD_GROUPS = Object.freeze(['source', 'sub_id', 'campaign', 'state', 'day']);
const SCRIPT_REQUIRED = Object.freeze(['opening', 'q_medicare', 'q_zip', 'q_reason', 'q_connect', 'pass_line', 'fail_line']);
const DAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONE = /^[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_SCORECARD_DAYS = 92;

class Invalid extends Error {}
const fail = message => { throw new Invalid(message); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const uuidOrNull = value => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null);

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

function validHours(value) {
  if (!isObject(value) || Object.keys(value).some(key => !['timezone', 'days'].includes(key))) return false;
  if (typeof value.timezone !== 'string' || !ZONE.test(value.timezone) || !isObject(value.days)) return false;
  return Object.entries(value.days).every(([day, config]) => DAYS.includes(day) && isObject(config)
    && Object.keys(config).every(key => ['enabled', 'start', 'end'].includes(key)) && typeof config.enabled === 'boolean'
    && (!config.enabled || (HHMM.test(config.start ?? '') && HHMM.test(config.end ?? '') && config.start < config.end)));
}

const count = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 1000000);
const PATCH_RULES = Object.freeze({
  active: value => typeof value === 'boolean',
  performance_routing: value => typeof value === 'boolean',
  staffed_hours_override: value => value === null || validHours(value),
  daily_budget_calls: count,
  exchange_daily_cap: count,
  exchange_hourly_cap: count,
  retention_mode: value => ['route_owner', 'reject_and_alert'].includes(value),
  screener_mode: value => ['off', 'inbound_only', 'always'].includes(value),
});

/** The campaign patch, or Invalid. */
export function campaignPatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) fail('body must be a non-empty object');
  for (const [key, value] of Object.entries(body)) {
    if (!CAMPAIGN_PATCH_FIELDS.includes(key)) fail(`unknown field ${key.slice(0, 64)}`);
    if (!PATCH_RULES[key](value)) fail(`invalid ${key}`);
  }
  return body;
}

/** The draft script body: campaign_id plus the script fields, or Invalid. */
export function scriptDraft(body) {
  if (!isObject(body)) fail('body must be an object');
  for (const [key, value] of Object.entries(body)) {
    if (key === 'campaign_id') { if (!uuidOrNull(value)) fail('invalid campaign_id'); continue; }
    if (SCRIPT_REQUIRED.includes(key)) {
      if (typeof value !== 'string' || value.length < 1 || value.length > 600) fail(`invalid ${key}`);
    } else if (key === 'disclaimer') {
      if (value !== null && (typeof value !== 'string' || value.length < 1 || value.length > 1000)) fail('invalid disclaimer');
    } else if (key === 'voice') {
      if (typeof value !== 'string' || !/^Polly\.[A-Za-z]+(-[A-Za-z]+)?$/.test(value)) fail('invalid voice');
    } else fail(`unknown field ${key.slice(0, 64)}`);
  }
  for (const key of ['campaign_id', ...SCRIPT_REQUIRED]) if (!own(body, key)) fail(`missing ${key}`);
  const { campaign_id: campaignId, ...script } = body;
  return { campaignId: campaignId.toLowerCase(), script };
}

const timestamp = (value, name) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value)
    || Number.isNaN(Date.parse(value))) fail(`invalid ${name}`);
  return new Date(value);
};

export function scorecardQuery(raw) {
  if (raw.from === undefined || raw.to === undefined) fail('from and to are required');
  const from = timestamp(raw.from, 'from'); const to = timestamp(raw.to, 'to');
  if (from >= to) fail('from must be before to');
  if (to - from > MAX_SCORECARD_DAYS * 86400000) fail(`window is at most ${MAX_SCORECARD_DAYS} days`);
  const group = raw.group === undefined || raw.group === '' ? [] : raw.group.split(',');
  if (group.some(item => !SCORECARD_GROUPS.includes(item)) || new Set(group).size !== group.length) fail('invalid group');
  return { from: from.toISOString(), to: to.toISOString(), group };
}

export function monthQuery(raw) {
  if (typeof raw.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) fail('month must be YYYY-MM');
  return `${raw.month}-01`;
}

// Endpoint table: method, path, scope, extra feature flag, handler. The
// handler returns [status, body]. Write handlers always reach the database so
// the attempt is audited; a body the allowlist rejects is replaced by one the
// database also rejects, so a 400 can never change data.
const ENDPOINTS = [
  { method: 'get', path: '/api/buyer/v1/campaigns', scope: 'campaigns:read',
    async run({ req, rpc }) { query(req, []); noBody(req); return [200, { campaigns: await rpc('buyer_campaigns', {}) }]; } },
  { method: 'patch', path: '/api/buyer/v1/campaigns/:id', scope: 'campaigns:write',
    async run({ req, rpc }) {
      let patch; let invalid = null;
      try { query(req, []); patch = campaignPatch(req.body); } catch (error) {
        if (!(error instanceof Invalid)) throw error;
        invalid = error.message;
        patch = isObject(req.body) ? Object.fromEntries(Object.keys(req.body).map(key => [key, '__rejected__'])) : {};
      }
      const result = await rpc('buyer_update_campaign', { p_campaign: uuidOrNull(req.params.id), p_patch: patch });
      return outcome(result, invalid, data => ({ campaign: data.campaign }));
    } },
  ...[['pause', true], ['resume', false]].map(([action, paused]) => ({
    method: 'post', path: `/api/buyer/v1/campaigns/:id/${action}`, scope: 'campaigns:write',
    async run({ req, rpc }) {
      let invalid = null;
      try { query(req, []); noBody(req); } catch (error) { if (!(error instanceof Invalid)) throw error; invalid = error.message; }
      // An invalid request is audited as not found against no campaign and changes nothing.
      const result = await rpc('buyer_set_campaign_paused',
        { p_campaign: invalid ? null : uuidOrNull(req.params.id), p_paused: paused });
      return outcome(result, invalid, data => ({ campaign: data.campaign }));
    },
  })),
  { method: 'get', path: '/api/buyer/v1/scorecard', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, rpc }) {
      const { from, to, group } = scorecardQuery(query(req, ['from', 'to', 'group'])); noBody(req);
      return [200, { from, to, group, rows: await rpc('buyer_scorecard', { p_from: from, p_to: to, p_group: group }) }];
    } },
  { method: 'get', path: '/api/buyer/v1/usage', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, rpc }) {
      const month = monthQuery(query(req, ['month'])); noBody(req);
      return [200, { usage: await rpc('buyer_usage', { p_month: month }) }];
    } },
  { method: 'get', path: '/api/buyer/v1/invoice-lines', scope: 'reports:read', feature: 'PING_SCORECARD_ENABLED',
    async run({ req, rpc }) {
      const month = monthQuery(query(req, ['month'])); noBody(req);
      return [200, { month, lines: await rpc('buyer_invoice_lines', { p_month: month }) }];
    } },
  { method: 'get', path: '/api/buyer/v1/retention-alerts', scope: 'reports:read',
    async run({ req, rpc }) {
      const raw = query(req, ['status', 'limit']); noBody(req);
      if (raw.status !== undefined && !['open', 'all'].includes(raw.status)) fail('status must be open or all');
      if (raw.limit !== undefined && !/^[1-9][0-9]{0,2}$/.test(raw.limit)) fail('limit must be 1 to 500');
      const limit = raw.limit === undefined ? 100 : Number(raw.limit);
      if (limit > 500) fail('limit must be 1 to 500');
      return [200, { alerts: await rpc('buyer_retention_alerts', { p_open_only: raw.status !== 'all', p_limit: limit }) }];
    } },
  { method: 'post', path: '/api/buyer/v1/retention-alerts/:id/ack', scope: 'alerts:write',
    async run({ req, rpc }) {
      let invalid = null;
      try { query(req, []); noBody(req); } catch (error) { if (!(error instanceof Invalid)) throw error; invalid = error.message; }
      const result = await rpc('buyer_ack_retention_alert', { p_alert: invalid ? null : uuidOrNull(req.params.id) });
      return outcome(result, invalid, data => ({ alert: data.alert }));
    } },
  { method: 'get', path: '/api/buyer/v1/screener-scripts', scope: 'campaigns:read', feature: 'PING_SCREENER_ENABLED',
    async run({ req, rpc }) {
      const raw = query(req, ['campaign_id']); noBody(req);
      if (raw.campaign_id !== undefined && !uuidOrNull(raw.campaign_id)) fail('invalid campaign_id');
      return [200, { scripts: await rpc('buyer_screener_scripts', { p_campaign: uuidOrNull(raw.campaign_id) }) }];
    } },
  { method: 'post', path: '/api/buyer/v1/screener-scripts', scope: 'screener:write', feature: 'PING_SCREENER_ENABLED',
    async run({ req, rpc }) {
      let draft; let invalid = null;
      try { query(req, []); draft = scriptDraft(req.body); } catch (error) {
        if (!(error instanceof Invalid)) throw error;
        invalid = error.message;
        draft = { campaignId: isObject(req.body) ? uuidOrNull(req.body.campaign_id) : null, script: {} };
      }
      const result = await rpc('buyer_create_screener_draft', { p_campaign: draft.campaignId, p_script: draft.script });
      const [status, body] = outcome(result, invalid, data => ({ script: data.script }));
      return [status === 200 ? 201 : status, body];
    } },
];

/** Maps a write routine's status to HTTP. A local rejection always wins. */
function outcome(result, invalid, ok) {
  if (invalid || result?.status === 'invalid') return [400, { error: 'invalid_request', detail: invalid ?? 'rejected' }];
  if (result?.status === 'not_found') return [404, { error: 'not_found' }];
  if (result?.status === 'ok') return [200, ok(result)];
  throw new Error('unexpected buyer routine result');
}

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
        const [status, body] = await endpoint.run({ req, rpc });
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
