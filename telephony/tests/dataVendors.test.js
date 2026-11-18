// S9 consumer data vendor slot: the provider interface fails open on timeouts
// and errors, signals are recorded in rule_trace for call and lead pings,
// low_intent rejects only when min_intent_score is set, and a disabled vendor
// (or none configured) changes nothing. Stubbed providers only; no network.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDataVendors, normalizeSignals, parseVendorList, stubProvider, vendorQuery, NO_DATA_VENDORS,
  DEFAULT_TIMEOUT_MS } from '../src/ping/dataVendors.js';
import { setFeatures } from './helpers/pingDb.js';
import { B, seedPublisherB } from './helpers/pingS2Db.js';
import { OP, BUYERS, seedExchange } from './helpers/exchangeDb.js';
import { createS9Db, S9_FEATURES, seedLeadCampaign, leadPing } from './helpers/pingS9Db.js';

const answer = value => ({ enrich: async () => value });
const signals = (score, sep = []) => ({ stub: { intent_score: score, sep_signals: sep, source: 'stub' } });

test('the default timeout is 300 ms and a slow provider fails open to no signals', async () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 300);
  const failures = [];
  const vendors = createDataVendors({ providers: { stub: { enrich: () => new Promise(resolve =>
    setTimeout(() => resolve({ intent_score: 90 }), 2000).unref()) } }, enabled: ['stub'],
  onFailure: (name, why) => failures.push([name, why]) });
  const started = Date.now();
  assert.deepEqual(await vendors.enrich({ state: 'KS' }), {});
  const took = Date.now() - started;
  assert.ok(took >= 250 && took < 1000, String(took));
  assert.deepEqual(failures, [['stub', 'timeout']]);
});

