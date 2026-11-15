// Explicit opt-in for existing enabled-feature behavior under test.
process.env.STRIPE_BILLING_ENABLED = 'true';
process.env.DAILY_VERSE_ENABLED = 'true';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import retiredCompliance from '../netlify/functions/compliance.js';
import { createComplianceReviewHandler } from '../netlify/functions/compliance-review.js';
import { createTranscribeHandler } from '../netlify/functions/transcribe.js';
import { createStripePortalHandler, config as portalConfig } from '../netlify/functions/stripe-portal.js';
import { createStripeCheckoutHandler, config as checkoutConfig } from '../netlify/functions/stripe-checkout.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = id(1), U = id(2), A = id(3), B = id(4), C = id(5);
const own = id(11), other = id(12), foreign = id(13);
const member = (userId = 'user-a', orgId = 'org-a') => ({ userId, orgId, tokenPayload: { org_role: 'org:member' } });
const admin = (orgId = 'org-a') => ({ userId: 'user-a', orgId, tokenPayload: { org_role: 'org:admin' } });
const pg = new PGlite();
const db = evidenceDb(pg);
const usage = { media: 0, provider: 0, stripe: [] };
db.storage = { from(bucket) {
  assert.equal(bucket, 'call-recordings');
  return { async createSignedUrl(path) {
    usage.media++;
    return { data: { signedUrl: `https://storage.offline.test/${path}?signed=fixture` } };
  } };
} };
const trustedKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreignKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
function token(key, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = encode({ alg: 'RS256', typ: 'JWT', kid: 'offline' }) + '.' + encode({ sub: 'user-a', sid: 'session', iss: 'https://trusted.clerk.accounts.dev', azp: new URL(JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).appOrigin).origin, aud: JSON.parse(process.env.DEPLOYMENT_PROFILE_JSON).organizationId, iat: now - 600, nbf: now - 600, exp: now + 60, ...extra });
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), key.privateKey).toString('base64url');
}
const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON, STRIPE_BILLING_ENABLED:'true', SCORING_ENABLED:'true', TRANSCRIPT_GAP_FILL_ENABLED:'true', DEEPGRAM_API_KEY: 'offline-fixture', STRIPE_PRO_PRICE_ID: 'price_fixture' };
const stripeClient = () => ({
  billingPortal: { sessions: { async create(body) { usage.stripe.push(body); return { url: 'https://stripe.offline.test/portal' }; } } },
  checkout: { sessions: { async create(body) { usage.stripe.push(body); return { id: 'checkout_fixture', url: 'https://stripe.offline.test/checkout' }; } } },
});
const transport = async (url, options) => {
  usage.provider++;
  assert.equal(new URL(url).hostname, 'api.deepgram.com');
  const audioUrl = JSON.parse(options.body).url;
  assert.match(audioUrl, /^https:\/\/phone.test\/api\/recordings\/media\//);
  assert.doesNotMatch(audioUrl, /attacker/);
  return Response.json({ metadata: { duration: 200 }, results: { channels: [{ alternatives: [{ transcript: 'Authorized transcript', words: [] }] }], utterances: [] } });
};
const factories = { 'compliance-review': createComplianceReviewHandler, transcribe: createTranscribeHandler, 'stripe-portal': createStripePortalHandler, 'stripe-checkout': createStripeCheckoutHandler };
const handler = (name, auth) => factories[name]({ authenticate: async () => auth, getDb: () => db, env, stripeClient, transport });
const request = (path, body) => new Request(`https://app.offline.test${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });

// Resolve the actual wildcard rewrite in netlify.toml so alias tests dispatch
// to the same exported function as the direct URL, including nested paths.
const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const apiRewrite = toml.split('[[redirects]]').find(block => /from = "\/api\/\*"/.test(block));
assert.match(apiRewrite, /to = "\/\.netlify\/functions\/:splat"/);
assert.match(apiRewrite, /status = 200/);
assert.deepEqual([portalConfig.path, checkoutConfig.path], ['/api/stripe-portal', '/api/stripe-checkout']);
function routedHandler(path, handlers) {
  const destination = path.startsWith('/api/') ? '/.netlify/functions/' + path.slice('/api/'.length) : path;
  return handlers[destination.split('/')[3]];
}
const paths = name => [`/api/${name}`, `/.netlify/functions/${name}`];
const retiredOperations = [
  ['POST', '/calls'], ['POST', `/calls/${other}/score`], ['GET', `/calls/${other}/scorecard`],
  ['GET', `/calls/${other}/detections`], ['POST', `/calls/${other}/override`], ['GET', '/scorecards'],
  ['GET', '/scorecards/card'], ['GET', '/templates'], ['GET', '/dashboard/overview'],
  ['GET', '/corrective-actions'], ['PATCH', '/corrective-actions/action'], ['GET', '/calibration/runs'],
  ['POST', '/calibration/start'], ['GET', '/calibration/run'], ['POST', '/calibration/run/override'],
  ['POST', '/recalculate'], ['GET', '/agents'],
];
for (const [method, suffix] of retiredOperations) {
  test(`retired ${method} ${suffix} returns 410 through alias and direct URL for every caller`, async () => {
    for (const prefix of paths('compliance')) for (const caller of ['none', 'member-other-call', 'member-admin-action', 'foreign-agency', 'admin']) {
      const path = prefix + suffix;
      const headers = caller === 'none' ? {} : { Authorization: `Bearer offline-${caller}` };
      const response = await routedHandler(path, { compliance: retiredCompliance })(new Request(`https://app.offline.test${path}`, { method, headers }));
      assert.equal(response.status, 410);
      assert.match((await response.json()).error, /retired/);
    }
  });
}

