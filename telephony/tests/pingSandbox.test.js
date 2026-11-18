// Publisher sandbox (S8a, migration 184) on PGlite: sandbox pings on
// /api/ping/v1 (ping_decide) and /api/exchange/v1/ping (exchange_ping) leave no
// reservation, usage event, shopper history, auction row or rotation change,
// are stored with engine 'sandbox' and without phone or ZIP, report
// "sandbox": true, and never match an arrival on a transfer number.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide } from './helpers/pingDb.js';
import { seedPublisherB, B, callSid } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, BUYERS, OP } from './helpers/exchangeDb.js';
import { createS8Db, S8_FEATURES } from './helpers/pingS8Db.js';

let db; let directCampaigns; let exchangeCampaigns;
const count = async (sql, args = []) => (await db.query(sql, args)).rows[0].n;
const sideEffects = async () => ({
  reservations: await count('SELECT count(*)::int n FROM ping_reservations'),
  usage: await count('SELECT count(*)::int n FROM platform_usage_events'),
  shoppers: await count('SELECT count(*)::int n FROM shopper_history'),
  auctions: await count('SELECT count(*)::int n FROM exchange_auctions'),
  alerts: await count('SELECT count(*)::int n FROM ping_retention_alerts'),
  billing: await count('SELECT count(*)::int n FROM ping_call_billing'),
});
const NONE = { reservations: 0, usage: 0, shoppers: 0, auctions: 0, alerts: 0, billing: 0 };

before(async () => {
  db = await createS8Db();
  await setFeatures(db, S8_FEATURES);
  directCampaigns = await seedPublisherB(db);
  exchangeCampaigns = await seedExchange(db);
  // Pooled history on, so a recorded row would show up.
  await db.query('UPDATE platform_settings SET pooled_shopper_enabled=true');
  await db.query('UPDATE exchange_sources SET strategy=$1 WHERE source_id=$2', ['weighted_rotation', OP.source]);
  await db.query('UPDATE lead_sources SET sandbox=true WHERE id=ANY($1)', [[B.source, OP.source]]);
});
after(async () => { await db.close(); });

test('sandbox defaults off and the engine check admits only the known engines', async () => {
  assert.equal(await count('SELECT count(*)::int n FROM lead_sources WHERE sandbox AND id<>ALL($1)', [[B.source, OP.source]]), 0);
  await assert.rejects(db.query(`INSERT INTO ping_decisions(tenant_id,source_id,available,reason,engine)
    VALUES($1,$2,false,'routing_disabled','bogus')`, [B.tenant, B.source]));
});

test('a direct sandbox ping is evaluated, tagged sandbox and leaves no side effects', async () => {
  const d = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550007101', callId: 'sbx-1',
    extra: { zip: '66002' } });
  assert.deepEqual([d.available, d.reason, d.sandbox], [true, 'accepted_full', true]);
  const { rows: [row] } = await db.query('SELECT * FROM ping_decisions WHERE id=$1', [d.decision_id]);
  assert.deepEqual([row.engine, row.caller_phone, row.caller_zip, row.campaign_id], ['sandbox', null, null, directCampaigns['ma-central']]);
  assert.deepEqual(await sideEffects(), NONE);
  // A re-ping never replays and still reserves nothing.
  const again = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550007101', callId: 'sbx-1' });
  assert.equal(again.available, true);
  const { rows: [second] } = await db.query('SELECT rule_trace FROM ping_decisions WHERE id=$1', [again.decision_id]);
  assert.ok(!second.rule_trace.some(step => step.rule === 'commitment_replay'));
  // Rules still apply: a state the campaign does not serve is rejected.
  const out = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'TX', phone: '+15550007102', callId: 'sbx-2' });
  assert.deepEqual([out.available, out.reason, out.sandbox], [false, 'state_not_allowed', true]);
  assert.deepEqual(await sideEffects(), NONE);
});

test('a direct sandbox decision never matches an arrival on the source number', async () => {
  const sid = callSid(7101);
  const { rows: resolved } = await db.query('SELECT * FROM ping_resolve_arrival($1,$2,$3,$4,now())',
    ['+15550007101', 'sbx-1', sid, B.number]);
  assert.equal(resolved[0].matched, false);
  const { rows: claimed } = await db.query('SELECT * FROM ping_claim_arrival($1,$2,$3,$4,$5,$6,now())',
    [sid, '+15550007101', 'sbx-1', B.number, [], null]);
  assert.equal(claimed.length, 0);
  assert.equal(await count('SELECT count(*)::int n FROM ping_decisions WHERE matched_call_sid IS NOT NULL'), 0);
  assert.deepEqual(await count(`SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL`), 0);
});

