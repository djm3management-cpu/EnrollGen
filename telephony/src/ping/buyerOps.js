// Tenant scoped buyer operations (spec section 8.4; sessions S8a and S8b).
// One set of validators, operations and outcome rules shared by the buyer API
// (/api/buyer/v1, keyed by a per-tenant API key) and the buyer portal screens
// (Netlify ping-buyer, keyed by the signed-in administrator's tenant). Each
// caller supplies a store bound to exactly one tenant; nothing here accepts a
// tenant id from the request.
import { randomUUID } from 'node:crypto';

export const BUYER_SCOPES = Object.freeze(['campaigns:read', 'campaigns:write', 'reports:read', 'alerts:write',
  'screener:write']);
export const CAMPAIGN_PATCH_FIELDS = Object.freeze(['active', 'staffed_hours_override', 'daily_budget_calls',
  'exchange_daily_cap', 'exchange_hourly_cap', 'retention_mode', 'screener_mode', 'performance_routing']);
export const SCORECARD_GROUPS = Object.freeze(['source', 'sub_id', 'campaign', 'state', 'day']);
export const SCRIPT_FIELDS = Object.freeze(['opening', 'q_medicare', 'q_zip', 'q_reason', 'q_connect', 'pass_line',
  'fail_line']);
const DAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONE = /^[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_SCORECARD_DAYS = 92;

/** A request the allowlists reject. Callers map it to 400. */
export class Invalid extends Error {}
export const fail = message => { throw new Invalid(message); };
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
export const uuidOrNull = value => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null);

export function validHours(value) {
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
    if (SCRIPT_FIELDS.includes(key)) {
      if (typeof value !== 'string' || value.length < 1 || value.length > 600) fail(`invalid ${key}`);
    } else if (key === 'disclaimer') {
      if (value !== null && (typeof value !== 'string' || value.length < 1 || value.length > 1000)) fail('invalid disclaimer');
    } else if (key === 'voice') {
      if (typeof value !== 'string' || !/^Polly\.[A-Za-z]+(-[A-Za-z]+)?$/.test(value)) fail('invalid voice');
    } else fail(`unknown field ${key.slice(0, 64)}`);
  }
  for (const key of ['campaign_id', ...SCRIPT_FIELDS]) if (!own(body, key)) fail(`missing ${key}`);
  const { campaign_id: campaignId, ...script } = body;
  return { campaignId: campaignId.toLowerCase(), script };
}

const timestamp = (value, name) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value)
    || Number.isNaN(Date.parse(value))) fail(`invalid ${name}`);
  return new Date(value);
};

export function scorecardQuery(raw, groups = SCORECARD_GROUPS) {
  if (raw.from === undefined || raw.to === undefined) fail('from and to are required');
  const from = timestamp(raw.from, 'from'); const to = timestamp(raw.to, 'to');
  if (from >= to) fail('from must be before to');
  if (to - from > MAX_SCORECARD_DAYS * 86400000) fail(`window is at most ${MAX_SCORECARD_DAYS} days`);
  const group = raw.group === undefined || raw.group === '' ? [] : raw.group.split(',');
  if (group.some(item => !groups.includes(item)) || new Set(group).size !== group.length) fail('invalid group');
  return { from: from.toISOString(), to: to.toISOString(), group };
}

export function monthQuery(raw) {
  if (typeof raw.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) fail('month must be YYYY-MM');
  return `${raw.month}-01`;
}

/** Maps a write routine's status to [http status, body]. A local rejection always wins. */
export function outcome(result, invalid, ok) {
  if (invalid || result?.status === 'invalid') return [400, { error: 'invalid_request', detail: invalid ?? 'rejected' }];
  if (result?.status === 'not_found') return [404, { error: 'not_found' }];
  if (result?.status === 'ok') return [200, ok(result)];
  throw new Error('unexpected buyer routine result');
}

// Operations. Each takes a tenant bound store and already parsed input, and
// returns [status, body]. Write operations always reach the store so the
// attempt is audited; input the allowlist rejects is replaced by input the
// store also rejects, so a 400 can never change data. `invalid` carries a
// rejection the caller found before the operation (for example an unknown
// query parameter).
export const listCampaigns = async store => [200, { campaigns: await store.campaigns() }];

