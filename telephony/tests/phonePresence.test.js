import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE agent_availability (agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);`);
  for (const file of ['038_call_owned_agent_reservations.sql','039_agent_phone_presence.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
});
after(async () => db?.close());
const sid1='00000000-0000-4000-8000-000000000001';
const sid2='00000000-0000-4000-8000-000000000002';
async function reset() {
  await db.exec("TRUNCATE agent_availability CASCADE; INSERT INTO agent_availability VALUES ('a','A','offline',false,now(),now())");
}
const session=(id,ready)=>db.query('SELECT update_agent_phone_session($1,$2,$3)',['a',id,ready]);
const available=()=>db.exec("UPDATE agent_availability SET status='available',available=true WHERE agent_id='a'");
const row=async()=>(await db.query('SELECT * FROM agent_availability')).rows[0];
const claim=async()=>(await db.query("SELECT * FROM claim_call_agent('CA1')")).rows;
test('only a registered live session can become available; reconnect does not opt in',async()=>{
  await reset(); await available(); assert.equal((await row()).status,'offline');
  await session(sid1,true); assert.equal((await row()).status,'offline');
  await available(); assert.equal((await claim())[0].agent_id,'a');
});
test('closing last browser goes offline immediately',async()=>{
  await reset(); await session(sid1,true); await available(); await session(sid1,false);
  assert.equal((await row()).status,'offline'); assert.deepEqual(await claim(),[]);
});
test('closing one of two browsers preserves the other session',async()=>{
  await reset(); await session(sid1,true); await session(sid2,true); await available();
  await session(sid1,false); assert.equal((await row()).status,'available');
  await session(sid2,false); assert.equal((await row()).status,'offline');
});
test('expired lease blocks routing before the cleanup job runs',async()=>{
  await reset(); await session(sid1,true); await available();
  await db.exec("UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second'");
  assert.deepEqual(await claim(),[]);
  await db.exec('SELECT expire_agent_phone_sessions()');
  assert.equal((await row()).status,'offline');
});
test('browser close during call preserves ownership and completes offline',async()=>{
  await reset(); await session(sid1,true); await available(); await claim(); await session(sid1,false);
  assert.equal((await row()).active_call_sid,'CA1');
  assert.equal((await row()).resume_status,'offline');
  await db.exec("SELECT release_call_agent('CA1')");
  assert.equal((await row()).status,'offline');
});
test('late heartbeat cannot promote manually offline agent',async()=>{
  await reset(); await session(sid1,true); await available();
  await db.exec("UPDATE agent_availability SET status='offline',available=false");
  await session(sid1,true); assert.equal((await row()).status,'offline');
});
test('replacement session survives stale close and expiry of older session',async()=>{
  await reset(); await session(sid1,true); await available(); await session(sid2,true);
  await db.query("UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second' WHERE session_id=$1",[sid1]);
  await db.exec('SELECT expire_agent_phone_sessions()'); await session(sid1,false);
  assert.equal((await row()).status,'available');
});
