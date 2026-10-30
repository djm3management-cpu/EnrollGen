import {carrierKey} from '../src/lib/enrollmentIntake.js';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createComplianceWorker} from '../integrations/complianceUploads.js';
import {processManualConverselyRun,selectConverselyWeek} from '../integrations/converselyRuns.js';
import {currentConverselyWeek,previousConverselyWeek} from '../integrations/converselySelection.js';
import {createComplianceUploadsHandler} from '../netlify/functions/compliance-uploads.js';
const pg=new PGlite(),base=evidenceDb(pg);
const db={...base,async rpc(name,args={}){
 const result=await base.rpc(name,{...args,...(args.p_decisions?{p_decisions:JSON.stringify(args.p_decisions)}:{})});
 if(name==='request_conversely_run'&&result.data)result.data=result.data[0]?.[name];return result;
}};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),agent=id(2),mark=id(3),excluded=id(4),foreign=id(5),week=currentConverselyWeek();
const account='AC'+'a'.repeat(32),parent='CA'+'b'.repeat(32),sid=n=>'RE'+String(n).padStart(32,'0');
const env={CONVERSELY_UPLOAD_ENABLED:'true',CONVERSELY_API_KEY:'test-key',CONVERSELY_SAMPLES_PER_AGENT:'5',CONVERSELY_CARRIERS:'UHC,Aetna,Humana',TELEPHONY_BASE_URL:'https://audio.test'};
const admin={userId:'admin',orgId:'org-a',tokenPayload:{org_role:'org:admin'}};
const query=async(sql,args=[]) => (await pg.query(sql,args)).rows;
const file=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const sent=[];
let failAgent=null;
const send=async(_url,body,headers)=>{const payload=JSON.parse(body);sent.push({payload,headers});return {status:payload.AgentID===failAgent?503:200};};
const tick=createComplianceWorker(db,{env,send,log:()=>{},isPlayable:async()=>true});
async function addCall(n,owner,carrier,score,{when=new Date(Date.now()-1000).toISOString(),intake=true,targetTenant=tenant}={}){
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_start,call_outcome,compliance_status,compliance_scorecard_id,metadata,product_type)
 VALUES($1,$2,$3,'Agent',$4,'enrolled','complete',$5,'{}','MA')`,[id(n),targetTenant,owner,when,id(n+1000)]);
 await query(`INSERT INTO compliance_scorecards VALUES($1,$2,$3,$4,false)`,[id(n+1000),targetTenant,id(n),score]);
 await query(`INSERT INTO recording_ingestion(id,tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status,copy_status) VALUES($1,$2,$3,$4,$5,$6,2,'completed','stored')`,[id(n+2000),targetTenant,id(n),sid(n),account,parent]);
 if(intake)await query(`INSERT INTO enrollment_intakes(id,tenant_id,call_id,carrier_key,data) VALUES($1,$2,$3,$4,$5)`,[id(n+3000),targetTenant,id(n),carrierKey(carrier),JSON.stringify({newCarrier:carrier,planName:'Plan',firstName:'Fixture',lastName:'Applicant',state:'NY',contractId:'H1234',planId:'001',segmentId:'0',enrollmentId:'ENR-'+n})]);
}
const api=(identity=admin)=>createComplianceUploadsHandler({authenticate:async()=>identity,getDb:()=>db});
const request=body=>new Request('https://app.test/api/compliance-uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const start=async(identity=admin)=>{const response=await api(identity)(request({action:'run_conversely_now'}));assert.equal(response.status,202,JSON.stringify(await response.clone().json()));return (await response.json()).run_id;};
const history=async()=>{const response=await api()(new Request('https://app.test/api/compliance-uploads'));assert.equal(response.status,200);return (await response.json()).weekly;};
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,agent_name text,call_start timestamptz,call_outcome text,compliance_status text,compliance_scorecard_id uuid,metadata jsonb,product_type text,enrollment_confirmation_number text,carrier_name text);
 CREATE TABLE compliance_scorecards(id uuid,tenant_id uuid,call_id uuid,overall_score numeric,is_thread_composite boolean);
 CREATE TABLE enrollment_intakes(id uuid PRIMARY KEY,tenant_id uuid,call_id uuid,carrier_key text,data jsonb,completed_at timestamptz DEFAULT now(),submitted_at timestamptz DEFAULT now());
 CREATE TABLE recording_ingestion(id uuid,tenant_id uuid,call_record_id uuid,recording_sid text,account_sid text,callback_call_sid text,recording_channels smallint,provider_status text,copy_status text,recording_duration_seconds integer,first_seen_at timestamptz DEFAULT now());
 CREATE TABLE recording_compliance_tickets(token_hash text,tenant_id uuid,recording_id text,minted_by text,format text,storage_path text,account_sid text,recording_sid text,expected_call_sid text,channels integer,created_at timestamptz,expires_at timestamptz);
 CREATE TABLE compliance_missing_codes(tenant_id uuid,call_start timestamptz);
 CREATE TABLE compliance_reconciliation(tenant_id uuid,day date);
 INSERT INTO tenants VALUES('${tenant}','org-a'),('${foreign}','org-b');
 INSERT INTO enrolled_agents VALUES('${agent}','${tenant}','user-a','Agent A',NULL,true),('${mark}','${tenant}','mark-user','Mark Endres',NULL,true),('${excluded}','${tenant}','excluded-user','Agent C',NULL,true),('${id(6)}','${foreign}','foreign-user','Foreign',NULL,true);
 INSERT INTO recording_agent_subjects VALUES('${tenant}','user-a','agent_a'),('${tenant}','mark-user','mark_endres');`);
 await pg.exec(file('123_compliance_uploads.sql'));
 await pg.exec('CREATE TABLE ix_uploads(LIKE conversely_submissions INCLUDING ALL)');
 const migration=file('125_enrollment_intakes.sql'),start=migration.indexOf('CREATE OR REPLACE FUNCTION public.conversely_week_candidates'),end=migration.indexOf('-- Historical rows',start);
 await pg.exec(migration.slice(start,end));
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,call_start,call_outcome) VALUES($1,$2,$3,'2020-01-07T12:00:00Z','enrolled')`,[id(99),tenant,agent]);
 await query(`INSERT INTO conversely_submissions(id,tenant_id,call_id,twilio_recording_sid,enrollment_key,status,uploaded_at) VALUES($1,$2,$3,$4,'legacy','uploaded','2020-01-13T12:00:00Z')`,[id(98),tenant,id(99),sid(99)]);
 await query(`INSERT INTO conversely_weekly_runs(week_start,samples_per_agent,created_at) VALUES('2020-01-06',1,'2020-01-13T12:00:00Z')`);
 await query(`INSERT INTO conversely_weekly_audit(week_start,tenant_id,agent_id,agent_slug,call_id,recording_sid,enrollment_key,eligible,selected,reason,sample_rank,submission_id) VALUES('2020-01-06',$1,$2,'agent_a',$3,$4,'legacy',true,true,'selected',1,$5)`,[tenant,agent,id(99),sid(99),id(98)]);
 await pg.exec(file('127_conversely_manual_runs.sql'));
 await addCall(10,agent,'Aetna',80);await addCall(11,agent,'UnitedHealthcare',95);await addCall(12,mark,'Humana',99);await addCall(13,excluded,'Other',100);await addCall(14,agent,'Aetna',1000,{intake:false});
 await addCall(15,id(6),'Aetna',100,{targetTenant:foreign});
 await db.rpc('heartbeat_conversely_worker',{p_enabled:true});
});
after(()=>pg.close());
test('migration preserves historical successful submissions in weekly slots and run history',async()=>{
 const slots=await query(`SELECT * FROM conversely_week_slots WHERE week_start='2020-01-06'`);assert.equal(slots.length,1);assert.equal(slots[0].submission_id,id(98));
 const [run]=await query(`SELECT * FROM conversely_runs WHERE week_start='2020-01-06'`);assert.ok(run);
 const results=(await db.rpc('conversely_run_results',{p_run:run.id,p_tenant:tenant})).data;assert.equal(results[0].status,'submitted');
});
test('manual requests are admin-only, enabled-worker gated, tenant-scoped, and deduplicate concurrent clicks',async()=>{
 const member={userId:'user-a',orgId:'org-a',tokenPayload:{org_role:'org:member'}};
 assert.equal((await api(member)(request({action:'run_conversely_now',role:'admin'}))).status,403);
 const requests=await Promise.all([start(),start()]);assert.equal(requests[0],requests[1]);
 const [run]=await query('SELECT * FROM conversely_runs WHERE id=$1',[requests[0]]);assert.equal(run.tenant_id,tenant);assert.equal(new Date(run.week_start).toISOString().slice(0,10),week);assert.equal(run.status,'pending');
});
test('worker immediately selects current-week completed intakes, honors rules and sends only one per agent despite larger legacy sample config',async()=>{
 await processManualConverselyRun(db,{env,isPlayable:async()=>true});
 await tick({schedule:false});
 assert.equal(sent.length,1);assert.equal(sent[0].payload.CallID,id(11));assert.equal(sent[0].payload.CarrierName,'UnitedHealthcare');
 const slots=await query('SELECT * FROM conversely_week_slots WHERE week_start=$1 AND tenant_id=$2',[week,tenant]);assert.equal(slots.length,1);assert.equal(slots[0].agent_id,agent);
 await db.rpc('finalize_conversely_runs');
 const result=await history();assert.ok(result.run.started_at);assert.ok(result.run.completed_at);assert.equal(result.run.status,'complete');
 assert.equal(result.results.find(row=>row.agent_id===agent).status,'submitted');
 assert.equal(result.results.find(row=>row.agent_id===mark).status,'skipped');assert.equal(result.results.find(row=>row.agent_id===mark).reason,'agent_contract_excluded');
 assert.equal(result.results.find(row=>row.agent_id===excluded).reason,'carrier_not_sms');assert.equal(result.results.length,3,'never expose or select the other tenant');
});
test('rerun skips a successful agent even when a newer higher-scored enrollment is available',async()=>{
 await addCall(16,agent,'Aetna',100);await start();await processManualConverselyRun(db,{env,isPlayable:async()=>true});await tick({schedule:false});await db.rpc('finalize_conversely_runs');
 assert.equal(sent.length,1);const result=await history();assert.equal(result.results.find(row=>row.agent_id===agent).status,'skipped');assert.equal(result.results.find(row=>row.agent_id===agent).reason,'already_submitted');
});
test('later eligible agents can submit, failures show per-agent, and retries reuse the same job/key without resubmitting successful teammates',async()=>{
 await addCall(17,mark,'Aetna',90);failAgent=mark;const run=await start();await processManualConverselyRun(db,{env,isPlayable:async()=>true});await tick({schedule:false});
 assert.equal(sent.length,2);let result=await history();assert.equal(result.results.find(row=>row.agent_id===mark).status,'failed');assert.equal(result.results.find(row=>row.agent_id===mark).reason,'conversely_http_503');
 assert.equal(await start(),run,'an active delivery run is reused');
 await query(`UPDATE conversely_submissions SET next_attempt_at=now()-interval '1 second' WHERE status='pending'`);failAgent=null;
 await tick({schedule:false});await db.rpc('finalize_conversely_runs');assert.equal(sent.length,3);assert.equal(sent[1].headers['Idempotency-Key'],sent[2].headers['Idempotency-Key']);
 result=await history();assert.equal(result.results.find(row=>row.agent_id===mark).status,'submitted');assert.equal(result.run.status,'complete');
});
test('disabling the worker after a click prevents selection/delivery, and disabled or stale workers reject new requests',async()=>{
 await start();await processManualConverselyRun(db,{env:{CONVERSELY_UPLOAD_ENABLED:'false'},isPlayable:()=>assert.fail('disabled')});
 assert.equal((await history()).run.status,'disabled');assert.equal(sent.length,3);
 await db.rpc('heartbeat_conversely_worker',{p_enabled:false});assert.equal((await api()(request({action:'run_conversely_now'}))).status,409);
 await query(`UPDATE conversely_worker_status SET enabled=true,heartbeat_at=now()-interval '6 minutes'`);assert.equal((await api()(request({action:'run_conversely_now'}))).status,409);
 await db.rpc('heartbeat_conversely_worker',{p_enabled:true});
});
test('selection failure has sanitized per-agent results and no submission',async()=>{
 await start();await processManualConverselyRun(db,{env,isPlayable:async()=>{throw Error('secret arbitrary provider content');}});
 const result=await history();assert.equal(result.run.status,'failed');assert.equal(result.run.last_error,'selection_failed');assert.ok(result.results.every(row=>row.status==='failed'));assert.equal(sent.length,3);
});
test('a previously manual submitted week is not duplicated by automatic selection, and pending slots also remain pinned',async()=>{
 await pg.exec('BEGIN');try{
  const previous=previousConverselyWeek(),when=new Date(previous+'T12:00:00Z').toISOString();await addCall(30,agent,'Aetna',90,{when});
  const [run]=await query(`INSERT INTO conversely_runs(tenant_id,week_start,trigger,status,lease_token) VALUES($1,$2,'manual','selecting',gen_random_uuid()) RETURNING *`,[tenant,previous]);
  const {decisions}=await selectConverselyWeek(db,previous,{env,isPlayable:async()=>true,tenantId:tenant});
  await db.rpc('reserve_conversely_run',{p_id:run.id,p_token:run.lease_token,p_decisions:decisions});
  const [slot]=await query('SELECT * FROM conversely_week_slots WHERE tenant_id=$1 AND week_start=$2',[tenant,previous]);
  await query(`UPDATE conversely_submissions SET status='uploaded',uploaded_at=now() WHERE id=$1`,[slot.submission_id]);
  const before=(await query('SELECT count(*)::integer n FROM conversely_submissions'))[0].n;
  await db.rpc('reserve_conversely_week',{p_week:previous,p_samples:1,p_decisions:decisions});
  assert.equal((await query('SELECT count(*)::integer n FROM conversely_submissions'))[0].n,before);
  const [scheduled]=await query(`SELECT * FROM conversely_runs WHERE tenant_id=$1 AND week_start=$2 AND trigger='scheduled'`,[tenant,previous]);assert.ok(scheduled);
  const results=(await db.rpc('conversely_run_results',{p_run:scheduled.id,p_tenant:tenant})).data;assert.equal(results.find(row=>row.agent_id===agent).reason,'already_submitted');
  assert.equal((await db.rpc('reserve_conversely_week',{p_week:previous,p_samples:1,p_decisions:decisions})).data.length,0);
 }finally{await pg.exec('ROLLBACK');}
});
test('automatic checks run immediately on worker start and at hourly intervals, not at a fixed wall-clock time',async()=>{
 await pg.exec('BEGIN');try{
  let clock=Date.now(),checks=0;const observed={...db,from(table){if(table==='conversely_weekly_runs')checks++;return db.from(table);}};
  const worker=createComplianceWorker(observed,{env,now:()=>clock,log:()=>{},isPlayable:async()=>true});
  await worker({deliveries:false});assert.equal(checks,1);
  clock+=3_599_999;await worker({deliveries:false});assert.equal(checks,1);
  clock++;await worker({deliveries:false});assert.equal(checks,2);
  await createComplianceWorker(observed,{env,now:()=>clock,log:()=>{},isPlayable:async()=>true})({deliveries:false});assert.equal(checks,3);
 }finally{await pg.exec('ROLLBACK');}
});
test('current/previous week boundaries use New York midnight across DST and browser roles cannot invoke manual-run functions',async()=>{
 assert.equal(currentConverselyWeek(Date.parse('2026-11-02T04:59:59Z')),'2026-10-26');assert.equal(currentConverselyWeek(Date.parse('2026-11-02T05:00:00Z')),'2026-11-02');
 await pg.exec('SET ROLE authenticated');try{await assert.rejects(()=>query('SELECT * FROM conversely_runs'),/permission denied/);await assert.rejects(()=>query('SELECT request_conversely_run($1,$2)',[tenant,'forged']),/permission denied/);}finally{await pg.exec('RESET ROLE');}
});

test('delivery rechecks Clerk-ID agent exclusions and allowlist changes before posting any reserved job',async()=>{
 await pg.exec('BEGIN');try{
  const previous=previousConverselyWeek();await addCall(31,agent,'Aetna',90,{when:new Date(previous+'T12:00:00Z').toISOString()});
  const [run]=await query(`INSERT INTO conversely_runs(tenant_id,week_start,trigger,status,lease_token) VALUES($1,$2,'manual','selecting',gen_random_uuid()) RETURNING *`,[tenant,previous]);
  const {decisions}=await selectConverselyWeek(db,previous,{env,isPlayable:async()=>true,tenantId:tenant});
  await db.rpc('reserve_conversely_run',{p_id:run.id,p_token:run.lease_token,p_decisions:decisions});
  const sendsBefore=sent.length;
  await createComplianceWorker(db,{env:{...env,CONVERSELY_AGENT_EXCLUSIONS:JSON.stringify({'user-a':['Aetna']})},send,log:()=>{}})({schedule:false});
  assert.equal(sent.length,sendsBefore);
  let [slot]=await query('SELECT * FROM conversely_week_slots WHERE tenant_id=$1 AND week_start=$2',[tenant,previous]);
  assert.equal((await query('SELECT last_error FROM conversely_submissions WHERE id=$1',[slot.submission_id]))[0].last_error,'agent_contract_excluded');
  await query(`UPDATE conversely_submissions SET next_attempt_at=now()-interval '1 second' WHERE id=$1`,[slot.submission_id]);
  await createComplianceWorker(db,{env:{...env,CONVERSELY_CARRIERS:'Humana'},send,log:()=>{}})({schedule:false});assert.equal(sent.length,sendsBefore);
  assert.equal((await query('SELECT last_error FROM conversely_submissions WHERE id=$1',[slot.submission_id]))[0].last_error,'carrier_not_sms');
 }finally{await pg.exec('ROLLBACK');}
});
