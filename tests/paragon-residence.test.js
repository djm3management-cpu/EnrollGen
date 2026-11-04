import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {processResidenceJob,runParagonResidenceWorker} from '../telephony/src/paragonResidenceWorker.js';
import {createParagonResidenceHandler} from '../netlify/functions/paragon-residence.js';
const pg=new PGlite(),base=evidenceDb(pg),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,T=id(1),S=id(3),A=id(4);
const sql=async(q,args=[]) => (await pg.query(q,args)).rows;
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const db={...base,async rpc(name,args={}){try{const entries=Object.entries(args),rows=await sql(`SELECT public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) AS value`,entries.map(([key,v])=>['p_candidate','p_metadata'].includes(key)?JSON.stringify(v):v));return {data:name==='claim_paragon_residence_jobs'?rows.map(r=>r.value):rows[0]?.value,error:null};}catch(error){return {data:null,error};}}};
const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data;};
before(async()=>{
 await pg.exec(readFileSync(new URL('./fixtures/paragon-billing-schema.sql',import.meta.url),'utf8'));
 await pg.exec(`ALTER TABLE tenants ADD clerk_org_id text;
 ALTER TABLE tenant_agents ADD clerk_user_id text;
 ALTER TABLE inbound_calls ADD routed_agent_id text,ADD return_reason text,ADD contact_id uuid,ADD vendor_metadata jsonb DEFAULT '{}';
 CREATE TABLE call_transcripts(id uuid,disposition text);
 CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,zip text,state text,source text,assigned_agent_id text,updated_at timestamptz DEFAULT clock_timestamp());
 CREATE FUNCTION contact_updated() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW;END; $$;
 CREATE TRIGGER contact_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION contact_updated();
 CREATE TABLE enrolled_agents(id uuid,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
 CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,inbound_call_id uuid,answered_at timestamptz,ended_at timestamptz);
 CREATE TABLE telephony_transcript_segments(id uuid,attempt_id uuid,speaker text,text text,captured_at timestamptz);
 CREATE TABLE zip_county_crosswalk(zip text,state_code text,county_fips text,county_name text);
 INSERT INTO zip_county_crosswalk VALUES('33101','FL','12086','Miami-Dade'),('85001','AZ','04013','Maricopa'),('10001','NY','36061','New York'),('07001','NJ','34023','Middlesex');`);
 await sql("INSERT INTO tenants VALUES($1,'org-a')",[T]);
 await sql("INSERT INTO lead_sources(id,tenant_id,name,type,active) VALUES($1,$2,'Paragon Media','publisher',true)",[S,T]);
 for(const [n,name,npn,slug,user] of [[4,'Dylan Maria','22167358','dylan_maria','dylan-user'],[5,'Mark Endres','20856361','mark_endres','mark-user']])await sql('INSERT INTO tenant_agents(id,tenant_id,name,npn,agent_slug,clerk_user_id,is_active) VALUES($1,$2,$3,$4,$5,$6,true)',[id(n),T,name,npn,slug,user]);
 await sql("INSERT INTO enrolled_agents VALUES($1,$2,'dylan-user','Dylan',NULL,true)",[A,T]);
 for(const name of ['051_paragon_vendor_matrix.sql','052_paragon_ping_and_claim.sql','053_paragon_zip_and_reports.sql','055_paragon_vendor_report.sql','056_resolve_recent_paragon_ping.sql','057_paragon_vendor_report_proof.sql','067_paragon_billing_hours.sql','098_ancillary_sale_disposition.sql','126_paragon_out_of_state_tasks.sql','131_paragon_residence_capture.sql'])await pg.exec(migration(name));
});
after(()=>pg.close());
beforeEach(async()=>{await pg.exec('TRUNCATE contacts,inbound_calls,telephony_call_attempts,telephony_transcript_segments,paragon_callback_tasks,paragon_residence_jobs,paragon_residence_sep_inputs,paragon_contact_zip_origin CASCADE');});
async function call(n=20,{zip='33101',source='fmo_transfer',ended=false}={}){
 const c=id(n),contact=id(n+100),attempt=id(n+200),sid='CA'+String(n).padStart(32,'0');
 await sql('INSERT INTO contacts(id,tenant_id,zip,state,source,assigned_agent_id) VALUES($1,$2,$3,$4,$5,$6)',[contact,T,zip,'FL',source,'dylan_maria']);
 await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,source_kind,lead_source_id,routed_agent_id,contact_id,status,caller_state) VALUES($1,$2,$3,'publisher',$4,'dylan_maria',$5,$6,'FL')",[c,T,sid,S,contact,ended?'completed':'accepted']);
 await sql('INSERT INTO telephony_call_attempts VALUES($1,$2,$3,clock_timestamp(),$4)',[attempt,T,c,ended?new Date().toISOString():null]);
 return {c,contact,attempt,sid};
}
async function speech(f,text,n=1,speaker='customer'){
 await sql('INSERT INTO telephony_transcript_segments VALUES($1,$2,$3,$4,$5)',[id(500+n),f.attempt,speaker,text,new Date(Date.now()+n*1000).toISOString()]);
}
const question=f=>speech(f,'May I have your ZIP code, county and state?',0,'agent');
const claim=async()=> (await rpc('claim_paragon_residence_jobs',{p_limit:5}))[0];
async function wake(c){await sql('UPDATE paragon_residence_jobs SET available_at=clock_timestamp() WHERE inbound_call_id=$1',[c]);}
const record=async c=>(await sql('SELECT * FROM inbound_calls WHERE id=$1',[c]))[0];

