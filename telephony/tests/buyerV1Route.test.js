// /api/buyer/v1 (S8a): auth, scopes, admission, allowlisted fields, unknown
// fields rejected, cross tenant isolation for every endpoint and audit rows on
// writes. The router runs against migration 184 in PGlite through the
// Supabase-shaped client; nothing is stubbed below the HTTP layer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBuyerV1Router, BUYER_ROUTES, campaignPatch } from '../src/routes/buyerV1.js';
import { setFeatures } from './helpers/pingDb.js';
import { supabaseLike } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, BUYERS, OP } from './helpers/exchangeDb.js';
import { createS8Db, S8_FEATURES } from './helpers/pingS8Db.js';
import { addScript } from './helpers/pingS7Db.js';

const ALL = ['campaigns:read', 'campaigns:write', 'reports:read', 'alerts:write', 'screener:write'];
const A = BUYERS.east; const B = BUYERS.central;
let pg; let campaigns; let keys; let alerts; let events; let server; let base;
let flags = () => true; let limit = () => 600;

async function createKey(tenant, scopes = ALL, name = `key-${Math.random()}`) {
  const { rows: [row] } = await pg.query('SELECT create_buyer_api_key($1,$2,$3,$4) AS k', [tenant, name, scopes, 'operator-test']);
  return row.k;
}

