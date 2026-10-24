import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createEmbeddingsHandler,authenticateEmbeddingRequest} from '../netlify/functions/embeddings.js';
import {recordProviderStatus} from '../netlify/lib/postCallProvider.js';
import {postCallFailureMessage,observePostCallStatus} from '../src/lib/postCallStatus.js';
import {createPostCallQueueHandler} from '../netlify/functions/post-call.js';
const pg=new PGlite(),base=evidenceDb(pg);
const db={...base,async rpc(name,args={}){try{const entries=Object.entries(args);const {rows}=await pg.query(`SELECT ${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) AS data`,entries.map(([k,v])=>['p_payload','p_result'].includes(k)?JSON.stringify(v):v));return{data:rows[0].data,error:null};}catch(error){return{data:null,error};}}};
const T='00000000-0000-4000-8000-000000000001',A='10000000-0000-4000-8000-000000000001',S='20000000-0000-4000-8000-000000000001',K='a'.repeat(64);
const auth={userId:'agent',orgId:'org',tokenPayload:{}};
const getJob=async()=> (await pg.query('SELECT * FROM post_call_jobs WHERE session_id=$1',[S])).rows[0];
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,ended_at timestamptz,call_record_id uuid);
 CREATE TABLE call_records(id uuid PRIMARY KEY,session_id uuid,tenant_id uuid,metadata jsonb);
 INSERT INTO tenants VALUES('${T}','org');INSERT INTO enrolled_agents VALUES('${A}','${T}','agent','Agent',NULL,true);
 INSERT INTO sessions VALUES('${S}','${T}','${A}',now(),NULL);`);
 for(const file of ['099_post_call_background_jobs.sql','101_post_call_provider_failures.sql','102_provider_quota_alert_throttle.sql'])await pg.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
});
after(()=>pg.close());
const embeddingRequest=()=>new Request('https://app.test/embeddings',{method:'POST',body:JSON.stringify({session_id:S,input:'realistic fixture transcript'})});

test('provider quota errors persist failed status and code; success clears only its own stage',async()=>{
 const handler=createEmbeddingsHandler({authenticate:async()=>auth,getDb:()=>db,env:{OPENAI_API_KEY:'fixture'},send:async()=>Response.json({error:{code:'insufficient_quota'}},{status:429})});
 const response=await handler(embeddingRequest());assert.equal(response.status,429);assert.equal((await response.json()).code,'insufficient_quota');
 let job=await getJob();assert.equal(job.status,'failed');assert.equal(job.error_code,'insufficient_quota');assert.match(postCallFailureMessage(job),/OpenAI credits.*insufficient_quota|insufficient_quota.*OpenAI credits/);
 await recordProviderStatus(db,S,'scoring','provider_http_500');
 const ok=createEmbeddingsHandler({authenticate:async()=>auth,getDb:()=>db,env:{OPENAI_API_KEY:'fixture'},send:async()=>Response.json({data:[{index:0,embedding:Array(1536).fill(1)}]})});
 assert.equal((await ok(embeddingRequest())).status,200);
 job=await getJob();assert.equal(job.status,'failed');assert.equal(job.error_code,'provider_http_500');assert.equal(job.provider_errors.embeddings,undefined);
 await recordProviderStatus(db,S,'scoring',null);assert.equal((await getJob()).status,'completed');
});

test('provider quota email alert is claimed at most once per hour',async()=>{
 await pg.exec('DELETE FROM provider_alert_throttle');
 const first=await db.rpc('claim_provider_quota_alert');assert.ifError(first.error);assert.equal(first.data,true);
 const immediate=await db.rpc('claim_provider_quota_alert');assert.ifError(immediate.error);assert.equal(immediate.data,false);
 await pg.exec("UPDATE provider_alert_throttle SET last_attempt_at=clock_timestamp()-interval '61 minutes'");
 const afterHour=await db.rpc('claim_provider_quota_alert');assert.ifError(afterHour.error);assert.equal(afterHour.data,true);
});

test('stale success cannot hide a newer failure; later worker completion cannot hide provider errors',async()=>{
 const started='2000-01-01T00:00:00Z';await recordProviderStatus(db,S,'embeddings','invalid_api_key');await recordProviderStatus(db,S,'embeddings',null,started);
 assert.equal((await getJob()).error_code,'invalid_api_key');
 const q=await db.rpc('enqueue_post_call_request',{p_session_id:S,p_tenant_id:T,p_agent_id:A,p_user_id:'agent',p_org_id:'org',p_clerk_session_id:null,p_request_key:K,p_action:'recover',p_payload:{action:'recover',session_id:S,transcript_text:'fixture'}});assert.ifError(q.error);
 const worker='30000000-0000-4000-8000-000000000001';await db.rpc('claim_post_call_worker',{p_session_id:S,p_worker_id:worker});await db.rpc('next_post_call_request',{p_session_id:S,p_worker_id:worker});
 await db.rpc('finish_post_call_request',{p_session_id:S,p_worker_id:worker,p_request_key:K,p_result:{saved:true},p_error_code:null});await db.rpc('next_post_call_request',{p_session_id:S,p_worker_id:worker});
 assert.equal((await getJob()).status,'failed');assert.equal((await getJob()).error_code,'invalid_api_key');
});

test('internal embedding authorization requires the active recovery nonce and matching persisted request',async()=>{
 const job=await getJob();const headers={'x-enrollgen-session-id':S,'x-enrollgen-request-key':K,'x-enrollgen-dispatch-token':job.dispatch_token};
 assert.equal((await authenticateEmbeddingRequest(new Request('https://test',{headers}),()=>db)).response.status,401);
 await pg.query("UPDATE post_call_jobs SET worker_id=gen_random_uuid(),status='running' WHERE session_id=$1",[S]);await pg.query("UPDATE post_call_requests SET status='running' WHERE session_id=$1",[S]);
 assert.equal((await authenticateEmbeddingRequest(new Request('https://test',{headers}),()=>db)).userId,'agent');
 assert.equal((await authenticateEmbeddingRequest(new Request('https://test',{headers:{...headers,'x-enrollgen-dispatch-token':'wrong'}}),()=>db)).response.status,401);
 await pg.query("UPDATE post_call_jobs SET worker_id=NULL,status='failed' WHERE session_id=$1",[S]);
});

test('operator retry preserves history; normal retries do not requeue a failed recovery',async()=>{
 await pg.query("UPDATE post_call_requests SET status='failed',error_code='insufficient_quota',completed_at=now() WHERE session_id=$1",[S]);
 assert.equal((await db.rpc('retry_post_call_recovery',{p_session_id:S,p_request_key:K})).data,true);
 const row=(await pg.query('SELECT * FROM post_call_requests WHERE session_id=$1',[S])).rows[0];assert.equal(row.status,'queued');assert.equal(row.retry_history[0].error_code,'insufficient_quota');
 assert.equal((await db.rpc('retry_post_call_recovery',{p_session_id:S,p_request_key:K})).data,false);
 for(const role of ['anon','authenticated']){await pg.exec('SET ROLE '+role);await assert.rejects(pg.query('SELECT retry_post_call_recovery($1,$2)',[S,K]),/permission denied/);await pg.exec('RESET ROLE');}
});

test('status-only API is ownership protected and exposes safe failure fields without dispatch secrets',async()=>{
 await recordProviderStatus(db,S,'scoring','credit_balance_exhausted');
 const handler=createPostCallQueueHandler({authenticate:async()=>auth,getDb:()=>db});const r=await handler(new Request(`https://test/api/post-call?session_id=${S}`));assert.equal(r.status,200);const body=await r.json();assert.equal(body.job.error_code,'credit_balance_exhausted');assert.equal(body.job.dispatch_token,undefined);
 assert.equal((await handler(new Request(`https://test/api/post-call?session_id=20000000-0000-4000-8000-000000000002`))).status,403);
});

