// Performance routing (migration 180) on PGlite with Test Publisher B (Central,
// direct generic, agents agent_x and agent_y). Round robin alone picks agent_x
// first (assigned longest ago). Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide } from './helpers/pingDb.js';
import { seedPublisherB, B, callSid } from './helpers/pingS2Db.js';
import { createS4Db, makeClient, S4_FEATURES } from './helpers/pingS4Db.js';
import { createS5Db, S5_FEATURES } from './helpers/pingS5Db.js';
import { decidePing, orderPool } from '../src/ping/decide.js';
import { agentConversions } from '../src/ping/scorecard.js';

let db; let campaigns; let ma; let seq = 900;
before(async () => {
  db = await createS5Db();
  campaigns = await seedPublisherB(db);
  ma = campaigns['ma-central'];
  await setFeatures(db, S5_FEATURES);
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const ping = (callId, extra = {}, on = db) => pingDecide(on, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550108001', callId, ...extra });
const decision = async id => (await q('SELECT * FROM ping_decisions WHERE id=$1', [id]))[0];
const perf = (fields = {}) => q(`UPDATE ping_campaigns SET performance_routing=$2,performance_min_calls=$3,performance_window_days=$4 WHERE id=$1`,
  [ma, fields.on ?? true, fields.min ?? 20, fields.days ?? 30]);
const refresh = async (campaign = ma) => (await q('SELECT refresh_agent_performance($1) n', [campaign]))[0].n;
const rows = async () => (await q(`SELECT agent_id,connected_calls,enrollments,conversion::float FROM agent_performance
  WHERE campaign_id=$1 ORDER BY agent_id`, [ma])).map(r => [r.agent_id, r.connected_calls, r.enrollments, r.conversion]);
const releaseHolds = (on = db) => on.query(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);

/** Routed, answered calls for one agent: connected calls of which the first `enrolled` enrolled. */
async function history(agent, connected, enrolled, { on = db, campaign = ma, daysAgo = 1, tenant = B.tenant, answered = true,
  test = false, inboundTenant = tenant } = {}) {
  for (let i = 0; i < connected; i += 1) {
    const sid = callSid((seq += 1));
    const { rows: [record] } = await on.query(`INSERT INTO call_records(tenant_id,call_outcome,is_test_enrollment) VALUES($1,$2,$3) RETURNING id`,
      [inboundTenant, i < enrolled ? 'enrolled' : 'not_interested', test]);
    await on.query(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,source_kind,answered_agent_id,call_record_id)
      VALUES($1,$2,'publisher',$3,$4)`, [inboundTenant, sid, answered ? agent : null, record.id]);
    await on.query(`INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,available,reason,engine,agent_id,matched_call_sid,received_at)
      VALUES($1,$2,$3,true,'accepted_full','generic',$4,$5,now()-make_interval(days=>$6))`, [tenant, B.source, campaign, agent, sid, daysAgo]);
  }
}
async function addAgent(slug, on = db) {
  await on.query(`INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,$2,'92000009',$2,true)`, [B.tenant, slug]);
  await on.query(`INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES($1,$1,'available',true)`, [slug]);
  await on.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
    SELECT $1,$2,2027,a.id,s.state,c.carrier,'test' FROM tenant_agents a CROSS JOIN unnest('{KS,MO}'::text[]) s(state)
    CROSS JOIN unnest($3::text[]) c(carrier) WHERE a.agent_slug=$4`, [B.tenant, ma, B.carriers, slug]);
}

test('new campaigns keep performance routing off with the documented defaults', async () => {
  const [row] = await q('SELECT performance_routing,performance_min_calls,performance_window_days FROM ping_campaigns WHERE id=$1', [ma]);
  assert.deepEqual(row, { performance_routing: false, performance_min_calls: 20, performance_window_days: 30 });
  assert.equal((await q('SELECT count(*)::int n FROM ping_campaigns WHERE performance_routing'))[0].n, 0);
});

test('with performance routing on, the higher converting agent is chosen over round robin', () => inTx(async () => {
  await perf();
  await history('agent_x', 20, 2);
  await history('agent_y', 20, 8);
  assert.equal(await refresh(), 2);
  assert.deepEqual(await rows(), [['agent_x', 20, 2, 0.1], ['agent_y', 20, 8, 0.4]]);
  const result = await ping('perf-1');
  assert.deepEqual([result.reason, result.agent_id], ['accepted_full', 'agent_y']);
  const trace = (await decision(result.decision_id)).rule_trace;
  assert.deepEqual(trace.find(step => step.rule === 'performance_routing'), { rule: 'performance_routing', result: 'applied' });
  // At arrival without a live reservation, the pool orders the same way.
  await releaseHolds();
  const [claim] = await q(`SELECT * FROM ping_claim_arrival($1,'+15550108001','perf-1',$2,'{}',NULL,clock_timestamp())`, [callSid(801), B.number]);
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_y', 'round_robin']);
}));

test('a new agent below min calls is treated as the campaign average, so it still gets calls', () => inTx(async () => {
  await perf();
  await history('agent_x', 20, 2);
  await history('agent_y', 20, 8);
  await addAgent('agent_new');
  await history('agent_new', 3, 3); // A perfect but tiny record is not trusted.
  await refresh();
  assert.deepEqual(await rows(), [['agent_new', 3, 3, 0.302326], ['agent_x', 20, 2, 0.1], ['agent_y', 20, 8, 0.4]], '13 of 43');
  assert.equal((await ping('perf-2')).agent_id, 'agent_y', 'a perfect 3 of 3 does not outrank a proven 0.4');
  await releaseHolds();
  await q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id='agent_y'`);
  assert.equal((await ping('perf-3')).agent_id, 'agent_new', 'the average outranks a proven 0.1');
  await releaseHolds();
  // An agent with no row at all (added after the refresh) also ranks at the average.
  await addAgent('agent_late');
  await q(`UPDATE agent_availability SET last_assigned_at=now() WHERE agent_id='agent_new'`);
  assert.equal((await ping('perf-4')).agent_id, 'agent_late', 'average tie breaks on last_assigned_at');
}));

test('with no history every agent sits at average 0 and round robin decides', () => inTx(async () => {
  await perf();
  assert.equal(await refresh(), 2);
  assert.deepEqual(await rows(), [['agent_x', 0, 0, 0], ['agent_y', 0, 0, 0]]);
  assert.equal((await ping('perf-5')).agent_id, 'agent_x');
}));

test('the retention owner still wins over performance ordering', () => inTx(async () => {
  await perf();
  await q('UPDATE ping_campaigns SET retention_enabled=true WHERE id=$1', [ma]);
  await history('agent_x', 20, 2);
  await history('agent_y', 20, 8);
  await refresh();
  await makeClient(db, { tenant: B.tenant, phone: '+15550108009', ownerSlug: 'agent_x' });
  const result = await ping('perf-6', { phone: '+15550108009' });
  assert.deepEqual([result.reason, result.agent_id], ['accepted_retention_owner', 'agent_x']);
  const trace = (await decision(result.decision_id)).rule_trace;
  assert.equal(trace.find(step => step.rule === 'retention_owner').result, 'hit');
  assert.equal(trace.find(step => step.rule === 'performance_routing'), undefined, 'the pool was not used');
  // The owner's reservation also wins at arrival.
  const [claim] = await q(`SELECT * FROM ping_claim_arrival($1,'+15550108009','perf-6',$2,'{}',NULL,clock_timestamp())`, [callSid(802), B.number]);
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_x', 'reserved']);
}));

test('the preferred agent at arrival ranks before conversion', () => inTx(async () => {
  await perf();
  await history('agent_x', 20, 2);
  await history('agent_y', 20, 8);
  await refresh();
  await ping('perf-7');
  await releaseHolds();
  const [claim] = await q(`SELECT * FROM ping_claim_arrival($1,'+15550108001','perf-7',$2,'{}','agent_x',clock_timestamp())`, [callSid(803), B.number]);
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_x', 'preferred']);
}));

test('refresh counts only this campaign\'s answered, non-test calls in its own tenant and window', () => inTx(async () => {
  await perf({ min: 2, days: 30 });
  await history('agent_x', 2, 1);
  await history('agent_x', 3, 3, { daysAgo: 31 }); // Outside the window.
  await history('agent_x', 3, 3, { campaign: campaigns['medsupp-central'] }); // Another campaign.
  await history('agent_x', 3, 0, { answered: false }); // Never answered by an agent.
  await history('agent_y', 2, 2, { test: true }); // Test enrollments are not enrollments.
  await history('agent_y', 2, 2, { inboundTenant: '0e000000-0000-4000-8000-0000000000c1' }); // Another tenant's call rows.
  await refresh();
  assert.deepEqual(await rows(), [['agent_x', 2, 1, 0.5], ['agent_y', 2, 0, 0]]);
  const [row] = await q('SELECT tenant_id,window_days FROM agent_performance WHERE campaign_id=$1 LIMIT 1', [ma]);
  assert.deepEqual(row, { tenant_id: B.tenant, window_days: 30 });
  // A second refresh replaces rows rather than adding to them.
  await refresh();
  assert.equal((await q('SELECT count(*)::int n FROM agent_performance WHERE campaign_id=$1', [ma]))[0].n, 2);
}));

test('refresh and routing are fenced by PING_PLATFORM_ENABLED and service role only', async () => {
  await setFeatures(db, { ...S5_FEATURES, PING_PLATFORM_ENABLED: false });
  try {
    await assert.rejects(q('SELECT refresh_agent_performance($1)', [ma]), /Ping platform disabled/);
  } finally { await setFeatures(db, S5_FEATURES); }
  await assert.rejects(q('SELECT refresh_agent_performance($1)', ['0e000000-0000-4000-8000-00000000ffff']), /Unknown ping campaign/);
  const [table] = await q(`SELECT relrowsecurity FROM pg_class WHERE relname='agent_performance'`);
  assert.equal(table.relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await q(`SELECT has_table_privilege($1,'agent_performance','SELECT') ok`, [role]))[0].ok, false, role);
    assert.equal((await q(`SELECT has_function_privilege($1,'public.refresh_agent_performance(uuid)','EXECUTE') ok`, [role]))[0].ok, false, role);
  }
  assert.equal((await q(`SELECT has_function_privilege('service_role','public.refresh_agent_performance(uuid)','EXECUTE') ok`))[0].ok, true);
  for (const sig of ['ping_campaign_conversion(uuid)', 'ping_agent_conversion(uuid,text,numeric)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await q(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`, [role, `public.${sig}`]))[0].ok, false, `${role} ${sig}`);
    }
  }
});

