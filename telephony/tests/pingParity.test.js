// Golden parity: paragon_ping (live definition, migration 067) and ping_decide
// (migration 172) receive the same inputs and must return the same available
// flag, mapped reason and selected agent. Each case runs on a fresh database
// state (its own transaction, rolled back) for each engine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPingDb, setFeatures, syncGenericConfig, paragonPing, pingDecide, OPEN_HOURS } from './helpers/pingDb.js';
import { mapLegacyReason, REASONS } from '../src/ping/decide.js';

let db;
before(async () => { db = await createPingDb(); await setFeatures(db); });
after(async () => db?.close());

const q = (sql, args = []) => db.query(sql, args);
const ping = (state, callId = null, phone = '+15550001000', extra = {}) => ({ state, callId, phone, ...extra });
const busy = (...agents) => () => q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id=ANY($1)`, [agents]);
const controls = sql => () => q(`UPDATE vendor_controls SET ${sql}`);
const config = sql => () => q(`UPDATE vendor_routing_config SET ${sql}`);
const expireReservations = (_q, engine) => q(engine === 'legacy'
  ? `UPDATE paragon_agent_reservations SET expires_at=clock_timestamp()-interval '1 second'`
  : `UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
const expireCommitments = (_q, engine) => q(engine === 'legacy'
  ? `UPDATE paragon_ping_decisions SET accepted_until=clock_timestamp()-interval '1 second'`
  : `UPDATE ping_decisions SET received_at=received_at-interval '31 seconds'`);
const closedHours = controls(`staffed_hours='{"timezone":"America/New_York","days":{}}'`);