before(async () => {
  await pg.exec(`
    CREATE TABLE tenants(id uuid PRIMARY KEY, clerk_org_id text);
    CREATE TABLE enrolled_agents(id uuid PRIMARY KEY, tenant_id uuid, clerk_user_id text, name text, npn text, is_active boolean);
    CREATE TABLE recording_agent_subjects(tenant_id uuid, clerk_user_id text, agent_slug text);
    CREATE TABLE sessions(id uuid PRIMARY KEY, tenant_id uuid, agent_id uuid, call_record_id uuid);
    CREATE TABLE call_records(id uuid PRIMARY KEY, tenant_id uuid, agent_id uuid, session_id uuid, agent_name text,
      call_end timestamptz, call_duration_seconds integer, transcript_raw text, transcript_diarized jsonb,
      dg_sentiment jsonb, dg_intents jsonb, dg_topics jsonb, dg_summary text, call_analytics jsonb, updated_at timestamptz);
    CREATE TABLE telephony_call_attempts(id uuid, tenant_id uuid, call_record_id uuid, parent_call_sid text, agent_id text);
    CREATE TABLE recording_download_tickets(token_hash text PRIMARY KEY,tenant_id uuid,recording_sid text,account_sid text,channels smallint,expected_call_sid text,download boolean,expires_at timestamptz);
    CREATE TABLE recording_ingestion(id uuid, tenant_id uuid, call_record_id uuid, storage_path text, first_seen_at timestamptz);
    CREATE TABLE compliance_scorecards(id uuid, tenant_id uuid, call_id uuid, created_at timestamptz);
    CREATE TABLE compliance_llm_passes(id uuid, tenant_id uuid, call_id uuid, created_at timestamptz, status text);
    CREATE TABLE manual_transcript_gap_fills(id uuid, tenant_id uuid, call_id uuid, created_at timestamptz, status text);
    CREATE TABLE subscriptions(tenant_id uuid, stripe_customer_id text);
    INSERT INTO tenants VALUES('${T}','org-a'),('${U}','org-b');
    INSERT INTO enrolled_agents VALUES('${A}','${T}','user-a','Agent A',NULL,true),('${B}','${T}','user-b','Agent B',NULL,true),('${C}','${U}','user-c','Agent C',NULL,true);
    INSERT INTO recording_agent_subjects VALUES('${T}','user-a','agent_a'),('${T}','user-b','agent_b'),('${U}','user-c','agent_c');
    INSERT INTO subscriptions VALUES('${T}','customer_a'),('${U}','customer_b');
  `);
  for (const [n, call, tenant, agent] of [[21, own, T, A], [22, other, T, B], [23, foreign, U, C]]) {
    await pg.query('INSERT INTO sessions VALUES($1,$2,$3,$4)', [id(n), tenant, agent, call]);
    await pg.query("INSERT INTO call_records(id,tenant_id,agent_id,session_id,agent_name,call_end,call_duration_seconds,transcript_raw,transcript_diarized) VALUES($1,$2,$3,$4,'Authorized agent',now(),200,'Original transcript','[]')", [call, tenant, agent, id(n)]);
    await pg.query('INSERT INTO recording_ingestion VALUES($1,$2,$3,$4,now())', [id(n + 10), tenant, call, `${tenant}/${call}.wav`]);
  }
});
after(() => pg.close());

