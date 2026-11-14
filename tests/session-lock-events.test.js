import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createSessionLockEventsHandler } from '../netlify/functions/session-lock-events.js';

const pg = new PGlite(), db = evidenceDb(pg);
const tenant = '00000000-0000-4000-8000-000000000001';
const agent = '00000000-0000-4000-8000-000000000002';
const auth = { userId: 'user-a', orgId: 'org-a', sessionId: 'session-a' };
const request = (body, method = 'POST') => new Request('https://offline.test/.netlify/functions/session-lock-events', { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const handler = identity => createSessionLockEventsHandler({ authenticate: async () => identity, getDb: () => db });
before(async () => {
  await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
    CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
    CREATE TABLE telephony_events(tenant_id uuid,event text,payload jsonb,occurred_at timestamptz DEFAULT now());
    INSERT INTO tenants VALUES('${tenant}','org-a');
    INSERT INTO enrolled_agents VALUES('${agent}','${tenant}','user-a','Agent',NULL,true);`);
});
after(() => pg.close());

test('existing event log records lock, unlock and failed-unlock with server-bound actor/tenant/time and no supplied PHI', async () => {
  for (const event of ['session_lock', 'session_unlock', 'session_unlock_failed']) {
    const response = await handler(auth)(request({ event, tenant_id: 'forged', clerk_user_id: 'forged', transcript: 'PHI', password: 'SECRET' }));
    assert.equal(response.status, 200);
  }
  const { rows } = await pg.query('SELECT * FROM telephony_events ORDER BY occurred_at');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.event), ['session_lock', 'session_unlock', 'session_unlock_failed']);
  for (const row of rows) {
    assert.equal(row.tenant_id, tenant); assert.equal(row.payload.clerk_user_id, 'user-a');
    assert.ok(row.occurred_at); assert.doesNotMatch(JSON.stringify(row), /PHI|SECRET|forged|transcript|password/);
  }
  assert.equal(rows[2].payload.result, 'failed');
});

test('session event log rejects unauthenticated, bypass, unprovisioned, inactive and foreign-organization subjects', async () => {
  const unauth = createSessionLockEventsHandler({ authenticate: async () => ({ response: new Response(null, { status: 401 }) }), getDb: () => { throw Error('Must not read DB'); } });
  assert.equal((await unauth(request({ event: 'session_lock' }))).status, 401);
  for (const [identity, status] of [[{ ...auth, userId: 'dev-bypass' }, 401], [{ ...auth, userId: 'unknown' }, 403], [{ ...auth, orgId: 'foreign' }, 403]]) {
    assert.equal((await handler(identity)(request({ event: 'session_lock' }))).status, status);
  }
  await pg.exec(`UPDATE enrolled_agents SET is_active=false WHERE id='${agent}'`);
  try {
    assert.equal((await handler(auth)(request({ event: 'session_unlock' }))).status, 403);
    assert.equal((await handler({ ...auth, tokenPayload: { org_role: 'org:admin' } })(request({ event: 'session_unlock' }))).status, 403);
  } finally { await pg.exec(`UPDATE enrolled_agents SET is_active=true WHERE id='${agent}'`); }
});

test('session log validates methods/events and fails visibly when persistence is unavailable', async () => {
  assert.equal((await handler(auth)(request(null, 'GET'))).status, 405);
  assert.equal((await handler(auth)(request({ event: 'arbitrary-write' }))).status, 400);
  const failing = createSessionLockEventsHandler({ authenticate: async () => auth, getDb: () => { throw Error('database credentials SECRET'); } });
  const response = await failing(request({ event: 'session_unlock' }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET|credentials/);
});
