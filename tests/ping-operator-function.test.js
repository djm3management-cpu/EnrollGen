// Netlify ping-operator (S8b): both flags gate, only an administrator of the
// deployment's own tenant gets in, explicit action and input allowlists,
// one time plaintext keys that are never stored, and an admin_action_log row
// before every write. Runs against migrations 171 to 187 in PGlite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPingOperatorHandler } from '../netlify/functions/ping-operator.js';
import { OPERATOR_ACTIONS } from '../telephony/src/ping/operatorOps.js';
import { createPortalDb, portalClient, BUYERS, OP, S9_FEATURES, exchangePing } from './helpers/pingPortalDb.js';

const A = BUYERS.east;
let pg; let campaigns; let flags;

before(async () => { ({ pg, campaigns } = await createPortalDb()); });
after(async () => { await pg.close(); });

const identity = (tenant, { admin = true } = {}) => ({ admin, tenant: { id: tenant }, agent: { id: 'agent' },
  auth: { userId: 'user_operator' } });

function handler({ who = identity(OP.tenant), db = null, enabledFlags = null, auth = null } = {}) {
  flags = enabledFlags ?? { ...S9_FEATURES };
  return createPingOperatorHandler({
    authenticate: async () => auth ?? { userId: who.auth.userId },
    getDb: () => db ?? portalClient(pg),
    resolveIdentity: async () => who,
    enabled: name => Boolean(flags[name]),
    profile: () => ({ tenantId: OP.tenant }),
  });
}