for (const name of Object.keys(factories)) {
  test(`${name}: real authentication rejects missing, expired, foreign-key and malformed credentials at both addresses before DB or providers`, async () => {
    const fail = () => { throw Error('Unauthenticated access reached a dependency'); };
    const endpoint = factories[name]({ getDb: fail, stripeClient: fail, transport: fail, env });
    const names = ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'CLERK_AUTHORIZED_PARTIES', 'CLERK_AUDIENCE'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
      for (const name of names) delete process.env[name];
      process.env.CLERK_JWT_KEY = trustedKey.publicKey.export({ type: 'spki', format: 'pem' });
      const invalidTokens = [null, 'malformed.token', token(trustedKey, { exp: Math.floor(Date.now() / 1000) - 60 }), token(foreignKey, { iss: 'https://foreign.clerk.accounts.dev' })];
      for (const path of paths(name)) for (const bearer of invalidTokens) {
        const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
        const response = await endpoint(new Request(`https://app.offline.test${path}`, { method: 'POST', headers, body: '{}' }));
        assert.equal(response.status, 401);
      }
    } finally {
      for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  });
  test(`${name}: bypass subject cannot access an active legacy handler even with admin claims`, async () => {
    const body = name === 'transcribe' ? { callId: own, recordingId: id(31) } : name === 'compliance-review' ? { call_id: own, action: 'preview' } : { plan: 'pro' };
    for (const path of paths(name)) assert.equal((await handler(name, { ...admin(), userId: 'dev-bypass' })(request(path, body))).status, 401);
  });
}

for (const [label, auth, call, expected] of [
  ['own call', member(), own, 200], ['another agent', member(), other, 403],
  ['other agency user', member('user-c', 'org-b'), own, 403], ['foreign call', admin(), foreign, 403],
  ['membership and org disagree', member('user-a', 'org-b'), own, 403], ['admin reviewing another agent', admin(), other, 200],
]) {
  test(`Compliance Review ${label} at both addresses`, async () => {
    for (const path of paths('compliance-review')) {
      const response = await handler('compliance-review', auth)(request(`${path}?call_id=${call}`));
      assert.equal(response.status, expected);
      if (expected === 200) {
        const data = await response.json();
        assert.equal(data.call.id, call);
        assert.equal(data.admin, auth.tokenPayload.org_role === 'org:admin');
        assert.deepEqual(data.items, []);
        assert.deepEqual(data.versions, []);
      }
    }
  });
}
test('every Compliance Review mutation rejects ordinary agents on their own call before provider work', async () => {
  const start = usage.provider;
  for (const action of ['preview', 'evaluate', 'review', 'fill', 'rescore']) for (const path of paths('compliance-review')) {
    const response = await handler('compliance-review', member())(request(path, { call_id: own, action, role: 'admin' }));
    assert.equal(response.status, 403);
  }
  assert.equal(usage.provider, start);
});
test('Compliance Review admin preview remains allowed, while a foreign admin cannot act on this agency', async () => {
  for (const path of paths('compliance-review')) {
    for (const [auth, expected] of [[admin(), 200], [admin('org-b'), 403]]) {
      assert.equal((await handler('compliance-review', auth)(request(path, { call_id: own, action: 'preview' }))).status, expected);
    }
  }
});

