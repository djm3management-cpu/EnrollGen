import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createAvailabilityHandler } from '../netlify/functions/set-availability.js';
import { requireClerkAuth } from '../netlify/functions/_clerkAuth.js';
import { availabilityRequest } from '../src/lib/availabilityApi.js';

const pg = new PGlite();
const db = evidenceDb(pg);
const tenant = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const auth = { userId: 'alice', sessionId: 'sess-alice', orgId: 'org-a', tokenPayload: {} };
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const query = async (text, values = []) => (await pg.query(text, values)).rows;
const handler = identity => createAvailabilityHandler({ authenticate: async () => identity, getDb: () => db });
const request = (body, method = 'POST', suffix = '') => new Request('https://app.example/api/set-availability' + suffix, {
  method, ...(body == null ? {} : { body: JSON.stringify(body) }), headers: { 'Content-Type': 'application/json' },
});
const call = async (identity, body, expected = 200, method, suffix) => {
  const response = await handler(identity)(request(body, method, suffix));
  const payload = await response.json();
  assert.equal(response.status, expected, JSON.stringify(payload));
  return payload;
};

before(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;`);
  await pg.exec(sql('./fixtures/evidence-live-schema.sql'));
  await pg.exec(`INSERT INTO tenants(id,name,clerk_org_id) VALUES ('${tenant}','A','org-a'),('${foreign}','B','org-b');
    INSERT INTO enrolled_agents(clerk_user_id,name,tenant_id,is_active) VALUES
      ('alice','Alice','${tenant}',true),('bob','Bob','${tenant}',true),
      ('foreign','Foreign','${foreign}',true),('inactive','Inactive','${tenant}',false);
    INSERT INTO agent_availability(agent_id,agent_name) VALUES ('alice','Alice'),('bob','Bob'),('foreign','Foreign'),('inactive','Inactive');
    INSERT INTO tenant_agents(tenant_id,name,agent_slug,clerk_user_id,is_active) VALUES
      ('${tenant}','Alice','alice','alice',true),('${tenant}','Bob','bob','bob',true),
      ('${foreign}','Foreign','foreign','foreign',true),('${tenant}','Inactive','inactive','inactive',false);
    -- Exercise grants that survive a table-only REVOKE.
    GRANT UPDATE(status) ON agent_availability TO anon,authenticated;
    GRANT SELECT(agent_id) ON agent_availability TO PUBLIC;`);
  await pg.exec(sql('../supabase/migrations/063_evidence_access.sql'));
  await pg.exec(sql('../supabase/migrations/073_availability_auth.sql'));
  await pg.exec('GRANT ALL ON agent_phone_sessions TO service_role; SET ROLE service_role');
});
after(async () => pg.close());

test('own status is resolved from the verified subject; writes retain deployed fields and response shape', async () => {
  await pg.exec("INSERT INTO agent_phone_sessions VALUES(gen_random_uuid(),'alice',now()+interval '1 hour')");
  const row = await call(auth, { status: 'available', tenant_id: foreign, agent_name: 'spoofed' });
  assert.equal(row.agent_id, 'alice');
  assert.equal(row.agent_name, 'Alice');
  assert.equal(row.status, 'available');
  assert.equal(row.available, true);
  assert.ok(row.toggled_at);
  assert.deepEqual(Object.keys(row).sort(), ['agent_id','agent_name','available','status','success','toggled_at']);
  assert.equal((await call(auth, null, 200, 'GET')).status, 'available');
  assert.ok((await query("SELECT * FROM agent_availability_log WHERE agent_id='alice'")).length);
});

test('an agent cannot read or change another agent, even with body admin claims', async () => {
  const before = await query("SELECT * FROM agent_availability WHERE agent_id='bob'");
  await call(auth, { agent_id: 'bob', status: 'offline', role: 'admin', isAdmin: true }, 403);
  await call(auth, null, 403, 'GET', '?agent_id=bob');
  assert.deepEqual(await query("SELECT * FROM agent_availability WHERE agent_id='bob'"), before);
});

test('verified organization admin override works and cannot cross organizations', async () => {
  const admin = { ...auth, userId: 'admin-without-agent-row', tokenPayload: { org_role: 'org:admin' } };
  assert.equal((await call(admin, { agent_id: 'bob', status: 'busy' })).status, 'busy');
  await call(admin, { agent_id: 'foreign', status: 'offline' }, 403);
  const v2 = { ...admin, orgId: null, tokenPayload: { o: { id: 'org-a', rol: 'admin' } } };
  assert.equal((await call(v2, { agent_id: 'bob', status: 'offline' })).status, 'offline');
});

test('verified server-managed global admin override works across organizations', async () => {
  const admin = { ...auth, userId: 'global-admin', orgId: null, tokenPayload: { public_metadata: { isAdmin: true } } };
  assert.equal((await call(admin, { agent_id: 'foreign', status: 'busy' })).status, 'busy');
});

test('inactive, unlinked, wrong-org and bypass identities cannot write', async () => {
  for (const identity of [
    { ...auth, userId: 'inactive' }, { ...auth, userId: 'unlinked' },
    { ...auth, orgId: 'org-b' }, { ...auth, userId: 'dev-bypass' }, { ...auth, sessionId: null },
  ]) await call(identity, { status: 'offline' }, identity.userId === 'dev-bypass' || !identity.sessionId ? 401 : 403);
  await pg.exec("UPDATE enrolled_agents SET is_active=false WHERE clerk_user_id='bob'");
  await call({ ...auth, userId: 'bob' }, { status: 'offline' }, 403);
  await pg.exec("UPDATE enrolled_agents SET is_active=true WHERE clerk_user_id='bob'");
});

test('browser roster spoofing cannot grant another subject availability access', async () => {
  await pg.exec('RESET ROLE');
  await pg.exec("UPDATE tenant_agents SET clerk_user_id='alice' WHERE agent_slug='bob'; UPDATE tenants SET clerk_org_id='org-a' WHERE id='" + foreign + "'");
  await pg.exec('SET ROLE service_role');
  await call(auth, { agent_id: 'bob', status: 'available' }, 403);
  await call({ ...auth, tokenPayload: { org_role: 'org:admin' } }, { agent_id: 'foreign', status: 'offline' }, 403);
});

test('presence and active call guards still own effective status and resume intent', async () => {
  await pg.exec("DELETE FROM agent_phone_sessions WHERE agent_id='alice'");
  assert.equal((await call(auth, { status: 'available' })).status, 'offline');
  await pg.exec("INSERT INTO agent_phone_sessions VALUES(gen_random_uuid(),'alice',now()+interval '1 hour'); UPDATE agent_availability SET active_call_sid='CA-active',status='busy',available=false WHERE agent_id='alice'");
  const row = await call(auth, { status: 'offline' });
  assert.equal(row.status, 'busy');
  assert.equal(row.available, false);
  const stored = (await query("SELECT * FROM agent_availability WHERE agent_id='alice'"))[0];
  assert.equal(stored.active_call_sid, 'CA-active');
  assert.equal(stored.resume_status, 'offline');
  assert.equal((await call(auth, { status: 'available' })).status, 'busy');
  assert.equal((await query("SELECT resume_status FROM agent_availability WHERE agent_id='alice'"))[0].resume_status, 'available');
});

test('073 denies direct availability CRUD and identity-map access, including column grants', async () => {
  for (const role of ['anon','authenticated']) {
    await pg.exec('RESET ROLE; SET ROLE ' + role);
    for (const table of ['agent_availability','agent_availability_log','availability_agent_subjects']) {
      await assert.rejects(pg.query('SELECT * FROM ' + table), /permission denied/);
      await assert.rejects(pg.query('DELETE FROM ' + table), /permission denied/);
      await assert.rejects(pg.query('INSERT INTO ' + table + ' DEFAULT VALUES'), /permission denied/);
    }
    await assert.rejects(pg.query("UPDATE agent_availability SET status='offline' WHERE agent_id='bob'"), /permission denied/);
    await assert.rejects(pg.query("UPDATE agent_availability_log SET status='offline'"), /permission denied/);
    await assert.rejects(pg.query("UPDATE availability_agent_subjects SET is_active=true"), /permission denied/);
    await assert.rejects(pg.query('SELECT agent_id FROM agent_availability'), /permission denied/);
  }
  await pg.exec('RESET ROLE; SET ROLE service_role');
  assert.ok((await query('SELECT * FROM agent_availability')).length);
});

test('Clerk signature verification is mandatory even when development bypass flags are enabled', async () => {
  const names = ['CLERK_JWT_KEY','CLERK_SECRET_KEY','DISABLE_CLERK_AUTH','VITE_DISABLE_CLERK_AUTH','CLERK_AUTHORIZED_PARTIES','CLERK_AUDIENCE'];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  try {
    for (const name of names) delete process.env[name];
    process.env.CLERK_JWT_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.DISABLE_CLERK_AUTH = process.env.VITE_DISABLE_CLERK_AUTH = 'true';
    const now = Math.floor(Date.now()/1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({ alg: 'RS256', typ: 'JWT', kid: 'fixture' }) + '.' + encode({
      sub: 'alice', sid: 'sess-alice', iss: 'https://fixture.clerk.accounts.dev', iat: now, nbf: now-5, exp: now+60,
    });
    const token = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
    const verified = await requireClerkAuth(new Request('https://app.example', { headers: { Authorization: 'Bearer ' + token } }), { allowBypass: false });
    assert.equal(verified.userId, 'alice');
    const endpoint = createAvailabilityHandler({ getDb: () => db });
    const validRequest = request({ status: 'offline' });
    validRequest.headers.set('Authorization', 'Bearer ' + token);
    assert.equal((await endpoint(validRequest)).status, 200);
    assert.equal((await endpoint(request({ status: 'offline' }))).status, 401);
    const sharedKeyRequest = request({ agent_id: 'bob', status: 'offline' });
    sharedKeyRequest.headers.set('x-api-key', 'old-shared-key');
    assert.equal((await endpoint(sharedKeyRequest)).status, 401);
  } finally {
    for (const name of names) if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name];
  }
});

test('browser requests carry Clerk tokens only, refuse missing sessions and surface denial', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, ...init }); return new Response(JSON.stringify({ agent_id: 'alice', status: 'offline' })); };
  try {
    await availabilityRequest(async () => 'session-token', { status: 'offline' });
    await availabilityRequest(async () => 'refreshed-token');
    assert.equal(calls[0].url, '/.netlify/functions/set-availability');
    assert.equal(calls[0].headers.Authorization, 'Bearer session-token');
    assert.equal(calls[0].headers['x-api-key'], undefined);
    assert.deepEqual(JSON.parse(calls[0].body), { status: 'offline' });
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].headers.Authorization, 'Bearer refreshed-token');
    await assert.rejects(availabilityRequest(async () => null, { status: 'offline' }), /Sign in/);
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    await assert.rejects(availabilityRequest(async () => 'token', { status: 'offline' }), /Forbidden/);
  } finally { globalThis.fetch = original; }
});