const url = query => `https://app.example/.netlify/functions/ping-operator${query ? `?${query}` : ''}`;
async function get(h, query) { const r = await h(new Request(url(query))); return { status: r.status, body: await r.json() }; }
async function post(h, body) {
  const r = await h(new Request(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
}
const audits = async () => (await pg.query(
  "SELECT * FROM admin_action_log WHERE action='ping_operator' ORDER BY occurred_at,id")).rows;

test('both PING_PLATFORM_ENABLED and PING_EXCHANGE_ENABLED are required before authentication', async () => {
  for (const off of ['PING_PLATFORM_ENABLED', 'PING_EXCHANGE_ENABLED']) {
    const h = handler({ enabledFlags: { ...S9_FEATURES, [off]: false }, auth: { response: new Response('{}', { status: 401 }) } });
    const response = await get(h, 'action=sources');
    assert.equal(response.status, 503);
    assert.equal(response.body.feature, off);
  }
});

test('auth passes through; a buyer administrator and a non admin operator member are forbidden and write nothing', async () => {
  assert.equal((await get(handler({ auth: { response: new Response('{}', { status: 401 }) } }), 'action=sources')).status, 401);
  const writes = [];
  for (const who of [identity(A.tenant), identity(OP.tenant, { admin: false })]) {
    const h = handler({ who, db: portalClient(pg, { writes }) });
    assert.equal((await get(h, 'action=sources')).status, 403);
    assert.equal((await post(h, { action: 'source_create', name: 'Forbidden source' })).status, 403);
    assert.equal((await post(h, { action: 'key_create', tenant_id: A.tenant, name: 'k', scopes: ['campaigns:read'] })).status, 403);
  }
  assert.deepEqual(writes, []);
});

test('unknown actions, fields and values are 400 and the method must match the action', async () => {
  const h = handler();
  assert.equal((await get(h, 'action=drop_everything')).status, 400);
  assert.equal((await get(h, 'action=sources&tenant_id=x')).status, 400);
  assert.equal((await get(h, 'action=source_create&name=x')).status, 400);
  assert.equal((await post(h, { action: 'sources' })).status, 400);
  assert.equal((await post(h, { action: 'source_create', name: 'x', ping_key_hash: 'f'.repeat(64) })).status, 400);
  assert.equal((await post(h, { action: 'source_strategy', source_id: OP.source, strategy: 'lowest_price' })).status, 400);
  assert.equal((await post(h, { action: 'route_update', route_id: OP.source, weight: 0 })).status, 400);
  assert.equal((await post(h, { action: 'plan_set', tenant_id: A.tenant, overage_per_ping: -1 })).status, 400);
  assert.equal((await post(h, { action: 'key_create', tenant_id: A.tenant, name: 'k', scopes: ['admin'] })).status, 400);
  assert.equal((await get(h, 'action=network&from=2026-11-01&to=2026-11-02&group=agent')).status, 400);
  assert.equal((await audits()).length, 0);
  for (const entry of Object.values(OPERATOR_ACTIONS)) assert.equal(typeof entry.fields, 'object');
});

test('creating a publisher returns the plaintext key once, stores only its hash and starts on priority_waterfall', async () => {
  const h = handler();
  const created = await post(h, { action: 'source_create', name: 'Synthetic Publisher Two' });
  assert.equal(created.status, 201);
  assert.match(created.body.key, /^egp_[0-9a-f]{64}$/);
  const { rows: [row] } = await pg.query('SELECT * FROM lead_sources WHERE id=$1', [created.body.source.id]);
  assert.equal(row.tenant_id, OP.tenant);
  assert.equal(row.ping_key_hash, createHash('sha256').update(created.body.key).digest('hex'));
  const { rows: [exchange] } = await pg.query('SELECT strategy FROM exchange_sources WHERE source_id=$1', [row.id]);
  assert.equal(exchange.strategy, 'priority_waterfall');
  const listed = (await get(h, 'action=sources')).body.sources;
  const mine = listed.find(s => s.id === row.id);
  assert.equal(mine.has_key, true);
  assert.ok(!JSON.stringify(listed).includes(row.ping_key_hash));
  assert.ok(!JSON.stringify(listed).includes(created.body.key));
  const audit = (await audits()).find(r => r.after_summary.op === 'source_create');
  assert.equal(audit.actor_id, 'user_operator');
  assert.ok(!JSON.stringify(audit).includes(created.body.key));
  assert.ok(!JSON.stringify(audit).includes(row.ping_key_hash));

  assert.equal((await post(h, { action: 'source_sandbox', source_id: row.id, sandbox: true })).body.source.sandbox, true);
  assert.equal((await post(h, { action: 'source_strategy', source_id: row.id, strategy: 'highest_price' })).body
    .exchange_source.strategy, 'highest_price');
  // A buyer's intake source is not an operator publisher.
  assert.equal((await post(h, { action: 'source_sandbox', source_id: A.source, sandbox: true })).status, 400);
  assert.equal((await pg.query('SELECT sandbox FROM lead_sources WHERE id=$1', [A.source])).rows[0].sandbox, false);
});

test('routes: list, create, update and deactivate, each audited', async () => {
  const h = handler();
  const listed = await get(h, `action=routes&source_id=${OP.source}`);
  assert.equal(listed.body.strategy, 'priority_waterfall');
  assert.equal(listed.body.routes.length, 3);
  const route = listed.body.routes.find(r => r.campaign_id === campaigns.east);
  const updated = await post(h, { action: 'route_update', route_id: route.id, priority: 7, weight: 3, price_override: 12.5 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.route.priority, 7);
  assert.equal(Number(updated.body.route.price_override), 12.5);
  assert.equal((await post(h, { action: 'route_update', route_id: route.id })).status, 400);
  assert.equal((await post(h, { action: 'route_deactivate', route_id: route.id })).body.route.active, false);
  assert.equal((await post(h, { action: 'route_create', source_id: OP.source, campaign_id: campaigns.east })).status, 400);
  const { rows: [source] } = await pg.query("SELECT id FROM lead_sources WHERE name='Synthetic Publisher Two'");
  const created = await post(h, { action: 'route_create', source_id: source.id, campaign_id: campaigns.pacific, priority: 2 });
  assert.equal(created.status, 201);
  assert.equal(created.body.route.weight, 1);
  const ops = (await audits()).map(r => r.after_summary.op);
  for (const op of ['route_update', 'route_deactivate', 'route_create']) assert.ok(ops.includes(op), op);
});

test('plans: list tenants and set a plan per buyer tenant', async () => {
  const h = handler();
  const listed = (await get(h, 'action=plans')).body;
  assert.ok(listed.tenants.some(t => t.id === A.tenant && t.name === 'Synthetic east agency'));
  assert.ok(listed.plans.some(p => p.tenant_id === A.tenant));
  const set = await post(h, { action: 'plan_set', tenant_id: A.tenant, included_pings: 500, per_routed_call: 1.75 });
  assert.equal(set.status, 200);
  assert.equal(set.body.plan.included_pings, 500);
  assert.equal(Number(set.body.plan.per_routed_call), 1.75);
  const fresh = await post(h, { action: 'plan_set', tenant_id: OP.tenant, included_pings: 10 });
  assert.equal(fresh.body.plan.tenant_id, OP.tenant);
  assert.equal((await audits()).filter(r => r.after_summary.op === 'plan_set').length, 2);
});

test('network scorecard groups by buyer tenant and source across tenants', async () => {
  await exchangePing(pg, { phone: '+15550009101', callId: 'operator-portal-1' });
  const from = new Date(Date.now() - 86400000).toISOString(); const to = new Date(Date.now() + 86400000).toISOString();
  const response = await get(handler(), `action=network&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&group=buyer_tenant,source`);
  assert.equal(response.status, 200);
  assert.ok(response.body.rows.length >= 2);
  assert.ok(response.body.rows.every(r => 'buyer_tenant' in r && 'source' in r));
  const off = handler({ enabledFlags: { ...S9_FEATURES, PING_SCORECARD_ENABLED: false } });
  assert.equal((await get(off, `action=network&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).status, 503);
});

test('screener scripts: the operator approves and retires, with the approver recorded', async () => {
  const { rows: [script] } = await pg.query(`INSERT INTO screener_scripts(tenant_id,campaign_id,version,opening,q_medicare,q_zip,
    q_reason,q_connect,pass_line,fail_line) VALUES($1,$2,1,'o','m','z','r','c','p','f') RETURNING id`, [A.tenant, campaigns.east]);
  const h = handler();
  assert.ok((await get(h, 'action=scripts')).body.scripts.some(s => s.id === script.id));
  const approved = await post(h, { action: 'script_approve', script_id: script.id });
  assert.equal(approved.body.script.status, 'approved');
  assert.equal(approved.body.script.approved_by, 'user_operator');
  assert.equal((await post(h, { action: 'script_approve', script_id: script.id })).status, 400);
  assert.equal((await post(h, { action: 'script_retire', script_id: script.id })).body.script.status, 'retired');
  const ops = (await audits()).filter(r => r.target_id === script.id).map(r => r.after_summary.op);
  assert.deepEqual(ops, ['script_approve', 'script_retire']);
});

test('buyer API keys: create reveals the plaintext once, list never shows it, revoke is audited', async () => {
  const h = handler();
  const created = await post(h, { action: 'key_create', tenant_id: A.tenant, name: 'Synthetic integration',
    scopes: ['reports:read', 'campaigns:read'] });
  assert.equal(created.status, 201);
  assert.match(created.body.plaintext, /^egb_[0-9a-f]{64}$/);
  assert.deepEqual(created.body.key.scopes, ['campaigns:read', 'reports:read']);
  const listed = await get(h, 'action=keys');
  assert.ok(listed.body.keys.some(k => k.id === created.body.key.id && k.active));
  assert.ok(!JSON.stringify(listed.body).includes(created.body.plaintext));
  assert.ok(!JSON.stringify(listed.body).includes('key_hash'));
  const { rows: [audit] } = await pg.query("SELECT actor FROM buyer_api_audit WHERE key_id=$1 AND action='key_created'", [created.body.key.id]);
  assert.equal(audit.actor, 'user_operator');
  const revoked = await post(h, { action: 'key_revoke', key_id: created.body.key.id });
  assert.equal(revoked.body.key.active, false);
  const ops = (await audits()).map(r => r.after_summary.op);
  assert.ok(ops.includes('key_create') && ops.includes('key_revoke'));
  assert.ok(!JSON.stringify(await audits()).includes(created.body.plaintext));
});

test('when the audit write fails no publisher is created and no key is minted', async () => {
  const h = handler({ db: portalClient(pg, { failInsertInto: 'admin_action_log' }) });
  assert.equal((await post(h, { action: 'source_create', name: 'Never created' })).status, 503);
  assert.equal((await pg.query("SELECT count(*)::int n FROM lead_sources WHERE name='Never created'")).rows[0].n, 0);
  const keys = (await pg.query('SELECT count(*)::int n FROM buyer_api_keys')).rows[0].n;
  assert.equal((await post(h, { action: 'key_create', tenant_id: A.tenant, name: 'x', scopes: ['campaigns:read'] })).status, 503);
  assert.equal((await pg.query('SELECT count(*)::int n FROM buyer_api_keys')).rows[0].n, keys);
});