test('the JS mirror orders the pool and decides like SQL for the same conversions', () => {
  const { average, conversions } = agentConversions({
    agent_x: { connected: 20, enrolled: 2 }, agent_y: { connected: 20, enrolled: 8 }, agent_new: { connected: 3, enrolled: 3 },
  }, { minCalls: 20 });
  assert.deepEqual([average, conversions], [0.302326, { agent_x: 0.1, agent_y: 0.4, agent_new: 0.302326 }]);
  const performance = { enabled: true, conversions, average };
  const agent = (agent_id, tier, last_assigned_at = null) => ({ agent_id, tier, available: true, status: 'available', last_assigned_at });
  const pool = [agent('agent_x', 'full', '2026-11-17T00:00:00Z'), agent('agent_y', 'full', '2026-11-17T01:00:00Z'),
    agent('agent_new', 'full'), agent('agent_late', 'full'), agent('agent_p', 'partial')];
  // Tier first; agent_late has no row and ranks at the average, tied with agent_new, then by agent_id.
  assert.deepEqual(orderPool(pool, performance).map(a => a.agent_id), ['agent_y', 'agent_late', 'agent_new', 'agent_x', 'agent_p']);
  assert.deepEqual(orderPool(pool, performance, { preferred: 'agent_x' }).map(a => a.agent_id)[0], 'agent_x');
  // Off, or absent: exactly the S4 order (never assigned first, then oldest, then agent_id).
  const s4 = ['agent_late', 'agent_new', 'agent_x', 'agent_y', 'agent_p'];
  assert.deepEqual(orderPool(pool, { ...performance, enabled: false }).map(a => a.agent_id), s4);
  assert.deepEqual(orderPool(pool).map(a => a.agent_id), s4);

  const campaign = { engine_mode: 'generic', active: true, allowed_states: ['KS'], retention_enabled: true };
  const base = { campaign, staffed: true, state: 'KS', callIdentity: 'id:1', agents: pool };
  const on = decidePing({ ...base, performance });
  assert.deepEqual([on.reason, on.agent_id], ['accepted_full', 'agent_y']);
  assert.deepEqual(on.rule_trace.at(-2), { rule: 'performance_routing', result: 'applied' });
  const off = decidePing(base);
  assert.equal(off.agent_id, 'agent_late');
  assert.equal(off.rule_trace.some(step => step.rule === 'performance_routing'), false);
  const owner = decidePing({ ...base, performance, filters: { existingClient: { contact_id: 'c', owner_agent_id: 'agent_x' } } });
  assert.deepEqual([owner.reason, owner.agent_id], ['accepted_retention_owner', 'agent_x']);
  assert.equal(owner.rule_trace.some(step => step.rule === 'performance_routing'), false);
});

