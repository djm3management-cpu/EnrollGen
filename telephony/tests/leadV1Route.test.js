// S9 routes: POST /api/ping/v1/lead and POST /api/post/v1/lead. Flags, key
// auth, admission, sandbox, response shapes and logs. Responses and log events
// never carry lead data. The database runs for real in PGlite; admission is
// stubbed as in pingV1Route.test.js. Synthetic identities only.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createLeadV1Router, leadPingResponse, leadPostResponse, unknownFields, LEAD_POST_FIELDS } from '../src/routes/leadV1.js';
import { createDataVendors } from '../src/ping/dataVendors.js';
import { setFeatures } from './helpers/pingDb.js';
import { B, seedPublisherB, supabaseLike } from './helpers/pingS2Db.js';
import { OP, BUYERS, seedExchange } from './helpers/exchangeDb.js';
import { createS9Db, S9_FEATURES, seedLeadCampaign, leadPost, TRUSTEDFORM } from './helpers/pingS9Db.js';

const KEY = 'synthetic-lead-key';
const EXCHANGE_KEY = 'synthetic-exchange-key';
const sha = value => createHash('sha256').update(value).digest('hex');
const admitted = { data: { authorized: true, allowed: true } };
const forbidden = () => assert.fail('must not reach the database');
let pg; let events; let rpcs;

const client = ({ admission = admitted } = {}) => {
  const real = supabaseLike(pg);
  return { rpc: async (name, args) => {
    rpcs.push(name);
    if (name === 'admit_vendor') return admission;
    return real.rpc(name, args);
  } };
};
const allOn = name => S9_FEATURES[name] === true;

