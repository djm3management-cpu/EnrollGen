// POST /api/exchange/v1/ping: flags, auth, admission and a response that never
// carries a price, another buyer, a candidate count or the winner's identity.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createExchangeV1Router, exchangeResponse } from '../src/routes/exchangeV1.js';
import { setFeatures } from './helpers/pingDb.js';
import { createS3Db, seedExchange, BUYERS, OP, EXCHANGE_FEATURES } from './helpers/exchangeDb.js';

const forbidden = () => assert.fail('must not reach the database');
const admitted = { data: { authorized: true, allowed: true } };
let pg; let events; let campaigns;

// Admission is stubbed (not part of this harness); exchange_ping runs for real in PGlite.
const pgClient = ({ admission = admitted, fail = false } = {}) => ({
  async rpc(name, args) {
    if (name === 'admit_vendor') return admission;
    if (name !== 'exchange_ping') return forbidden();
    if (fail) return { data: null, error: new Error('down') };
    try {
      const { rows } = await pg.query('SELECT exchange_ping($1,$2) AS r', [args.p_key_hash, args.p_payload]);
      return { data: rows[0].r, error: null };
    } catch (error) { return { data: null, error }; }
  },
});

async function serve(options, body, headers = { 'x-api-key': 'synthetic-exchange-key' }) {
  const app = express();
  app.use(express.json());
  app.use(createExchangeV1Router({ log: event => events.push(event), admissionLimit: () => 600, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/exchange/v1/ping`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const flags = (on = {}) => name => on[name] === true;
const allOn = flags({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true });
const on = { enabled: allOn, routingEnabled: () => true };

before(async () => {
  pg = await createS3Db(); campaigns = await seedExchange(pg);
  await pg.query('UPDATE lead_sources SET ping_key_hash=$2 WHERE id=$1',
    [OP.source, createHash('sha256').update('synthetic-exchange-key').digest('hex')]);
  await setFeatures(pg, EXCHANGE_FEATURES);
});
after(async () => pg?.close());
const reset = async () => {
  events = [];
  await pg.exec(`DELETE FROM ping_reservations; DELETE FROM exchange_auctions; UPDATE agent_availability SET available=true,status='available';`);
};

test('each missing flag returns 503 naming it, before auth or any database work', async () => {
  await reset();
  const cases = [
    [{}, 'PING_PLATFORM_ENABLED'],
    [{ PING_EXCHANGE_ENABLED: true }, 'PING_PLATFORM_ENABLED'],
    [{ PING_PLATFORM_ENABLED: true }, 'PING_EXCHANGE_ENABLED'],
  ];
  for (const [state, feature] of cases) {
    const response = await serve({ enabled: flags(state), db: forbidden }, { phone: '+15550003000', state: 'TX' }, {});
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: 'disabled', feature });
  }
  assert.deepEqual(events, []);
});

test('the database fence also answers 503 naming the flag', async () => {
  await reset();
  await setFeatures(pg, { PING_PLATFORM_ENABLED: true });
  try {
    const response = await serve({ ...on, db: () => pgClient() }, { phone: '+15550003000', state: 'TX', call_id: 'r0' });
    assert.deepEqual([response.status, response.body], [503, { status: 'disabled', feature: 'PING_EXCHANGE_ENABLED' }]);
  } finally { await setFeatures(pg, EXCHANGE_FEATURES); }
});

test('missing key, an unknown key or a non-exchange key is 401', async () => {
  await reset();
  assert.equal((await serve({ ...on, db: forbidden }, {}, {})).status, 401);
  const wrong = await serve({ ...on, db: () => pgClient({ admission: { data: { authorized: false } } }) }, { state: 'TX' });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Unauthorized' }]);
  // Admission passed but exchange_ping does not know the key.
  const unknown = await serve({ ...on, db: () => pgClient() }, { state: 'TX' }, { 'x-api-key': 'someone-else' });
  assert.deepEqual([unknown.status, unknown.body], [401, { error: 'Unauthorized' }]);
});

test('admission limited is 429 with Retry-After; admission failure is 503', async () => {
  await reset();
  const limited = await serve({ ...on, db: () => pgClient({ admission: { data: { authorized: true, allowed: false, retry_after: 9 } } }) }, { state: 'TX' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '9');
  assert.equal(limited.body.error, 'admission_limited');
  const failed = await serve({ ...on, db: () => pgClient({ admission: { data: null, error: new Error('down') } }) }, { state: 'TX' });
  assert.equal(failed.status, 503);
});

test('a winning ping returns only the five fields, never price, buyers or counts, and logs last 4 only', async () => {
  await reset();
  const response = await serve({ ...on, db: () => pgClient() },
    { phone: '(555) 000-3001', state: 'tx', zip: '75001', call_id: 'r1', sub_id: 's9' });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['auction_id', 'available', 'reason', 'transfer_number', 'ttl_seconds']);
  assert.deepEqual([response.body.available, response.body.reason, response.body.transfer_number, response.body.ttl_seconds],
    [true, 'accepted_full', BUYERS.east.transfer, 30]);
  const text = JSON.stringify(response.body);
  for (const secret of [...Object.values(campaigns), ...Object.values(BUYERS).map(b => b.tenant), 'agent_east', 'price', 'candidate']) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].event, events[0].phone_last4, events[0].state, events[0].auction_id],
    ['exchange_v1_auction', '3001', 'TX', response.body.auction_id]);
  assert.doesNotMatch(JSON.stringify(events), /5550003001|75001/);
});

test('no buyer is a 200 with available false and no transfer number', async () => {
  await reset();
  const response = await serve({ ...on, db: () => pgClient() }, { phone: '+15550003002', state: 'NY', call_id: 'r2' });
  assert.equal(response.status, 200);
  assert.deepEqual({ ...response.body, auction_id: null },
    { auction_id: null, available: false, reason: 'exchange_no_buyer', ttl_seconds: null, transfer_number: null });
  assert.ok(response.body.auction_id);
});

test('a database error fails closed with the same shape', async () => {
  await reset();
  const response = await serve({ ...on, db: () => pgClient({ fail: true }) }, { phone: '+15550003003', state: 'TX' });
  assert.deepEqual([response.status, response.body],
    [200, { auction_id: null, available: false, reason: 'error_rejected', ttl_seconds: null, transfer_number: null }]);
});

test('exchangeResponse drops every field outside the contract', () => {
  assert.deepEqual(exchangeResponse({ authorized: true, auction_id: 'a', available: true, reason: 'accepted_full',
    ttl_seconds: 30, transfer_number: '+15005550201', price: 50, candidates: [], winner_campaign_id: 'x', tenant_id: 't' }),
  { auction_id: 'a', available: true, reason: 'accepted_full', ttl_seconds: 30, transfer_number: '+15005550201' });
});
