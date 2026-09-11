import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('presence rollback restores legacy availability without dropping reservations; re-enable restores lease checks',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);`);
  for(const path of ['supabase/migrations/038_call_owned_agent_reservations.sql','supabase/migrations/039_agent_phone_presence.sql','scripts/telephony/pause-phone-presence.sql']) {
   await db.exec(await readFile(new URL('../../'+path,import.meta.url),'utf8'));
  }
  await db.exec("INSERT INTO agent_availability VALUES('a','A','offline',false,now(),now(),NULL,NULL,NULL)");
  await db.exec("UPDATE agent_availability SET status='available',available=true");
  assert.equal((await db.query("SELECT * FROM claim_call_agent('CA1')")).rows[0].agent_id,'a');
  await db.exec("SELECT expire_agent_phone_sessions(); UPDATE agent_availability SET status='available',available=true");
  assert.equal((await db.query('SELECT active_call_sid FROM agent_availability')).rows[0].active_call_sid,'CA1');
  await db.exec("SELECT release_call_agent('CA1')");
  assert.equal((await db.query('SELECT status FROM agent_availability')).rows[0].status,'available');
  await db.exec(await readFile(new URL('../../scripts/telephony/enable-phone-presence.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query("SELECT * FROM claim_call_agent('CA2')")).rows,[]);
  await db.exec('SELECT expire_agent_phone_sessions()');
  assert.equal((await db.query('SELECT status FROM agent_availability')).rows[0].status,'offline');
 } finally {await db.close();}
});