// expect lists the mapped reason and agent per ping step.
const CASES = [
  { name: 'full agent in allowed state', steps: [ping('KS', 'k1')], expect: [['accepted_full', 'agent_a']] },
  { name: 'second allowed state', steps: [ping('AR', 'k1')], expect: [['accepted_full', 'agent_a']] },
  { name: 'lowercase padded state is normalized', steps: [ping(' ks ', 'k1')], expect: [['accepted_full', 'agent_a']] },
  { name: 'state not allowed', steps: [ping('NC', 'k1')], expect: [['state_not_allowed', null]] },
  { name: 'missing state', steps: [ping('', 'k1')], expect: [['state_not_allowed', null]] },
  { name: 'routing disabled', steps: [ping('KS', 'k1', undefined, { routing: false })], expect: [['routing_disabled', null]] },
  { name: 'source paused (vendor_paused)', setup: controls('vendor_pause=true'), steps: [ping('KS', 'k1')], expect: [['source_paused', null]] },
  { name: 'controls missing', setup: () => q('DELETE FROM vendor_controls'), steps: [ping('KS', 'k1')], expect: [['source_paused', null]] },
  { name: 'outside staffed hours', setup: closedHours, steps: [ping('KS', 'k1')], expect: [['outside_staffed_hours', null]] },
  { name: 'staffed hours in a non New York zone stay closed',
    setup: controls(`staffed_hours=jsonb_set(staffed_hours,'{timezone}','"UTC"')`), steps: [ping('KS', 'k1')], expect: [['outside_staffed_hours', null]] },
  { name: 'routing unconfigured', setup: () => q('DELETE FROM vendor_routing_config'), steps: [ping('KS', 'k1')], expect: [['campaign_inactive', null]] },
  { name: 'missing call identity', steps: [ping('KS', null, null)], expect: [['missing_call_identity', null]] },
  { name: 'phone only identity', steps: [ping('KS', null)], expect: [['accepted_full', 'agent_a']] },
  { name: 'allowed state without matrix rows', steps: [ping('AZ', 'k1')], expect: [['no_eligible_agent', null]] },
  { name: 'critical carrier missing for every licensed agent',
    setup: () => q(`DELETE FROM vendor_agent_state_eligibility WHERE state='AR' AND agent_id IN (SELECT id FROM tenant_agents WHERE agent_slug IN ('agent_a','agent_b'))`),
    steps: [ping('AR', 'k1')], expect: [['no_eligible_agent', null]] },
  { name: 'plan year mismatch', setup: config('plan_year=2028'), steps: [ping('KS', 'k1')], expect: [['no_eligible_agent', null]] },
  { name: 'inactive agents are ineligible', setup: () => q(`UPDATE tenant_agents SET is_active=false WHERE agent_slug IN ('agent_a','agent_b')`),
    steps: [ping('KS', 'k1')], expect: [['no_eligible_agent', null]] },
  { name: 'partial when the full agent is busy', setup: busy('agent_a'), steps: [ping('KS', 'k1')], expect: [['accepted_partial', 'agent_b']] },
  { name: 'full tier beats an older partial assignment',
    setup: () => q(`UPDATE agent_availability SET last_assigned_at=CASE agent_id WHEN 'agent_a' THEN now() ELSE now()-interval '1 day' END`),
    steps: [ping('KS', 'k1')], expect: [['accepted_full', 'agent_a']] },
  { name: 'round robin among full agents by last assignment',
    setup: async () => {
      await q(`UPDATE vendor_agent_state_eligibility SET aetna=true`);
      await q(`UPDATE agent_availability SET last_assigned_at=CASE agent_id WHEN 'agent_a' THEN now() ELSE now()-interval '1 day' END`);
    }, steps: [ping('KS', 'k1')], expect: [['accepted_full', 'agent_b']] },
  { name: 'all eligible busy', setup: busy('agent_a', 'agent_b'), steps: [ping('KS', 'k1')], expect: [['all_eligible_busy', null]] },
  { name: 'eligible agents on a call', setup: () => q(`UPDATE agent_availability SET active_call_sid='CA-busy'`),
    steps: [ping('KS', 'k1')], expect: [['all_eligible_busy', null]] },
  { name: 'eligible agents offline', setup: () => q(`UPDATE agent_availability SET status='offline'`),
    steps: [ping('KS', 'k1')], expect: [['all_eligible_busy', null]] },
  { name: 're-ping same call id', steps: [ping('KS', 'k1'), ping('KS', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 're-ping same phone without call id', steps: [ping('KS', null), ping('KS', null)],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 're-ping same call id in another state', steps: [ping('KS', 'k1'), ping('AR', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 'concurrent reservations exhaust the pool', steps: [ping('KS', 'k1'), ping('KS', 'k2', '+15550001002'), ping('KS', 'k3', '+15550001003')],
    expect: [['accepted_full', 'agent_a'], ['accepted_partial', 'agent_b'], ['all_eligible_busy', null]] },
  { name: 'expired reservation frees the agent',
    steps: [ping('KS', 'k1'), expireReservations, expireCommitments, ping('KS', 'k2', '+15550001002')],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 'live reservation is reused after the 30 second commitment',
    steps: [ping('KS', 'k1'), expireCommitments, ping('KS', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 'reserved agent going busy moves the re-ping to the next agent',
    steps: [ping('KS', 'k1'), busy('agent_a'), expireCommitments, ping('KS', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['accepted_partial', 'agent_b']] },
  { name: 'pause overrides the accepted commitment', steps: [ping('KS', 'k1'), controls('vendor_pause=true'), ping('KS', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['source_paused', null]] },
  { name: 'accepted commitment survives hours closing', steps: [ping('KS', 'k1'), closedHours, ping('KS', 'k1')],
    expect: [['accepted_full', 'agent_a'], ['accepted_full', 'agent_a']] },
  { name: 'no critical carriers makes a missing carrier partial',
    setup: async () => { await config(`critical_carriers='{}'`)(); await busy('agent_a', 'agent_b')(); },
    steps: [ping('AR', 'k1')], expect: [['accepted_partial', 'agent_c']] },
  { name: 'narrower required carriers promote partial to full',
    setup: async () => {
      await config(`required_carriers=ARRAY['humana','uhc']`)();
      await q(`UPDATE agent_availability SET last_assigned_at=CASE agent_id WHEN 'agent_a' THEN now() ELSE now()-interval '1 day' END`);
    }, steps: [ping('KS', 'k1')], expect: [['accepted_full', 'agent_b']] },
];

async function run(engine, testCase) {
  await db.exec('BEGIN');
  try {
    await q('UPDATE vendor_controls SET staffed_hours=$1,vendor_pause=false', [OPEN_HOURS]);
    if (testCase.setup) await testCase.setup();
    if (engine === 'generic') await syncGenericConfig(db);
    const results = [];
    for (const step of testCase.steps) {
      if (typeof step === 'function') { await step(q, engine); continue; }
      const decision = engine === 'legacy' ? await paragonPing(db, step) : await pingDecide(db, step);
      assert.equal(decision.authorized, true);
      results.push({ available: decision.available, reason: engine === 'legacy' ? mapLegacyReason(decision.reason) : decision.reason,
        agent_id: decision.agent_id ?? null });
    }
    return results;
  } finally { await db.exec('ROLLBACK'); }
}

test('golden table has at least 25 cases', () => assert.ok(CASES.length >= 25, String(CASES.length)));

for (const testCase of CASES) {
  test(`parity: ${testCase.name}`, async () => {
    const legacy = await run('legacy', testCase);
    const generic = await run('generic', testCase);
    assert.deepEqual(generic, legacy);
    assert.deepEqual(legacy.map(r => [r.reason, r.agent_id]), testCase.expect);
    for (const result of generic) {
      assert.ok(REASONS.includes(result.reason));
      assert.equal(result.available, result.reason.startsWith('accepted_'));
    }
  });
}
