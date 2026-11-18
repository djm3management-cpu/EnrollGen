// End to end for a second publisher on the generic engine (session S2):
// ping, reservation, arrival claim, Twilio-verified billing, returns and pause.
// "Test Publisher B" lives in a Central time tenant with two generic campaigns.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide } from './helpers/pingDb.js';
import { createS2Db, seedPublisherB, supabaseLike, callSid, B } from './helpers/pingS2Db.js';
import { processPingBillingJob, enqueuePingBillingCallback } from '../src/ping/billing.js';

let db; let campaigns; let client;
const ACCOUNT = `AC${'a'.repeat(32)}`;
const config = { twilioAccountSid: ACCOUNT };
before(async () => {
  db = await createS2Db(); campaigns = await seedPublisherB(db); client = supabaseLike(db);
  await setFeatures(db);
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const rejects = async (sql, args, pattern) => {
  await db.exec('SAVEPOINT expected');
  try { await assert.rejects(q(sql, args), pattern); } finally { await db.exec('ROLLBACK TO SAVEPOINT expected'); }
};

const PHONE = '+15550005000';
const ping = (extra = {}) => pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: PHONE, callId: 'pb-1', ...extra });
const arrive = async ({ sid = callSid(1), phone = PHONE, callId = 'pb-1', to = B.number, exclude = [], preferred = null, at = null } = {}) =>
  (await q(`SELECT * FROM ping_claim_arrival($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,clock_timestamp()))`,
    [sid, phone, callId, to, exclude, preferred, at]))[0] ?? null;
const resolveArrival = async ({ sid = callSid(1), phone = PHONE, callId = 'pb-1', to = B.number } = {}) =>
  (await q('SELECT * FROM ping_resolve_arrival($1,$2,$3,$4,clock_timestamp())', [phone, callId, sid, to]))[0];
const olderThan = (agent, other) => q(`UPDATE agent_availability SET last_assigned_at=CASE agent_id
  WHEN $1 THEN now()-interval '2 days' WHEN $2 THEN now()-interval '1 day' ELSE last_assigned_at END`, [agent, other]);