test('a sandbox exchange ping picks a winner without reserving, metering, auctioning or rotating', async () => {
  const rotation = (await db.query('SELECT rotation_state FROM exchange_sources WHERE source_id=$1', [OP.source])).rows[0].rotation_state;
  const r = await exchangePing(db, { phone: '+15550007201', callId: 'sbx-x-1' });
  assert.deepEqual([r.available, r.sandbox, r.auction_id], [true, true, null]);
  assert.ok(Object.values(BUYERS).some(b => b.transfer === r.transfer_number));
  assert.ok(['accepted_full', 'accepted_partial'].includes(r.reason));
  assert.deepEqual(await sideEffects(), NONE);
  const { rows } = await db.query(`SELECT engine,caller_phone,caller_zip FROM ping_decisions WHERE source_id=$1`, [OP.source]);
  assert.equal(rows.length, Object.keys(exchangeCampaigns).length);
  assert.ok(rows.every(x => x.engine === 'sandbox' && x.caller_phone === null && x.caller_zip === null));
  assert.deepEqual((await db.query('SELECT rotation_state FROM exchange_sources WHERE source_id=$1', [OP.source])).rows[0].rotation_state, rotation);
  // The winner's transfer number never matches a sandbox decision.
  const sid = callSid(7201);
  const { rows: claimed } = await db.query('SELECT * FROM ping_claim_arrival($1,$2,$3,$4,$5,$6,now())',
    [sid, '+15550007201', 'sbx-x-1', r.transfer_number, [], null]);
  assert.equal(claimed.length, 0);
  assert.equal((await db.query('SELECT * FROM ping_resolve_arrival($1,$2,$3,$4,now())',
    ['+15550007201', 'sbx-x-1', sid, r.transfer_number])).rows[0].matched, false);
});

test('a sandbox exchange buyer cap reject is tagged sandbox too', async () => {
  await db.query('UPDATE ping_campaigns SET exchange_daily_cap=0 WHERE id=$1', [exchangeCampaigns.east]);
  try {
    await exchangePing(db, { phone: '+15550007301', callId: 'sbx-x-2' });
    const { rows } = await db.query(`SELECT engine FROM ping_decisions WHERE reason='buyer_cap_reached'`);
    assert.ok(rows.length >= 1 && rows.every(x => x.engine === 'sandbox'));
  } finally { await db.query('UPDATE ping_campaigns SET exchange_daily_cap=NULL WHERE id=$1', [exchangeCampaigns.east]); }
  assert.deepEqual(await sideEffects(), NONE);
});

test('the same source live again reserves, meters and records as before', async () => {
  await db.query('UPDATE lead_sources SET sandbox=false WHERE id=$1', [OP.source]);
  const r = await exchangePing(db, { phone: '+15550007401', callId: 'live-1' });
  assert.equal(r.available, true);
  assert.equal(r.sandbox, undefined);
  assert.ok(r.auction_id);
  const effects = await sideEffects();
  assert.equal(effects.reservations, 1);
  assert.ok(effects.usage >= 1);
  assert.equal(effects.auctions, 1);
  assert.equal(effects.shoppers, 1);
});

test('the same claim path matches once the direct source is live, so the sandbox non-match is real', async () => {
  await db.query('UPDATE lead_sources SET sandbox=false WHERE id=$1', [B.source]);
  const d = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550007501', callId: 'live-b-1' });
  assert.deepEqual([d.available, d.sandbox], [true, undefined]);
  const sid = callSid(7501);
  const { rows: claimed } = await db.query('SELECT * FROM ping_claim_arrival($1,$2,$3,$4,$5,$6,now())',
    [sid, '+15550007501', 'live-b-1', B.number, [], null]);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].decision_id, d.decision_id);
  assert.equal(await count(`SELECT count(*)::int n FROM ping_decisions WHERE engine='sandbox' AND matched_call_sid IS NOT NULL`), 0);
});
