import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createPostCallQueueHandler,postCallRequestKey} from '../netlify/functions/post-call.js';
import {createPostCallWorker} from '../netlify/functions/post-call-background.js';
import {watchPostCallRequest} from '../src/lib/postCallPipeline.js';
const pg=new PGlite();
const T='00000000-0000-4000-8000-000000000001',A='10000000-0000-4000-8000-000000000001';
const S='20000000-0000-4000-8000-000000000001',OTHER='20000000-0000-4000-8000-000000000002';
const base=evidenceDb(pg),db={...base,async rpc(name,args){
 const params=Object.entries(args);
 try { const {rows}=await pg.query(`SELECT public.${name}(${params.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) AS data`,params.map(([key,value])=>['p_payload','p_result'].includes(key)?JSON.stringify(value):value));return {data:rows[0].data,error:null}; }
 catch(error){return {data:null,error};}
}};
const auth={userId:'dylan-test',orgId:'org-test',sessionId:'clerk-session'};
let dispatches=[];
const handler=createPostCallQueueHandler({getDb:()=>db,authenticate:async()=>auth,send:async(url,init)=>{dispatches.push(JSON.parse(init.body));return new Response(null,{status:202});}});
const submit=(body)=>handler(new Request('https://app.test/api/post-call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:S,...body})}));
const status=key=>handler(new Request(`https://app.test/api/post-call?session_id=${S}&request_key=${key}`));
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,call_record_id uuid,ended_at timestamptz);
 CREATE TABLE call_records(id uuid PRIMARY KEY,session_id uuid,tenant_id uuid,agent_id uuid,transcript_id uuid,metadata jsonb);
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY,tenant_id uuid,session_id uuid);
 INSERT INTO tenants VALUES('${T}','org-test');
 INSERT INTO enrolled_agents VALUES('${A}','${T}','dylan-test','Dylan',NULL,true);
 INSERT INTO sessions(id,tenant_id,agent_id) VALUES('${S}','${T}','${A}'),('${OTHER}','${T}',gen_random_uuid());`);
 await pg.exec(readFileSync(new URL('../supabase/migrations/099_post_call_background_jobs.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../supabase/migrations/101_post_call_provider_failures.sql',import.meta.url),'utf8'));
});
after(()=>pg.close());

test('202 acceptance is durable; retries and concurrent worker deliveries execute one init per session',async()=>{
 const one=await submit({action:'init',transcript_text:'first'});assert.equal(one.status,202);const accepted=await one.json();
 const two=await submit({action:'init',transcript_text:'changed'});assert.equal((await two.json()).request_key,accepted.request_key);
 assert.equal((await pg.query('SELECT count(*)::int n FROM post_call_jobs')).rows[0].n,1);
 assert.equal((await pg.query('SELECT count(*)::int n FROM post_call_requests')).rows[0].n,1);
 let calls=0,finish;const gate=new Promise(resolve=>{finish=resolve;});
 const worker=createPostCallWorker({getDb:()=>db,work:()=>async()=>{calls++;await gate;return new Response(JSON.stringify({call_record_id:'record-1'}));}});
 const invocation=()=>new Request('https://app.test/.netlify/functions/post-call-background',{method:'POST',body:JSON.stringify(dispatches[0])});
 const first=worker(invocation());
 for(let i=0;i<100 && !calls;i++)await new Promise(resolve=>setTimeout(resolve,1));
 await worker(invocation());assert.equal(calls,1);
 finish();await first;
 const row=await (await status(accepted.request_key)).json();assert.equal(row.status,'completed');assert.equal(row.job.status,'completed');assert.equal(row.result.call_record_id,'record-1');
 const before=dispatches.length;const duplicate=await submit({action:'init'});assert.equal((await duplicate.json()).status,'completed');assert.equal(dispatches.length,before);
});

test('same-payload retries do not rerun failed work; distinct lifecycle stages remain allowed',async()=>{
 const accepted=await (await submit({action:'finalize',transcript_text:'saved transcript'})).json();
 let calls=0;const worker=createPostCallWorker({getDb:()=>db,work:()=>async()=>{calls++;return new Response('{}',{status:503});}});
 await worker(new Request('https://app.test/background',{method:'POST',body:JSON.stringify(dispatches.at(-1))}));
 const failed=await (await status(accepted.request_key)).json();assert.equal(failed.status,'failed');
 const retried=await (await submit({action:'finalize',transcript_text:'saved transcript'})).json();assert.equal(retried.status,'failed');assert.equal(calls,1);
 const changed=await (await submit({action:'finalize',transcript_text:'additional transcript'})).json();assert.notEqual(changed.request_key,accepted.request_key);
});

test('cross-agent submission and status are denied; dispatch credentials are never in client responses',async()=>{
 assert.equal((await submit({action:'init',session_id:OTHER})).status,403);
 const response=await submit({action:'checkpoint',transcript_text:'test'});const body=await response.json();assert.equal(body.dispatch_token,undefined);
 const denied=await handler(new Request(`https://app.test/api/post-call?session_id=${OTHER}&request_key=${body.request_key}`));assert.equal(denied.status,403);
 for(const role of ['anon','authenticated']){
 await pg.exec('SET ROLE '+role);await assert.rejects(pg.query('SELECT * FROM post_call_jobs'),/permission denied/);await assert.rejects(pg.query('SELECT claim_post_call_worker($1,gen_random_uuid())',[S]),/permission denied/);await pg.exec('RESET ROLE');
 }
});

test('idempotency ignores presentation/record-link fields; polling is bounded and never resubmits',async()=>{
 assert.equal(postCallRequestKey({action:'finalize',session_id:S,transcript_text:'x'}),postCallRequestKey({transcript_text:'x',session_id:S,action:'finalize',call_record_id:'later',transcript_id:'later'}));
 let polls=0;const send=async()=>new Response(JSON.stringify(++polls<3?{status:'running',job:{progress:'finalize'}}:{status:'completed',result:{call_record_id:'saved'}}));
 assert.deepEqual(await watchPostCallRequest(null,S,'key',{send,wait:async()=>{},maxPolls:3}),{call_record_id:'saved'});
 await assert.rejects(watchPostCallRequest(null,S,'key',{send:async()=>new Response('{"status":"running"}'),wait:async()=>{},maxPolls:2}),/taking longer/);
});