async function call(path, body, { options = {}, headers = { 'x-api-key': KEY } } = {}) {
  const app = express();
  app.use(express.json());
  app.use(createLeadV1Router({ db: () => client(), enabled: allOn, log: event => events.push(event), admissionLimit: () => 600, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const leadPing = (body, opts) => call('/api/ping/v1/lead', { state: 'KS', zip: '66002', product_line: 'ma', ...body }, opts);
const leadPostCall = (id, body = {}, opts) => call('/api/post/v1/lead', { lead_ping_id: id, ...leadPost(body) }, opts);
const count = async table => Number((await pg.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
const leaks = value => /5552010001|Synthetic|example\.test|66002|sub-secret/.test(JSON.stringify(value));

before(async () => {
  pg = await createS9Db();
  await setFeatures(pg, S9_FEATURES);
  await seedPublisherB(pg);
  await pg.query('UPDATE lead_sources SET ping_key_hash=$2 WHERE id=$1', [B.source, sha(KEY)]);
  await seedLeadCampaign(pg, { tenant: B.tenant, source: B.source });
  await seedExchange(pg);
  await pg.query('UPDATE lead_sources SET ping_key_hash=$2 WHERE id=$1', [OP.source, sha(EXCHANGE_KEY)]);
  for (const key of Object.keys(BUYERS)) {
    const id = await seedLeadCampaign(pg, { tenant: BUYERS[key].tenant, source: BUYERS[key].source, states: ['TX'],
      carriers: ['aetna'], name: `lead-${key}` });
    await pg.query('INSERT INTO exchange_routes(source_id,campaign_id,priority) VALUES($1,$2,$3)', [OP.source, id, BUYERS[key].priority]);
  }
});
after(async () => pg?.close());
beforeEach(async () => {
  events = []; rpcs = [];
  await pg.exec(`ALTER TABLE lead_billing DISABLE TRIGGER USER; DELETE FROM lead_billing; ALTER TABLE lead_billing ENABLE TRIGGER USER;
    DELETE FROM lead_posts; DELETE FROM lead_auctions; DELETE FROM lead_pings; DELETE FROM opportunities;
    DELETE FROM pipeline_stages; DELETE FROM pipelines; DELETE FROM contacts; UPDATE lead_sources SET sandbox=false;`);
});

test('PING_PLATFORM_ENABLED off answers 503 on both routes before auth or the database', async () => {
  for (const path of ['/api/ping/v1/lead', '/api/post/v1/lead']) {
    const response = await call(path, {}, { options: { enabled: () => false, db: forbidden }, headers: {} });
    assert.deepEqual([response.status, response.body], [503, { status: 'disabled', feature: 'PING_PLATFORM_ENABLED' }]);
  }
});

test('exchange routing additionally needs PING_EXCHANGE_ENABLED', async () => {
  const enabled = name => name === 'PING_PLATFORM_ENABLED';
  const response = await leadPing({ exchange: true }, { options: { enabled, db: forbidden } });
  assert.deepEqual([response.status, response.body], [503, { status: 'disabled', feature: 'PING_EXCHANGE_ENABLED' }]);
  const direct = await leadPing({}, { options: { enabled } });
  assert.equal(direct.status, 200, 'a direct lead ping needs only the platform flag');
});

test('missing or wrong keys are 401; admission limits are 429 with Retry-After; admission failure is 503', async () => {
  assert.equal((await leadPing({}, { headers: {} })).status, 401);
  const db = () => ({ rpc: async () => ({ data: { authorized: false } }) });
  assert.deepEqual((await leadPing({}, { options: { db } })).body, { error: 'Unauthorized' });
  const limited = await leadPostCall('0e000000-0000-4000-8000-000000000001', {}, { options: {
    db: () => ({ rpc: async () => ({ data: { authorized: true, allowed: false, retry_after: 9 } }) }) } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '9');
  const down = await leadPing({}, { options: { db: () => ({ rpc: async () => ({ data: null, error: new Error('down') }) }) } });
  assert.equal(down.status, 503);
  // A key that passes admission but matches no publisher in the database is still refused.
  const stranger = await leadPing({}, { headers: { 'x-api-key': 'not-a-publisher' } });
  assert.deepEqual([stranger.status, stranger.body], [401, { error: 'Unauthorized' }]);
});

test('a lead ping answers only id, availability, reason and the post deadline, never the lead data', async () => {
  const response = await leadPing({ sub_id: 'sub-secret', t65: 'true', consent_cert_id: TRUSTEDFORM });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['available', 'lead_ping_id', 'post_expires_at', 'reason']);
  assert.equal(response.body.available, true);
  assert.ok(!leaks(response.body) && !leaks(events));
  assert.deepEqual(events.map(e => [e.event, e.status, e.lead_ping_id]), [['lead_v1_ping', 200, response.body.lead_ping_id]]);
  assert.deepEqual(rpcs, ['admit_vendor', 'lead_ping_decide']);
});

test('a lead ping with a phone or any unknown field is a 400 and nothing is stored', async () => {
  for (const extra of [{ phone: '+15552010001' }, { first_name: 'Synthetic' }, { mbi: '1EG4TE5MK73' }, { exchange: 'yes' }]) {
    const response = await leadPing(extra);
    assert.deepEqual([response.status, response.body], [400, { available: false, reason: 'invalid_payload' }]);
  }
  assert.equal(await count('lead_pings'), 0);
  assert.ok(!leaks(events));
});

test('a post answers only accepted and reason, normalizes the phone, and never echoes the lead', async () => {
  const ping = (await leadPing({ consent_cert_id: TRUSTEDFORM })).body;
  const response = await leadPostCall(ping.lead_ping_id, { phone: '(555) 201-0001' });
  assert.deepEqual([response.status, response.body], [200, { accepted: true, reason: 'accepted' }]);
  assert.equal((await pg.query('SELECT phone FROM contacts')).rows[0].phone, '+15552010001');
  const again = await leadPostCall(ping.lead_ping_id);
  assert.deepEqual([again.status, again.body], [200, { accepted: false, reason: 'duplicate_lead' }]);
  assert.ok(!leaks(events));
  assert.deepEqual(events.map(e => e.event), ['lead_v1_ping', 'lead_v1_post', 'lead_v1_post']);
});

test('MBI, SSN, DOB, health fields and a bad lead_ping_id are 400 before the database decides, and write nothing', async () => {
  const ping = (await leadPing({})).body;
  for (const extra of [{ mbi: '1EG4TE5MK73' }, { ssn: '000-00-0000' }, { dob: '1950-01-01' }, { conditions: 'x' }]) {
    rpcs = [];
    const response = await leadPostCall(ping.lead_ping_id, extra);
    assert.deepEqual([response.status, response.body], [400, { accepted: false, reason: 'invalid_payload' }]);
    assert.deepEqual(rpcs, ['admit_vendor'], 'refused by the allowlist before the post routine');
  }
  assert.equal((await leadPostCall('not-a-uuid')).status, 400);
  const malformed = await leadPostCall(ping.lead_ping_id, { email: 'not an email' });
  assert.deepEqual([malformed.status, malformed.body], [400, { accepted: false, reason: 'invalid_payload' }]);
  assert.equal(await count('lead_posts'), 0);
  assert.equal(await count('contacts'), 0);
  assert.ok(!leaks(events));
});

test('a sandbox source gets "sandbox": true on ping and post and nothing is written by the post', async () => {
  await pg.query('UPDATE lead_sources SET sandbox=true WHERE id=$1', [B.source]);
  const ping = await leadPing({ consent_cert_id: TRUSTEDFORM });
  assert.equal(ping.body.sandbox, true);
  assert.equal(ping.body.available, true);
  const { rows: [row] } = await pg.query('SELECT engine,zip FROM lead_pings');
  assert.deepEqual([row.engine, row.zip], ['sandbox', null]);
  const post = await leadPostCall(ping.body.lead_ping_id);
  assert.deepEqual(post.body, { accepted: true, reason: 'accepted', sandbox: true });
  for (const table of ['lead_posts', 'contacts', 'opportunities', 'lead_billing']) assert.equal(await count(table), 0, table);
});

test('an exchange lead ping goes through exchange_lead_ping and answers the same shape', async () => {
  const response = await leadPing({ state: 'TX', zip: '75001', exchange: true }, { headers: { 'x-api-key': EXCHANGE_KEY } });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['available', 'lead_ping_id', 'post_expires_at', 'reason']);
  assert.equal(response.body.available, true);
  assert.deepEqual(rpcs, ['admit_vendor', 'exchange_lead_ping']);
  assert.equal(events[0].exchange, true);
});

test('data vendor signals are passed to the database only when a vendor is configured', async () => {
  const dataVendors = createDataVendors({ providers: { stub: { enrich: async query => {
    assert.deepEqual(Object.keys(query).sort(), ['product_line', 'state', 't65', 'zip']);
    return { intent_score: 10, sep_signals: [], source: 'stub' };
  } } }, enabled: ['stub'] });
  await pg.query("INSERT INTO data_vendor_settings(tenant_id,provider,enabled,min_intent_score) VALUES($1,'stub',true,50)", [B.tenant]);
  try {
    const response = await leadPing({}, { options: { dataVendors } });
    assert.deepEqual([response.body.available, response.body.reason], [false, 'low_intent']);
  } finally { await pg.query('DELETE FROM data_vendor_settings'); }
});

test('response helpers never pass through extra fields', () => {
  const ping = leadPingResponse({ lead_ping_id: 'x', available: true, reason: 'accepted_full', post_expires_at: 't',
    price: 12, state: 'KS', zip: '66002', agent_id: 'a' });
  assert.deepEqual(ping, { lead_ping_id: 'x', available: true, reason: 'accepted_full', post_expires_at: 't' });
  assert.deepEqual(leadPostResponse({ accepted: true, reason: 'accepted', contact_id: 'c', phone: 'p' }),
    { accepted: true, reason: 'accepted' });
  assert.deepEqual(unknownFields({ lead_ping_id: 'x', mbi: 'y', dob: 'z' }, LEAD_POST_FIELDS), ['mbi', 'dob']);
});
