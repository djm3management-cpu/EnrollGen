// Migrations 171 and 172: header, feature fence, access, pilot seed and the
// generic-only engine behaviors (shadow, replay logging, fail closed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPingDb, setFeatures, syncGenericConfig, pingDecide, migration, source, tenant, FULL } from './helpers/pingDb.js';

let db;
before(async () => { db = await createPingDb(); });
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const ping = (extra = {}) => pingDecide(db, { state: 'KS', phone: '+15550002000', callId: 'm1', ...extra });

test('migrations 171 and 172 start with the UNAPPLIED header', async () => {
  for (const name of ['171_ping_platform_foundation.sql', '172_ping_decide.sql']) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /\u2014/, 'no em dashes');
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION)\s+(public\.)?paragon_/i, 'never alters paragon objects');
  }
});

test('ping_decide returns nothing useful and logs nothing without PING_PLATFORM_ENABLED', async () => {
  const fences = [
    () => q(`SELECT set_config('request.jwt.claims','',false),set_config('request.headers','',false)`),
    () => setFeatures(db, { PING_PLATFORM_ENABLED: false }),
    () => setFeatures(db, {}),
    async () => { await setFeatures(db); await q(`SELECT set_config('request.jwt.claims','{"role":"authenticated"}',false)`); },
  ];
  for (const fence of fences) {
    await fence();
    assert.deepEqual(await ping(), { status: 'disabled' });
  }
  assert.equal((await q('SELECT count(*)::int n FROM ping_decisions'))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations'))[0].n, 0);
});

test('new tables have RLS and no browser grants; routines are service role only', async () => {
  const tables = await q(`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN
    ('ping_campaigns','agent_campaign_carriers','ping_decisions','ping_reservations') ORDER BY relname`);
  assert.equal(tables.length, 4);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true, table.relname);
    for (const role of ['anon', 'authenticated']) {
      const [grant] = await q('SELECT has_table_privilege($1,$2,$3) ok', [role, table.relname, 'SELECT']);
      assert.equal(grant.ok, false, `${role} ${table.relname}`);
    }
  }
  for (const fn of ['ping_decide(text,text,jsonb,text)', 'ping_agent_tier(text,text,uuid)', 'ping_hours_open(jsonb,timestamptz)']) {
    for (const role of ['anon', 'authenticated']) assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', [role, fn, 'EXECUTE']))[0].ok, false, fn);
    assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', ['service_role', fn, 'EXECUTE']))[0].ok, true, fn);
  }
});

test('pilot seed copies Paragon routing into one legacy campaign with null rule fields', async () => {
  const campaigns = await q('SELECT * FROM ping_campaigns');
  assert.equal(campaigns.length, 1);
  const [config] = await q('SELECT * FROM vendor_routing_config WHERE source_id=$1', [source]);
  const [campaign] = campaigns;
  assert.deepEqual([campaign.tenant_id, campaign.source_id, campaign.engine_mode, campaign.active, campaign.product_line],
    [tenant, source, 'legacy', true, 'ma']);
  for (const key of ['allowed_states', 'required_carriers', 'critical_carriers', 'plan_year', 'reservation_ttl_seconds']) {
    assert.deepEqual(campaign[key], config[key], key);
  }
  assert.deepEqual([campaign.pricing_model, campaign.billable_seconds, campaign.retention_mode, campaign.screener_mode],
    ['per_call', 90, 'route_owner', 'off']);
  for (const key of ['cooldown_same_source_days', 'cooldown_any_source_days', 'repeat_shopper_threshold',
    'repeat_shopper_window_days', 'daily_budget_calls', 'staffed_hours_override']) assert.equal(campaign[key], null, key);
  const [expected] = await q(`SELECT ${FULL.map(c => `count(*) FILTER (WHERE ${c})`).join('+')} AS n FROM vendor_agent_state_eligibility`);
  const [copied] = await q('SELECT count(*) AS n FROM agent_campaign_carriers WHERE enabled');
  assert.equal(Number(copied.n), Number(expected.n));
  const [tiers] = await q(`SELECT ping_agent_tier('agent_a','KS',$1) a,ping_agent_tier('agent_b','KS',$1) b,ping_agent_tier('agent_c','AR',$1) c,
    paragon_agent_tier('agent_a','KS',$2) la,paragon_agent_tier('agent_b','KS',$2) lb,paragon_agent_tier('agent_c','AR',$2) lc`, [campaign.id, source]);
  assert.deepEqual([tiers.a, tiers.b, tiers.c], [tiers.la, tiers.lb, tiers.lc]);
});

test('seed inserts nothing when the Paragon source is absent', async () => {
  const empty = await createPingDb({ paragon: false });
  try {
    assert.equal((await empty.query('SELECT count(*)::int n FROM ping_campaigns')).rows[0].n, 0);
    assert.equal((await empty.query('SELECT count(*)::int n FROM agent_campaign_carriers')).rows[0].n, 0);
  } finally { await empty.close(); }
});

