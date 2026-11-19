// Operator operations for the exchange (spec sections 8 and 9; session S8b).
// Only the platform operator (the deployment's own tenant, verified by the
// caller) reaches these. Every action has an explicit input allowlist and
// unknown fields are rejected. Every write is audited with `audit(entry)`
// (admin_action_log) before it runs, so an audit failure blocks the write; the
// existing per table audits (buyer_api_audit, screener_script_audit and the
// lead_sources operator trigger) still record their own rows. Plaintext keys
// are returned once and never stored or logged; hashes are never returned.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Invalid, fail, isObject, uuidOrNull, scorecardQuery, BUYER_SCOPES, SCORECARD_GROUPS } from './buyerOps.js';
import { ATTESTATION_COLUMNS, attestationView, checkAttestation } from './attestations.js';

export const STRATEGIES = Object.freeze(['priority_waterfall', 'weighted_rotation', 'highest_price']);
export const SOURCE_TYPES = Object.freeze(['publisher', 'aggregator']);
export const NETWORK_GROUPS = Object.freeze(['buyer_tenant', ...SCORECARD_GROUPS]);
const PLAN_FIELDS = Object.freeze(['included_pings', 'overage_per_ping', 'per_routed_call', 'per_screener_minute',
  'per_screened_qualified']);

class StoreError extends Error {}
const checked = ({ data, error }) => { if (error) throw new StoreError('operator_store_failed'); return data; };
const rows = data => (Array.isArray(data) ? data : data == null ? [] : [data]);

const uuid = (value, name) => uuidOrNull(value) ?? fail(`invalid ${name}`);
const bool = (value, name) => (typeof value === 'boolean' ? value : fail(`invalid ${name}`));
const int = (min, max) => (value, name) => (Number.isInteger(value) && value >= min && value <= max ? value : fail(`invalid ${name}`));
const money = (value, name) => (value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0
  && value <= 100000 && Math.round(value * 10000) === value * 10000) ? value : fail(`invalid ${name}`));
const plainMoney = (value, name) => (value === null ? fail(`invalid ${name}`) : money(value, name));
const label = (value, name) => (typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 128
  && ![...value].some(ch => ch.charCodeAt(0) < 32) ? value.trim() : fail(`invalid ${name}`));
const oneOf = list => (value, name) => (list.includes(value) ? value : fail(`invalid ${name}`));
const scopes = value => (Array.isArray(value) && value.length >= 1 && value.length <= BUYER_SCOPES.length
  && value.every(scope => BUYER_SCOPES.includes(scope)) && new Set(value).size === value.length ? [...value].sort()
  : fail('invalid scopes'));
const text = (value, name) => (typeof value === 'string' && value.length <= 64 ? value : fail(`invalid ${name}`));
const text200 = (value, name) => (typeof value === 'string' && value.length <= 200 ? value : fail(`invalid ${name}`));

/**
 * Checks `input` against `fields` ({name: [validator, required]}). Unknown
 * fields are Invalid. Returns only the allowlisted, validated fields.
 */
export function allow(input, fields) {
  if (input === undefined || input === null) input = {};
  if (!isObject(input)) fail('input must be an object');
  for (const key of Object.keys(input)) if (!Object.hasOwn(fields, key)) fail(`unknown field ${key.slice(0, 64)}`);
  const out = {};
  for (const [key, [check, required]] of Object.entries(fields)) {
    if (input[key] === undefined) { if (required) fail(`missing ${key}`); continue; }
    out[key] = check(input[key], key);
  }
  return out;
}

const R = true; const O = false;
const tenantName = t => t.agency_display_name || t.name || t.id;

/**
 * The operator action table. Each entry: write (audited), fields (input
 * allowlist) and run(ctx, input) returning the response body.
 */
