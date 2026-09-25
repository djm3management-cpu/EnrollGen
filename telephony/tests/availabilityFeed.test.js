import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createHandler, hashKey } from '../../supabase/functions/get-availability/handler.js';
const sql = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
let db;
const key = 'test-consumer-key-with-enough-randomness';
const hash = createHash('sha256').update(key).digest('hex');
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);
    CREATE TABLE tenant_agents(agent_slug text, is_active boolean, clerk_user_id text, tenant_id uuid);
    CREATE TABLE enrolled_agents(clerk_user_id text,tenant_id uuid,licensed_states text[]);`);
  for (const path of ['supabase/migrations/038_call_owned_agent_reservations.sql',
    'supabase/migrations/039_agent_phone_presence.sql','supabase/migrations/046_sticky_agent_routing.sql',
    'supabase/migrations/047_availability_feed.sql']) await db.exec(await sql(path));
  await db.query('INSERT INTO availability_consumers(name,key_hash) VALUES ($1,$2)', ['test-vendor',hash]);
});
after(async () => db?.close());
async function reset(paused = false) {
  await db.exec(await sql(`scripts/telephony/${paused ? 'pause' : 'enable'}-phone-presence.sql`));
  await db.exec(`TRUNCATE agent_availability CASCADE; TRUNCATE tenant_agents; TRUNCATE enrolled_agents;
    UPDATE availability_consumers SET active=true;
    INSERT INTO agent_availability(agent_id,agent_name,status,available,toggled_at) VALUES
      ('a','Alice','available',true,'2026-01-01'),('b','Bob','available',true,'2026-01-02');
    INSERT INTO agent_phone_sessions SELECT gen_random_uuid(),agent_id,now()+interval '1 hour' FROM agent_availability;
    INSERT INTO tenant_agents VALUES ('a',true,'alice','00000000-0000-0000-0000-000000000001'),('b',true,'bob','00000000-0000-0000-0000-000000000001');
    INSERT INTO enrolled_agents VALUES ('alice','00000000-0000-0000-0000-000000000001',ARRAY['NJ',' pa ','NJ']),('bob','00000000-0000-0000-0000-000000000001',ARRAY['CA']);`);
}
const rpc = async params => ({ data: (await db.query('SELECT get_availability_feed($1,$2) AS data',[params.p_key_hash,params.p_agent_id])).rows[0].data });
const feed = async () => (await rpc({p_key_hash:hash,p_agent_id:null})).data.feed;
const claim = async (sid, preferred, agent = null) => (await db.query('SELECT * FROM claim_call_agent($1,$2,$3,$4)',[sid,[],agent,preferred])).rows[0];

for (const paused of [false,true]) {
  test(`feed and claims share eligibility (presence ${paused ? 'paused' : 'enabled'})`, async () => {
    for (const [change,expected] of [
      ["SELECT 1",true],
      ["UPDATE agent_availability SET status='offline' WHERE agent_id='a'",false],
      ["UPDATE agent_availability SET available=false WHERE agent_id='a'",false],
      ["UPDATE agent_availability SET active_call_sid='EXISTING' WHERE agent_id='a'",false],
      ["UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second' WHERE agent_id='a'",paused],
      ["DELETE FROM agent_phone_sessions WHERE agent_id='a'",paused],
    ]) {
      for (const preferred of [null,'a']) {
        await reset(paused); await db.exec(change);
        const result=await feed();
        assert.equal(result.agents[0].available,expected,change);
        assert.deepEqual(result.available_states,expected?['CA','NJ','PA']:['CA']);
        assert.equal((await claim('CALL',preferred)).agent_id,expected?'a':'b',change);
      }
    }
  });
  test(`outbound still bypasses manual status with presence ${paused ? 'paused' : 'enabled'}`,async()=>{
    await reset(paused);
    await db.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='a'");
    assert.equal((await claim('OUT',null,'a')).agent_id,'a');
    await db.exec("SELECT release_call_agent('OUT'); DELETE FROM agent_phone_sessions WHERE agent_id='a'");
    assert.equal((await claim('OUT2',null,'a'))?.agent_id,paused?'a':undefined);
  });
}

test('licensing is per agent and tenant; stale/missing licensing never borrows another tenant',async()=>{
  await reset();
  await db.exec("INSERT INTO enrolled_agents VALUES ('alice','00000000-0000-0000-0000-000000000002',ARRAY['TX']); DELETE FROM enrolled_agents WHERE clerk_user_id='bob'");
  const result=await feed();
  assert.deepEqual(result.agents[0].licensed_states,['NJ','PA']);
  assert.deepEqual(result.agents[1].licensed_states,[]);
  assert.deepEqual(result.available_states,['NJ','PA']);
});
test('all unavailable has empty states and accurate counts; live second session remains eligible',async()=>{
  await reset();
  await db.exec("INSERT INTO agent_phone_sessions VALUES (gen_random_uuid(),'a',now()-interval '1 second')");
  assert.equal((await feed()).available_count,2);
  await db.exec("UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second'");
  const result=await feed();
  assert.deepEqual(result.available_states,[]);
  assert.equal(result.available_count,0); assert.equal(result.any_available,false);
  assert.equal(result.total_count,2); assert.equal(result.unavailable_count,2);
});
test('revoked and unknown keys rejected immediately, with safe consumer latency logs',async()=>{
  await reset(); const logs=[];
  const handler=createHandler({rpc,log:l=>logs.push(JSON.parse(l))});
  const request=()=>new Request('https://example.test/',{headers:{'x-api-key':key}});
  assert.equal((await handler(request())).status,200);
  await db.exec("UPDATE availability_consumers SET active=false WHERE name='test-vendor'");
  const response=await handler(request());
  assert.equal(response.status,401); assert.deepEqual(await response.json(),{error:'Unauthorized'});
  assert.equal(logs[1].consumer,'test-vendor'); assert.ok(logs[1].latency_ms>=0);
  assert.equal(JSON.stringify(logs).includes(key),false); assert.equal(JSON.stringify(logs).includes(hash),false);
  assert.equal((await handler(new Request('https://example.test/',{headers:{'x-api-key':'unknown'}}))).status,401);
});
test('response allowlist and single-agent compatibility, no cache and one RPC per GET',async()=>{
  await reset(); let count=0;
  const handler=createHandler({rpc:async p=>{count++;const r=await rpc(p);if(r.data.feed.agents[0]) r.data.feed.agents[0].phone='PRIVATE';return r;},log:()=>{}});
  const get=path=>handler(new Request('https://example.test/'+path,{headers:{'x-api-key':key}}));
  const response=await get(''); const body=await response.json();
  assert.equal(count,1); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Object.keys(body.agents[0]).sort(),['agent_id','agent_name','available','licensed_states','status']);
  assert.equal(JSON.stringify(body).includes('PRIVATE'),false);
  const single=await (await get('?agent_id=a')).json();assert.equal(single.status,'available');assert.equal(single.agent_id,'a');
  assert.equal((await get('?agent_id=missing')).status,404);
});
test('method, missing key, preflight and errors are sanitized and logged',async()=>{
  const logs=[]; let calls=0;
  const handler=createHandler({rpc:async()=>{calls++;throw Error('secret database error');},log:l=>logs.push(JSON.parse(l))});
  for(const [method,headers,status] of [['GET',{},401],['POST',{},405],['OPTIONS',{},200],['GET',{'x-api-key':key},503]]){
    const response=await handler(new Request('https://example.test/',{method,headers}));
    assert.equal(response.status,status); assert.equal((await response.text()).includes('secret'),false);
  }
  assert.equal(calls,1);assert.equal(logs.length,4);assert.equal(await hashKey(key),hash);
});
test('browser roles cannot read key table or call service RPCs; status page key matches seed',async()=>{
  const {rows:[r]}=await db.query(`SELECT has_table_privilege('anon','availability_consumers','SELECT') AS keys,
    has_function_privilege('authenticated','get_availability_feed(text,text)','EXECUTE') AS browser,
    has_function_privilege('service_role','get_availability_feed(text,text)','EXECUTE') AS service`);
  assert.deepEqual(r,{keys:false,browser:false,service:true});
  const page=await sql('status-page/index.html');
  const pageKey=page.match(/const API_KEY = '([^']+)'/)[1];
  const seeded=await rpc({p_key_hash:await hashKey(pageKey),p_agent_id:null});
  assert.equal(seeded.data.consumer_name,'nghs-status');assert.equal(seeded.data.authorized,true);
  assert.equal((await sql('supabase/migrations/047_availability_feed.sql')).includes(pageKey),false);
});

test('shared predicate preserves sticky exclusions, assignment, retries and call-owned release',async()=>{
  await reset();
  assert.equal((await claim('ONE','b')).claim_path,'preferred');
  const reserved=(await db.query("SELECT * FROM agent_availability WHERE agent_id='b'")).rows[0];
  assert.ok(reserved.last_assigned_at); assert.equal(reserved.resume_status,'available');
  assert.equal((await claim('ONE','a')).agent_id,'b');
  assert.equal((await claim('TWO','b')).agent_id,'a');
  await db.exec("SELECT release_call_agent('OLD','b')");
  assert.equal((await feed()).available_count,0);
  await db.exec("SELECT release_call_agent('ONE','b')");
  assert.equal((await feed()).available_count,1);
  await reset(); await db.exec("UPDATE tenant_agents SET is_active=false WHERE agent_slug='a'");
  assert.equal((await claim('THREE','a')).agent_id,'b');
  await reset();
  assert.equal((await db.query("SELECT * FROM claim_call_agent('FOUR',ARRAY['a'],NULL,'a')")).rows[0].agent_id,'b');
});

test('047 preserves paused mode at install and recovery scripts keep shared predicates installed',async()=>{
  const other=new PGlite();
  try {
    await other.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE agent_availability(agent_id text,agent_name text,status text,available boolean,toggled_at timestamptz,updated_at timestamptz);
      CREATE TABLE tenant_agents(agent_slug text,is_active boolean,clerk_user_id text,tenant_id uuid);
      CREATE TABLE enrolled_agents(clerk_user_id text,tenant_id uuid,licensed_states text[]);`);
    for(const path of ['supabase/migrations/038_call_owned_agent_reservations.sql','supabase/migrations/039_agent_phone_presence.sql',
      'scripts/telephony/pause-phone-presence.sql','supabase/migrations/046_sticky_agent_routing.sql','supabase/migrations/047_availability_feed.sql']) await other.exec(await sql(path));
    assert.equal((await other.query('SELECT enforced FROM telephony_presence_policy')).rows[0].enforced,false);
    await other.exec("INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES ('a','A','available',true)");
    assert.equal((await other.query("SELECT * FROM claim_call_agent('PAUSED')")).rows[0].agent_id,'a');
    for(const mode of ['enable','pause']){
      await other.exec(await sql(`scripts/telephony/${mode}-phone-presence.sql`));
      const {rows:[r]}=await other.query("SELECT pg_get_functiondef('claim_call_agent(text,text[],text)'::regprocedure) AS def");
      assert.ok(r.def.includes('agent_inbound_routable'));
      assert.equal((await other.query('SELECT enforced FROM telephony_presence_policy')).rows[0].enforced,mode==='enable');
    }
  } finally { await other.close(); }
});