export async function updateCampaign(store, id, body, invalid = null) {
  let patch;
  if (!invalid) {
    try { patch = campaignPatch(body); } catch (error) { if (!(error instanceof Invalid)) throw error; invalid = error.message; }
  }
  if (invalid) patch = isObject(body) ? Object.fromEntries(Object.keys(body).map(key => [key, '__rejected__'])) : {};
  const result = await store.updateCampaign(uuidOrNull(id), patch);
  return outcome(result, invalid, data => ({ campaign: data.campaign }));
}

/** An invalid request is audited as not found against no campaign and changes nothing. */
export async function setCampaignPaused(store, id, paused, invalid = null) {
  const result = await store.setPaused(invalid ? null : uuidOrNull(id), paused);
  return outcome(result, invalid, data => ({ campaign: data.campaign }));
}

export async function scorecard(store, raw) {
  const { from, to, group } = scorecardQuery(raw);
  return [200, { from, to, group, rows: await store.scorecard(from, to, group) }];
}

export async function usage(store, raw) {
  const month = monthQuery(raw);
  return [200, { usage: await store.usage(month) }];
}

export async function invoiceLines(store, raw) {
  const month = monthQuery(raw);
  return [200, { month, lines: await store.invoiceLines(month) }];
}

export async function retentionAlerts(store, raw) {
  if (raw.status !== undefined && !['open', 'all'].includes(raw.status)) fail('status must be open or all');
  if (raw.limit !== undefined && !/^[1-9][0-9]{0,2}$/.test(raw.limit)) fail('limit must be 1 to 500');
  const limit = raw.limit === undefined ? 100 : Number(raw.limit);
  if (limit > 500) fail('limit must be 1 to 500');
  return [200, { alerts: await store.retentionAlerts(raw.status !== 'all', limit) }];
}

export async function ackAlert(store, id, invalid = null) {
  const result = await store.ackAlert(invalid ? null : uuidOrNull(id));
  return outcome(result, invalid, data => ({ alert: data.alert }));
}

export async function screenerScripts(store, raw) {
  if (raw.campaign_id !== undefined && !uuidOrNull(raw.campaign_id)) fail('invalid campaign_id');
  return [200, { scripts: await store.screenerScripts(uuidOrNull(raw.campaign_id)) }];
}

export async function createScreenerDraft(store, body, invalid = null) {
  let draft;
  if (!invalid) {
    try { draft = scriptDraft(body); } catch (error) { if (!(error instanceof Invalid)) throw error; invalid = error.message; }
  }
  if (invalid) draft = { campaignId: isObject(body) ? uuidOrNull(body.campaign_id) : null, script: {} };
  const result = await store.createScreenerDraft(draft.campaignId, draft.script);
  const [status, response] = outcome(result, invalid, data => ({ script: data.script }));
  return [status === 200 ? 201 : status, response];
}

/**
 * The buyer API store: every routine takes the key id, never a tenant, and the
 * database derives the tenant and writes buyer_api_audit (migration 184).
 * `rpc(name, args)` already carries p_key.
 */
export function keyStore(rpc) {
  return {
    campaigns: () => rpc('buyer_campaigns', {}),
    updateCampaign: (campaign, patch) => rpc('buyer_update_campaign', { p_campaign: campaign, p_patch: patch }),
    setPaused: (campaign, paused) => rpc('buyer_set_campaign_paused', { p_campaign: campaign, p_paused: paused }),
    scorecard: (from, to, group) => rpc('buyer_scorecard', { p_from: from, p_to: to, p_group: group }),
    usage: month => rpc('buyer_usage', { p_month: month }),
    invoiceLines: month => rpc('buyer_invoice_lines', { p_month: month }),
    retentionAlerts: (openOnly, limit) => rpc('buyer_retention_alerts', { p_open_only: openOnly, p_limit: limit }),
    ackAlert: alert => rpc('buyer_ack_retention_alert', { p_alert: alert }),
    screenerScripts: campaign => rpc('buyer_screener_scripts', { p_campaign: campaign }),
    createScreenerDraft: (campaign, script) => rpc('buyer_create_screener_draft', { p_campaign: campaign, p_script: script }),
  };
}