export const OPERATOR_ACTIONS = Object.freeze({
  sources: { write: false, fields: {}, async run({ db, operatorTenant }) {
    const list = rows(checked(await db.from('lead_sources').select('id,name,type,active,sandbox,ping_key_hash,created_at')
      .eq('tenant_id', operatorTenant).in('type', SOURCE_TYPES).order('name')));
    const exchange = list.length ? rows(checked(await db.from('exchange_sources').select('source_id,strategy,active')
      .in('source_id', list.map(s => s.id)))) : [];
    return { sources: list.map(({ ping_key_hash: hash, ...s }) => ({ ...s, has_key: Boolean(hash),
      strategy: exchange.find(e => e.source_id === s.id)?.strategy ?? null,
      exchange_active: exchange.find(e => e.source_id === s.id)?.active ?? false })) };
  } },
  source_create: { write: true, target: 'lead_sources', fields: { name: [label, R], type: [oneOf(SOURCE_TYPES), O],
    sandbox: [bool, O] }, async run({ db, operatorTenant, audit }, input) {
    const key = `egp_${randomBytes(32).toString('hex')}`;
    await audit({ op: 'source_create', target_type: 'lead_sources', target_id: null, result: 'authorized',
      detail: { name: input.name, type: input.type ?? 'publisher', sandbox: input.sandbox ?? false } });
    const source = checked(await db.from('lead_sources').insert({ id: randomUUID(), tenant_id: operatorTenant, name: input.name,
      type: input.type ?? 'publisher', active: true, sandbox: input.sandbox ?? false,
      ping_key_hash: createHash('sha256').update(key).digest('hex') }).select('id,name,type,active,sandbox,created_at').single());
    // D5: new exchange sources start on priority_waterfall.
    checked(await db.from('exchange_sources').insert({ source_id: source.id, strategy: 'priority_waterfall' }).select('source_id').single());
    return { source: { ...source, has_key: true, strategy: 'priority_waterfall', exchange_active: true }, key };
  } },
  source_sandbox: { write: true, fields: { source_id: [uuid, R], sandbox: [bool, R] },
    async run({ db, operatorTenant, audit }, input) {
      const source = await ownSource(db, operatorTenant, input.source_id);
      await audit({ op: 'source_sandbox', target_type: 'lead_sources', target_id: source.id, result: 'authorized',
        detail: { sandbox: input.sandbox } });
      return { source: checked(await db.from('lead_sources').update({ sandbox: input.sandbox }).eq('tenant_id', operatorTenant)
        .eq('id', source.id).select('id,name,type,active,sandbox,created_at').single()) };
    } },
  source_strategy: { write: true, fields: { source_id: [uuid, R], strategy: [oneOf(STRATEGIES), R] },
    async run({ db, operatorTenant, audit }, input) {
      const source = await ownSource(db, operatorTenant, input.source_id);
      await audit({ op: 'source_strategy', target_type: 'exchange_sources', target_id: source.id, result: 'authorized',
        detail: { strategy: input.strategy } });
      const existing = checked(await db.from('exchange_sources').select('source_id').eq('source_id', source.id).maybeSingle());
      const write = existing
        ? db.from('exchange_sources').update({ strategy: input.strategy }).eq('source_id', source.id)
        : db.from('exchange_sources').insert({ source_id: source.id, strategy: input.strategy });
      return { exchange_source: checked(await write.select('source_id,strategy,active').single()) };
    } },
  // Spec v5: publisher attestations (migration 190). Feature gated; the
  // lead_sources operator trigger also records every change.
  source_attestations: { write: false, feature: 'SOURCE_ATTESTATIONS_ENABLED', fields: {}, async run({ db, operatorTenant }) {
    const list = rows(checked(await db.from('lead_sources').select(ATTESTATION_COLUMNS).eq('tenant_id', operatorTenant)
      .in('type', SOURCE_TYPES).order('name')));
    const campaigns = rows(checked(await db.from('ping_campaigns').select('id,tenant_id,name,require_source_attestations').order('name')));
    return { sources: list.map(source => attestationView(source)), campaigns };
  } },
  source_attestation: { write: true, feature: 'SOURCE_ATTESTATIONS_ENABLED', fields: { source_id: [uuid, R],
    onshore_operation: [bool, R], no_resale: [bool, R], consent_language_reviewed: [bool, R],
    attestation_document_ref: [(value, name) => (value === null ? null : text200(value, name)), R], expires_at: [text, R] },
  async run({ db, operatorTenant, audit, actor }, input) {
    const source = await ownSource(db, operatorTenant, input.source_id);
    const { patch, error } = checkAttestation(input, actor);
    if (error) fail(error);
    await audit({ op: 'source_attestation', target_type: 'lead_sources', target_id: source.id, result: 'authorized',
      detail: { onshore_operation: patch.onshore_operation, no_resale: patch.no_resale, consent_language_reviewed: patch.consent_language_reviewed,
        attestation_document_ref: patch.attestation_document_ref, expires_at: patch.attestation_expires_at } });
    return { source: attestationView(checked(await db.from('lead_sources').update(patch).eq('tenant_id', operatorTenant)
      .eq('id', source.id).select(ATTESTATION_COLUMNS).single())) };
  } },
  campaign_attestations: { write: true, feature: 'SOURCE_ATTESTATIONS_ENABLED', fields: { campaign_id: [uuid, R],
    require_source_attestations: [bool, R] },
  async run({ db, audit }, input) {
    const campaign = checked(await db.from('ping_campaigns').select('id').eq('id', input.campaign_id).maybeSingle());
    if (!campaign) fail('unknown campaign_id');
    await audit({ op: 'campaign_attestations', target_type: 'ping_campaigns', target_id: campaign.id, result: 'authorized',
      detail: { require_source_attestations: input.require_source_attestations } });
    return { campaign: checked(await db.from('ping_campaigns').update({ require_source_attestations: input.require_source_attestations })
      .eq('id', campaign.id).select('id,tenant_id,name,require_source_attestations').single()) };
  } },
  campaigns: { write: false, fields: {}, async run({ db }) {
    return { campaigns: rows(checked(await db.from('ping_campaigns').select('id,tenant_id,name,channel,active,product_line')
      .order('name'))) };
  } },
  routes: { write: false, fields: { source_id: [uuid, R] }, async run({ db, operatorTenant }, input) {
    const source = await ownSource(db, operatorTenant, input.source_id);
    const exchange = checked(await db.from('exchange_sources').select('source_id,strategy,active').eq('source_id', source.id)
      .maybeSingle());
    return { strategy: exchange?.strategy ?? null, routes: rows(checked(await db.from('exchange_routes')
      .select('id,source_id,campaign_id,priority,weight,price_override,active,created_at').eq('source_id', source.id)
      .order('priority'))) };
  } },
  route_create: { write: true, fields: { source_id: [uuid, R], campaign_id: [uuid, R], priority: [int(0, 100000), O],
    weight: [int(1, 1000), O], price_override: [money, O], active: [bool, O] },
  async run({ db, operatorTenant, audit }, input) {
    const source = await ownSource(db, operatorTenant, input.source_id);
    const campaign = checked(await db.from('ping_campaigns').select('id').eq('id', input.campaign_id).maybeSingle());
    if (!campaign) fail('unknown campaign_id');
    await audit({ op: 'route_create', target_type: 'exchange_routes', target_id: null, result: 'authorized', detail: input });
    const { data, error } = await db.from('exchange_routes').insert({ source_id: source.id, campaign_id: campaign.id,
      priority: input.priority ?? 100, weight: input.weight ?? 1, price_override: input.price_override ?? null,
      active: input.active ?? true }).select('id,source_id,campaign_id,priority,weight,price_override,active,created_at').single();
    if (error?.code === '23505') fail('route already exists');
    return { route: checked({ data, error }) };
  } },
  route_update: { write: true, fields: { route_id: [uuid, R], priority: [int(0, 100000), O], weight: [int(1, 1000), O],
    price_override: [money, O], active: [bool, O] },
  async run(ctx, input) {
    const { route_id: id, ...changes } = input;
    if (!Object.keys(changes).length) fail('nothing to change');
    return { route: await changeRoute(ctx, id, changes, 'route_update') };
  } },
  route_deactivate: { write: true, fields: { route_id: [uuid, R] },
    run: async (ctx, input) => ({ route: await changeRoute(ctx, input.route_id, { active: false }, 'route_deactivate') }) },
  plans: { write: false, fields: {}, async run({ db }) {
    const tenants = rows(checked(await db.from('tenants').select('id,name,agency_display_name').order('name')));
    const plans = rows(checked(await db.from('platform_price_plans').select(`tenant_id,${PLAN_FIELDS.join(',')},effective_at`)));
    return { tenants: tenants.map(t => ({ id: t.id, name: tenantName(t) })), plans };
  } },
  plan_set: { write: true, fields: { tenant_id: [uuid, R], included_pings: [int(0, 100000000), O],
    overage_per_ping: [plainMoney, O], per_routed_call: [plainMoney, O], per_screener_minute: [plainMoney, O],
    per_screened_qualified: [plainMoney, O] },
  async run({ db, audit }, input) {
    const { tenant_id: tenantId, ...values } = input;
    if (!Object.keys(values).length) fail('nothing to change');
    const tenant = checked(await db.from('tenants').select('id').eq('id', tenantId).maybeSingle());
    if (!tenant) fail('unknown tenant_id');
    await audit({ op: 'plan_set', target_type: 'platform_price_plans', target_id: tenant.id, result: 'authorized', detail: values });
    const existing = checked(await db.from('platform_price_plans').select('tenant_id').eq('tenant_id', tenant.id).maybeSingle());
    const row = { ...values, effective_at: new Date().toISOString() };
    const write = existing
      ? db.from('platform_price_plans').update(row).eq('tenant_id', tenant.id)
      : db.from('platform_price_plans').insert({ tenant_id: tenant.id, ...row });
    return { plan: checked(await write.select(`tenant_id,${PLAN_FIELDS.join(',')},effective_at`).single()) };
  } },
  network: { write: false, feature: 'PING_SCORECARD_ENABLED', fields: { from: [text, R], to: [text, R], group: [text, O] },
    async run({ db }, input) {
      const { from, to, group } = scorecardQuery(input, NETWORK_GROUPS);
      return { from, to, group, rows: rows(checked(await db.rpc('ping_operator_scorecard', { p_from: from, p_to: to, p_group: group }))) };
    } },
  scripts: { write: false, feature: 'PING_SCREENER_ENABLED', fields: {}, async run({ db }) {
    return { scripts: rows(checked(await db.from('screener_scripts')
      .select('id,tenant_id,campaign_id,version,status,approved_by,approved_at,created_at').order('created_at', { ascending: false })
      .limit(500))) };
  } },
  script_approve: { write: true, feature: 'PING_SCREENER_ENABLED', fields: { script_id: [uuid, R] },
    async run({ db, actor, audit }, input) {
      const script = await existingScript(db, input.script_id);
      if (script.status !== 'draft') fail('only a draft script can be approved');
      await audit({ op: 'script_approve', target_type: 'screener_scripts', target_id: script.id, result: 'authorized',
        detail: { campaign_id: script.campaign_id, version: script.version } });
      checked(await db.rpc('approve_screener_script', { p_script: script.id, p_approved_by: actor }));
      return { script: await existingScript(db, script.id) };
    } },
  script_retire: { write: true, feature: 'PING_SCREENER_ENABLED', fields: { script_id: [uuid, R] },
    async run({ db, audit }, input) {
      const script = await existingScript(db, input.script_id);
      await audit({ op: 'script_retire', target_type: 'screener_scripts', target_id: script.id, result: 'authorized',
        detail: { campaign_id: script.campaign_id, version: script.version } });
      checked(await db.rpc('retire_screener_script', { p_script: script.id }));
      return { script: await existingScript(db, script.id) };
    } },
  keys: { write: false, fields: {}, async run({ db }) {
    return { keys: rows(checked(await db.from('buyer_api_keys')
      .select('id,tenant_id,name,scopes,active,created_at,last_used_at,revoked_at').order('created_at', { ascending: false }))) };
  } },
  key_create: { write: true, fields: { tenant_id: [uuid, R], name: [label, R], scopes: [scopes, R] },
    async run({ db, actor, audit }, input) {
      const tenant = checked(await db.from('tenants').select('id').eq('id', input.tenant_id).maybeSingle());
      if (!tenant) fail('unknown tenant_id');
      await audit({ op: 'key_create', target_type: 'buyer_api_keys', target_id: null, result: 'authorized',
        detail: { tenant_id: tenant.id, name: input.name, scopes: input.scopes } });
      const created = checked(await db.rpc('create_buyer_api_key', { p_tenant: tenant.id, p_name: input.name,
        p_scopes: input.scopes, p_actor: actor }));
      const { key, ...meta } = created;
      return { key: meta, plaintext: key };
    } },
  key_revoke: { write: true, fields: { key_id: [uuid, R] }, async run({ db, actor, audit }, input) {
    const key = checked(await db.from('buyer_api_keys').select('id').eq('id', input.key_id).maybeSingle());
    if (!key) fail('unknown key_id');
    await audit({ op: 'key_revoke', target_type: 'buyer_api_keys', target_id: key.id, result: 'authorized' });
    checked(await db.rpc('revoke_buyer_api_key', { p_key: key.id, p_actor: actor }));
    return { key: checked(await db.from('buyer_api_keys').select('id,tenant_id,name,scopes,active,created_at,last_used_at,revoked_at')
      .eq('id', key.id).single()) };
  } },
});

