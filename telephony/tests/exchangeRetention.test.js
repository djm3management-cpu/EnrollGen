// Exchange retention priority (migration 178) on PGlite: three buyer tenants
// under priority_waterfall, with retention on for every buyer campaign. An
// accepting buyer whose decision is accepted_retention_owner outranks the
// strategy; among several, the strategy decides. Losers never learn that
// another buyer had the client. Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures } from './helpers/pingDb.js';
import { seedExchange, exchangePing, BUYERS } from './helpers/exchangeDb.js';
import { createS4Db, makeClient, S4_FEATURES } from './helpers/pingS4Db.js';
import { selectWinner, publisherReason } from '../src/ping/exchange.js';

let db; let campaigns;
before(async () => {
  db = await createS4Db(); campaigns = await seedExchange(db);
  await setFeatures(db, S4_FEATURES);
  await db.query('UPDATE ping_campaigns SET retention_enabled=true WHERE id=ANY($1)', [Object.values(campaigns)]);
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const buyerOf = id => Object.keys(campaigns).find(key => campaigns[key] === id) ?? null;
const PHONE = '+15550105001';
const ping = (extra = {}) => exchangePing(db, { phone: PHONE, callId: 'xr-1', extra: { zip: '75001' }, ...extra });
const auction = async id => (await q('SELECT * FROM exchange_auctions WHERE id=$1', [id]))[0];
const evalRows = auctionId => q(`SELECT d.* FROM exchange_auctions a
  CROSS JOIN LATERAL jsonb_array_elements(a.candidates) c JOIN ping_decisions d ON d.id=(c->>'decision_id')::uuid
  WHERE a.id=$1`, [auctionId]);
const client = key => makeClient(db, { tenant: BUYERS[key].tenant, phone: PHONE, ownerSlug: BUYERS[key].agent });

test('the priority 3 buyer that owns the client wins over priorities 1 and 2', () => inTx(async () => {
  const contact = await client('pacific');
  const result = await ping();
  assert.equal(result.available, true);
  assert.equal(result.transfer_number, BUYERS.pacific.transfer);
  assert.equal(result.reason, 'accepted_full', 'the publisher sees a tier, never retention');
  const row = await auction(result.auction_id);
  assert.equal(buyerOf(row.winner_campaign_id), 'pacific');
  assert.equal(row.reason, 'accepted_retention_owner', 'the operator auction row keeps the real reason');
  const [winner] = await q('SELECT * FROM ping_decisions WHERE id=$1', [row.winner_decision_id]);
  assert.deepEqual([winner.engine, winner.reason, winner.agent_id, winner.tenant_id],
    ['exchange', 'accepted_retention_owner', BUYERS.pacific.agent, BUYERS.pacific.tenant]);
  const alerts = await q('SELECT * FROM ping_retention_alerts');
  assert.equal(alerts.length, 1, 'one alert, for the winner, written by its real decision');
  assert.deepEqual([alerts[0].tenant_id, alerts[0].contact_id, alerts[0].decision_id],
    [BUYERS.pacific.tenant, contact, winner.id]);
}));

test('losers\' rows hold no phone, no ZIP and no retention hint', () => inTx(async () => {
  await client('pacific');
  const result = await ping();
  const rows = await evalRows(result.auction_id);
  const losers = rows.filter(row => row.campaign_id !== campaigns.pacific);
  assert.equal(losers.length, 2);
  for (const row of losers) {
    assert.equal(row.engine, 'exchange_eval');
    assert.equal(row.caller_phone, null);
    assert.equal(row.caller_zip, null);
    assert.equal(row.reason, 'accepted_full');
    assert.equal(row.rule_trace.find(s => s.rule === 'existing_client_retention').result, 'pass');
    const text = JSON.stringify(row);
    assert.doesNotMatch(text, /retention_owner|"hit"|"mode"/, buyerOf(row.campaign_id));
    assert.doesNotMatch(text, new RegExp(PHONE.slice(1)));
  }
  // No loser tenant gets an alert, a reservation or a matched decision.
  const loserTenants = [BUYERS.east.tenant, BUYERS.central.tenant];
  assert.equal((await q('SELECT count(*)::int n FROM ping_retention_alerts WHERE tenant_id=ANY($1)', [loserTenants]))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int n FROM ping_reservations WHERE tenant_id=ANY($1)', [loserTenants]))[0].n, 0);
}));

test('with two retention buyers the strategy decides between them', () => inTx(async () => {
  await client('pacific');
  await client('central');
  const result = await ping();
  const row = await auction(result.auction_id);
  assert.equal(buyerOf(row.winner_campaign_id), 'central', 'priority 2 beats priority 3; priority 1 has no client');
  // Under highest_price the pricier retention buyer wins instead.
  await q(`UPDATE exchange_sources SET strategy='highest_price'`);
  await q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
  const priced = await auction((await ping({ callId: 'xr-2' })).auction_id);
  assert.equal(buyerOf(priced.winner_campaign_id), 'pacific', 'rate 50 beats 40; east at 30 is not a client');
}));

test('a retention buyer that cannot take the call does not block the strategy', () => inTx(async () => {
  await client('pacific');
  await q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id=$1`, [BUYERS.pacific.agent]);
  const row = await auction((await ping()).auction_id);
  assert.equal(buyerOf(row.winner_campaign_id), 'east');
  assert.equal(row.reason, 'accepted_full');
}));

test('reject_and_alert at a buyer rejects it in evaluation, alerts that buyer only, and the others compete', () => inTx(async () => {
  await q(`UPDATE ping_campaigns SET retention_mode='reject_and_alert' WHERE id=$1`, [campaigns.east]);
  const contact = await client('east');
  const result = await ping();
  const row = await auction(result.auction_id);
  assert.equal(buyerOf(row.winner_campaign_id), 'central');
  assert.equal(row.candidates.find(c => c.campaign_id === campaigns.east).reason, 'existing_client_retention');
  const alerts = await q('SELECT * FROM ping_retention_alerts');
  assert.deepEqual(alerts.map(a => [a.tenant_id, a.contact_id]), [[BUYERS.east.tenant, contact]]);
}));

test('the JS mirror ranks retention first, lets the strategy order retention ties and masks the publisher reason', () => {
  const candidates = [
    { campaign_id: 'east', priority: 1, weight: 1, price: 30 },
    { campaign_id: 'central', priority: 2, weight: 2, price: 40, retention: true },
    { campaign_id: 'pacific', priority: 3, weight: 1, price: 50, retention: true },
  ];
  assert.deepEqual(selectWinner({ strategy: 'priority_waterfall', candidates }).ranking, ['central', 'pacific', 'east']);
  assert.equal(selectWinner({ strategy: 'highest_price', candidates }).winner, 'pacific');
  const rotation = selectWinner({ strategy: 'weighted_rotation', candidates, rotationState: { east: 5 } });
  assert.deepEqual(rotation.rotationState, { east: 5 }, 'rotation is not advanced by a retention win');
  assert.equal(selectWinner({ strategy: 'priority_waterfall', candidates, committed: 'east' }).winner, 'east');
  assert.equal(publisherReason('accepted_retention_owner', 'partial'), 'accepted_partial');
  assert.equal(publisherReason('accepted_retention_owner', 'full'), 'accepted_full');
  assert.equal(publisherReason('exchange_no_buyer', null), 'exchange_no_buyer');
});