const CAMPAIGN_COLUMNS = 'id,tenant_id,source_id,name,product_line,active,engine_mode,allowed_states,pricing_model,rate,'
  + 'transfer_number,staffed_hours_override,daily_budget_calls,exchange_daily_cap,exchange_hourly_cap,retention_mode,'
  + 'screener_mode,performance_routing,channel,created_at,updated_at';
const SCRIPT_COLUMNS = 'id,campaign_id,version,status,opening,q_medicare,q_zip,q_reason,q_connect,pass_line,fail_line,'
  + 'disclaimer,voice,approved_at,created_at';

class StoreError extends Error {}
const checked = ({ data, error }) => { if (error) throw new StoreError('buyer_store_failed'); return data; };
const rows = data => (Array.isArray(data) ? data : data == null ? [] : [data]);

/** The buyer API campaign shape (buyer_api_campaign_json, 184) plus channel. */
function campaignJson(c, controls) {
  return { id: c.id, name: c.name, product_line: c.product_line, active: c.active, engine_mode: c.engine_mode,
    allowed_states: c.allowed_states, pricing_model: c.pricing_model, rate: c.rate, transfer_number: c.transfer_number,
    staffed_hours_override: c.staffed_hours_override, daily_budget_calls: c.daily_budget_calls,
    exchange_daily_cap: c.exchange_daily_cap, exchange_hourly_cap: c.exchange_hourly_cap,
    retention_mode: c.retention_mode, screener_mode: c.screener_mode, performance_routing: c.performance_routing,
    channel: c.channel ?? 'call',
    paused: controls.some(p => p.paused && p.source_id === c.source_id && (p.campaign_id == null || p.campaign_id === c.id)),
    created_at: c.created_at, updated_at: c.updated_at };
}

/**
 * The portal store: the same operations bound to one tenant by the server
 * from the signed-in administrator, never from input. Writes go through the
 * tenant filter and are audited with `audit(entry)` (admin_action_log) before
 * they run, so an audit failure blocks the write. Rejected and not found
 * attempts are audited too, as in buyer_api_audit.
 */
