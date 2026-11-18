import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createPingV1Router } from '../src/routes/pingV1.js';
import { parsePingFieldMaps, readPing, phoneLast4 } from '../src/ping/adapter.js';
import { createPingDb, setFeatures, syncGenericConfig } from './helpers/pingDb.js';

const forbidden = () => assert.fail('must not reach the database');
const admitted = { data: { authorized: true, allowed: true } };
let pg, events;

// Supabase-shaped client: admission is stubbed (it is not part of the ping
// schema harness); ping_decide runs for real in PGlite.
const pgClient = ({ admission = admitted } = {}) => ({
  async rpc(name, args) {
    if (name === 'admit_vendor') return admission;
    if (name !== 'ping_decide') return forbidden();
    try {
      const { rows } = await pg.query('SELECT ping_decide($1,$2,$3,$4) AS d', [args.p_key_hash, args.p_campaign, args.p_payload, args.p_engine]);
      return { data: rows[0].d, error: null };
    } catch (error) { return { data: null, error }; }
  },
});

async function serve(options, body, headers = { 'x-api-key': 'synthetic-key' }) {
  const app = express();
  app.use(express.json());
  app.use(createPingV1Router({ log: event => events.push(event), admissionLimit: () => 600, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ping/v1`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const on = { enabled: () => true, routingEnabled: () => true };

before(async () => {
  pg = await createPingDb();
  // The synthetic API key hashes to the Paragon source key.
  await pg.query('UPDATE lead_sources SET ping_key_hash=$1', [createHash('sha256').update('synthetic-key').digest('hex')]);
  await setFeatures(pg);
  await syncGenericConfig(pg);
});
after(async () => pg?.close());
const reset = async () => { events = []; await pg.exec('DELETE FROM ping_reservations; DELETE FROM ping_decisions;'); };

test('flag off returns 503 before auth or any database work', async () => {
  await reset();
  const response = await serve({ enabled: () => false, db: forbidden }, { phone: '+15550003000', state: 'KS' }, {});
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: 'disabled', feature: 'PING_PLATFORM_ENABLED' });
});

test('missing or wrong key is 401', async () => {
  await reset();
  assert.equal((await serve({ ...on, db: forbidden }, {}, {})).status, 401);
  const wrong = await serve({ ...on, db: () => pgClient({ admission: { data: { authorized: false } } }) }, { state: 'KS' });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Unauthorized' }]);
});

test('admission limited is 429 with Retry-After; admission failure is 503', async () => {
  await reset();
  const limited = await serve({ ...on, db: () => pgClient({ admission: { data: { authorized: true, allowed: false, retry_after: 17 } } }) }, { state: 'KS' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '17');
  assert.equal(limited.body.error, 'admission_limited');
  const failed = await serve({ ...on, db: () => pgClient({ admission: { data: null, error: new Error('down') } }) }, { state: 'KS' });
  assert.equal(failed.status, 503);
});

test('valid ping returns the decision shape, never a price, and logs the last 4 digits only', async () => {
  await reset();
  const response = await serve({ ...on, db: () => pgClient() },
    { phone: '(555) 000-3001', state: 'ks', zip: '66002', call_id: 'r1', sub_id: 's9', t65: true });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['available', 'decision_id', 'reason', 'ttl_seconds']);
  assert.deepEqual([response.body.available, response.body.reason, response.body.ttl_seconds], [true, 'accepted_full', 30]);
  const [row] = (await pg.query('SELECT * FROM ping_decisions WHERE id=$1', [response.body.decision_id])).rows;
  assert.deepEqual([row.caller_phone, row.caller_state, row.caller_zip, row.vendor_call_id, row.publisher_sub_id, row.t65_flag, Number(row.price)],
    ['+15550003001', 'KS', '66002', 'r1', 's9', true, 28]);
  assert.equal(events.length, 1);
  assert.equal(events[0].phone_last4, '3001');
  assert.doesNotMatch(JSON.stringify(events), /555000/);
});

test('invalid phone returns available false with invalid_payload, logged as a decision', async () => {
  await reset();
  const response = await serve({ ...on, db: () => pgClient() }, { phone: '12-34', state: 'KS', call_id: 'r2' });
  assert.deepEqual([response.status, response.body.available, response.body.reason], [200, false, 'invalid_payload']);
  assert.ok(response.body.decision_id);
  assert.equal(events[0].phone_last4, null);
});

test('routing switch off answers routing_disabled; database flag off answers 503', async () => {
  await reset();
  const response = await serve({ enabled: () => true, routingEnabled: () => false, db: () => pgClient() }, { phone: '+15550003002', state: 'KS', call_id: 'r3' });
  assert.deepEqual([response.body.available, response.body.reason], [false, 'routing_disabled']);
  await setFeatures(pg, {});
  try {
    const fenced = await serve({ ...on, db: () => pgClient() }, { phone: '+15550003002', state: 'KS', call_id: 'r4' });
    assert.deepEqual([fenced.status, fenced.body], [503, { status: 'disabled', feature: 'PING_PLATFORM_ENABLED' }]);
  } finally { await setFeatures(pg); }
});

test('database errors fail closed as error_rejected', async () => {
  await reset();
  const db = () => ({ rpc: async name => name === 'admit_vendor' ? admitted : { data: null, error: new Error('down') } });
  const response = await serve({ ...on, db }, { phone: '+15550003003', state: 'KS', call_id: 'r5' });
  assert.deepEqual([response.status, response.body], [200, { available: false, reason: 'error_rejected' }]);
});

test('field mapping per source reads the mapped names and the campaign selector', async () => {
  await reset();
  const fieldMaps = parsePingFieldMaps(JSON.stringify({ 'Paragon Media': { phone: 'ani', state: 'region', call_id: 'cid', zip: 'postal', campaign: 'camp' } }));
  const response = await serve({ ...on, db: () => pgClient(), fieldMaps, sourceName: () => 'Paragon Media' },
    { ani: '+15550003004', region: 'AR', cid: 'mapped-1', postal: '72201', camp: 'default' });
  assert.deepEqual([response.body.available, response.body.reason], [true, 'accepted_full']);
  const [row] = (await pg.query('SELECT * FROM ping_decisions WHERE id=$1', [response.body.decision_id])).rows;
  assert.deepEqual([row.caller_phone, row.caller_state, row.vendor_call_id, row.caller_zip], ['+15550003004', 'AR', 'mapped-1', '72201']);
  const unknown = await serve({ ...on, db: () => pgClient() }, { phone: '+15550003005', state: 'KS', call_id: 'r6', campaign: 'missing' });
  assert.equal(unknown.body.reason, 'campaign_inactive');
});

test('adapter falls back to generic names, ignores unsafe maps and never reads routing from the body', () => {
  assert.deepEqual(parsePingFieldMaps('not json'), {});
  assert.equal(parsePingFieldMaps({ s: { phone: 'drop table' } }).s.phone, 'phone');
  const fields = readPing({ phone: '5550003006', state: 'tx', t65: 'false', routing_enabled: true }, parsePingFieldMaps({ s: { phone: 'ani' } }).s);
  assert.deepEqual([fields.phone, fields.state, fields.t65, fields.invalidT65], ['+15550003006', 'TX', false, false]);
  assert.equal('routingEnabled' in fields, false);
  assert.equal(phoneLast4('+15550003006'), '3006');
  assert.equal(phoneLast4(null), null);
});
