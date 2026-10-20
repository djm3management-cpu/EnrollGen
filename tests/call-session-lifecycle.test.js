import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createCallSessionBoundary} from '../src/lib/callSessionBoundary.js';
import {scriptReducer,initialState,getActiveSection} from '../src/context/scriptReducer.js';
import {createCallDispositionHandler} from '../netlify/functions/call-disposition.js';
import {createPostCallQueueHandler} from '../netlify/functions/post-call.js';
import {evidenceDb} from './helpers/evidenceDb.js';
const sql=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const T='00000000-0000-4000-8000-000000000001',A='10000000-0000-4000-8000-000000000001';
const SID1='CA'+'1'.repeat(32),SID2='CA'+'2'.repeat(32);
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid PRIMARY KEY,name text,agency_display_name text,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,name text,npn text,clerk_user_id text,is_active boolean);
 CREATE TABLE tenant_agents(tenant_id uuid,clerk_user_id text,agent_slug text,is_active boolean);
 CREATE TABLE availability_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,call_record_id uuid,
  flow text,product_line text,created_at timestamptz DEFAULT now(),ended_at timestamptz,completed boolean,duration_seconds integer);
 CREATE TABLE agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,agency text,is_active boolean);
 CREATE TABLE call_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,agent_name text,
  call_direction text,call_type text,product_type text,call_start timestamptz,twilio_call_sid text,contact_id uuid,
  metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz,session_id uuid,transcript_id uuid,
  enrollment_completed boolean,ancillary_product_type text,transcript_raw text,transcript_diarized jsonb,call_duration_seconds integer,call_end timestamptz,call_outcome text,
  CONSTRAINT call_records_call_outcome_check CHECK(call_outcome IS NULL OR call_outcome IN ('incomplete','callback_scheduled','enrolled')));
 CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,call_record_id uuid,ended_at timestamptz);
 CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,parent_call_sid text,agent_id text,direction text,
  child_call_sid text,status text,created_at timestamptz DEFAULT now(),contact_id uuid,inbound_call_id uuid,call_record_id uuid,
  answered_at timestamptz,ended_at timestamptz,talk_seconds integer DEFAULT 0);
 CREATE TABLE call_transcripts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,owner_agent_id uuid,
  call_record_id uuid,session_id uuid,call_date timestamptz,direction text,product_line text,transcript_text text,source_system text,
  source_id text,phi_scrubbed boolean,last_checkpoint_at timestamptz,updated_at timestamptz,disposition text,
  CONSTRAINT call_transcripts_disposition_check CHECK(disposition IS NULL OR disposition IN ('pending','incomplete','callback_scheduled','enrolled')));
 CREATE TABLE telephony_events(tenant_id uuid,twilio_call_sid text,event text,payload jsonb);
 CREATE TABLE scoring_jobs(call_id uuid,tenant_id uuid,status text,transcript_revision text);
 CREATE FUNCTION scoring_transcript_snapshot(c call_records) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('raw',c.transcript_raw)$$;
 CREATE TABLE agent_availability(agent_id text PRIMARY KEY,agent_name text,status text,available boolean,toggled_at timestamptz);
 INSERT INTO tenants VALUES('${T}','Agency','Agency','org');
 INSERT INTO enrolled_agents VALUES('${A}','${T}','Mark',NULL,'user',true);
 INSERT INTO tenant_agents VALUES('${T}','user','mark',true);
 INSERT INTO availability_agent_subjects VALUES('${T}','user','mark',true);
 INSERT INTO agent_availability VALUES('mark','Mark','available',true,now());`);
 await pg.exec(sql('038_call_owned_agent_reservations.sql'));
 const original=sql('054_cms_landscape_2027.sql');
 await pg.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.cms_plans_py2027'),original.indexOf('CREATE INDEX')));
 await pg.exec(sql('084_durable_transcripts.sql'));
 const taxonomy=sql('098_ancillary_sale_disposition.sql');
 await pg.exec(taxonomy.slice(0,taxonomy.indexOf('CREATE OR REPLACE FUNCTION'))+'COMMIT;');
 await pg.exec(sql('099_post_call_background_jobs.sql'));
 await pg.exec(sql('101_post_call_provider_failures.sql'));
 await pg.exec(sql('104_call_session_identity.sql'));
 await pg.exec(sql('105_mandatory_call_wrap_up.sql'));
 return pg;
}
async function attempt(pg,sid,seconds=null,direction='inbound'){
 const id=randomUUID(),inbound=randomUUID();
 await pg.query('INSERT INTO inbound_calls(id,tenant_id) VALUES($1,$2)',[inbound,T]);
 await pg.query(`INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,status,inbound_call_id)
 VALUES($1,$2,$3,'mark',$4,'ringing',$5)`,[id,T,sid,direction,inbound]);
 if(seconds!==null) await pg.query(`UPDATE telephony_call_attempts SET answered_at=now()-($2||' seconds')::interval,status='accepted' WHERE id=$1`,[id,seconds]);
 return id;
}
async function start(pg,sid){return(await pg.query('SELECT start_telephony_session($1,$2,$3,$4) result',[T,A,sid,'ma'])).rows[0].result;}
async function end(pg,id,seconds){await pg.query("UPDATE telephony_call_attempts SET ended_at=now(),talk_seconds=$2,status='completed' WHERE id=$1",[id,seconds]);}
const availability=async pg=>(await pg.query("SELECT * FROM agent_availability WHERE agent_id='mark'")).rows[0];

test('back-to-back inbound calls get different sessions, canonical records and transcripts; repeated starts deduplicate',async()=>{
 const pg=await fixture();try{
 const first=await attempt(pg,SID1);const a=await start(pg,SID1);
 await pg.query("SELECT persist_telephony_transcript($1,$2,'customer','First call',now(),0,1000)",[first,randomUUID()]);
 await attempt(pg,SID2);const b=await start(pg,SID2);
 assert.notEqual(a.session_id,b.session_id);assert.notEqual(a.call_record_id,b.call_record_id);
 assert.equal((await start(pg,SID2)).session_id,b.session_id);
 const rows=(await pg.query('SELECT session_id,transcript_text FROM call_transcripts')).rows;
 assert.deepEqual(rows,[{session_id:a.session_id,transcript_text:'CUSTOMER: First call'}]);
 assert.equal((await pg.query('SELECT count(*)::int n FROM sessions')).rows[0].n,2);
 }finally{await pg.close();}
});
test('stale tab submitting old links and a new SID is queued only in the new verified session',async()=>{
 const pg=await fixture();try{
 await attempt(pg,SID1);const first=await start(pg,SID1);await attempt(pg,SID2);
 const base=evidenceDb(pg);const db={...base,async rpc(name,args){try{return{data:(await pg.query(`SELECT ${name}(${Object.keys(args).map((k,i)=>k+'=> $'+(i+1)).join(',')}) result`,Object.entries(args).map(([k,v])=>k==='p_payload'?JSON.stringify(v):v))).rows[0].result,error:null};}catch(error){return{data:null,error};}}};
 const handler=createPostCallQueueHandler({getDb:()=>db,authenticate:async()=>({userId:'user',orgId:'org'}),send:async()=>new Response(null,{status:202})});
 const response=await handler(new Request('https://test/api/post-call',{method:'POST',body:JSON.stringify({action:'finalize',session_id:first.session_id,call_record_id:first.call_record_id,twilio_call_sid:SID2,telephony_call:true,flow:'ma'})}));
 assert.equal(response.status,202,JSON.stringify(await response.clone().json()));
 const body=await response.json();assert.notEqual(body.session_id,first.session_id);
 const requests=(await pg.query('SELECT session_id,payload FROM post_call_requests')).rows;
 assert.equal(requests.length,1);assert.equal(requests[0].session_id,body.session_id);assert.notEqual(requests[0].payload.call_record_id,first.call_record_id);
 }finally{await pg.close();}
});
test('connected 15-second call holds routing across release/toggles until outcome save closes its session',async()=>{
 const pg=await fixture();try{
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID1]);const id=await attempt(pg,SID1,15);const call=await start(pg,SID1);await end(pg,id,15);
 await pg.query('SELECT release_call_agent($1)',[SID1]);
 let row=await availability(pg);assert.equal(row.wrap_up_call_sid,SID1);assert.equal(row.status,'busy');assert.equal(row.available,false);
 await pg.exec("UPDATE agent_availability SET status='available',available=true WHERE agent_id='mark'");
 assert.equal((await availability(pg)).available,false);
 await assert.rejects(pg.query("SELECT * FROM claim_call_agent($1,'{}','mark')",[SID2]),/Save Call Outcome/);
 await pg.query(`UPDATE call_records SET call_outcome='callback_scheduled',metadata=metadata||jsonb_build_object('wrap_up_saved_at',now()) WHERE id=$1`,[call.call_record_id]);
 row=await availability(pg);assert.equal(row.wrap_up_call_sid,null);assert.equal(row.available,true);
 const saved=(await pg.query('SELECT * FROM sessions WHERE id=$1',[call.session_id])).rows[0];assert.ok(saved.ended_at);assert.equal(saved.completed,false);
 await pg.query('SELECT release_call_agent($1)',[SID1]);assert.equal((await availability(pg)).available,true);
 }finally{await pg.close();}
});
test('connected calls under 15 seconds auto-dispose; missed/voicemail calls do not require wrap-up',async()=>{
 const pg=await fixture();try{
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID1]);const id=await attempt(pg,SID1,14);const call=await start(pg,SID1);await end(pg,id,14);
 await pg.query('SELECT release_call_agent($1)',[SID1]);
 const record=(await pg.query('SELECT * FROM call_records WHERE id=$1',[call.call_record_id])).rows[0];assert.equal(record.call_outcome,'short_call_hangup');
 assert.ok((await pg.query('SELECT ended_at FROM sessions WHERE id=$1',[call.session_id])).rows[0].ended_at);
 assert.equal((await availability(pg)).available,true);
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID2]);const missed=await attempt(pg,SID2);await end(pg,missed,0);await pg.query('SELECT release_call_agent($1)',[SID2]);
 assert.equal((await availability(pg)).wrap_up_call_sid,null);assert.equal((await availability(pg)).available,true);
 }finally{await pg.close();}
});
test('back-to-back outbound calls create separate canonical sessions and preserve the selected offline preference',async()=>{
 const pg=await fixture();try{
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID1]);
 const first=await attempt(pg,SID1,20,'outbound');const one=await start(pg,SID1);await end(pg,first,20);
 await pg.query('SELECT release_call_agent($1)',[SID1]);
 await pg.exec("UPDATE agent_availability SET status='offline',available=false WHERE agent_id='mark'");
 await pg.query("UPDATE call_records SET call_outcome='callback_scheduled',metadata=metadata||jsonb_build_object('wrap_up_saved_at',now()) WHERE id=$1",[one.call_record_id]);
 assert.equal((await availability(pg)).status,'offline');
 await pg.query("SELECT * FROM claim_call_agent($1,'{}','mark')",[SID2]);
 await attempt(pg,SID2,20,'outbound');const two=await start(pg,SID2);
 assert.notEqual(one.session_id,two.session_id);assert.notEqual(one.call_record_id,two.call_record_id);
 assert.equal(two.call_direction,'outbound');
 await pg.query('SELECT release_call_agent($1)',[SID1]);
 assert.equal((await availability(pg)).active_call_sid,SID2);
 for(const role of ['anon','authenticated']){
  await pg.exec('SET ROLE '+role);await assert.rejects(pg.query('SELECT * FROM call_wrap_ups'),/permission denied/);
  await assert.rejects(pg.query('SELECT start_telephony_session($1,$2,$3,$4)',[T,A,SID2,'ma']),/permission denied/);await pg.exec('RESET ROLE');
 }
 }finally{await pg.close();}
});
test('short-call result is applied when the browser binds a transcript after hang-up',async()=>{
 const pg=await fixture();try{
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID1]);const id=await attempt(pg,SID1,1);await end(pg,id,1);
 await pg.query('SELECT release_call_agent($1)',[SID1]);const saved=await start(pg,SID1);
 const row=(await pg.query('SELECT call_outcome,metadata FROM call_records WHERE id=$1',[saved.call_record_id])).rows[0];
 assert.equal(row.call_outcome,'short_call_hangup');assert.equal(row.metadata.auto_disposition,'short_call_hangup');
 assert.ok((await pg.query('SELECT ended_at FROM sessions WHERE id=$1',[saved.session_id])).rows[0].ended_at);
 await pg.query("SELECT persist_telephony_transcript($1,$2,'customer','Late final',now(),0,1000)",[id,randomUUID()]);
 assert.equal((await pg.query('SELECT disposition FROM call_transcripts WHERE call_record_id=$1',[saved.call_record_id])).rows[0].disposition,'short_call_hangup');
 assert.equal((await availability(pg)).wrap_up_call_sid,null);
 }finally{await pg.close();}
});
test('incident kill switch clears all holds, preserves active reservations and makes future holds a no-op',async()=>{
 const pg=await fixture();try{
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID1]);const first=await attempt(pg,SID1,60);await start(pg,SID1);
 await end(pg,first,60);await pg.query('SELECT release_call_agent($1)',[SID1]);
 assert.equal((await availability(pg)).wrap_up_call_sid,SID1);
 await pg.exec(sql('106_disable_wrap_up_routing_holds.sql'));
 assert.equal((await availability(pg)).wrap_up_call_sid,null);
 assert.equal((await pg.query('SELECT routing_hold_enabled FROM call_wrap_up_policy')).rows[0].routing_hold_enabled,false);
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID2]);const second=await attempt(pg,SID2,60);await start(pg,SID2);
 await pg.query("SELECT refresh_agent_wrap_up('mark')");
 assert.equal((await availability(pg)).active_call_sid,SID2);assert.equal((await availability(pg)).wrap_up_call_sid,null);
 await end(pg,second,60);await pg.query('SELECT release_call_agent($1)',[SID2]);
 assert.equal((await availability(pg)).wrap_up_call_sid,null);assert.equal((await availability(pg)).available,true);
 assert.equal((await pg.query('SELECT status,outcome FROM call_wrap_ups WHERE attempt_id=$1',[first])).rows[0].outcome,null);
 }finally{await pg.close();}
});
test('inbound and outbound cockpit boundaries survive hang-up and rotate on each new SID; late SID hydration preserves the live cockpit',()=>{
 const boundary=createCallSessionBoundary();
 const first={params:{twilioCallSid:SID1},call:{}};const second={params:{direction:'outbound'},call:{parameters:{CallSid:SID2}}};
 assert.equal(boundary(first),SID1);assert.equal(boundary(null),SID1);assert.equal(boundary({...first}),SID1);assert.equal(boundary(second),SID2);assert.equal(boundary(null),SID2);
 const late={call:{parameters:{}}};const pinned=boundary(late);late.call.parameters.CallSid=SID1;assert.equal(boundary(late),pinned);
 const disconnected=scriptReducer(initialState,{type:'CALL_DISCONNECTED'});assert.equal(getActiveSection(disconnected),8);assert.equal(disconnected.notes.callOutcome,'');
 const next=scriptReducer({...disconnected,notes:{...disconnected.notes,customerFirstName:'Previous'}},{type:'NEW_CALL',direction:'outbound'});assert.equal(next.notes.customerFirstName,'');assert.equal(next.callDirection,'outbound');assert.equal(getActiveSection(next),1);
});

test('late first-call session/end responses cannot replace or clear the second call metadata',async()=>{
 let finishFirst,finishEnd;const first=new Promise(resolve=>{finishFirst=resolve;}),end=new Promise(resolve=>{finishEnd=resolve;});
 let count=0;
 const source=readFileSync(new URL('../src/hooks/useSessionTracker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.env.VITE_DISABLE_CLERK_AUTH === "true"','false').replaceAll('import.meta.env.DEV','false').replace(/^export /gm,'');
 const context=vm.createContext({debugLog:()=>{},useRef:v=>({current:v}),useCallback:fn=>fn,useEffect:()=>{},useAppAuth:()=>({getToken:()=>''}),setTimeout,console,
 evidenceRequest:async(_token,_endpoint,body)=>{if(body.action==='end'){await end;return{ok:true};}const n=++count;if(n===1)await first;return{session_id:'session-'+n,agent_id:A,agent_name:'Mark'};}});
 vm.runInContext(source+';globalThis.tracker=useSessionTracker();globalThis.get=getActiveSessionMetadata;',context);
 const one=context.tracker.startSession('ma',{twilioCallSid:SID1});
 const two=context.tracker.startSession('ma',{twilioCallSid:SID2});await two;finishFirst();await one;
 assert.equal(context.get().sessionId,'session-2');assert.equal(context.get().twilioCallSid,SID2);
 const ending=context.tracker.endSession(8,false);await Promise.resolve();
 await context.tracker.startSession('ma',{twilioCallSid:SID1});finishEnd();await ending;
 assert.equal(context.get().sessionId,'session-3');assert.equal(context.get().twilioCallSid,SID1);
});

async function stabilizedFixture(){
 const pg=await fixture();await pg.exec(sql('106_disable_wrap_up_routing_holds.sql'));
 await pg.exec(sql('107_dialer_disposition_save.sql'));
 await pg.exec(sql('108_disposition_only_wrap_up.sql'));return pg;
}
async function endedAgentCall(pg,sid,seconds=60,direction='inbound'){
 const id=await attempt(pg,sid,seconds,direction);const call=await start(pg,sid);
 await pg.query('UPDATE telephony_call_attempts SET child_call_sid=$2 WHERE id=$1',[id,'CA'+id.replaceAll('-','')]);
 if(direction==='inbound')await pg.query("SELECT persist_telephony_transcript($1,$2,'customer','Retained evidence',now(),0,1000)",[id,randomUUID()]);
 await end(pg,id,seconds);return {...call,id};
}
const dispositionRequest=(body)=>new Request('https://test/api/call-disposition',body?{method:'POST',body:JSON.stringify(body)}:{});
const dispositionHandler=(pg,extra={})=>createCallDispositionHandler({getDb:()=>evidenceDb(pg),authenticate:async()=>({userId:'user',orgId:'org'}),...extra});

test('dialer outcome closes only the owned completed session, never scores, and refuses any live reservation or call',async()=>{
 const pg=await stabilizedFixture();try{
 const one=await endedAgentCall(pg,SID1);const handler=dispositionHandler(pg);
 let response=await handler(dispositionRequest());assert.equal(response.status,200);assert.equal((await response.json()).disposition.call_sid,SID1);
 await pg.query('SELECT * FROM claim_call_agent($1)',[SID2]);const active=await attempt(pg,SID2,60);
 response=await handler(dispositionRequest({call_sid:SID1,call_outcome:'callback_scheduled'}));assert.equal(response.status,409);
 assert.equal((await handler(dispositionRequest()).then(r=>r.json())).in_progress,true);
 await pg.query('SELECT release_call_agent($1)',[SID2]);
 assert.equal((await handler(dispositionRequest()).then(r=>r.json())).in_progress,true,'even an accidentally released reservation cannot expose wrap-up while another call is open');
 await end(pg,active,60);
 response=await handler(dispositionRequest({call_sid:SID1,call_outcome:'callback_scheduled'}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 assert.equal((await response.json()).session_id,one.session_id);
 const record=(await pg.query('SELECT call_outcome FROM call_records WHERE id=$1',[one.call_record_id])).rows[0];assert.equal(record.call_outcome,'callback_scheduled');
 assert.ok((await pg.query('SELECT ended_at FROM sessions WHERE id=$1',[one.session_id])).rows[0].ended_at);
 assert.equal((await pg.query('SELECT ended_at FROM sessions WHERE twilio_call_sid=$1',[SID2])).rows[0].ended_at,null);
 assert.equal((await pg.query('SELECT disposition FROM call_transcripts WHERE call_record_id=$1',[one.call_record_id])).rows[0].disposition,'callback_scheduled');
 assert.equal((await pg.query('SELECT count(*)::int n FROM scoring_jobs')).rows[0].n,0);
 assert.equal((await availability(pg)).wrap_up_call_sid,null);
 response=await handler(dispositionRequest({call_sid:SID1,call_outcome:'not_interested'}));assert.equal(response.status,200);assert.equal((await response.json()).call_outcome,'callback_scheduled','retry does not overwrite saved outcome');
 assert.equal((await handler(dispositionRequest({call_sid:'CA'+'f'.repeat(32),call_outcome:'enrolled'}))).status,409);
 assert.equal((await dispositionHandler(pg,{authenticate:async()=>({userId:'outsider',orgId:'org'})})(dispositionRequest())).status,403);
 assert.equal((await dispositionHandler(pg,{authenticate:async()=>({userId:'user',orgId:'other'})})(dispositionRequest())).status,403);
 for(const role of ['anon','authenticated']){
  await pg.exec('SET ROLE '+role);await assert.rejects(pg.query('SELECT save_agent_call_disposition($1,$2,$3,$4,$5,$6,false)',[T,A,'mark',SID1,'enrolled',null]),/permission denied/);await pg.exec('RESET ROLE');
 }
 }finally{await pg.close();}
});

test('short calls auto-dispose once; missed/voicemail exempt; outbound child completion alone never prompts',async()=>{
 const pg=await stabilizedFixture();try{
 const handler=dispositionHandler(pg);const one=await endedAgentCall(pg,SID1,14);
 let response=await handler(dispositionRequest({call_sid:SID1,call_outcome:'short_call_hangup',automatic:true}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 assert.equal((await pg.query('SELECT call_outcome FROM call_records WHERE id=$1',[one.call_record_id])).rows[0].call_outcome,'short_call_hangup');
 const missed=await attempt(pg,'CA'+'3'.repeat(32));await end(pg,missed,0);
 const voicemail=await endedAgentCall(pg,'CA'+'4'.repeat(32));await pg.query("UPDATE call_records SET call_outcome='voicemail_left' WHERE id=$1",[voicemail.call_record_id]);
 assert.equal((await handler(dispositionRequest()).then(r=>r.json())).disposition,null);
 await endedAgentCall(pg,SID2,60,'outbound');
 assert.equal((await handler(dispositionRequest()).then(r=>r.json())).disposition,null,'customer/transfer completion does not prove the browser agent leg ended');
 await pg.query("INSERT INTO telephony_events VALUES($1,$2,'call_completed',$3)",[T,SID2,JSON.stringify({CallSid:SID2,CallStatus:'completed'})]);
 assert.equal((await handler(dispositionRequest()).then(r=>r.json())).disposition.call_sid,SID2);
 assert.equal((await handler(dispositionRequest({call_sid:SID2,call_outcome:'short_call_hangup',automatic:true}))).status,409);
 assert.equal((await handler(dispositionRequest({call_sid:SID2,call_outcome:'sale_ancillary',ancillary_product_type:'bad'}))).status,400);
 response=await handler(dispositionRequest({call_sid:SID2,call_outcome:'sale_ancillary',ancillary_product_type:'dental_vision'}));assert.equal(response.status,200);
 assert.equal((await pg.query('SELECT ancillary_product_type FROM call_records WHERE twilio_call_sid=$1',[SID2])).rows[0].ancillary_product_type,'dental_vision');
 assert.equal((await availability(pg)).wrap_up_call_sid,null);
 }finally{await pg.close();}
});

test('a new call claiming the agent between GET/POST checks and the save is preserved; disposition is refused atomically',async()=>{
 const pg=await stabilizedFixture();try{
 const one=await endedAgentCall(pg,SID1);const db=evidenceDb(pg);
 const handler=dispositionHandler(pg,{getDb:()=>({...db,async rpc(name,args){await pg.query('SELECT * FROM claim_call_agent($1)',[SID2]);return db.rpc(name,args);}})});
 const response=await handler(dispositionRequest({call_sid:SID1,call_outcome:'callback_scheduled'}));assert.equal(response.status,409);
 assert.equal((await availability(pg)).active_call_sid,SID2);
 assert.equal((await pg.query('SELECT ended_at FROM sessions WHERE id=$1',[one.session_id])).rows[0].ended_at,null);
 assert.equal((await pg.query('SELECT call_outcome FROM call_records WHERE id=$1',[one.call_record_id])).rows[0].call_outcome,null);
 }finally{await pg.close();}
});

 test('disposition alone closes an enrolled or ancillary call without notes, contact/enrollment data, cross-sell or an opportunity',async()=>{
 const pg=await stabilizedFixture();try{
  const handler=dispositionHandler(pg);
  for(const [sid,outcome] of [[SID1,'enrolled'],[SID2,'sale_ancillary']]){
   const call=await endedAgentCall(pg,sid);
   const response=await handler(dispositionRequest({call_sid:sid,call_outcome:outcome}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
   const row=(await pg.query('SELECT call_outcome,ancillary_product_type,enrollment_completed FROM call_records WHERE id=$1',[call.call_record_id])).rows[0];
   assert.equal(row.call_outcome,outcome);assert.equal(row.ancillary_product_type,null);
   assert.ok((await pg.query('SELECT ended_at FROM sessions WHERE id=$1',[call.session_id])).rows[0].ended_at);
  }
 }finally{await pg.close();}
 });