export function tenantStore(db, { tenantId, actor, audit }) {
  if (!uuidOrNull(tenantId) || !actor || typeof audit !== 'function') throw new Error('tenant store requires tenant, actor and audit');
  const controls = async () => checked(await db.from('ping_source_controls').select('source_id,campaign_id,paused')
    .eq('tenant_id', tenantId).eq('paused', true));
  const campaign = async id => (id ? checked(await db.from('ping_campaigns').select(CAMPAIGN_COLUMNS)
    .eq('tenant_id', tenantId).eq('id', id).maybeSingle()) : null);
  const record = (op, target, result, detail = {}) => audit({ op, target_type: target.type, target_id: target.id ?? null,
    result, detail });
  return {
    async campaigns() {
      const [list, paused] = [checked(await db.from('ping_campaigns').select(CAMPAIGN_COLUMNS).eq('tenant_id', tenantId)
        .order('name')), await controls()];
      return rows(list).map(c => campaignJson(c, rows(paused)));
    },
    async updateCampaign(id, patch) {
      let ok = true;
      try { campaignPatch(patch); } catch (error) { if (!(error instanceof Invalid)) throw error; ok = false; }
      const fields = isObject(patch) ? Object.keys(patch).map(key => key.slice(0, 64)).sort() : [];
      const current = ok ? await campaign(id) : null;
      if (!ok || !current) {
        await record('campaign_update', { type: 'ping_campaigns', id: current?.id }, 'denied', { fields });
        return { status: ok ? 'not_found' : 'invalid' };
      }
      await record('campaign_update', { type: 'ping_campaigns', id: current.id }, 'authorized', { changes: patch });
      const updated = checked(await db.from('ping_campaigns').update(patch).eq('tenant_id', tenantId).eq('id', current.id)
        .select(CAMPAIGN_COLUMNS).single());
      return { status: 'ok', campaign: campaignJson(updated, rows(await controls())) };
    },
    async setPaused(id, paused) {
      if (typeof paused !== 'boolean') throw new Error('Pause state required');
      const current = await campaign(id);
      const op = paused ? 'campaign_pause' : 'campaign_resume';
      if (!current) { await record(op, { type: 'ping_campaigns' }, 'denied'); return { status: 'not_found' }; }
      await record(op, { type: 'ping_campaigns', id: current.id }, 'authorized');
      checked(await db.rpc('set_ping_source_control', { p_tenant: tenantId, p_source: current.source_id,
        p_campaign: current.id, p_paused: paused, p_actor: actor }));
      return { status: 'ok', campaign: campaignJson(current, rows(await controls())) };
    },
    scorecard: async (from, to, group) => rows(checked(await db.rpc('ping_scorecard',
      { p_tenant: tenantId, p_from: from, p_to: to, p_group: group }))),
    usage: async month => checked(await db.rpc('platform_usage_summary', { p_tenant: tenantId, p_month: month })),
    invoiceLines: async month => rows(checked(await db.rpc('platform_invoice_lines', { p_tenant: tenantId, p_month: month })))
      .sort((a, b) => a.line_no - b.line_no),
    async retentionAlerts(openOnly, limit) {
      let query = db.from('ping_retention_alerts')
        .select('id,campaign_id,contact_id,owner_agent_id,decision_id,created_at,acknowledged_at').eq('tenant_id', tenantId);
      if (openOnly) query = query.is('acknowledged_at', null);
      return rows(checked(await query.order('created_at', { ascending: false }).limit(Math.max(1, Math.min(limit ?? 100, 500)))));
    },
    async ackAlert(id) {
      const alert = id ? checked(await db.from('ping_retention_alerts').select('id,campaign_id,acknowledged_at')
        .eq('tenant_id', tenantId).eq('id', id).maybeSingle()) : null;
      if (!alert) { await record('alert_ack', { type: 'ping_retention_alerts' }, 'denied'); return { status: 'not_found' }; }
      await record('alert_ack', { type: 'ping_retention_alerts', id: alert.id }, 'authorized');
      // A second acknowledgement keeps the first time.
      const current = alert.acknowledged_at ? alert : checked(await db.from('ping_retention_alerts')
        .update({ acknowledged_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', alert.id)
        .select('id,campaign_id,acknowledged_at').single());
      return { status: 'ok', alert: { id: current.id, campaign_id: current.campaign_id, acknowledged_at: current.acknowledged_at } };
    },
    async screenerScripts(campaignId) {
      let query = db.from('screener_scripts').select(SCRIPT_COLUMNS).eq('tenant_id', tenantId);
      if (campaignId) query = query.eq('campaign_id', campaignId);
      return rows(checked(await query.order('version'))).sort((a, b) => String(a.campaign_id).localeCompare(String(b.campaign_id))
        || a.version - b.version);
    },
    async createScreenerDraft(campaignId, script) {
      let ok = isObject(script);
      try { scriptDraft({ campaign_id: campaignId ?? '', ...script }); } catch (error) { if (!(error instanceof Invalid)) throw error; ok = false; }
      const current = await campaign(campaignId);
      if (!ok || !current) {
        await record('screener_draft_create', { type: 'screener_scripts', id: current?.id }, 'denied');
        return { status: !ok ? 'invalid' : 'not_found' };
      }
      await record('screener_draft_create', { type: 'ping_campaigns', id: current.id }, 'authorized');
      // Drafts only; approval stays with the operator. A concurrent draft for the
      // same campaign takes the next version (UNIQUE(campaign_id,version)).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const latest = rows(checked(await db.from('screener_scripts').select('version').eq('campaign_id', current.id)
          .order('version', { ascending: false }).limit(1)));
        const { data, error } = await db.from('screener_scripts').insert({ id: randomUUID(), tenant_id: tenantId,
          campaign_id: current.id, version: (latest[0]?.version ?? 0) + 1, ...script, voice: script.voice ?? 'Polly.Joanna' })
          .select('id,campaign_id,version,status,created_at').single();
        if (!error) return { status: 'ok', script: data };
        if (error.code !== '23505') throw new StoreError('buyer_store_failed');
      }
      throw new StoreError('buyer_store_failed');
    },
  };
}