test('a throwing or unusable provider fails open; the call never rejects', async () => {
  const failures = [];
  const onFailure = (name, why) => failures.push(why);
  const throwing = createDataVendors({ providers: { stub: { enrich: async () => { throw new Error('vendor down'); } } },
    enabled: ['stub'], onFailure });
  assert.deepEqual(await throwing.enrich({}), {});
  for (const bad of [null, [], { intent_score: 'high' }, { intent_score: 101 }, { intent_score: -1 }, {}]) {
    assert.deepEqual(await createDataVendors({ providers: { stub: answer(bad) }, enabled: ['stub'], onFailure }).enrich({}), {});
  }
  assert.deepEqual(failures, ['error', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
});

test('signals are normalized and providers see only state, ZIP, t65 and product line', async () => {
  assert.deepEqual(normalizeSignals({ intent_score: 72.6, sep_signals: ['moved', 'moved', 'Bad Value', 3, 'lost_coverage'],
    source: 'Vendor X' }, 'stub'), { intent_score: 73, sep_signals: ['moved', 'lost_coverage'], source: 'stub' });
  assert.deepEqual(vendorQuery({ state: 'KS', zip: '66002', t65: true, product_line: 'ma', phone: '+15552010001',
    first_name: 'Synthetic' }), { state: 'KS', zip: '66002', t65: true, product_line: 'ma' });
  let seen;
  await createDataVendors({ providers: { stub: { enrich: async query => { seen = query; return { intent_score: 1 }; } } },
    enabled: ['stub'] }).enrich({ state: 'KS', phone: '+15552010001', email: 'x@example.test' });
  assert.deepEqual(Object.keys(seen).sort(), ['product_line', 'state', 't65', 'zip']);
});

test('no configured vendor means no call at all; only known providers are configurable', async () => {
  assert.equal(NO_DATA_VENDORS.enabled, false);
  assert.equal(await NO_DATA_VENDORS.enrich({ state: 'KS' }), null);
  assert.deepEqual(parseVendorList(' stub, acme ,STUB'), ['stub']);
  assert.deepEqual(parseVendorList(undefined), []);
  const first = await stubProvider.enrich({ state: 'KS', zip: '66002', t65: true, product_line: 'ma' });
  const second = await stubProvider.enrich({ state: 'KS', zip: '66002', t65: true, product_line: 'ma' });
  assert.deepEqual(first, second, 'the stub is deterministic');
  assert.ok(first.intent_score >= 0 && first.intent_score <= 100);
  assert.deepEqual(first.sep_signals, ['turning_65']);
});

// Database behavior: call pings (ping_decide_signals, exchange_ping_signals) and lead pings.
let db; let campaigns;
const callPing = async (n, withSignals) => {
  const payload = { phone: `+1555201${String(n).padStart(4, '0')}`, state: 'KS', call_id: `dv-${n}`, routing_enabled: true };
  const { rows: [row] } = withSignals === undefined
    ? await db.query('SELECT ping_decide($1,$2,$3,$4) AS d', [B.hash, 'ma-central', payload, 'generic'])
    : await db.query('SELECT ping_decide_signals($1,$2,$3,$4,$5) AS d', [B.hash, 'ma-central', payload, 'generic', withSignals]);
  const { rows: [decision] } = await db.query('SELECT reason,rule_trace FROM ping_decisions WHERE id=$1', [row.d.decision_id]);
  return decision;
};
const vendorSteps = trace => trace.filter(step => ['data_vendor', 'low_intent'].includes(step.rule));
const setVendor = (tenant, enabled, min = null) => db.query(`INSERT INTO data_vendor_settings(tenant_id,provider,enabled,min_intent_score)
  VALUES($1,'stub',$2,$3) ON CONFLICT (tenant_id,provider) DO UPDATE SET enabled=$2,min_intent_score=$3`, [tenant, enabled, min]);

before(async () => {
  db = await createS9Db();
  await setFeatures(db, S9_FEATURES);
  campaigns = await seedPublisherB(db);
  await seedLeadCampaign(db, { tenant: B.tenant, source: B.source });
  await seedExchange(db);
});
after(async () => db?.close());
beforeEach(async () => db.exec('DELETE FROM ping_reservations; DELETE FROM data_vendor_settings;'));

test('a disabled or absent vendor setting leaves call decisions exactly as without signals', async () => {
  const plain = await callPing(1);
  await db.exec('DELETE FROM ping_reservations');
  const withSignals = await callPing(2, signals(5));
  assert.equal(withSignals.reason, plain.reason);
  assert.deepEqual(withSignals.rule_trace, plain.rule_trace);
  await setVendor(B.tenant, false, 50);
  await db.exec('DELETE FROM ping_reservations');
  assert.deepEqual((await callPing(3, signals(5))).rule_trace, plain.rule_trace);
});

test('an enabled vendor records signals in the call rule_trace; low_intent only with min_intent_score', async () => {
  await setVendor(B.tenant, true, null);
  const recorded = await callPing(4, signals(5, ['moved']));
  assert.match(recorded.reason, /^accepted_/);
  assert.deepEqual(vendorSteps(recorded.rule_trace), [{ rule: 'data_vendor', result: 'recorded', provider: 'stub',
    intent_score: 5, sep_signals: ['moved'], source: 'stub' }]);
  await setVendor(B.tenant, true, 50);
  await db.exec('DELETE FROM ping_reservations');
  const low = await callPing(5, signals(5));
  assert.equal(low.reason, 'low_intent');
  assert.deepEqual(vendorSteps(low.rule_trace).map(step => [step.rule, step.result]), [['data_vendor', 'recorded'], ['low_intent', 'hit'], ['low_intent', 'reject']], 'the gate step, then the decision');
  const passed = await callPing(6, signals(50));
  assert.match(passed.reason, /^accepted_/);
  assert.equal(vendorSteps(passed.rule_trace).at(-1).result, 'pass');
});

test('a vendor that failed (no signals for it) fails open and is traced as no_signals', async () => {
  await setVendor(B.tenant, true, 90);
  const decision = await callPing(7, {});
  assert.match(decision.reason, /^accepted_/);
  assert.deepEqual(vendorSteps(decision.rule_trace), [{ rule: 'data_vendor', result: 'no_signals', provider: 'stub' }]);
  // The signals setting does not outlive the call.
  assert.equal((await db.query("SELECT coalesce(current_setting('ping.vendor_signals',true),'') AS s")).rows[0].s, '');
});

test('lead pings record signals and reject low intent only for a tenant with a minimum', async () => {
  const ping = async score => leadPing(db, { key: B.hash, payload: { state: 'KS', zip: '66002' }, signals: score == null ? null : signals(score) });
  assert.equal((await ping(5)).reason, 'accepted_full', 'no vendor setting');
  await setVendor(B.tenant, true, null);
  const recorded = await ping(5);
  const { rows: [row] } = await db.query('SELECT rule_trace FROM lead_pings WHERE id=$1', [recorded.lead_ping_id]);
  assert.equal(vendorSteps(row.rule_trace)[0].intent_score, 5);
  await setVendor(B.tenant, true, 40);
  assert.equal((await ping(5)).reason, 'low_intent');
  assert.equal((await ping(40)).reason, 'accepted_full');
  assert.equal((await ping(null)).reason, 'accepted_full', 'no signals at all fails open');
});

test('in the exchange each buyer applies its own setting; a low intent buyer loses to the next', async () => {
  await setVendor(BUYERS.east.tenant, true, 60);
  const payload = { phone: '+15552019001', state: 'TX', call_id: 'dv-x1', routing_enabled: true };
  const { rows: [plain] } = await db.query('SELECT exchange_ping($1,$2) AS r', [OP.hash, payload]);
  const { rows: [{ winner_campaign_id: plainWinner }] } = await db.query('SELECT winner_campaign_id FROM exchange_auctions WHERE id=$1', [plain.r.auction_id]);
  await db.exec('DELETE FROM ping_reservations');
  const { rows: [low] } = await db.query('SELECT exchange_ping_signals($1,$2,$3) AS r', [OP.hash,
    { ...payload, call_id: 'dv-x2', phone: '+15552019002' }, signals(10)]);
  const { rows: [auction] } = await db.query('SELECT winner_campaign_id,candidates FROM exchange_auctions WHERE id=$1', [low.r.auction_id]);
  assert.notEqual(auction.winner_campaign_id, plainWinner);
  assert.equal(auction.candidates.find(c => c.campaign_id === plainWinner).reason, 'low_intent');
  assert.equal(low.r.reason, 'accepted_full', 'the publisher sees only the winner');
  assert.ok(campaigns['ma-central']);
});