// Twilio REST fakes: a fixed parent arrival, ended `seconds` later.
const ARRIVED_AT = Date.now() - 600_000;
const twilioCall = (sid, { seconds, talk = Math.max(0, seconds - 10) }) => {
  const arrived = new Date(ARRIVED_AT);
  const ended = new Date(arrived.getTime() + seconds * 1000);
  return {
    fetchParent: async () => ({ sid, accountSid: ACCOUNT, direction: 'inbound', status: 'completed',
      dateCreated: arrived.toISOString(), endTime: ended.toISOString() }),
    fetchChildren: async () => talk ? [{ sid: `${sid.slice(0, -1)}f`, accountSid: ACCOUNT, parentCallSid: sid,
      status: 'completed', endTime: ended.toISOString(), duration: String(talk) }] : [],
  };
};
async function finalize(sid, seconds) {
  await q(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,to_number,source_kind,lead_source_id,status)
    VALUES($1,$2,$3,$4,'publisher',$5,'ringing') ON CONFLICT DO NOTHING`, [B.tenant, sid, PHONE, B.number, B.source]);
  await q('UPDATE ping_call_billing SET next_attempt_at=clock_timestamp()-interval \'1 second\' WHERE parent_call_sid=$1', [sid]);
  const { data: jobs, error } = await client.rpc('claim_ping_billing_jobs', { p_limit: 5 });
  assert.equal(error, null);
  const job = jobs.find(row => row.parent_call_sid === sid);
  assert.ok(job, 'job leased');
  return processPingBillingJob({ db: client, config, job, ...twilioCall(sid, { seconds }) });
}

test('ping is accepted with a reservation for the Central tenant', () => inTx(async () => {
  const decision = await ping();
  assert.deepEqual([decision.authorized, decision.available, decision.reason, decision.agent_id, decision.ttl_seconds],
    [true, true, 'accepted_full', 'agent_x', 30]);
  const [reservation] = await q('SELECT * FROM ping_reservations WHERE campaign_id=$1', [campaigns['ma-central']]);
  assert.deepEqual([reservation.tenant_id, reservation.agent_id, reservation.reservation_key, reservation.caller_state],
    [B.tenant, 'agent_x', 'id:pb-1', 'KS']);
  const [row] = await q('SELECT tenant_id,source_id,price FROM ping_decisions WHERE id=$1', [decision.decision_id]);
  assert.deepEqual([row.tenant_id, row.source_id, Number(row.price)], [B.tenant, B.source, 35]);
}));

test('arrival within 5 minutes claims the reserved agent and snapshots billing', () => inTx(async () => {
  const decision = await ping();
  await olderThan('agent_y', 'agent_x'); // Round robin alone would now pick agent_y.
  const resolved = await resolveArrival();
  assert.deepEqual([resolved.matched, resolved.available, resolved.decision_id, resolved.tenant_id, resolved.campaign_id],
    [true, true, decision.decision_id, B.tenant, campaigns['ma-central']]);
  assert.equal((await q('SELECT count(*)::int n FROM ping_call_billing'))[0].n, 0, 'resolve has no side effects');
  const claim = await arrive();
  assert.deepEqual([claim.agent_id, claim.claim_path, claim.caller_state, claim.vendor_call_id, claim.decision_id],
    ['agent_x', 'reserved', 'KS', 'pb-1', decision.decision_id]);
  const [agent] = await q(`SELECT * FROM agent_availability WHERE agent_id='agent_x'`);
  assert.deepEqual([agent.active_call_sid, agent.status, agent.available], [callSid(1), 'busy', false]);
  assert.equal((await q('SELECT matched_call_sid FROM ping_decisions WHERE id=$1', [decision.decision_id]))[0].matched_call_sid, callSid(1));
  assert.equal((await q('SELECT consumed_call_sid FROM ping_reservations'))[0].consumed_call_sid, callSid(1));
  const [billing] = await q('SELECT * FROM ping_call_billing WHERE parent_call_sid=$1', [callSid(1)]);
  assert.deepEqual([billing.tenant_id, billing.source_id, billing.campaign_id, billing.decision_id, billing.pricing_model,
    Number(billing.rate), billing.billable_threshold_seconds, billing.finalized_at],
  [B.tenant, B.source, campaigns['ma-central'], decision.decision_id, 'per_call', 35, 120, null]);
  // The snapshot holds through later campaign edits and cannot be rewritten.
  await q(`UPDATE ping_campaigns SET rate=99,billable_seconds=10,pricing_model='per_app' WHERE id=$1`, [campaigns['ma-central']]);
  assert.equal(Number((await q('SELECT rate FROM ping_call_billing'))[0].rate), 35);
  await rejects('UPDATE ping_call_billing SET rate=1', [], /immutable/);
  // A retried webhook returns the same claim; a second call cannot reuse the decision.
  assert.deepEqual([(await arrive()).agent_id, (await arrive()).claim_path], ['agent_x', 'existing']);
  assert.equal(await arrive({ sid: callSid(2) }), null);
}));

test('arrival after the reservation TTL picks a fresh agent by tier and round robin', () => inTx(async () => {
  await ping();
  await q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
  await olderThan('agent_y', 'agent_x');
  const claim = await arrive();
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_y', 'round_robin']);
  assert.equal((await q('SELECT consumed_call_sid FROM ping_reservations'))[0].consumed_call_sid, null, 'expired reservation untouched');
}));

test('a preferred agent wins among equal tiers once the reservation has expired', () => inTx(async () => {
  await ping();
  await q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
  const claim = await arrive({ preferred: 'agent_y' });
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_y', 'preferred']);
}));

test('an excluded reserved agent is skipped for the next eligible agent', () => inTx(async () => {
  await ping();
  const claim = await arrive({ exclude: ['agent_x'] });
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_y', 'round_robin']);
}));

test('an arrival more than 5 minutes after the ping does not match', () => inTx(async () => {
  await ping();
  await q(`UPDATE ping_decisions SET received_at=received_at-interval '5 minutes 1 second'`);
  assert.equal((await resolveArrival()).matched, false);
  assert.equal(await arrive(), null);
  assert.equal((await q(`SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL`))[0].n, 0);
}));

test('only the source that owns the dialed number matches, by call id or phone', () => inTx(async () => {
  await ping({ callId: null });
  assert.equal((await resolveArrival({ to: '+15005550199', callId: null })).matched, false, 'other number');
  assert.equal((await resolveArrival({ callId: null, phone: '+15550009999' })).matched, false, 'other phone');
  assert.equal((await resolveArrival({ callId: null })).matched, true, 'phone only identity');
  assert.equal((await arrive({ callId: null })).claim_path, 'reserved');
}));

test('a legacy or shadow campaign never matches an arrival', () => inTx(async () => {
  await ping();
  for (const mode of ['legacy', 'shadow']) {
    await q('UPDATE ping_campaigns SET engine_mode=$2 WHERE id=$1', [campaigns['ma-central'], mode]);
    assert.equal((await resolveArrival()).matched, false, mode);
    assert.equal(await arrive(), null, mode);
  }
}));

test('the arrival functions do nothing without PING_PLATFORM_ENABLED', () => inTx(async () => {
  await ping();
  await setFeatures(db, {});
  try {
    assert.equal((await resolveArrival()).matched, false);
    assert.equal(await arrive(), null);
    assert.deepEqual(await q('SELECT * FROM claim_ping_billing_jobs(5)'), []);
    assert.equal((await q('SELECT count(*)::int n FROM ping_call_billing'))[0].n, 0);
  } finally { await setFeatures(db); }
}));

test('finalize computes Twilio-verified billable seconds and makes the record immutable', () => inTx(async () => {
  await ping(); await arrive();
  const queued = await enqueuePingBillingCallback(client, config, { AccountSid: ACCOUNT, CallSid: callSid(1), CallStatus: 'in-progress' },
    { enabled: () => true });
  assert.equal(queued.status, 'queued');
  assert.equal((await q('SELECT count(*)::int n FROM ping_call_billing_events WHERE parent_call_sid=$1', [callSid(1)]))[0].n, 1);
  assert.equal(await finalize(callSid(1), 200), 'finalized');
  const [billing] = await q('SELECT * FROM ping_call_billing WHERE parent_call_sid=$1', [callSid(1)]);
  assert.deepEqual([billing.billable_seconds, billing.talk_seconds, billing.account_sid, billing.error_code], [200, 190, ACCOUNT, null]);
  assert.ok(billing.finalized_at && billing.inbound_call_id);
  assert.equal(billing.duplicate_flag, false);
  assert.equal((await q('SELECT count(*)::int n FROM ping_returns'))[0].n, 0, 'a full length call is not returned');
  await rejects('UPDATE ping_call_billing SET billable_seconds=1', [], /immutable/);
}));

test('a short call auto-creates a short_duration return', () => inTx(async () => {
  await ping(); await arrive();
  assert.equal(await finalize(callSid(1), 45), 'finalized');
  const returns = await q('SELECT * FROM ping_returns');
  assert.deepEqual(returns.map(r => [r.reason, r.auto_flagged, r.status, r.tenant_id, r.campaign_id, r.billing_parent_call_sid]),
    [['short_duration', true, 'open', B.tenant, campaigns['ma-central'], callSid(1)]]);
  assert.equal(await finalize(callSid(1), 45), 'finalized', 'replayed finalize');
  assert.equal((await q('SELECT count(*)::int n FROM ping_returns'))[0].n, 1, 'flags are idempotent');
}));

test('a call later marked wrong_state, and a 90 day repeat caller, are returned', () => inTx(async () => {
  await q(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,to_number,source_kind,lead_source_id,status,created_at)
    VALUES($1,$2,$3,$4,'publisher',$5,'completed',now()-interval '20 days')`, [B.tenant, callSid(90), PHONE, B.number, B.source]);
  await ping(); await arrive();
  assert.equal(await finalize(callSid(1), 300), 'finalized');
  assert.deepEqual((await q('SELECT reason FROM ping_returns ORDER BY reason')).map(r => r.reason), ['duplicate']);
  await q('UPDATE inbound_calls SET wrong_state=true WHERE twilio_call_sid=$1', [callSid(1)]);
  assert.deepEqual((await q('SELECT reason FROM ping_returns ORDER BY reason')).map(r => r.reason), ['duplicate', 'wrong_state']);
}));