test('UI observer reports provider failures, clears after success, and stops polling after cleanup',async()=>{
 let tick,stopped=false;const seen=[];let job={status:'failed',error_code:'credit_balance_exhausted'};
 const stop=observePostCallStatus({getToken:async()=>'',getSessionId:()=>S,onStatus:j=>seen.push(postCallFailureMessage(j)),onError:e=>{throw e;},schedule:fn=>{tick=fn;return 1;},cancel:()=>{stopped=true;},send:async()=>Response.json({job})});
 await new Promise(resolve=>setImmediate(resolve));assert.match(seen[0],/credit_balance_exhausted/);job={status:'completed'};tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(seen.at(-1),'');stop();tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(seen.length,2);assert.equal(stopped,true);
});

test('service worker bypasses functions, Supabase and other data; navigation/static retain offline handling',async()=>{
 const handlers={},calls=[];const shell=new Response('cached shell');
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self:{location:{hostname:'enrollgen.com',origin:'https://enrollgen.com'},addEventListener:(n,h)=>handlers[n]=h},URL,Response,fetch:async()=>{throw new Error('offline');},caches:{match:async key=>key==='/index.html'?shell:undefined}});
 for(const url of ['https://enrollgen.com/.netlify/functions/call-log','https://enrollgen.com/.netlify/functions/paragon-zip-confirm','https://enrollgen.com/api/post-call','https://x.supabase.co/rest/v1/sessions','https://x.supabase.co/auth/v1/token','https://x.supabase.co/storage/v1/object/file','https://clerk.example.com/v1/client']){
 handlers.fetch({request:{method:'GET',url,mode:'cors'},respondWith:()=>calls.push(url)});
 }assert.deepEqual(calls,[]);
 let fallback;handlers.fetch({request:{method:'GET',url:'https://enrollgen.com/script/ma',mode:'navigate'},respondWith:p=>{fallback=p;}});assert.equal(await(await fallback).text(),'cached shell');
 handlers.fetch({request:{method:'GET',url:'https://enrollgen.com/assets/image.png',mode:'cors'},respondWith:p=>{fallback=p;}});assert.equal((await fallback).status,503);
});