async function alertFor(buyer, campaign) {
  const { rows: [d] } = await pg.query(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine)
    VALUES($1,$2,$3,true,'accepted_retention_owner','exchange') RETURNING id`, [buyer.tenant, OP.source, campaign]);
  const { rows: [a] } = await pg.query(`INSERT INTO ping_retention_alerts(tenant_id,contact_id,source_id,campaign_id,decision_id)
    VALUES($1,gen_random_uuid(),$2,$3,$4) RETURNING id`, [buyer.tenant, OP.source, campaign, d.id]);
  return a.id;
}

before(async () => {
  pg = await createS8Db();
  await setFeatures(pg, S8_FEATURES);
  campaigns = await seedExchange(pg);
  // Usage for both buyers: east wins the first auction, every routed buyer is metered.
  await exchangePing(pg, { phone: '+15550009001', callId: 'buyer-api-1' });
  keys = { a: await createKey(A.tenant), b: await createKey(B.tenant), aRead: await createKey(A.tenant, ['campaigns:read']) };
  alerts = { a: await alertFor(A, campaigns.east), b: await alertFor(B, campaigns.central) };
  await addScript(pg, { tenant: B.tenant, campaign: campaigns.central });
  const app = express();
  app.use(express.json());
  app.use(createBuyerV1Router({ db: () => supabaseLike(pg), enabled: name => flags(name), admissionLimit: () => limit(),
    log: event => events.push(event) }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await pg.close(); });

async function call(method, path, { key = keys.a.key, body } = {}) {
  events = [];
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: response.status, headers: response.headers, body: parsed };
}

const campaignRow = async id => (await pg.query('SELECT * FROM ping_campaigns WHERE id=$1', [id])).rows[0];
const audit = async (keyId, action) => (await pg.query(
  'SELECT * FROM buyer_api_audit WHERE key_id=$1 AND action=$2 ORDER BY created_at', [keyId, action])).rows;

test('keys are created once in plaintext and stored only as a hash, with an audit row', async () => {
  assert.match(keys.a.key, /^egb_[0-9a-f]{64}$/);
  const { rows } = await pg.query('SELECT * FROM buyer_api_keys WHERE id=$1', [keys.a.id]);
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows[0]).includes(keys.a.key));
  assert.equal((await audit(keys.a.id, 'key_created')).length, 1);
  await assert.rejects(pg.query('SELECT create_buyer_api_key($1,$2,$3,$4)', [A.tenant, 'bad', ['campaigns:delete'], 'op']));
  await assert.rejects(pg.query('DELETE FROM buyer_api_audit'));
});

test('authentication: missing, unknown and revoked keys are 401; flags off is 503', async () => {
  assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: null })).status, 401);
  assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: 'egb_unknown' })).status, 401);
  const doomed = await createKey(A.tenant);
  assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: doomed.key })).status, 200);
  await pg.query('SELECT revoke_buyer_api_key($1,$2)', [doomed.id, 'operator-test']);
  assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: doomed.key })).status, 401);
  assert.equal((await audit(doomed.id, 'key_revoked')).length, 1);
  await assert.rejects(pg.query('UPDATE buyer_api_keys SET active=true,revoked_at=NULL WHERE id=$1', [doomed.id]));
  flags = name => name !== 'PING_PLATFORM_ENABLED';
  try {
    const off = await call('GET', '/api/buyer/v1/campaigns');
    assert.deepEqual([off.status, off.body.feature], [503, 'PING_PLATFORM_ENABLED']);
  } finally { flags = () => true; }
  flags = name => name !== 'PING_SCORECARD_ENABLED';
  try { assert.equal((await call('GET', '/api/buyer/v1/usage?month=2026-11')).status, 503); } finally { flags = () => true; }
});

test('scopes: a read-only key reads campaigns but every other scope is 403 and changes nothing', async () => {
  const key = keys.aRead.key;
  assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key })).status, 200);
  const before = await campaignRow(campaigns.east);
  for (const [method, path, body] of [['PATCH', `/api/buyer/v1/campaigns/${campaigns.east}`, { active: false }],
    ['POST', `/api/buyer/v1/campaigns/${campaigns.east}/pause`], ['GET', '/api/buyer/v1/usage?month=2026-11'],
    ['POST', `/api/buyer/v1/retention-alerts/${alerts.a}/ack`],
    ['POST', '/api/buyer/v1/screener-scripts', { campaign_id: campaigns.east }]]) {
    const result = await call(method, path, { key, body });
    assert.equal(result.status, 403, path);
    assert.equal(result.body.error, 'insufficient_scope');
  }
  assert.deepEqual(await campaignRow(campaigns.east), before);
  assert.equal((await pg.query('SELECT count(*)::int n FROM buyer_api_audit WHERE key_id=$1 AND action<>$2',
    [keys.aRead.id, 'key_created'])).rows[0].n, 0);
});

test('admission is per key: over the limit is 429 with Retry-After, and another key is unaffected', async () => {
  const key = await createKey(A.tenant);
  limit = () => 2;
  try {
    assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: key.key })).status, 200);
    assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: key.key })).status, 200);
    const limited = await call('GET', '/api/buyer/v1/campaigns', { key: key.key });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) >= 1);
    const other = await createKey(A.tenant);
    assert.equal((await call('GET', '/api/buyer/v1/campaigns', { key: other.key })).status, 200);
  } finally { limit = () => 600; }
});

test('GET campaigns lists only the key tenant campaigns', async () => {
  const a = await call('GET', '/api/buyer/v1/campaigns');
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.campaigns.map(c => c.id), [campaigns.east]);
  const b = await call('GET', '/api/buyer/v1/campaigns', { key: keys.b.key });
  assert.deepEqual(b.body.campaigns.map(c => c.id), [campaigns.central]);
  assert.equal((await call('GET', '/api/buyer/v1/campaigns?tenant_id=x')).status, 400);
});

test('PATCH changes only allowlisted fields and audits every call, rejected ones included', async () => {
  const hours = { timezone: 'America/New_York', days: { mon: { enabled: true, start: '09:00', end: '17:00' } } };
  const ok = await call('PATCH', `/api/buyer/v1/campaigns/${campaigns.east}`, { body: {
    daily_budget_calls: 40, exchange_daily_cap: 30, exchange_hourly_cap: 5, retention_mode: 'reject_and_alert',
    screener_mode: 'inbound_only', performance_routing: true, staffed_hours_override: hours } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const row = await campaignRow(campaigns.east);
  assert.deepEqual([row.daily_budget_calls, row.exchange_daily_cap, row.exchange_hourly_cap, row.retention_mode,
    row.screener_mode, row.performance_routing], [40, 30, 5, 'reject_and_alert', 'inbound_only', true]);
  assert.deepEqual(row.staffed_hours_override, hours);
  assert.equal(ok.body.campaign.daily_budget_calls, 40);
  const before = await campaignRow(campaigns.east);
  for (const body of [{ rate: 1 }, { engine_mode: 'legacy' }, { tenant_id: B.tenant }, { active: false, transfer_number: '+15005550299' },
    { active: 'no' }, { daily_budget_calls: -1 }, { daily_budget_calls: 1.5 }, { retention_mode: 'drop' },
    { staffed_hours_override: { timezone: 'EST', days: {} } }, { staffed_hours_override: { timezone: 'America/Chicago', days: { mon: { enabled: true, start: '17:00', end: '09:00' } } } },
    {}, []]) {
    const result = await call('PATCH', `/api/buyer/v1/campaigns/${campaigns.east}`, { body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(await campaignRow(campaigns.east), before);
  const rows = await audit(keys.a.id, 'campaign_update');
  assert.equal(rows.filter(r => r.outcome === 'ok').length, 1);
  assert.equal(rows.filter(r => r.outcome === 'rejected').length, 12);
  assert.ok(rows.some(r => r.outcome === 'rejected' && JSON.stringify(r.detail.fields).includes('transfer_number')));
  assert.equal(rows.find(r => r.outcome === 'ok').detail.changes.daily_budget_calls, 40);
  assert.deepEqual(campaignPatch({ active: true }), { active: true });
});

test('pause and resume go through ping_source_controls with an audit trail', async () => {
  const paused = await call('POST', `/api/buyer/v1/campaigns/${campaigns.east}/pause`);
  assert.equal(paused.status, 200);
  assert.equal(paused.body.campaign.paused, true);
  const { rows: [control] } = await pg.query('SELECT * FROM ping_source_controls WHERE campaign_id=$1', [campaigns.east]);
  assert.deepEqual([control.paused, control.tenant_id, control.changed_by], [true, A.tenant, `buyer-api:${keys.a.id}`]);
  const resumed = await call('POST', `/api/buyer/v1/campaigns/${campaigns.east}/resume`);
  assert.equal(resumed.body.campaign.paused, false);
  assert.equal((await audit(keys.a.id, 'campaign_pause')).length, 1);
  assert.equal((await audit(keys.a.id, 'campaign_resume')).length, 1);
  assert.equal((await call('POST', `/api/buyer/v1/campaigns/${campaigns.east}/pause?now=1`)).status, 400);
});

test('reports: scorecard, usage and invoice lines validate input and read only the key tenant', async () => {
  const from = new Date(Date.now() - 86400000).toISOString(); const to = new Date(Date.now() + 86400000).toISOString();
  const card = await call('GET', `/api/buyer/v1/scorecard?from=${from}&to=${to}&group=campaign`);
  assert.equal(card.status, 200, JSON.stringify(card.body));
  assert.ok(card.body.rows.length >= 1);
  assert.ok(card.body.rows.every(r => r.campaign === campaigns.east), JSON.stringify(card.body.rows));
  for (const bad of ['', `from=${from}`, `from=${to}&to=${from}`, `from=${from}&to=${to}&group=buyer_tenant`,
    `from=${from}&to=${to}&group=state,state`, `from=2026-01-01&to=2026-12-31`, `from=${from}&to=${to}&tenant=1`]) {
    assert.equal((await call('GET', `/api/buyer/v1/scorecard?${bad}`)).status, 400, bad);
  }
  const month = new Date().toISOString().slice(0, 7);
  const usage = await call('GET', `/api/buyer/v1/usage?month=${month}`);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.usage.tenant_id, A.tenant);
  assert.equal(Number(usage.body.usage.pings), 1);
  const lines = await call('GET', `/api/buyer/v1/invoice-lines?month=${month}`);
  assert.equal(lines.status, 200);
  assert.ok(lines.body.lines.some(l => l.kind === 'ping'));
  for (const bad of ['', 'month=2026-13', 'month=2026-1', `month=${month}&x=1`]) {
    assert.equal((await call('GET', `/api/buyer/v1/usage?${bad}`)).status, 400, bad);
  }
});

test('retention alerts: list and acknowledge only the key tenant alerts', async () => {
  const list = await call('GET', '/api/buyer/v1/retention-alerts');
  assert.deepEqual(list.body.alerts.map(a => a.id), [alerts.a]);
  assert.ok(!JSON.stringify(list.body).includes('+1555'));
  const ack = await call('POST', `/api/buyer/v1/retention-alerts/${alerts.a}/ack`);
  assert.equal(ack.status, 200);
  assert.ok(ack.body.alert.acknowledged_at);
  assert.deepEqual((await call('GET', '/api/buyer/v1/retention-alerts')).body.alerts, []);
  assert.equal((await call('GET', '/api/buyer/v1/retention-alerts?status=all')).body.alerts.length, 1);
  for (const bad of ['status=closed', 'limit=0', 'limit=501', 'limit=abc', 'other=1']) {
    assert.equal((await call('GET', `/api/buyer/v1/retention-alerts?${bad}`)).status, 400, bad);
  }
  assert.equal((await audit(keys.a.id, 'alert_ack')).filter(r => r.outcome === 'ok').length, 1);
});

test('screener scripts: drafts only, next version, approval stays operator only', async () => {
  const draft = { campaign_id: campaigns.east, opening: 'Synthetic opening.', q_medicare: 'Medicare?', q_zip: 'ZIP?',
    q_reason: 'Reason?', q_connect: 'Connect?', pass_line: 'Connecting.', fail_line: 'Goodbye.' };
  const created = await call('POST', '/api/buyer/v1/screener-scripts', { body: draft });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual([created.body.script.version, created.body.script.status], [1, 'draft']);
  const second = await call('POST', '/api/buyer/v1/screener-scripts', { body: { ...draft, voice: 'Polly.Matthew' } });
  assert.equal(second.body.script.version, 2);
  for (const body of [{ ...draft, status: 'approved' }, { ...draft, approved_by: 'me' }, { ...draft, opening: '' },
    { ...draft, voice: 'Alice' }, { campaign_id: campaigns.east }, { ...draft, campaign_id: 'nope' }]) {
    assert.equal((await call('POST', '/api/buyer/v1/screener-scripts', { body })).status, 400, JSON.stringify(Object.keys(body)));
  }
  const { rows } = await pg.query('SELECT status FROM screener_scripts WHERE campaign_id=$1', [campaigns.east]);
  assert.deepEqual(rows.map(r => r.status), ['draft', 'draft']);
  const list = await call('GET', '/api/buyer/v1/screener-scripts');
  assert.deepEqual(list.body.scripts.map(s => s.campaign_id), [campaigns.east, campaigns.east]);
  assert.equal((await call('POST', `/api/buyer/v1/screener-scripts/${created.body.script.id}/approve`)).status, 404);
  assert.ok(!BUYER_ROUTES.some(r => /approve/.test(r.path)));
  const audits = await audit(keys.a.id, 'screener_draft_create');
  assert.equal(audits.filter(r => r.outcome === 'ok').length, 2);
  assert.equal(audits.filter(r => r.outcome === 'rejected').length, 6);
  assert.ok(audits.every(r => !JSON.stringify(r.detail).includes('Synthetic opening')));
});

test('cross tenant: a key from tenant A can never read or change tenant B on any endpoint', async () => {
  const bBefore = await campaignRow(campaigns.central);
  const bScripts = (await pg.query('SELECT count(*)::int n FROM screener_scripts WHERE tenant_id=$1', [B.tenant])).rows[0].n;
  const cases = [
    ['PATCH', `/api/buyer/v1/campaigns/${campaigns.central}`, { active: false }, 404],
    ['POST', `/api/buyer/v1/campaigns/${campaigns.central}/pause`, undefined, 404],
    ['POST', `/api/buyer/v1/campaigns/${campaigns.central}/resume`, undefined, 404],
    ['POST', `/api/buyer/v1/retention-alerts/${alerts.b}/ack`, undefined, 404],
    ['POST', '/api/buyer/v1/screener-scripts', { campaign_id: campaigns.central, opening: 'x', q_medicare: 'x', q_zip: 'x',
      q_reason: 'x', q_connect: 'x', pass_line: 'x', fail_line: 'x' }, 404],
  ];
  for (const [method, path, body, status] of cases) {
    assert.equal((await call(method, path, { body })).status, status, path);
  }
  assert.deepEqual(await campaignRow(campaigns.central), bBefore);
  assert.equal((await pg.query('SELECT count(*)::int n FROM ping_source_controls WHERE campaign_id=$1', [campaigns.central])).rows[0].n, 0);
  assert.equal((await pg.query('SELECT acknowledged_at FROM ping_retention_alerts WHERE id=$1', [alerts.b])).rows[0].acknowledged_at, null);
  assert.equal((await pg.query('SELECT count(*)::int n FROM screener_scripts WHERE tenant_id=$1', [B.tenant])).rows[0].n, bScripts);
  // Reads: nothing of B appears through A's key.
  const reads = await Promise.all(['/api/buyer/v1/campaigns', '/api/buyer/v1/retention-alerts?status=all',
    `/api/buyer/v1/screener-scripts?campaign_id=${campaigns.central}`, '/api/buyer/v1/screener-scripts',
    `/api/buyer/v1/scorecard?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 86400000).toISOString()}&group=campaign`,
    `/api/buyer/v1/usage?month=${new Date().toISOString().slice(0, 7)}`,
    `/api/buyer/v1/invoice-lines?month=${new Date().toISOString().slice(0, 7)}`].map(path => call('GET', path)));
  for (const read of reads) {
    assert.equal(read.status, 200);
    const text = JSON.stringify(read.body);
    for (const foreign of [campaigns.central, B.tenant, alerts.b, campaigns.pacific, BUYERS.pacific.tenant]) {
      assert.ok(!text.includes(foreign), `${foreign} leaked in ${text.slice(0, 200)}`);
    }
  }
  // B's audit trail stays B's; A's attempts are recorded under A.
  assert.equal((await pg.query(`SELECT count(*)::int n FROM buyer_api_audit WHERE key_id=$1 AND tenant_id<>$2`,
    [keys.a.id, A.tenant])).rows[0].n, 0);
  assert.ok((await pg.query(`SELECT count(*)::int n FROM buyer_api_audit WHERE key_id=$1 AND outcome='not_found'`,
    [keys.a.id])).rows[0].n >= 5);
});

test('malformed ids are 404 or 400 and still audited; each request logs one event without the key', async () => {
  const before = (await pg.query('SELECT count(*)::int n FROM buyer_api_audit WHERE key_id=$1', [keys.a.id])).rows[0].n;
  assert.equal((await call('PATCH', '/api/buyer/v1/campaigns/not-a-uuid', { body: { active: true } })).status, 404);
  assert.equal((await call('POST', '/api/buyer/v1/retention-alerts/not-a-uuid/ack')).status, 404);
  const after = (await pg.query('SELECT count(*)::int n FROM buyer_api_audit WHERE key_id=$1', [keys.a.id])).rows[0].n;
  assert.equal(after, before + 2);
  await call('GET', '/api/buyer/v1/campaigns');
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'buyer_v1_request');
  assert.ok(!JSON.stringify(events).includes(keys.a.key));
});
