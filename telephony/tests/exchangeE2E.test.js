// End to end for the exchange orchestrator (session S3) on PGlite: one
// operator tenant owns the publisher; three buyer tenants in Eastern, Central
// and Pacific time each own their agent, carriers, hours, transfer number and
// price plan. Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide, migration } from './helpers/pingDb.js';
import { seedPublisherB, B, callSid } from './helpers/pingS2Db.js';
import { createS3Db, seedExchange, exchangePing, fixturePhoneHash, allWeek, BUYERS, OP,
  EXCHANGE_FEATURES, MIGRATIONS_S3 } from './helpers/exchangeDb.js';

let db; let campaigns;
before(async () => {
  db = await createS3Db(); await seedPublisherB(db); campaigns = await seedExchange(db);
  await setFeatures(db, EXCHANGE_FEATURES);
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const rejects = async (sql, args, pattern) => {
  await db.exec('SAVEPOINT expected');
  try { await assert.rejects(q(sql, args), pattern); } finally { await db.exec('ROLLBACK TO SAVEPOINT expected'); }
};
const buyerOf = id => Object.keys(campaigns).find(key => campaigns[key] === id) ?? null;
const PHONE = '+15550007000';
const strategy = value => q('UPDATE exchange_sources SET strategy=$2 WHERE source_id=$1', [OP.source, value]);
const auction = async id => (await q('SELECT * FROM exchange_auctions WHERE id=$1', [id]))[0];
const winnerOf = async result => buyerOf((await auction(result.auction_id)).winner_campaign_id);
const releaseHolds = () => q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
const pingN = (n, extra = {}) => exchangePing(db, { phone: `+1555000${String(7100 + n)}`, callId: `ex-${n}`, ...extra });
const localHour = zone => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' })
  .format(new Date()));
const pad = hour => `${String(hour).padStart(2, '0')}`;
const setHours = (key, hours) => q('UPDATE vendor_controls SET staffed_hours=$2 WHERE tenant_id=$1', [BUYERS[key].tenant, hours]);

test('175 and 176 carry the UNAPPLIED header, a transaction, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S3) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /\u2014/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
  }
});

test('new tables have RLS and no browser grants; exchange routines are service role only', async () => {
  const names = ['exchange_sources', 'exchange_routes', 'exchange_auctions', 'platform_price_plans',
    'platform_usage_events', 'ping_platform_secrets'];
  const tables = await q('SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1)', [names]);
  assert.equal(tables.length, names.length);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true, table.relname);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_table_privilege($1,$2,$3) ok', [role, table.relname, 'SELECT']))[0].ok, false);
    }
  }
  for (const fn of ['exchange_ping(text,jsonb)', 'ping_decide_campaign(uuid,uuid,jsonb,text)', 'ping_phone_pepper()',
    'ping_phone_hash(text)', 'platform_record_usage(uuid,text,uuid,uuid,text)', 'provision_ping_phone_pepper(text)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('SELECT has_function_privilege($1,$2,$3) ok', [role, fn, 'EXECUTE']))[0].ok, false, fn);
    }
  }
  assert.equal((await q(`SELECT has_function_privilege('service_role','exchange_ping(text,jsonb)','EXECUTE') ok`))[0].ok, true);
  assert.equal((await q(`SELECT has_table_privilege('service_role','platform_usage_events','UPDATE') ok`))[0].ok, false);
});