test('plain Vite HTML disables local-only status polling and clears the parse-error banner',async()=>{
 let tick,cancelled=0,requests=0;const seen=[],errors=[];
 const stop=observePostCallStatus({allowMissingEndpoint:true,getToken:async()=>'',getSessionId:()=>null,
  onStatus:job=>seen.push(job),onError:error=>errors.push(error),
  schedule:fn=>{tick=fn;return 7;},cancel:id=>{assert.equal(id,7);cancelled++;},
  send:async()=>{requests++;return new Response('<!doctype html><html>Vite shell</html>',{headers:{'content-type':'text/html'}});},
 });
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,[null]);assert.deepEqual(errors,[]);assert.equal(cancelled,1);
 tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,1);stop();
});

test('production HTML errors and genuine JSON failures remain visible; local APIs still report real failed jobs',async()=>{
 const failed={status:'failed',error_code:'credit_balance_exhausted'};
 for(const [local,response,expected] of [
  [false,new Response('<html>Error</html>',{headers:{'content-type':'text/html'}}),'invalid response'],
  [true,Response.json({error:'Status service failed'},{status:503}),'Status service failed'],
  [true,Response.json({job:failed}),null],
 ]){
  const errors=[],seen=[];
  const stop=observePostCallStatus({allowMissingEndpoint:local,getToken:async()=>'',getSessionId:()=>S,
   onStatus:job=>seen.push(job),onError:error=>errors.push(error.message),schedule:()=>1,cancel:()=>{},send:async()=>response});
  await new Promise(resolve=>setImmediate(resolve));
  if(expected){assert.ok(errors[0].includes(expected));assert.deepEqual(seen,[]);}else{assert.deepEqual(errors,[]);assert.deepEqual(seen[0],failed);}
  stop();
 }
});