for (const [label, auth, callId, recordingId, expected] of [
  ['owner', member(), own, id(31), 200], ['another agent call', member(), other, id(32), 403],
  ['foreign member', member('user-c', 'org-b'), own, id(31), 403], ['foreign admin', admin('org-b'), own, id(31), 403],
  ['admin on another agent', admin(), other, id(32), 200],
  ['recording from another call', member(), own, id(32), 403], ['recording from another agency', admin(), own, id(33), 403],
]) {
  test(`transcribe ${label} at both addresses`, async () => {
    for (const path of paths('transcribe')) {
      const start = { media: usage.media, provider: usage.provider };
      const before = (await pg.query('SELECT transcript_raw FROM call_records WHERE id=$1', [callId])).rows[0].transcript_raw;
      const response = await handler('transcribe', auth)(request(path, { callId, recordingId, url: 'https://attacker.offline.test/audio', role: 'admin', tenant_id: T }));
      assert.equal(response.status, expected);
      if (expected === 200) {
        const data = await response.json();
        assert.equal(data.call_updated, true);
        assert.equal(data.transcript_raw, 'Authorized transcript');
      } else {
        assert.deepEqual({ media: usage.media, provider: usage.provider }, start);
        assert.equal((await pg.query('SELECT transcript_raw FROM call_records WHERE id=$1', [callId])).rows[0].transcript_raw, before);
      }
    }
  });
}
test('transcribe requires both call and recording, and cannot use an arbitrary URL alone', async () => {
  for (const body of [{ url: 'https://attacker.offline.test/audio' }, { recordingId: id(31) }]) {
    const start = usage.provider;
    assert.equal((await handler('transcribe', member())(request('/api/transcribe', body))).status, 400);
    assert.equal(usage.provider, start);
  }
});

for (const name of ['stripe-portal', 'stripe-checkout']) {
  test(`${name} rejects ordinary and mismatched-agency callers before Stripe, even with submitted admin/foreign-call fields`, async () => {
    for (const path of paths(name)) for (const auth of [member(), member('user-c', 'org-b'), member('user-a', 'org-b')]) {
      const start = usage.stripe.length;
      const response = await handler(name, auth)(request(path, { plan: 'pro', seats: 2, call_id: other, tenant_id: T, role: 'admin' }));
      assert.equal(response.status, 403);
      assert.equal(usage.stripe.length, start);
    }
  });
  test(`${name} permits admins only for their resolved agency, ignoring submitted agency and call IDs`, async () => {
    for (const path of paths(name)) for (const [org, tenant, customer] of [['org-a', T, 'customer_a']]) {
      const response = await handler(name, admin(org))(request(path, { plan: 'pro', seats: 2, call_id: other, tenant_id: org === 'org-a' ? U : T }));
      assert.equal(response.status, 200);
      assert.equal(usage.stripe.at(-1).customer, customer);
      if (name === 'stripe-checkout') {
        assert.equal(usage.stripe.at(-1).client_reference_id, tenant);
        assert.equal(usage.stripe.at(-1).metadata.tenant_id, tenant);
        assert.deepEqual(usage.stripe.at(-1).line_items, [{ price: 'price_fixture', quantity: 2 }]);
      }
    }
  });
  test(`${name} rejects an unknown agency without the old default-tenant fallback`, async () => {
    assert.equal((await handler(name, admin('unknown'))(request(`/api/${name}`, { plan: 'pro' }))).status, 403);
  });
}

test('transcribe rechecks tenant and owner on writes if attribution changes during provider work', async () => {
  for (const change of [{ tenant_id: U }, { agent_id: B }]) {
    const original = (await pg.query('SELECT transcript_raw FROM call_records WHERE id=$1', [own])).rows[0].transcript_raw;
    const endpoint = createTranscribeHandler({ authenticate: async () => member(), getDb: () => db, env,
      transport: async (url, options) => {
        if (change.tenant_id) await pg.query('UPDATE call_records SET tenant_id=$1 WHERE id=$2', [U, own]);
        else await pg.query('UPDATE call_records SET agent_id=$1 WHERE id=$2', [B, own]);
        return transport(url, options);
      },
    });
    try {
      const response = await endpoint(request('/api/transcribe', { callId: own, recordingId: id(31) }));
      assert.equal(response.status, 403);
      assert.equal((await pg.query('SELECT transcript_raw FROM call_records WHERE id=$1', [own])).rows[0].transcript_raw, original);
    } finally {
      await pg.query('UPDATE call_records SET tenant_id=$1,agent_id=$2 WHERE id=$3', [T, A, own]);
    }
  }
});

test('billing recognizes signed owner claims and protected membership for admins without an active organization', async () => {
  for (const name of ['stripe-portal', 'stripe-checkout']) for (const auth of [
    { userId: 'user-a', orgId: 'org-a', tokenPayload: { org_role: 'org:owner' } },
    { userId: 'user-a', orgId: null, tokenPayload: { public_metadata: { isAdmin: true } } },
  ]) {
    const response = await handler(name, auth)(request(`/api/${name}`, { plan: 'pro', tenant_id: U }));
    assert.equal(response.status, 200);
    assert.equal(usage.stripe.at(-1).customer, 'customer_a');
  }
});
