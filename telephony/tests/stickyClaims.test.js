import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const migration = 'supabase/migrations/046_sticky_agent_routing.sql';
let db;
async function setup() {
  const database = new PGlite();
  await database.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);
    CREATE TABLE tenant_agents(agent_slug text, is_active boolean);`);
  for (const path of ['supabase/migrations/038_call_owned_agent_reservations.sql', 'supabase/migrations/039_agent_phone_presence.sql']) {
    await database.exec(await sql(path));
  }
  return database;
}
before(async () => { db = await setup(); await db.exec(await sql(migration)); });
after(async () => db?.close());
async function reset(paused = false) {
  await db.exec(await sql(`scripts/telephony/${paused ? 'pause' : 'enable'}-phone-presence.sql`));
  await db.exec(`TRUNCATE agent_availability CASCADE; TRUNCATE tenant_agents;
    INSERT INTO agent_availability(agent_id,agent_name,status,available,toggled_at,last_assigned_at) VALUES
      ('a','A','available',true,'2026-01-01','2026-01-01'),
      ('b','B','available',true,'2026-01-02','2026-01-02'),
      ('c','C','available',true,'2026-01-03','2026-01-03');
    INSERT INTO tenant_agents VALUES ('a',true),('b',true),('c',true);
    INSERT INTO agent_phone_sessions SELECT gen_random_uuid(),agent_id,now()+interval '1 hour' FROM agent_availability;`);
}
const claim = (sid, preferred = 'c', exclude = [], agent = null) => db.query(
  'SELECT * FROM claim_call_agent($1,$2,$3,$4)', [sid, exclude, agent, preferred]).then(r => r.rows[0]);
const legacy = (sid, exclude = [], agent = null) => db.query(
  'SELECT * FROM claim_call_agent($1,$2,$3)', [sid, exclude, agent]).then(r => r.rows[0]);
const release = sid => db.query('SELECT release_call_agent($1)', [sid]);

for (const paused of [false, true]) {
  const mode = paused ? 'paused presence' : 'enabled presence';
  test(`${mode}: preferred agent wins over least-recently-assigned and advances assignment time`, async () => {
    await reset(paused);
    const result = await claim('CA1');
    assert.deepEqual(result, { agent_id: 'c', agent_name: 'C', claim_path: 'preferred' });
    const { rows: [row] } = await db.query("SELECT * FROM agent_availability WHERE agent_id='c'");
    assert.equal(row.active_call_sid, 'CA1'); assert.equal(row.status, 'busy'); assert.equal(row.available, false);
    assert.ok(new Date(row.last_assigned_at) > new Date('2026-01-03'));
    assert.equal(row.resume_status, 'available');
    assert.equal((await claim('CA1')).claim_path, 'existing');
    await release('CA1'); assert.equal((await legacy('CA2')).agent_id, 'a');
  });

  test(`${mode}: offline, busy, reserved, inactive, absent-roster and excluded preferred agents fall through`, async () => {
    for (const change of [
      "UPDATE agent_availability SET status='offline',available=false WHERE agent_id='a'",
      "UPDATE agent_availability SET status='busy',available=false WHERE agent_id='a'",
      "UPDATE agent_availability SET active_call_sid='OTHER',status='busy',available=false WHERE agent_id='a'",
      "UPDATE tenant_agents SET is_active=false WHERE agent_slug='a'",
      "DELETE FROM tenant_agents WHERE agent_slug='a'",
      "UPDATE agent_availability SET available=false WHERE agent_id='a'",
    ]) {
      await reset(paused); await db.exec(change);
      assert.deepEqual(await claim('CA1', 'a'), { agent_id: 'b', agent_name: 'B', claim_path: 'round_robin' });
    }
    await reset(paused);
    assert.equal((await claim('CA1', 'a', ['a'])).agent_id, 'b');
    assert.equal((await claim('CA2', 'missing')).agent_id, 'a');
  });

  test(`${mode}: no-answer fallback never re-prefers and respects exclusion`, async () => {
    await reset(paused); assert.equal((await claim('CA1')).agent_id, 'c');
    await release('CA1');
    assert.deepEqual(await legacy('CA1', ['c']), { agent_id: 'a', agent_name: 'A' });
    // Late child completion from c cannot release the fallback reservation.
    await db.query("SELECT release_call_agent('CA1','c')");
    assert.equal((await db.query("SELECT active_call_sid FROM agent_availability WHERE agent_id='a'")).rows[0].active_call_sid, 'CA1');
  });

  test(`${mode}: overlapping preferred claims reserve distinct agents`, async () => {
    await reset(paused);
    // PGlite serializes execution; this checks outcomes, not multi-connection lock contention.
    const results = await Promise.all([claim('CA1'), claim('CA2')]);
    assert.deepEqual(results.map(r => [r.agent_id, r.claim_path]), [['c', 'preferred'], ['a', 'round_robin']]);
    assert.equal((await db.query('SELECT count(DISTINCT active_call_sid)::int AS count FROM agent_availability')).rows[0].count, 2);
  });

  test(`${mode}: null preference and outbound retain legacy behavior`, async () => {
    await reset(paused); assert.equal((await claim('CA1', null)).agent_id, 'a');
    await reset(paused); assert.equal((await legacy('CA1')).agent_id, 'a');
    await db.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='c'");
    assert.equal((await legacy('OUT1', [], 'c')).agent_id, 'c');
    await release('OUT1');
    assert.equal((await claim('OUT2', 'b', [], 'c')).agent_id, 'c');
  });
}

test('enabled presence rejects expired or absent sessions; paused presence allows them', async () => {
  for (const paused of [false, true]) {
    for (const change of ["UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second' WHERE agent_id='c'",
      "DELETE FROM agent_phone_sessions WHERE agent_id='c'"]) {
      await reset(paused); await db.exec(change);
      assert.equal((await claim('CA1')).agent_id, paused ? 'c' : 'a');
    }
  }
});

test('pause and re-enable preserve overload, reservations and restricted RPC privileges', async () => {
  await reset(); await claim('CA1');
  for (const mode of ['pause', 'enable']) {
    await db.exec(await sql(`scripts/telephony/${mode}-phone-presence.sql`));
    assert.equal((await claim('CA1')).agent_id, 'c');
    const { rows: [privilege] } = await db.query(`SELECT
      has_function_privilege('authenticated','claim_call_agent(text,text[],text,text)','EXECUTE') AS browser,
      has_function_privilege('service_role','claim_call_agent(text,text[],text,text)','EXECUTE') AS service`);
    assert.equal(privilege.browser, false); assert.equal(privilege.service, true);
  }
});

test('migration also preserves presence mode when installed into a paused database', async () => {
  const pausedDb = await setup();
  try {
    await pausedDb.exec(await sql('scripts/telephony/pause-phone-presence.sql'));
    await pausedDb.exec(await sql(migration));
    await pausedDb.exec("INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES ('a','A','available',true); INSERT INTO tenant_agents VALUES ('a',true)");
    assert.equal((await pausedDb.query("SELECT * FROM claim_call_agent('CA1','{}',NULL,'a')")).rows[0].claim_path, 'preferred');
  } finally { await pausedDb.close(); }
});