test('a paused source rejects pings and arrivals', () => inTx(async () => {
  await ping();
  await q('SELECT set_ping_source_control($1,$2,NULL,true,$3)', [B.tenant, B.source, 'ops@test']);
  assert.equal((await ping({ callId: 'pb-7', phone: '+15550005007' })).reason, 'source_paused');
  const claim = await arrive();
  assert.deepEqual([claim.agent_id, claim.claim_path], [null, 'rejected']);
  assert.equal((await q(`SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL`))[0].n, 0);
}));

test('a paused campaign rejects while another campaign on the same source accepts', () => inTx(async () => {
  await q('SELECT set_ping_source_control($1,$2,$3,true,$4)', [B.tenant, B.source, campaigns['ma-central'], 'ops@test']);
  assert.equal((await ping()).reason, 'source_paused');
  const other = await ping({ campaign: 'medsupp-central', callId: 'pb-8' });
  assert.deepEqual([other.available, other.reason], [true, 'accepted_full']);
  const claim = await arrive({ callId: 'pb-8' });
  assert.deepEqual([claim.claim_path, claim.campaign_id], ['reserved', campaigns['medsupp-central']]);
}));

test('Paragon state is untouched by the generic path', () => inTx(async () => {
  await ping(); await arrive(); await finalize(callSid(1), 45);
  for (const table of ['paragon_ping_decisions', 'paragon_agent_reservations', 'paragon_call_billing', 'paragon_billing_events']) {
    assert.equal((await q(`SELECT count(*)::int n FROM ${table}`))[0].n, 0, table);
  }
}));