async function ownSource(db, operatorTenant, id) {
  const source = checked(await db.from('lead_sources').select('id').eq('tenant_id', operatorTenant).eq('id', id)
    .in('type', SOURCE_TYPES).maybeSingle());
  return source ?? fail('unknown source_id');
}

async function existingScript(db, id) {
  const script = checked(await db.from('screener_scripts').select('id,tenant_id,campaign_id,version,status,approved_by,approved_at,created_at')
    .eq('id', id).maybeSingle());
  return script ?? fail('unknown script_id');
}

async function changeRoute({ db, operatorTenant, audit }, id, changes, op) {
  const route = checked(await db.from('exchange_routes').select('id,source_id').eq('id', id).maybeSingle());
  if (!route) fail('unknown route_id');
  await ownSource(db, operatorTenant, route.source_id);
  await audit({ op, target_type: 'exchange_routes', target_id: route.id, result: 'authorized', detail: changes });
  return checked(await db.from('exchange_routes').update(changes).eq('id', route.id)
    .select('id,source_id,campaign_id,priority,weight,price_override,active,created_at').single());
}

/**
 * Runs one operator action. Returns [status, body]. Unknown actions and
 * fields are 400; `enabled(flag)` gates per action features.
 */
export async function runOperatorAction(ctx, action, input, { method = 'POST', enabled = () => true } = {}) {
  const entry = Object.hasOwn(OPERATOR_ACTIONS, action) ? OPERATOR_ACTIONS[action] : null;
  try {
    if (!entry) fail('unknown action');
    if (entry.write !== (method === 'POST')) fail(`${action} requires ${entry.write ? 'POST' : 'GET'}`);
    if (entry.feature && !enabled(entry.feature)) return [503, { status: 'disabled', feature: entry.feature }];
    const clean = allow(input, entry.fields);
    return [entry.write && action.endsWith('_create') ? 201 : 200, await entry.run(ctx, clean)];
  } catch (error) {
    if (error instanceof Invalid) return [400, { error: 'invalid_request', detail: error.message }];
    throw error;
  }
}
