import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {converselyConfiguration,canonicalCarrier,carrierEligibility,selectWeeklySamples,previousConverselyWeek} from '../integrations/converselySelection.js';
import {createComplianceWorker,scheduleConverselyWeek,playableMp3} from '../integrations/complianceUploads.js';
const pg=new PGlite(),base=evidenceDb(pg);
const db={...base,rpc:(name,args={})=>base.rpc(name,name==='reserve_conversely_week'?{...args,p_decisions:JSON.stringify(args.p_decisions)}:args)};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),agent=id(2),mark=id(3),empty=id(4);
const account='AC'+'a'.repeat(32),parent='CA'+'b'.repeat(32),sid=n=>'RE'+String(n).padStart(32,'0');
const now=()=>Date.parse('2026-10-27T16:00:00Z');
const env={CONVERSELY_UPLOAD_ENABLED:'true',CONVERSELY_API_KEY:'secret',TELEPHONY_BASE_URL:'https://audio.test'};
const query=(sql,args=[])=>pg.query(sql,args);
async function addCall(n,owner,carrier,score,time,{status='complete',recording=true}={}){
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_outcome,carrier_name,call_start,compliance_status,compliance_scorecard_id,metadata)
 VALUES($1,$2,$3,'Agent','enrolled',$4,$5,$6,$7,'{}')`,[id(n),tenant,owner,carrier,time,status,id(n+100)]);
 if(score!=null)await query('INSERT INTO compliance_scorecards VALUES($1,$2,$3,$4,false)',[id(n+100),tenant,id(n),score]);
 if(recording)await query(`INSERT INTO recording_ingestion(id,tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status,copy_status,recording_duration_seconds)
 VALUES($1,$2,$3,$4,$5,$6,2,'completed','stored',120)`,[id(n+200),tenant,id(n),sid(n),account,parent]);
}
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,is_active boolean,name text);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,agent_name text,call_outcome text,carrier_name text,call_start timestamptz,
 compliance_status text,compliance_scorecard_id uuid,enrollment_confirmation_number text,metadata jsonb);
 CREATE TABLE compliance_scorecards(id uuid,tenant_id uuid,call_id uuid,overall_score numeric,is_thread_composite boolean);
 CREATE TABLE recording_ingestion(id uuid,tenant_id uuid,call_record_id uuid,recording_sid text,account_sid text,callback_call_sid text,recording_channels smallint,
 provider_status text,copy_status text,recording_duration_seconds integer,first_seen_at timestamptz DEFAULT now());
 CREATE TABLE recording_compliance_tickets(token_hash text,tenant_id uuid,recording_id text,minted_by text,format text,storage_path text,account_sid text,recording_sid text,
 expected_call_sid text,channels smallint,created_at timestamptz,expires_at timestamptz);
 INSERT INTO tenants VALUES('${tenant}');
 INSERT INTO enrolled_agents(id,tenant_id,clerk_user_id,is_active) VALUES('${agent}','${tenant}','ordinary',true),('${mark}','${tenant}','mark-subject',true),('${empty}','${tenant}','empty',true);
 INSERT INTO recording_agent_subjects VALUES('${tenant}','mark-subject','mark_endres');`);
 await pg.exec(readFileSync(new URL('../supabase/migrations/123_compliance_uploads.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../supabase/migrations/127_conversely_manual_runs.sql',import.meta.url),'utf8'));
 await addCall(10,agent,'Aetna',80,'2026-10-20T16:00:00Z');
 await addCall(11,agent,'UHC',95,'2026-10-21T16:00:00Z');
 await addCall(12,agent,'Devoted Health',95,'2026-10-23T16:00:00Z');
 await addCall(13,agent,'Unmatched Carrier',100,'2026-10-24T16:00:00Z');
 await addCall(14,agent,'Aetna',100,'2026-10-25T16:00:00Z',{status:'failed'});
 await addCall(15,agent,'Aetna',100,'2026-10-25T17:00:00Z',{recording:false});
 await addCall(16,mark,'Humana',100,'2026-10-24T16:00:00Z');
});
after(()=>pg.close());
test('carrier aliases match case-insensitively; unlisted names and restricted allowlists fail closed',()=>{
 for(const name of ['UnitedHealthcare','uhc','UNITED HEALTHCARE','AARP Medicare Advantage'])assert.equal(canonicalCarrier(name),'UnitedHealthcare');
 for(const [alias,carrier] of [['Devoted Health','Devoted'],['Centene','WellCare'],['Wellcare by Allwell','WellCare'],['Zing Health','Zing'],['Elevance','Anthem'],['Anthem Blue Cross','Anthem'],['Aetna Medicare','Aetna'],['CVS','Aetna'],['Cigna','HealthSpring'],['Cigna HealthSpring','HealthSpring'],['Humana','Humana']])assert.equal(canonicalCarrier(alias),carrier);
 assert.equal(carrierEligibility({carrier_name:'Unknown'},converselyConfiguration()),'carrier_not_sms');
 assert.equal(carrierEligibility({carrier_name:'Humana'},converselyConfiguration({CONVERSELY_CARRIERS:'uhc,Devoted Health'})),'carrier_not_sms');
 assert.throws(()=>converselyConfiguration({CONVERSELY_CARRIERS:'Unknown'}));
});
test('Humana exception uses configurable agent identifiers, never an agent name comparison',()=>{
 const config=converselyConfiguration();
 assert.equal(carrierEligibility({agent_slug:'mark_endres',agent_name:'Any Display Name',carrier_name:'Humana'},config),'agent_contract_excluded');
 assert.equal(carrierEligibility({agent_slug:'different',agent_name:'Mark Endres',carrier_name:'Humana'},config),null);
 assert.equal(carrierEligibility({agent_id:'custom-agent',carrier_name:'CVS'},converselyConfiguration({CONVERSELY_AGENT_EXCLUSIONS:'{"custom-agent":["Aetna"]}'})),'agent_contract_excluded');
});
test('last closed ET week handles Monday boundaries and daylight saving',()=>{
 assert.equal(previousConverselyWeek(now()),'2026-10-19');
 assert.equal(previousConverselyWeek(Date.parse('2026-10-26T03:59:59Z')),'2026-10-12');
 assert.equal(previousConverselyWeek(Date.parse('2026-10-26T04:00:00Z')),'2026-10-19');
 assert.equal(previousConverselyWeek(Date.parse('2026-11-02T05:00:00Z')),'2026-10-26');
});
test('sampling count is configurable and highest-score ties choose the newest call',()=>{
 const calls=[80,95,95].map((score,i)=>({tenant_id:tenant,agent_id:agent,call_id:id(i),carrier_name:'UHC',score,call_start:`2026-10-${20+i}T16:00:00Z`,compliance_status:'complete',playable:true}));
 assert.deepEqual(selectWeeklySamples(calls,converselyConfiguration()).filter(row=>row.selected).map(row=>row.call_id),[id(2)]);
 assert.deepEqual(selectWeeklySamples(calls,converselyConfiguration({CONVERSELY_SAMPLES_PER_AGENT:'2'})).filter(row=>row.selected).sort((a,b)=>a.sample_rank-b.sample_rank).map(row=>row.call_id),[id(2),id(1)]);
 for(const value of ['0','-1','NaN','1.5'])assert.throws(()=>converselyConfiguration({CONVERSELY_SAMPLES_PER_AGENT:value}));
});
test('disabled sampling does not reserve a run or create jobs',async()=>{
 await scheduleConverselyWeek(db,{env:{},now,isPlayable:()=>assert.fail()});
 assert.equal((await query('SELECT * FROM conversely_weekly_runs')).rows.length,0);
 assert.equal((await query('SELECT * FROM conversely_submissions')).rows.length,0);
});
test('weekly run persists one highest-score MP3 sample per eligible agent and logs every decision',async()=>{
 const logs=[];const options={env,now,log:line=>logs.push(JSON.parse(line)),isPlayable:async row=>!!row.recording_sid};
 await scheduleConverselyWeek(db,options);await scheduleConverselyWeek(db,options);
 const jobs=(await query('SELECT * FROM conversely_submissions')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].call_id,id(12));
 const audit=logs.filter(row=>row.event==='conversely_weekly_selection');
 assert.equal(audit.filter(row=>row.eligible).length,3);
 assert.equal(audit.find(row=>row.call_id===id(13)).reason,'carrier_not_sms');
 assert.equal(audit.find(row=>row.call_id===id(14)).reason,'score_incomplete');
 assert.equal(audit.find(row=>row.call_id===id(15)).reason,'recording_unplayable');
 assert.equal(audit.find(row=>row.call_id===id(16)).reason,'agent_contract_excluded');
 assert.ok(audit.some(row=>row.agent_id===mark && row.reason==='no_eligible_calls'));
 assert.ok(audit.some(row=>row.agent_id===empty && row.reason==='no_eligible_calls'));
 assert.equal(logs.filter(row=>row.event==='conversely_weekly_run').length,1);
});
test('delivery uses MP3-suffixed bearer URL, fresh retry tickets and stable idempotency key, then never duplicates success',async()=>{
 await pg.exec(`CREATE TABLE enrollment_intakes(id text,tenant_id uuid,call_id uuid,data jsonb,submitted_at timestamptz DEFAULT now(),completed_at timestamptz DEFAULT now());
 INSERT INTO enrollment_intakes(id,tenant_id,call_id,data) SELECT enrollment_key,tenant_id,call_id,'{"newCarrier":"Devoted Health","planName":"Test Plan"}'::jsonb FROM conversely_submissions;`);
 const sent=[];const tick=createComplianceWorker(db,{env,now,log:()=>{},send:async(url,body,headers)=>{sent.push({url,payload:JSON.parse(body),headers});return {status:sent.length===1?503:200};}});
 await tick({schedule:false});await tick({schedule:false});assert.equal(sent.length,1);
 await query(`UPDATE conversely_submissions SET next_attempt_at=now()-interval '1 minute'`);
 await tick({schedule:false});await tick({schedule:false});assert.equal(sent.length,2);
 assert.match(sent[0].payload.RecordingPath,/\/api\/recordings\/conversly\/[\w-]{43}\.mp3$/);
 assert.equal(sent[0].payload.Target,'New Gen Health Solutions');assert.equal(Object.keys(sent[0].payload).length,25);
 assert.notEqual(sent[0].payload.RecordingPath,sent[1].payload.RecordingPath);
 assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
 assert.ok((await query('SELECT * FROM recording_compliance_tickets')).rows.every(row=>row.format==='mp3' && !row.storage_path));
 assert.equal((await query('SELECT status FROM conversely_submissions')).rows[0].status,'uploaded');
});
test('playability probes Twilio MP3 with a bounded range and rejects unavailable recordings',async()=>{
 const candidate={account_sid:account,recording_sid:sid(10),recording_channels:2};
 assert.equal(await playableMp3(candidate,{env:{TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'secret'},fetchImpl:async(url,options)=>{
  assert.match(url,/\.mp3\?/);assert.equal(options.headers.Range,'bytes=0-0');return new Response('x',{status:206,headers:{'Content-Type':'audio/mpeg'}});
 }}),true);
 assert.equal(await playableMp3(candidate,{env:{TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'secret'},fetchImpl:async()=>new Response(null,{status:404})}),false);
});
test('retry lease ownership, exponential delay, five-attempt exhaustion and RLS are shared',async()=>{
 await query(`INSERT INTO conversely_submissions(tenant_id,call_id,twilio_recording_sid,enrollment_key) VALUES($1,$2,$3,'retry-test')`,[tenant,id(10),sid(10)]);
 let job;
 for(let attempt=1;attempt<=5;attempt++){
  job=(await db.rpc('claim_compliance_upload',{p_provider:'conversely'})).data[0];assert.equal(job.attempts,attempt);
  await db.rpc('finish_compliance_upload',{p_provider:'conversely',p_id:job.id,p_token:id(99),p_success:true});
  assert.equal((await query('SELECT status FROM conversely_submissions WHERE id=$1',[job.id])).rows[0].status,'uploading');
  await db.rpc('finish_compliance_upload',{p_provider:'conversely',p_id:job.id,p_token:job.lease_token,p_success:false,p_error:'provider_error'});
  const row=(await query('SELECT *,extract(epoch FROM(next_attempt_at-updated_at))::integer AS delay FROM conversely_submissions WHERE id=$1',[job.id])).rows[0];assert.equal(row.delay,60*2**(attempt-1));
  await query(`UPDATE conversely_submissions SET next_attempt_at=now()-interval '1 minute' WHERE id=$1`,[job.id]);
 }
 assert.equal((await db.rpc('claim_compliance_upload',{p_provider:'conversely'})).data.length,0);
 assert.equal((await query('SELECT status FROM conversely_submissions WHERE id=$1',[job.id])).rows[0].status,'failed');
 await pg.exec('SET ROLE authenticated');try{await assert.rejects(()=>query('SELECT * FROM conversely_submissions'),/permission denied/);}finally{await pg.exec('RESET ROLE');}
});
