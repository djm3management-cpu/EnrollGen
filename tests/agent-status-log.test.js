import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createAgentStatusLogHandler } from '../netlify/functions/agent-status-log.js';

const pg = new PGlite();
const db = evidenceDb(pg);
const auth = { userId: 'alice', sessionId: 'sess-alice', orgId: 'org-a', tokenPayload: {org_role:'org:admin'} };
const filters = { from: '2026-10-29T04:00:00Z', to: '2026-10-30T04:00:00Z' };
async function call(params = {}, identity = auth, expected = 200, method = 'GET') {
  const handler = createAgentStatusLogHandler({ authenticate: async () => identity, getDb: () => db });
  const response = await handler(new Request(`https://example.test/api/agent-status-log?${new URLSearchParams({ ...filters, ...params })}`, { method }));
  const payload = await response.json();
  assert.equal(response.status, expected, JSON.stringify(payload));
  return payload;
}

before(async () => {
  await pg.exec(`
    CREATE TABLE tenants(id uuid PRIMARY KEY, clerk_org_id text);
    CREATE TABLE enrolled_agents(id uuid, tenant_id uuid, clerk_user_id text, name text, npn text, is_active boolean);
    CREATE TABLE recording_agent_subjects(tenant_id uuid, clerk_user_id text, agent_slug text);
    CREATE TABLE availability_agent_subjects(tenant_id uuid, agent_slug text);
    CREATE TABLE agent_availability(agent_id text, agent_name text);
    CREATE TABLE agent_availability_log(id text, agent_id text, agent_name text, status text, available boolean, changed_at timestamptz);
    INSERT INTO tenants VALUES('00000000-0000-4000-8000-000000000001','org-a'),('00000000-0000-4000-8000-000000000002','org-b');
    INSERT INTO enrolled_agents VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','alice','Alice',NULL,true),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','foreign','Foreign',NULL,true),('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','inactive','Inactive',NULL,false);
    INSERT INTO availability_agent_subjects VALUES('00000000-0000-4000-8000-000000000001','alice'),('00000000-0000-4000-8000-000000000001','bob'),('00000000-0000-4000-8000-000000000002','foreign');
    INSERT INTO agent_availability VALUES('alice','Alice'),('bob','Bob'),('foreign','Foreign');
    INSERT INTO agent_availability_log VALUES
      ('01','alice','Alice','available',true,'2026-10-29T13:00:00Z'),
      ('02','alice','Alice','offline',false,'2026-10-29T17:30:00Z'),
      ('03','bob','Bob','busy',false,'2026-10-29T17:30:00Z'),
      ('04','foreign','Foreign','available',true,'2026-10-29T14:00:00Z'),
      ('05','alice','Alice','offline',false,'2026-10-30T04:00:00Z'),
      ('06','bob','Bob','offline',false,'2026-10-29T03:59:59Z');
  `);
});
after(() => pg.close());

test('agency history is tenant scoped, newest first, with stable pagination and local day boundaries', async () => {
  const first = await call({ limit: '2' });
  assert.equal(first.count, 3);
  assert.deepEqual(first.rows.map(row => row.id), ['03', '02']);
  assert.deepEqual(first.agents.map(row => row.agent_id), ['alice', 'bob']);
  const second = await call({ offset: '2', limit: '2' });
  assert.deepEqual(second.rows.map(row => row.id), ['01']);
});

test('filters apply before pagination and preserve exact timestamps', async () => {
  const result = await call({ agent: 'alice', status: 'offline' });
  assert.equal(result.count, 1);
  assert.equal(result.rows[0].id, '02');
  assert.equal(new Date(result.rows[0].changed_at).toISOString(), '2026-10-29T17:30:00.000Z');
  assert.equal((await call({ status: 'callbacks_only' })).count, 0);
});

test('foreign agents, injected tenants and untrusted identities cannot expose another agency', async () => {
  await call({ agent: 'foreign' }, auth, 403);
  await call({ tenant_id: '00000000-0000-4000-8000-000000000002' }, auth, 400);
  await call({}, { ...auth, userId: 'inactive' }, 403);
  await call({}, { ...auth, userId: 'unlinked' }, 403);
  await call({}, { ...auth, orgId: 'org-b' }, 403);
  await call({}, { ...auth, userId: 'dev-bypass' }, 401);
  await call({}, { ...auth, sessionId: null }, 401);
  await call({}, { ...auth, userId: 'foreign', orgId: 'org-b' },403);
});

test('organization admins without active provisioned membership are denied', async () => {
  const admin = { ...auth, userId: 'admin', tokenPayload: { org_role: 'org:admin' } };
  await call({}, admin,403);
  await call({ agent: 'foreign' }, admin, 403);
});

test('invalid dates, page values, statuses and writes are rejected', async () => {
  for (const params of [
    { from: '' }, { to: 'invalid' }, { to: filters.from }, { to: '2026-12-30T00:00:00Z' },
    { offset: '-1' }, { limit: '0' }, { limit: '101' }, { status: 'online' },
  ]) await call(params, auth, 400);
  await call({}, auth, 405, 'POST');
});