// The same scenario on an S4 database and on this S5 database with
// performance routing off (and agent_performance rows present): every
// decision, trace, reservation and claim must serialize identically.
async function offScenario(on) {
  const run = async (sql, args = []) => (await on.query(sql, args)).rows;
  const local = await seedPublisherB(on);
  await run('ALTER TABLE inbound_calls ADD COLUMN IF NOT EXISTS answered_agent_id text');
  await history('agent_x', 20, 2, { on, campaign: local['ma-central'] });
  await history('agent_y', 20, 8, { on, campaign: local['ma-central'] });
  if ((await run(`SELECT to_regprocedure('public.refresh_agent_performance(uuid)') IS NOT NULL ok`))[0].ok) {
    assert.equal((await run('SELECT refresh_agent_performance($1) n', [local['ma-central']]))[0].n, 2);
  }
  const claim = async (n, callId, phone, preferred = null) => (await run(
    `SELECT agent_id,claim_path FROM ping_claim_arrival($1,$2,$3,$4,'{}',$5,clock_timestamp())`,
    [callSid(n), phone, callId, B.number, preferred]))[0];
  const out = [];
  out.push(await ping('off-1', {}, on));
  out.push(await claim(811, 'off-1', '+15550108001'));
  out.push(await ping('off-2', { state: 'MO', phone: '+15550108002' }, on));
  await releaseHolds(on);
  out.push(await claim(812, 'off-2', '+15550108002'));
  await run(`UPDATE agent_availability SET active_call_sid=NULL,status='available',available=true`);
  out.push(await ping('off-3', { phone: '+15550108003' }, on));
  out.push(await ping('off-3', { phone: '+15550108003' }, on)); // Commitment replay.
  out.push(await ping('off-4', { phone: '+15550108004', campaign: 'medsupp-central' }, on));
  out.push(await ping('off-5', { state: 'TX' }, on));
  const decisions = await run(`SELECT reason,agent_id,available,engine,caller_state,price::text,rule_trace FROM ping_decisions
    WHERE vendor_call_id LIKE 'off-%' ORDER BY received_at,vendor_call_id`);
  const reservations = await run(`SELECT reservation_key,agent_id,caller_state,consumed_call_sid FROM ping_reservations ORDER BY created_at`);
  const strip = value => JSON.parse(JSON.stringify(value, (key, v) => (['decision_id', 'latency_ms'].includes(key) ? undefined : v)));
  return JSON.stringify(strip({ out, decisions, reservations }));
}

test('with performance routing off, selection is byte identical to S4 for the same scenario', async () => {
  const s4 = await createS4Db();
  const s5 = await createS5Db();
  try {
    await setFeatures(s4, S4_FEATURES);
    await setFeatures(s5, S5_FEATURES);
    const [before4, before5] = [await offScenario(s4), await offScenario(s5)];
    assert.equal(before5, before4);
    assert.match(before4, /"agent_id":"agent_x"/, 'round robin picked the lower converting agent first');
  } finally { await s4.close(); await s5.close(); }
});