test('a transcript residence atomically flags a wrong-state call and creates the eligible teammate callback',async()=>{
 const f=await call();await question(f);await speech(f,'85001, Maricopa County, Arizona.');
 await processResidenceJob(db,await claim());const row=await record(f.c);
 assert.equal(row.confirmed_zip,'85001');assert.equal(row.confirmed_state,'AZ');assert.equal(row.wrong_state,true);assert.equal(row.paragon_serviceability,'callback');assert.equal(row.return_reason,'wrong_state');
 const tasks=await sql('SELECT * FROM paragon_callback_tasks');assert.equal(tasks.length,1);assert.equal(tasks[0].assigned_agent_id,'mark_endres');
 assert.equal(row.vendor_metadata.paragon_residence.source,'transcript');assert.ok(row.vendor_metadata.paragon_residence.captured_at);
 await wake(f.c);await processResidenceJob(db,await claim());assert.equal((await sql('SELECT * FROM paragon_callback_tasks')).length,1);
});
test('last clear valid transcript correction wins, stays ambiguous for admins, and supersedes both fallbacks',async()=>{
 const f=await call(21,{ended:true});await question(f);await speech(f,'My ZIP is 33101.',1);await speech(f,'Actually my ZIP is 10001 in New York.',2);
 await processResidenceJob(db,await claim());const row=await record(f.c);
 assert.equal(row.confirmed_zip,'10001');assert.equal(row.confirmed_state,'NY');assert.equal(row.return_reason,'out_of_state_not_serviceable');assert.equal(row.vendor_metadata.paragon_residence.ambiguous,true);
 const reviews=await sql('SELECT * FROM v_paragon_residence_review');assert.equal(reviews[0].review_reason,'ambiguous_residence');
 await sql("INSERT INTO paragon_residence_sep_inputs(inbound_call_id,tenant_id,zip,state,metadata) VALUES($1,$2,'33101','FL','{}')",[f.c,T]);
 await wake(f.c);await processResidenceJob(db,await claim());assert.equal((await record(f.c)).confirmed_zip,'10001');
});
test('vendor ZIP is never promoted, even on an existing manual-source contact; invalid/no ZIP reaches admin review',async()=>{
 for(const [n,text] of [[22,'00000'],[23,'I do not know']]){
  const f=await call(n,{source:'manual',ended:true});await question(f);await speech(f,text,n);
  const job=await claim();assert.equal(job.contact,null);await processResidenceJob(db,job);assert.equal((await record(f.c)).confirmed_zip,null);
  assert.ok((await sql('SELECT * FROM v_paragon_residence_review WHERE inbound_call_id=$1',[f.c])).length);
  await sql("UPDATE paragon_residence_jobs SET available_at='infinity' WHERE inbound_call_id=$1",[f.c]);
 }
});
test('explicit agent ZIP provenance is required and invalidated by a subsequent unproven contact update',async()=>{
 const f=await call(24,{source:'manual'});
 await rpc('save_paragon_contact_zip',{p_contact:f.contact,p_tenant:T,p_zip:'07001',p_user:'dylan-user'});
 const job=await claim();assert.equal(job.contact.zip,'07001');await processResidenceJob(db,job);assert.equal((await record(f.c)).confirmed_zip,'07001');assert.equal((await record(f.c)).vendor_metadata.paragon_residence.source,'contact_record');
 await sql("UPDATE contacts SET zip='85001' WHERE id=$1",[f.contact]);await wake(f.c);assert.equal((await claim()).contact,null);
});
test('successful call-bound SEP input outranks contact evidence but cannot overwrite transcript residence',async()=>{
 const f=await call(25);
 await rpc('save_paragon_contact_zip',{p_contact:f.contact,p_tenant:T,p_zip:'07001',p_user:'dylan-user'});
 await rpc('enqueue_paragon_sep_residence',{p_call:f.c,p_tenant:T,p_agent:'dylan_maria',p_sid:f.sid,p_zip:'85001',p_state:'AZ',p_county:'Maricopa'});
 await processResidenceJob(db,await claim());assert.equal((await record(f.c)).vendor_metadata.paragon_residence.source,'sep_lookup');
 await question(f);await speech(f,'My ZIP is 10001 New York.',3);await wake(f.c);await processResidenceJob(db,await claim());assert.equal((await record(f.c)).vendor_metadata.paragon_residence.source,'transcript');
 await rpc('enqueue_paragon_sep_residence',{p_call:f.c,p_tenant:T,p_agent:'dylan_maria',p_sid:f.sid,p_zip:'33101',p_state:'FL',p_county:null});
 await processResidenceJob(db,await claim());assert.equal((await record(f.c)).confirmed_zip,'10001');
});
test('wrong call SID, wrong agent, ended calls and state-only input cannot queue SEP residence',async()=>{
 const f=await call(26);const args={p_call:f.c,p_tenant:T,p_agent:'dylan_maria',p_sid:f.sid,p_zip:'33101',p_state:'FL',p_county:null};
 for(const patch of [{p_sid:'CA'+'f'.repeat(32)},{p_agent:'mark_endres'},{p_zip:null}])assert.ok((await db.rpc('enqueue_paragon_sep_residence',{...args,...patch})).error);
 await sql('UPDATE telephony_call_attempts SET ended_at=clock_timestamp() WHERE id=$1',[f.attempt]);assert.ok((await db.rpc('enqueue_paragon_sep_residence',args)).error);
 assert.equal((await sql('SELECT * FROM paragon_residence_sep_inputs')).length,0);
});
test('capture failure retains durable evidence and retries independently with exponential backoff',async()=>{
 const f=await call(27);await question(f);await speech(f,'85001 Arizona.',1);let failed=false;
 const flaky={...db,async rpc(name,args){if(name==='finish_paragon_residence_job'&&!failed){failed=true;return {error:{code:'08006'}};}return db.rpc(name,args);}};
 await runParagonResidenceWorker({db:flaky,log:()=>{}});
 const [pending]=await sql('SELECT * FROM paragon_residence_jobs');assert.equal(pending.attempts,1);assert.equal(pending.last_error,'08006');assert.equal((await record(f.c)).confirmed_zip,null);assert.equal((await sql('SELECT * FROM telephony_transcript_segments')).length,2);
 await wake(f.c);await runParagonResidenceWorker({db,log:()=>{}});assert.equal((await record(f.c)).confirmed_zip,'85001');
});
test('residence review is admin-only and tenant scoped; browser roles cannot invoke capture RPCs',async()=>{
 const f=await call(28,{ended:true});await processResidenceJob(db,await claim());
 const auth={userId:'dylan-user',orgId:'org-a'},url='https://app.test/api/paragon-residence';
 const member=createParagonResidenceHandler({getDb:()=>db,authenticate:async()=>auth});assert.equal((await member(new Request(url))).status,403);
 const admin=createParagonResidenceHandler({getDb:()=>db,authenticate:async()=>({...auth,tokenPayload:{org_role:'org:admin'}})});const response=await admin(new Request(url));assert.equal(response.status,200);assert.equal((await response.json()).rows[0].inbound_call_id,f.c);
 for(const role of ['anon','authenticated']){await pg.exec('SET ROLE '+role);await assert.rejects(sql('SELECT * FROM paragon_residence_jobs'),/permission denied/);await assert.rejects(sql('SELECT claim_paragon_residence_jobs(1)'),/permission denied/);await pg.exec('RESET ROLE');}
});
test('authenticated API accepts only owned typed lookups and explicit contact edits, rejecting forged sources and organizations',async()=>{
 const f=await call(29),url='https://app.test/api/paragon-residence';
 const handler=auth=>createParagonResidenceHandler({getDb:()=>db,authenticate:async()=>auth});
 const request=body=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const auth={userId:'dylan-user',orgId:'org-a'},member=handler(auth);
 const payload={action:'sep_lookup',inbound_call_id:f.c,call_sid:f.sid,zip:'85001',state:'AZ',entry:'agent_typed'};
 assert.equal((await member(request({...payload,entry:'transcript'}))).status,400);
 assert.equal((await handler({...auth,orgId:'foreign-org'})(request(payload))).status,403);
 assert.equal((await member(request({...payload,call_sid:'CA'+'f'.repeat(32)}))).status,409);
 assert.equal((await member(request(payload))).status,202);
 assert.equal((await member(request({action:'contact_zip_edit',contact_id:f.contact,zip:'07001'}))).status,200);
 assert.equal((await sql('SELECT zip FROM paragon_contact_zip_origin'))[0].zip,'07001');
 await sql("UPDATE contacts SET assigned_agent_id='mark_endres' WHERE id=$1",[f.contact]);
 assert.equal((await member(request({action:'contact_zip_edit',contact_id:f.contact,zip:'10001'}))).status,403);
 assert.equal((await handler({userId:'dev-bypass'})(request(payload))).status,401);
});
test('ended Paragon calls with no assigned agent still enter missing-residence admin review',async()=>{
 const f=await call(30,{ended:true});await sql('UPDATE inbound_calls SET routed_agent_id=NULL WHERE id=$1',[f.c]);
 await processResidenceJob(db,await claim());
 const rows=await sql('SELECT * FROM v_paragon_residence_review');assert.equal(rows[0].inbound_call_id,f.c);assert.equal(rows[0].review_reason,'no_valid_residence');
 assert.equal((await record(f.c)).confirmed_zip,null);
});
