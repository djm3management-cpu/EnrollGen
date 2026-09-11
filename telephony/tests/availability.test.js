import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE agent_availability (agent_id text, agent_name text, status text,
      available boolean, toggled_at timestamptz, updated_at timestamptz);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/038_call_owned_agent_reservations.sql', import.meta.url), 'utf8'));
});
after(async () => db?.close());
async function reset() {
  await db.exec(`TRUNCATE agent_availability;
    INSERT INTO agent_availability VALUES
    ('a','A','available',true,'2026-01-01',now()),
    ('b','B','available',true,'2026-01-02',now()),
    ('c','C','available',true,'2026-01-03',now());`);
}
const claim = async (sid, exclude = [], agent = null) => (await db.query(
  'SELECT * FROM claim_call_agent($1,$2,$3)', [sid, exclude, agent])).rows;
const release = async (sid, agent = null) => (await db.query(
  'SELECT release_call_agent($1,$2) AS released', [sid, agent])).rows[0].released;

test('three simultaneous requests select distinct agents; fourth has no capacity', async () => {
  await reset();
  const results = await Promise.all(['CA1','CA2','CA3','CA4'].map(sid => claim(sid)));
  assert.deepEqual(results.map(r => r[0]?.agent_id), ['a','b','c',undefined]);
});
test('rotation gives an unassigned agent priority over a fast-finishing agent', async () => {
  await reset(); await claim('CA1'); await release('CA1');
  assert.equal((await claim('CA2'))[0].agent_id, 'b');
});
test('old and duplicate releases cannot free a new call', async () => {
  await reset(); await claim('CA1', [], 'a');
  assert.equal(await release('CA1','a'), true);
  await claim('CA2', [], 'a');
  assert.equal(await release('CA1','a'), false);
  assert.deepEqual(await claim('CA3', [], 'a'), []);
});
test('manual available cannot override a live call; offline preference survives completion', async () => {
  await reset(); await claim('CA1', [], 'a');
  await db.exec("UPDATE agent_availability SET status='available',available=true WHERE agent_id='a'");
  assert.deepEqual(await claim('CA2', [], 'a'), []);
  await db.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='a'");
  await release('CA1');
  const { rows } = await db.query("SELECT status,available FROM agent_availability WHERE agent_id='a'");
  assert.deepEqual(rows[0], {status:'offline',available:false});
});
test('same-call claim retries reuse one reservation', async () => {
  await reset();
  const result = await Promise.all([claim('CA1'),claim('CA1'),claim('CA1')]);
  assert.deepEqual(result.map(r => r[0].agent_id), ['a','a','a']);
});
test('declined call excludes tried agents and stale child callback cannot free next agent', async () => {
  await reset(); await claim('CA1'); await release('CA1','a');
  assert.equal((await claim('CA1',['a']))[0].agent_id,'b');
  assert.equal(await release('CA1','a'),false);
  assert.deepEqual(await claim('CA2',[],'b'),[]);
});
test('outbound reserves offline agents and restores their preference', async () => {
  await reset(); await db.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='a'");
  assert.equal((await claim('OUT1',[],'a'))[0].agent_id,'a');
  assert.equal((await claim('IN1'))[0].agent_id,'b');
  await release('OUT1');
  assert.equal((await db.query("SELECT status FROM agent_availability WHERE agent_id='a'")).rows[0].status,'offline');
});
test('duplicate roster identity is rejected', async () => {
  await reset(); await assert.rejects(db.exec("INSERT INTO agent_availability(agent_id) VALUES ('a')"));
});
test('manual busy during a call remains busy after completion', async () => {
  await reset(); await claim('CA1', [], 'a');
  await db.exec("UPDATE agent_availability SET status='busy',available=false WHERE agent_id='a'");
  await release('CA1');
  assert.equal((await db.query("SELECT status FROM agent_availability WHERE agent_id='a'")).rows[0].status,'busy');
});
test('completed routing response persists and duplicate request keys are rejected', async () => {
  await db.exec("INSERT INTO telephony_routing_responses(request_key) VALUES ('voice:CA1')");
  await assert.rejects(db.exec("INSERT INTO telephony_routing_responses(request_key) VALUES ('voice:CA1')"));
  await db.exec("UPDATE telephony_routing_responses SET response_xml='<Response/>' WHERE request_key='voice:CA1'");
  assert.equal((await db.query("SELECT response_xml FROM telephony_routing_responses WHERE request_key='voice:CA1'")).rows[0].response_xml,'<Response/>');
});
