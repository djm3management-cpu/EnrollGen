import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseDirectAgentNumbers, directAgentForNumber } from '../src/directRouting.js';
import { availabilitySnapshot } from '../src/paragonRouting.js';
import { decideParagonPing } from '../src/paragonEligibility.js';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../src/lib/availabilityStatus.js';

let db;
const sql = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);
    CREATE TABLE tenant_agents(agent_slug text,is_active boolean,clerk_user_id text,tenant_id uuid);
    CREATE TABLE enrolled_agents(clerk_user_id text,tenant_id uuid,licensed_states text[]);`);
  for (const name of ['038_call_owned_agent_reservations.sql','039_agent_phone_presence.sql',
    '046_sticky_agent_routing.sql','047_availability_feed.sql','109_callbacks_only_availability.sql']) {
    await db.exec(await sql('supabase/migrations/' + name));
  }
});
after(() => db.close());
async function reset(paused = false) {
  await db.exec(await sql(`scripts/telephony/${paused ? 'pause' : 'enable'}-phone-presence.sql`));
  await db.exec(`TRUNCATE agent_availability CASCADE; TRUNCATE tenant_agents;
    INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES
      ('a','Alice','available',true),('b','Bob','available',true),('c','Carol','available',true);
    INSERT INTO tenant_agents(agent_slug,is_active) VALUES ('a',true),('b',true),('c',true);
    INSERT INTO agent_phone_sessions SELECT gen_random_uuid(),agent_id,now()+interval '1 hour' FROM agent_availability;
    UPDATE agent_availability SET status='callbacks_only',available=false WHERE agent_id IN ('a','c');`);
}
const customer = (sid, agent = 'a', direct = false, exclude = []) => db.query(
  'SELECT * FROM claim_customer_call_agent($1,$2,$3,$4)', [sid,exclude,agent,direct]).then(r => r.rows[0]);
const normal = (sid, preferred = null, exclude = []) => db.query(
  'SELECT * FROM claim_call_agent($1,$2,NULL,$3)', [sid,exclude,preferred]).then(r => r.rows[0]);

for (const paused of [false,true]) {
  test(`Callbacks Only is sticky/direct reachable, excluded from vendor preference and rotation (presence paused=${paused})`, async () => {
    await reset(paused);
    assert.equal((await customer('STICKY')).agent_id,'a');
    assert.equal((await customer('STICKY','c')).agent_id,'a'); // Same-call retry.
    await db.exec("SELECT release_call_agent('STICKY','a')");
    assert.deepEqual((await db.query("SELECT status,available FROM agent_availability WHERE agent_id='a'")).rows[0],
      {status:'callbacks_only',available:false});
    assert.equal((await customer('DIRECT','a',true)).agent_id,'a');
    assert.equal((await normal('VENDOR','c')).agent_id,'b');
    assert.equal(await normal('NO_CAPACITY'),undefined);
  });

  test(`Offline, Busy, reserved and inactive agents cannot receive customer calls (presence paused=${paused})`, async () => {
    for (const change of ["status='offline',available=false", "status='busy',available=false", "active_call_sid='OTHER',status='busy',available=false"]) {
      await reset(paused);
      await db.exec("UPDATE agent_availability SET " + change + " WHERE agent_id='a'");
      assert.equal(await customer('DIRECT','a',true),undefined);
      assert.equal((await customer('STICKY')).agent_id,'b');
    }
    await reset(paused);
    await db.exec("UPDATE tenant_agents SET is_active=false WHERE agent_slug='a'");
    assert.equal(await customer('DIRECT','a',true),undefined);
    assert.equal((await customer('STICKY')).agent_id,'b');
  });
}

test('no-answer overflow excludes the sticky agent and other Callbacks Only agents; stale release cannot free fallback',async()=>{
  await reset();
  await customer('CALL'); await db.exec("SELECT release_call_agent('CALL','a')");
  assert.equal((await normal('CALL',null,['a'])).agent_id,'b');
  await db.exec("SELECT release_call_agent('CALL','a')");
  assert.equal(await customer('DIRECT','b',true),undefined);
  await db.exec("SELECT release_call_agent('CALL','b')");
  assert.equal(await normal('CALL',null,['a','b']),undefined);
});

test('Available retains customer eligibility and normal rotation; manual mode survives an active call',async()=>{
  await reset();
  assert.equal((await customer('CALL','b')).agent_id,'b');
  await db.exec("UPDATE agent_availability SET status='callbacks_only',available=false WHERE agent_id='b'");
  assert.equal(await customer('DIRECT','b',true),undefined);
  await db.exec("SELECT release_call_agent('CALL','b')");
  assert.equal((await customer('NEXT','b',true)).agent_id,'b');
  await db.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='b'; SELECT release_call_agent('NEXT','b')");
  assert.equal(await customer('OFFLINE','b',true),undefined);
});

test('overlapping callbacks cannot reserve the same agent twice',async()=>{
  await reset();
  // PGlite serializes execution; verify exclusive outcomes, not lock contention.
  const claims=await Promise.all([customer('FIRST'),customer('SECOND')]);
  assert.deepEqual(claims.map(a=>a.agent_id),['a','b']);
  assert.equal(await customer('DIRECT','a',true),undefined);
});

test('Callbacks Only requires live phone presence; expiry and disconnect make it Offline',async()=>{
  for (const change of ["DELETE FROM agent_phone_sessions WHERE agent_id='a'",
    "UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second' WHERE agent_id='a'"]) {
    await reset(); await db.exec(change);
    assert.equal(await customer('DIRECT','a',true),undefined);
    await db.exec('SELECT expire_agent_phone_sessions()');
    assert.equal((await db.query("SELECT status FROM agent_availability WHERE agent_id='a'")).rows[0].status,'offline');
    await db.exec("UPDATE agent_availability SET status='callbacks_only' WHERE agent_id='a'");
    assert.equal((await db.query("SELECT status FROM agent_availability WHERE agent_id='a'")).rows[0].status,'offline');
  }
  await reset();
  await db.exec("SELECT update_agent_phone_session('a',session_id,false) FROM agent_phone_sessions WHERE agent_id='a'");
  assert.equal((await db.query("SELECT status FROM agent_availability WHERE agent_id='a'")).rows[0].status,'offline');
});

test('customer reservation RPC is service-only',async()=>{
  for(const role of ['anon','authenticated']) {
    await db.exec('SET ROLE '+role);
    await assert.rejects(customer('UNAUTHORIZED'),/permission denied/);
    await db.exec('RESET ROLE');
  }
});

test('direct destinations use only configured numbers and cannot consume vendor traffic',()=>{
  const mappings=parseDirectAgentNumbers('{"+16090000001":"a"}','+16090000000');
  assert.equal(directAgentForNumber('+16090000001',mappings),'a');
  assert.equal(directAgentForNumber('+16090000001',mappings,true),null);
  assert.equal(directAgentForNumber('+16090000002',mappings),null);
  assert.equal(directAgentForNumber(null,mappings),null);
  for(const raw of ['[]','null','{"bad":"a"}','{"+16090000001":""}','{"+16090000000":"a"}']) {
    assert.throws(()=>parseDirectAgentNumbers(raw,'+16090000000'));
  }
});

test('vendor decision helpers reject Callbacks Only even with stale available=true',()=>{
  const agents=[{agent_id:'a',status:'callbacks_only',available:true,tier:'full'}];
  assert.equal(availabilitySnapshot({agents}).any_available,false);
  assert.equal(decideParagonPing({state:'KS',agents}).available,false);
  assert.equal(availabilitySnapshot({agents:[{...agents[0],status:'available'}]}).available_count,1);
});

test('status controls expose and label the new status with existing theme colors',()=>{
  assert.equal(AVAILABILITY_OPTIONS.find(o=>o.value==='callbacks_only').label,'CALLBACKS ONLY');
  assert.equal(availabilityLabel('callbacks_only'),'CALLBACKS ONLY');
});