test('exchange_ping is fenced by both flags, rejects unknown keys and fails closed without the pepper', () => inTx(async () => {
  await setFeatures(db, {});
  assert.deepEqual(await exchangePing(db), { status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
  await setFeatures(db, { PING_PLATFORM_ENABLED: true });
  assert.deepEqual(await exchangePing(db), { status: 'disabled', feature: 'PING_EXCHANGE_ENABLED' });
  await setFeatures(db, EXCHANGE_FEATURES);
  assert.deepEqual(await exchangePing(db, { key: 'f'.repeat(64) }), { authorized: false });
  assert.equal((await q('SELECT count(*)::int n FROM exchange_auctions'))[0].n, 0);
  await q('DELETE FROM ping_platform_secrets');
  await rejects('SELECT exchange_ping($1,$2)', [OP.hash, { phone: PHONE, state: 'TX', routing_enabled: true }], /pepper/);
  await rejects('SELECT provision_ping_phone_pepper($1)', ['short'], /32 characters/);
}));

test('waterfall: priority 1 wins and holds an agent; losers hold nothing and keep no phone or ZIP', () => inTx(async () => {
  const result = await exchangePing(db, { callId: 'ex-1', extra: { zip: '75001' } });
  assert.deepEqual(Object.keys(result).sort(), ['auction_id', 'authorized', 'available', 'reason', 'transfer_number', 'ttl_seconds']);
  assert.deepEqual([result.available, result.reason, result.transfer_number, result.ttl_seconds],
    [true, 'accepted_full', BUYERS.east.transfer, 30]);
  const row = await auction(result.auction_id);
  assert.deepEqual([row.strategy, row.candidate_count, buyerOf(row.winner_campaign_id), row.reason, row.source_id],
    ['priority_waterfall', 3, 'east', 'accepted_full', OP.source]);
  assert.deepEqual(row.candidates.map(c => [buyerOf(c.campaign_id), c.available, c.reason, Number(c.price)]),
    [['east', true, 'accepted_full', 30], ['central', true, 'accepted_full', 40], ['pacific', true, 'accepted_full', 50]]);
  for (const candidate of row.candidates) {
    assert.deepEqual(Object.keys(candidate).sort(), ['available', 'campaign_id', 'decision_id', 'price', 'reason']);
  }
  assert.doesNotMatch(JSON.stringify(row), /5550007000|75001/, 'the auction never stores the phone or ZIP');

  const holds = await q('SELECT tenant_id,agent_id,reservation_key FROM ping_reservations WHERE campaign_id=ANY($1)', [Object.values(campaigns)]);
  assert.deepEqual(holds.map(h => [h.tenant_id, h.agent_id, h.reservation_key]), [[BUYERS.east.tenant, 'agent_east', 'id:ex-1']]);

  const [winner] = await q('SELECT * FROM ping_decisions WHERE id=$1', [row.winner_decision_id]);
  assert.deepEqual([winner.engine, winner.tenant_id, winner.source_id, winner.caller_phone, winner.caller_zip, winner.agent_id],
    ['exchange', BUYERS.east.tenant, OP.source, PHONE, '75001', 'agent_east']);
  const evals = await q(`SELECT * FROM ping_decisions WHERE engine='exchange_eval' ORDER BY tenant_id`);
  assert.deepEqual(evals.map(d => d.tenant_id), [BUYERS.east.tenant, BUYERS.central.tenant, BUYERS.pacific.tenant]);
  for (const d of evals) {
    assert.deepEqual([d.caller_phone, d.caller_zip, d.source_id], [null, null, OP.source]);
    assert.deepEqual(d.rule_trace.at(-1), { rule: 'phone_hash', result: 'recorded', sha256: fixturePhoneHash(PHONE) });
    assert.doesNotMatch(JSON.stringify(d), /5550007000/);
  }
  // Only the winning tenant stores the phone, anywhere in the decision log.
  assert.deepEqual((await q('SELECT DISTINCT tenant_id FROM ping_decisions WHERE caller_phone=$1', [PHONE])).map(r => r.tenant_id),
    [BUYERS.east.tenant]);
}));

test('waterfall falls to priority 2 when priority 1 is outside its own hours', () => inTx(async () => {
  const hour = localHour(BUYERS.east.zone);
  const closed = (hour + 2) % 24;
  await setHours('east', { timezone: BUYERS.east.zone, days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .map(day => [day, { enabled: true, start: `${pad(closed)}:00`, end: closed === 23 ? '23:59' : `${pad(closed + 1)}:00` }])) });
  const result = await exchangePing(db, { callId: 'ex-2' });
  assert.equal(await winnerOf(result), 'central');
  assert.equal(result.transfer_number, BUYERS.central.transfer);
  const row = await auction(result.auction_id);
  assert.equal(row.candidates.find(c => buyerOf(c.campaign_id) === 'east').reason, 'outside_staffed_hours');
}));

test('each buyer is judged in its own IANA timezone', () => inTx(async () => {
  // The same wall clock window in every buyer's own zone, open now only in Pacific.
  const hour = localHour('America/Los_Angeles');
  const window = (zone) => allWeek(zone, `${pad(Math.max(hour - 1, 0))}:00`, hour >= 22 ? '23:59' : `${pad(hour + 1)}:59`);
  for (const key of Object.keys(BUYERS)) await setHours(key, window(BUYERS[key].zone));
  const result = await exchangePing(db, { callId: 'ex-3' });
  const row = await auction(result.auction_id);
  assert.deepEqual(row.candidates.map(c => [buyerOf(c.campaign_id), c.reason]),
    [['east', 'outside_staffed_hours'], ['central', 'outside_staffed_hours'], ['pacific', 'accepted_full']]);
  assert.equal(await winnerOf(result), 'pacific');
}));

test('waterfall falls to priority 2 when priority 1 has no eligible agent', () => inTx(async () => {
  await q('UPDATE tenant_agents SET is_active=false WHERE tenant_id=$1', [BUYERS.east.tenant]);
  const result = await exchangePing(db, { callId: 'ex-4' });
  assert.equal(await winnerOf(result), 'central');
  assert.equal((await auction(result.auction_id)).candidates[0].reason, 'no_eligible_agent');
  // Another tenant's agents never serve a buyer: east still has none of its own.
  assert.equal((await q(`SELECT count(*)::int n FROM ping_reservations WHERE tenant_id=$1`, [BUYERS.east.tenant]))[0].n, 0);
}));

test('highest_price picks the highest effective price, honoring a route override', () => inTx(async () => {
  await strategy('highest_price');
  const first = await exchangePing(db, { callId: 'ex-5' });
  assert.equal(await winnerOf(first), 'pacific');
  await releaseHolds();
  await q('UPDATE exchange_routes SET price_override=60 WHERE campaign_id=$1', [campaigns.east]);
  const second = await exchangePing(db, { callId: 'ex-6', phone: '+15550007006' });
  assert.equal(await winnerOf(second), 'east');
  assert.equal(Number((await auction(second.auction_id)).candidates[0].price), 60);
  assert.equal(second.price, undefined);
}));

test('weighted rotation spreads across buyers by weight, deterministically', () => inTx(async () => {
  await strategy('weighted_rotation');
  const wins = { east: 0, central: 0, pacific: 0 }; const order = [];
  for (let n = 0; n < 8; n += 1) {
    const result = await pingN(n);
    const winner = await winnerOf(result);
    wins[winner] += 1; order.push(winner);
    await releaseHolds();
  }
  // Weights 1:2:1 over 8 pings; smooth round robin never repeats a weight 1 buyer back to back.
  assert.deepEqual(wins, { east: 2, central: 4, pacific: 2 });
  assert.deepEqual(order.slice(0, 4).sort(), ['central', 'central', 'east', 'pacific']);
  const [{ rotation_state: state }] = await q('SELECT rotation_state FROM exchange_sources WHERE source_id=$1', [OP.source]);
  assert.deepEqual(Object.values(state).map(Number), [0, 0, 0], 'two full cycles return to zero');
}));

test('a re-ping inside the commitment stays with the buyer already holding the call', () => inTx(async () => {
  await strategy('weighted_rotation');
  const first = await exchangePing(db, { callId: 'ex-7' });
  const again = await exchangePing(db, { callId: 'ex-7' });
  assert.equal(await winnerOf(again), await winnerOf(first));
  assert.equal(again.transfer_number, first.transfer_number);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations WHERE reservation_key=$1', ['id:ex-7']))[0].n, 1);
}));

test('hourly and daily caps exclude a buyer and log buyer_cap_reached', () => inTx(async () => {
  await q('UPDATE ping_campaigns SET exchange_hourly_cap=1 WHERE id=$1', [campaigns.east]);
  assert.equal(await winnerOf(await pingN(10)), 'east');
  await releaseHolds();
  const capped = await pingN(11);
  assert.equal(await winnerOf(capped), 'central');
  const row = await auction(capped.auction_id);
  const east = row.candidates.find(c => buyerOf(c.campaign_id) === 'east');
  assert.equal(east.reason, 'buyer_cap_reached');
  const [decision] = await q('SELECT * FROM ping_decisions WHERE id=$1', [east.decision_id]);
  assert.deepEqual([decision.reason, decision.engine, decision.tenant_id, decision.caller_phone, decision.available],
    ['buyer_cap_reached', 'exchange_eval', BUYERS.east.tenant, null, false]);
  assert.deepEqual(decision.rule_trace[0], { rule: 'buyer_cap_reached', result: 'reject', scope: 'hourly' });
  assert.equal(decision.rule_trace.at(-1).sha256, fixturePhoneHash('+15550007111'));
  assert.equal((await q(`SELECT count(*)::int n FROM platform_usage_events WHERE ref_id=$1`, [east.decision_id]))[0].n, 0,
    'a capped buyer is not evaluated or metered');

  await q('UPDATE ping_campaigns SET exchange_daily_cap=1 WHERE id=$1', [campaigns.central]);
  await releaseHolds();
  const daily = await pingN(12);
  assert.equal(await winnerOf(daily), 'pacific');
  const centralRow = (await auction(daily.auction_id)).candidates.find(c => buyerOf(c.campaign_id) === 'central');
  assert.equal(centralRow.reason, 'buyer_cap_reached');
  assert.equal((await q('SELECT rule_trace FROM ping_decisions WHERE id=$1', [centralRow.decision_id]))[0].rule_trace[0].scope, 'daily');
}));

test('no accepting buyer returns exchange_no_buyer and holds nothing', () => inTx(async () => {
  const result = await exchangePing(db, { callId: 'ex-20', state: 'NY' });
  assert.deepEqual([result.available, result.reason, result.transfer_number, result.ttl_seconds],
    [false, 'exchange_no_buyer', null, null]);
  const row = await auction(result.auction_id);
  assert.deepEqual([row.winner_campaign_id, row.winner_decision_id, row.reason, row.candidate_count],
    [null, null, 'exchange_no_buyer', 3]);
  assert.ok(row.candidates.every(c => c.reason === 'state_not_allowed'));
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations'))[0].n, 0);
  assert.equal((await q(`SELECT count(*)::int n FROM ping_decisions WHERE engine='exchange'`))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int n FROM ping_decisions WHERE caller_phone IS NOT NULL'))[0].n, 0);
}));

test('an inactive exchange source or a campaign without a transfer number never wins', () => inTx(async () => {
  await q('UPDATE ping_campaigns SET transfer_number=NULL WHERE id=$1', [campaigns.east]);
  const result = await exchangePing(db, { callId: 'ex-21' });
  assert.equal(await winnerOf(result), 'central');
  assert.deepEqual((await auction(result.auction_id)).candidates[0],
    { campaign_id: campaigns.east, decision_id: null, available: false, reason: 'campaign_inactive', price: null });
  await q('UPDATE exchange_sources SET active=false WHERE source_id=$1', [OP.source]);
  const off = await exchangePing(db, { callId: 'ex-22', phone: '+15550007022' });
  assert.deepEqual([off.available, off.reason], [false, 'exchange_no_buyer']);
  assert.deepEqual([(await auction(off.auction_id)).strategy, (await auction(off.auction_id)).candidate_count], [null, 0]);
}));

test('a winner that loses the race falls to the next best once and keeps no phone', () => inTx(async () => {
  // Simulates a concurrent claim: once east's evaluation is logged, its only agent goes busy.
  await q(`CREATE FUNCTION pg_temp.steal_agent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    UPDATE agent_availability SET available=false,status='busy' WHERE agent_id='agent_east'; RETURN NEW; END $$`);
  await q(`CREATE TRIGGER steal_agent AFTER INSERT ON ping_decisions FOR EACH ROW
    WHEN (NEW.engine='exchange_eval' AND NEW.available AND NEW.agent_id='agent_east') EXECUTE FUNCTION pg_temp.steal_agent()`);
  const result = await exchangePing(db, { callId: 'ex-23' });
  assert.equal(await winnerOf(result), 'central');
  const [lost] = await q(`SELECT * FROM ping_decisions WHERE engine='exchange' AND tenant_id=$1`, [BUYERS.east.tenant]);
  assert.deepEqual([lost.available, lost.reason, lost.caller_phone, lost.caller_zip], [false, 'all_eligible_busy', null, null]);
  assert.equal(lost.rule_trace.at(-1).sha256, fixturePhoneHash(PHONE));
  // Both east and central lose the race after every evaluation accepted: the
  // exchange gives up after one fallback and never tries pacific.
  await q('DROP TRIGGER steal_agent ON ping_decisions');
  await q(`CREATE OR REPLACE FUNCTION pg_temp.steal_agent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    UPDATE agent_availability SET available=false,status='busy' WHERE agent_id IN ('agent_east','agent_central'); RETURN NEW; END $$`);
  await q(`CREATE TRIGGER steal_agent AFTER INSERT ON ping_decisions FOR EACH ROW
    WHEN (NEW.engine='exchange_eval' AND NEW.available AND NEW.agent_id='agent_pacific') EXECUTE FUNCTION pg_temp.steal_agent()`);
  await q(`UPDATE agent_availability SET available=true,status='available',active_call_sid=NULL WHERE agent_id IN ('agent_east','agent_central')`);
  await releaseHolds();
  const none = await exchangePing(db, { callId: 'ex-24', phone: '+15550007024' });
  assert.deepEqual([none.available, none.reason], [false, 'exchange_no_buyer']);
  const tried = await q(`SELECT tenant_id FROM ping_decisions WHERE engine='exchange' AND vendor_call_id='ex-24' ORDER BY received_at`);
  assert.deepEqual(tried.map(d => d.tenant_id), [BUYERS.east.tenant, BUYERS.central.tenant]);
  assert.ok((await auction(none.auction_id)).candidates.every(c => c.available), 'every evaluation had accepted');
  await q('DROP TRIGGER steal_agent ON ping_decisions');
}));

test('usage: one ping event per evaluated candidate, free inside the allowance and overage beyond it', () => inTx(async () => {
  for (let n = 30; n < 33; n += 1) { await pingN(n); await releaseHolds(); }
  const events = await q(`SELECT e.*,d.tenant_id AS decision_tenant FROM platform_usage_events e
    JOIN ping_decisions d ON d.id::text=e.ref_id ORDER BY e.occurred_at`);
  assert.equal(events.length, 9);
  for (const event of events) {
    assert.deepEqual([event.kind, Number(event.quantity), event.source_id, event.tenant_id], ['ping', 1, OP.source, event.decision_tenant]);
  }
  const prices = key => events.filter(e => e.tenant_id === BUYERS[key].tenant).map(e => Number(e.unit_price));
  assert.deepEqual(prices('east'), [0, 0, 0.05], 'two included pings, then the overage price');
  assert.deepEqual(prices('central'), [0, 0, 0]);
  // Payloads the publisher could not deliver are not metered.
  await exchangePing(db, { callId: 'ex-34', routing: false });
  assert.equal((await q('SELECT count(*)::int n FROM platform_usage_events'))[0].n, 9);
}));

test('usage events cannot be updated or deleted', () => inTx(async () => {
  await pingN(40);
  await rejects('UPDATE platform_usage_events SET unit_price=0', [], /append only/);
  await rejects('DELETE FROM platform_usage_events', [], /append only/);
  await rejects('TRUNCATE platform_usage_events', [], /append only/);
}));

test('arrival on the winner transfer number claims the reserved agent and meters one routed call', () => inTx(async () => {
  const result = await exchangePing(db, { callId: 'ex-50' });
  const arrive = async (sid, to = BUYERS.east.transfer) => (await q(
    `SELECT * FROM ping_claim_arrival($1,$2,$3,$4,'{}',NULL,clock_timestamp())`, [sid, PHONE, 'ex-50', to]))[0] ?? null;
  const resolve = async to => (await q('SELECT * FROM ping_resolve_arrival($1,$2,$3,$4,clock_timestamp())',
    [PHONE, 'ex-50', callSid(50), to]))[0];
  assert.equal((await resolve(BUYERS.central.transfer)).matched, false, 'a loser number never matches');
  const resolved = await resolve(BUYERS.east.transfer);
  assert.deepEqual([resolved.matched, resolved.available, resolved.tenant_id, resolved.source_id, resolved.campaign_id],
    [true, true, BUYERS.east.tenant, OP.source, campaigns.east]);
  assert.equal(await arrive(callSid(50), BUYERS.central.transfer), null);
  const claim = await arrive(callSid(50));
  assert.deepEqual([claim.agent_id, claim.claim_path, claim.decision_id, claim.tenant_id],
    ['agent_east', 'reserved', (await auction(result.auction_id)).winner_decision_id, BUYERS.east.tenant]);
  assert.equal((await arrive(callSid(50))).claim_path, 'existing', 'a retried webhook returns the claim');
  const routed = await q(`SELECT * FROM platform_usage_events WHERE kind='routed_call'`);
  assert.deepEqual(routed.map(e => [e.tenant_id, Number(e.unit_price), e.ref_id, e.campaign_id, e.source_id]),
    [[BUYERS.east.tenant, 1.5, callSid(50), campaigns.east, OP.source]]);
  const [billing] = await q('SELECT * FROM ping_call_billing WHERE parent_call_sid=$1', [callSid(50)]);
  assert.deepEqual([billing.tenant_id, billing.source_id, Number(billing.rate)], [BUYERS.east.tenant, OP.source, 30]);
}));

test('arrival by phone alone matches, and nothing matches with PING_EXCHANGE_ENABLED off', () => inTx(async () => {
  await exchangePing(db, { callId: null });
  const arrive = () => q(`SELECT * FROM ping_claim_arrival($1,$2,NULL,$3,'{}',NULL,clock_timestamp())`,
    [callSid(51), PHONE, BUYERS.east.transfer]);
  await setFeatures(db, { PING_PLATFORM_ENABLED: true });
  assert.deepEqual(await arrive(), []);
  await setFeatures(db, EXCHANGE_FEATURES);
  assert.equal((await arrive())[0].claim_path, 'reserved');
  assert.equal((await q(`SELECT count(*)::int n FROM platform_usage_events WHERE kind='routed_call'`))[0].n, 1);
}));

test('a paused buyer campaign rejects at evaluation and at arrival', () => inTx(async () => {
  await exchangePing(db, { callId: 'ex-52' });
  await q('SELECT set_ping_source_control($1,$2,$3,true,$4)', [BUYERS.east.tenant, BUYERS.east.source, campaigns.east, 'ops@test']);
  const claim = (await q(`SELECT * FROM ping_claim_arrival($1,$2,'ex-52',$3,'{}',NULL,clock_timestamp())`,
    [callSid(52), PHONE, BUYERS.east.transfer]))[0];
  assert.deepEqual([claim.agent_id, claim.claim_path], [null, 'rejected']);
  const next = await exchangePing(db, { callId: 'ex-53', phone: '+15550007053' });
  assert.equal((await auction(next.auction_id)).candidates[0].reason, 'source_paused');
  assert.equal((await q(`SELECT count(*)::int n FROM platform_usage_events WHERE kind='routed_call'`))[0].n, 0);
}));

test('direct ping_decide pings still behave exactly as S2 and never cross tenants', () => inTx(async () => {
  const direct = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550005000', callId: 'pb-1' });
  assert.deepEqual([direct.available, direct.reason, direct.agent_id, direct.ttl_seconds, direct.price], [true, 'accepted_full', 'agent_x', 30, 35]);
  const [row] = await q('SELECT tenant_id,engine,caller_phone FROM ping_decisions WHERE id=$1', [direct.decision_id]);
  assert.deepEqual([row.tenant_id, row.engine, row.caller_phone], [B.tenant, 'generic', '+15550005000']);
  // The operator key cannot reach a buyer campaign directly, by id or by name.
  await q('INSERT INTO vendor_controls(tenant_id,vendor_pause,staffed_hours) VALUES($1,false,$2)', [OP.tenant, allWeek('America/New_York')]);
  for (const campaign of [campaigns.east, 'exchange-east']) {
    const cross = await pingDecide(db, { key: OP.hash, campaign, state: 'TX', phone: PHONE, callId: 'x-1' });
    assert.deepEqual([cross.available, cross.reason], [false, 'campaign_inactive']);
    const [log] = await q('SELECT tenant_id,campaign_id FROM ping_decisions WHERE id=$1', [cross.decision_id]);
    assert.deepEqual([log.tenant_id, log.campaign_id], [OP.tenant, null]);
  }
  await rejects('SELECT ping_decide($1,NULL,$2,$3)', [OP.hash, { state: 'TX' }, 'exchange'], /Invalid ping engine/);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations WHERE tenant_id<>$1', [B.tenant]))[0].n, 0);
}));
