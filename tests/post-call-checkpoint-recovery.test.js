import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postCallFailureMessage} from '../src/lib/postCallStatus.js';

test('recovered checkpoint timeouts clear existing and future warnings without losing failure history',async()=>{
 const pg=new PGlite();
 const T='00000000-0000-4000-8000-000000000001',A='10000000-0000-4000-8000-000000000001',S='20000000-0000-4000-8000-000000000001';
 try {
  await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
   CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,is_active boolean);
   CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,ended_at timestamptz);
   CREATE TABLE call_records(id uuid PRIMARY KEY,session_id uuid,tenant_id uuid,metadata jsonb);
   INSERT INTO tenants VALUES('${T}','org');
   INSERT INTO enrolled_agents VALUES('${A}','${T}','agent',true);
   INSERT INTO sessions VALUES('${S}','${T}','${A}',now());`);
  for(const file of ['099_post_call_background_jobs.sql','101_post_call_provider_failures.sql'])
   await pg.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await pg.query(`INSERT INTO post_call_jobs(session_id,tenant_id,agent_id,clerk_user_id,status)
   VALUES($1,$2,$3,'agent','failed')`,[S,T,A]);
  const request=async(key,action,status,error_code=null,result={},payload={call_record_id:'record'})=>pg.query(
   `INSERT INTO post_call_requests(session_id,request_key,action,status,error_code,result,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[S,key.padEnd(64,key[0]),action,status,error_code,JSON.stringify(result),JSON.stringify(payload)]);
  const job=async()=> (await pg.query('SELECT * FROM post_call_jobs WHERE session_id=$1',[S])).rows[0];
  const refresh=()=>pg.query('UPDATE post_call_jobs SET status=status WHERE session_id=$1',[S]);
  const saved={transcript_id:'transcript',call_record_id:'record'};
  await request('a','checkpoint','failed','worker_timeout');
  await request('b','finalize','completed',null,saved);
  await pg.exec(readFileSync(new URL('../supabase/migrations/117_recovered_checkpoint_status.sql',import.meta.url),'utf8'));
  assert.equal((await job()).status,'completed');
  assert.equal(postCallFailureMessage(await job()),'');
  const history=(await pg.query("SELECT status,error_code FROM post_call_requests WHERE request_key=$1",['a'.repeat(64)])).rows[0];
  assert.deepEqual(history,{status:'failed',error_code:'worker_timeout'});
  // A newer failure is unresolved until a newer, actual transcript save completes.
  await request('c','checkpoint','failed','worker_timeout');await refresh();
  assert.equal((await job()).status,'failed');assert.equal((await job()).error_code,'worker_timeout');
  await request('d','checkpoint','completed',null,{call_record_id:'record'});await refresh();
  assert.equal((await job()).status,'failed');
  await request('e','checkpoint','completed',null,{...saved,call_record_id:'other-record'});await refresh();
  assert.equal((await job()).status,'failed');
  await request('f','checkpoint','completed',null,saved);await refresh();
  assert.equal((await job()).status,'completed');
  // Provider failures remain visible even after a successful transcript save.
  await pg.query(`UPDATE post_call_jobs SET status='failed',provider_errors=$2 WHERE session_id=$1`,[S,JSON.stringify({scoring:{code:'insufficient_quota',at:new Date().toISOString()}})]);
  assert.equal((await job()).status,'failed');assert.equal((await job()).error_code,'insufficient_quota');
  await pg.query("UPDATE post_call_jobs SET provider_errors='{}' WHERE session_id=$1",[S]);
  assert.equal((await job()).status,'completed');
  // Exercise ordinary worker completion: its historical failure scan must no
  // longer leave the alert stuck after a completed queue.
  await request('7','checkpoint','queued');
  const W='30000000-0000-4000-8000-000000000001';
  await pg.query('SELECT claim_post_call_worker($1,$2)',[S,W]);
  await pg.query('SELECT next_post_call_request($1,$2)',[S,W]);
  await pg.query('SELECT finish_post_call_request($1,$2,$3,$4,NULL)',[S,W,'7'.repeat(64),JSON.stringify(saved)]);
  await pg.query('SELECT next_post_call_request($1,$2)',[S,W]);
  assert.equal((await job()).status,'completed');
  assert.equal(postCallFailureMessage(await job()),'');
  for(const [key,action,code] of [['1','wrap_up','worker_timeout'],['2','webhook_result','worker_timeout'],['3','recover','worker_timeout'],['4','finalize','worker_timeout'],['5','checkpoint','post_call_http_500']]){
   await request(key,action,'failed',code);await refresh();
   assert.equal((await job()).status,'failed');assert.equal((await job()).error_code,code);
   await request(key+'a','checkpoint','completed',null,saved);await refresh();
   assert.equal((await job()).status,'failed');assert.equal((await job()).error_code,code);
  }
  await request('6','finalize','completed',null,saved);await refresh();
  assert.equal((await job()).status,'failed');
  for(const role of ['anon','authenticated']){
   await pg.exec('SET ROLE '+role);
   await assert.rejects(pg.query('SELECT unresolved_post_call_error($1)',[S]),/permission denied/);
   await pg.exec('RESET ROLE');
  }
 } finally {await pg.close();}
});
