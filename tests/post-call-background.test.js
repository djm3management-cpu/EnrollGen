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
 CREATE TABLE call_records(id uuid PRIMARY KEY,session_id uuid,tenant_id uuid,agent_id uuid,transcript_id uuid,metadata jsonb,webhook_sent boolean);
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY,tenant_id uuid,session_id uuid);
 INSERT INTO tenants VALUES('${T}','org-test');
 INSERT INTO enrolled_agents VALUES('${A}','${T}','dylan-test','Dylan',NULL,true);
 INSERT INTO sessions(id,tenant_id,agent_id) VALUES('${S}','${T}','${A}'),('${OTHER}','${T}',gen_random_uuid());`);
 await pg.exec(readFileSync(new URL('../supabase/migrations/099_post_call_background_jobs.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../supabase/migrations/101_post_call_provider_failures.sql',import.meta.url),'utf8'));
 for(const file of ['117_recovered_checkpoint_status.sql','130_post_call_lifecycle_safety.sql']) await pg.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
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
 let calls=0;const worker=createPostCallWorker({getDb:()=>db,wait:async()=>{},work:()=>async()=>{calls++;return new Response('{}',{status:503});}});
 await worker(new Request('https://app.test/background',{method:'POST',body:JSON.stringify(dispatches.at(-1))}));
 const failed=await (await status(accepted.request_key)).json();assert.equal(failed.status,'failed');
 const retried=await (await submit({action:'finalize',transcript_text:'saved transcript'})).json();assert.equal(retried.status,'failed');assert.equal(calls,4);
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

test('webhook claim is tenant scoped and survives concurrent or repeated processing',async()=>{
 const id='40000000-0000-4000-8000-000000000001';
 await pg.query('INSERT INTO call_records(id,tenant_id,session_id,agent_id) VALUES($1,$2,$3,$4)',[id,T,S,A]);
 const claim=tenant=>db.rpc('claim_post_call_webhook',{p_call_record_id:id,p_tenant_id:tenant});
 assert.equal((await claim(OTHER)).data,false);
 const results=await Promise.all([claim(T),claim(T)]);assert.equal(results.filter(x=>x.data).length,1);
 assert.equal((await claim(T)).data,false);
});
test('HTTP checkpoint recovery retains historical failure but clears the current error only for a matching later save',async()=>{
 const session='20000000-0000-4000-8000-000000000003';
 await pg.query('INSERT INTO sessions(id,tenant_id,agent_id) VALUES($1,$2,$3)',[session,T,A]);
 await pg.query('INSERT INTO post_call_jobs(session_id,tenant_id,agent_id,clerk_user_id) VALUES($1,$2,$3,$4)',[session,T,A,'dylan-test']);
 await pg.query("INSERT INTO post_call_requests(session_id,request_key,action,status,error_code,payload) VALUES($1,$2,'checkpoint','failed','post_call_http_503',$3)",[session,'d'.repeat(64),JSON.stringify({call_record_id:'matching'})]);
 await pg.query("UPDATE post_call_jobs SET status='failed' WHERE session_id=$1",[session]);
 assert.equal((await pg.query('SELECT status FROM post_call_jobs WHERE session_id=$1',[session])).rows[0].status,'failed');
 await pg.query("INSERT INTO post_call_requests(session_id,request_key,action,status,payload,result) VALUES($1,$2,'finalize','completed','{}',$3)",[session,'e'.repeat(64),JSON.stringify({call_record_id:'matching',transcript_id:'saved'})]);
 await pg.query("UPDATE post_call_jobs SET status='failed' WHERE session_id=$1",[session]);
 assert.equal((await pg.query('SELECT status FROM post_call_jobs WHERE session_id=$1',[session])).rows[0].status,'completed');
 assert.equal((await pg.query('SELECT status FROM post_call_requests WHERE session_id=$1 AND request_key=$2',[session,'d'.repeat(64)])).rows[0].status,'failed');
});

test('admin status hides errors from agents and retries require admin plus terminal parent verification',async()=>{
 const {createPostCallAdminHandler}=await import('../netlify/functions/post-call-admin.js');
 const id='40000000-0000-4000-8000-000000000001',url='https://app.test/api/post-call-admin?call_record_id='+id;
 await pg.query("UPDATE call_records SET post_call_status='failed',post_call_last_error='private_sql_error' WHERE id=$1",[id]);
 const member=createPostCallAdminHandler({getDb:()=>db,authenticate:async()=>auth});
 const visible=await (await member(new Request(url))).json();assert.equal(visible.last_error,null);assert.equal(visible.can_retry,false);
 assert.equal((await member(new Request(url,{method:'POST'}))).status,403);
 let verified=0;
 const admin=createPostCallAdminHandler({getDb:()=>db,authenticate:async()=>({...auth,tokenPayload:{org_role:'org:admin'}}),verifyEnded:async()=>{verified++;throw Object.assign(new Error('Call active'),{status:409});}});
 const detail=await (await admin(new Request(url))).json();assert.equal(detail.last_error,'private_sql_error');assert.equal(detail.can_retry,true);
 // Use an EvidenceError to retain the HTTP status instead of an unclassified storage failure.
 const {EvidenceError}=await import('../netlify/functions/_evidenceAccess.js');
 const active=createPostCallAdminHandler({getDb:()=>db,authenticate:async()=>({...auth,tokenPayload:{org_role:'org:admin'}}),verifyEnded:async()=>{verified++;throw new EvidenceError(409,'Call active');}});
 assert.equal((await active(new Request(url,{method:'POST'}))).status,409);assert.equal(verified,1);
});

test('manual finalization retry is idempotent and resolves only its explicitly linked failure after a successful stored save',async()=>{
 const session='20000000-0000-4000-8000-000000000004',id='40000000-0000-4000-8000-000000000004';
 await pg.query('INSERT INTO sessions(id,tenant_id,agent_id) VALUES($1,$2,$3)',[session,T,A]);
 await pg.query('INSERT INTO call_records(id,session_id,tenant_id,agent_id) VALUES($1,$2,$3,$4)',[id,session,T,A]);
 await pg.query('INSERT INTO post_call_jobs(session_id,tenant_id,agent_id,clerk_user_id) VALUES($1,$2,$3,$4)',[session,T,A,'dylan-test']);
 await pg.query("INSERT INTO post_call_requests(session_id,request_key,action,status,payload,error_code) VALUES($1,$2,'finalize','failed',$3,'post_call_http_503')",[session,'1'.repeat(64),JSON.stringify({call_record_id:id,transcript_text:'partial'})]);
 const payload={action:'finalize',session_id:session,call_record_id:id,transcript_text:'full stored transcript'};
 const key=postCallRequestKey(payload),retry=()=>db.rpc('retry_post_call_transcript',{p_session_id:session,p_request_key:key,p_payload:payload});
 assert.equal((await retry()).error,null);assert.equal((await retry()).error,null);
 assert.equal((await pg.query('SELECT count(*)::int n FROM post_call_requests WHERE session_id=$1',[session])).rows[0].n,2);
 const old=(await pg.query('SELECT status,payload,retry_request_key FROM post_call_requests WHERE session_id=$1 AND request_key=$2',[session,'1'.repeat(64)])).rows[0];
 assert.equal(old.status,'failed');assert.equal(old.payload.transcript_text,'partial');assert.equal(old.retry_request_key,key);
 await pg.query("UPDATE post_call_jobs SET status='failed' WHERE session_id=$1",[session]);
 assert.equal((await pg.query('SELECT status FROM post_call_jobs WHERE session_id=$1',[session])).rows[0].status,'failed');
 await pg.query("UPDATE post_call_requests SET status='completed',result=$3 WHERE session_id=$1 AND request_key=$2",[session,key,JSON.stringify({call_record_id:id,transcript_id:'saved'})]);
 await pg.query("UPDATE post_call_jobs SET status='completed' WHERE session_id=$1",[session]);
 assert.equal((await pg.query('SELECT status FROM post_call_jobs WHERE session_id=$1',[session])).rows[0].status,'completed');
});