test('a legacy campaign answers routing_disabled to the generic engine and still logs it', () => inTx(async () => {
  await setFeatures(db);
  const decision = await ping();
  assert.deepEqual([decision.authorized, decision.available, decision.reason], [true, false, 'routing_disabled']);
  const [row] = await q('SELECT * FROM ping_decisions WHERE id=$1', [decision.decision_id]);
  assert.deepEqual([row.reason, row.engine, row.caller_phone, row.vendor_call_id], ['routing_disabled', 'generic', '+15550002000', 'm1']);
  assert.ok(row.latency_ms >= 0);
}));

test('shadow decides like generic but reserves and claims nothing', () => inTx(async () => {
  await setFeatures(db);
  await syncGenericConfig(db, 'shadow');
  const decision = await ping({ engine: 'shadow' });
  assert.deepEqual([decision.available, decision.reason, decision.agent_id], [true, 'accepted_full', 'agent_a']);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations'))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int n FROM paragon_agent_reservations'))[0].n, 0);
  assert.equal((await q(`SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL OR status<>'available'`))[0].n, 0);
  assert.equal((await q('SELECT engine FROM ping_decisions WHERE id=$1', [decision.decision_id]))[0].engine, 'shadow');
  assert.equal((await ping({ engine: 'generic' })).reason, 'routing_disabled', 'a shadow campaign rejects generic pings');
}));

test('invalid payloads are rejected before any rule and logged', () => inTx(async () => {
  await setFeatures(db);
  await syncGenericConfig(db);
  for (const extra of [{ phone: '555' }, { extra: { zip: '1234' } }, { extra: { t65: 'maybe' } }]) {
    const decision = await ping(extra);
    assert.deepEqual([decision.available, decision.reason], [false, 'invalid_payload'], JSON.stringify(extra));
  }
  const [array] = (await db.query(`SELECT ping_decide($1,NULL,'[]'::jsonb,'generic') d`, ['b'.repeat(64)])).rows;
  assert.equal(array.d.reason, 'routing_disabled', 'a non-object payload cannot carry routing_enabled');
  assert.equal((await q(`SELECT count(*)::int n FROM ping_decisions WHERE reason='invalid_payload'`))[0].n, 3);
}));

test('unknown keys are unauthorized and never logged', () => inTx(async () => {
  await setFeatures(db);
  assert.deepEqual(await pingDecide(db, { state: 'KS', callId: 'x', key: 'c'.repeat(64) }), { authorized: false });
  assert.equal((await q('SELECT count(*)::int n FROM ping_decisions'))[0].n, 0);
}));

test('commitment replays are logged but never extend the 30 second window', () => inTx(async () => {
  await setFeatures(db);
  await syncGenericConfig(db);
  const first = await ping({ extra: { zip: '66002', sub_id: 'sub-7', consent_cert_id: 'cert-1', t65: true } });
  const second = await ping();
  assert.equal(second.agent_id, first.agent_id);
  const rows = await q('SELECT * FROM ping_decisions ORDER BY received_at');
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].caller_zip, rows[0].publisher_sub_id, rows[0].consent_cert_id, rows[0].t65_flag], ['66002', 'sub-7', 'cert-1', true]);
  assert.ok(rows[1].rule_trace.some(step => step.rule === 'commitment_replay' && step.decision_id === first.decision_id));
  await q(`UPDATE ping_decisions SET received_at=received_at-interval '31 seconds' WHERE id=$1`, [first.decision_id]);
  await q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
  await q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id='agent_a'`);
  const third = await ping();
  assert.deepEqual([third.reason, third.agent_id], ['accepted_partial', 'agent_b'], 'the replay row is not a new commitment');
}));

test('an unexpected error rejects, rolls back the reservation and still logs the decision', () => inTx(async () => {
  await setFeatures(db);
  await syncGenericConfig(db);
  await db.exec('DROP FUNCTION agent_inbound_routable(text,text,boolean,text) CASCADE');
  const decision = await ping();
  assert.deepEqual([decision.authorized, decision.available, decision.reason, decision.agent_id], [true, false, 'error_rejected', null]);
  const [row] = await q('SELECT * FROM ping_decisions WHERE id=$1', [decision.decision_id]);
  assert.equal(row.reason, 'error_rejected');
  assert.equal(row.rule_trace.at(-1).rule, 'error_rejected');
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations'))[0].n, 0);
}));

test('the decision log only accepts the closed reason list', () => inTx(async () => {
  await assert.rejects(q(`INSERT INTO ping_decisions(tenant_id,source_id,available,reason,engine) VALUES($1,$2,false,'vendor_paused','generic')`,
    [tenant, source]), /check constraint/);
}));
