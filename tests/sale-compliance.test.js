import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createScoreCallHandler } from '../netlify/functions/score-call-background.js';
import { generateScorecard } from '../src/compliance/engine/ScorecardGenerator.js';
import { isComplianceSale } from '../src/lib/saleCompliance.js';
import { runTranscriptDispatch } from '../telephony/src/transcripts.js';
import { retryFailedScoring } from '../scripts/post-call/retry-failed-scoring.mjs';

const pg=new PGlite(), db=evidenceDb(pg);
const tenant=randomUUID(),agent=randomUUID(),template=randomUUID(),intent=randomUUID();
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const query=(sql,args=[])=>pg.query(sql,args).then(r=>r.rows);
const record=async id=>(await query('SELECT * FROM call_records WHERE id=$1',[id]))[0];
const segments=[{speaker:'agent',text:'This call is recorded. FULL_AGENT_START',start_ms:0,end_ms:1200},
 {speaker:'customer',text:'I understand. FULL_CUSTOMER_MIDDLE',start_ms:1300,end_ms:2500},
 {speaker:'agent',text:'Your enrollment is complete. FULL_AGENT_END',start_ms:150000,end_ms:160000},
 {speaker:'customer',text:'Thank you. FULL_CUSTOMER_TAIL',start_ms:170000,end_ms:179000}];
let modelCalls=[];
const classify=async(system,user)=>{
 modelCalls.push(user);
 return {detections:[{intent_code:'CALL_OPEN_001_RECORDING_ANNOUNCE',detected:true,confidence:0.99,
  speaker:'agent',evidence_text:'This call is recorded.',sequence_position:1}],risk_indicators:[],sentiment:{}};
};
const worker=createScoreCallHandler({getDb:()=>db,classify,recordStatus:async()=>{}});
async function score(id) {
 return worker(new Request('https://example.test/score',{method:'POST',headers:{'x-enrollgen-job-secret':'sale-test'},
  body:JSON.stringify({callId:id,tenantId:tenant,transcript:'CLIENT PARTIAL MUST BE IGNORED'})}),{});
}
async function newCall({finished=true,diarized=segments}={}) {
 const id=randomUUID();
 await query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,
  call_start,call_end,call_duration_seconds,transcript_raw,transcript_diarized,metadata)
  VALUES($1,$2,$3,'Fixture Agent','inbound','sales','MA',now()-interval '3 minutes',$4,180,$5,$6,$7)`,
 [id,tenant,agent,finished?new Date().toISOString():null,diarized.map(u=>u.speaker+': '+u.text).join('\n'),JSON.stringify(diarized),
  JSON.stringify(finished?{transcript_finalized_at:new Date().toISOString(),transcript_source:'deepgram_server'}:{})]);
 return id;
}
const setOutcome=(id,outcome)=>query('UPDATE call_records SET call_outcome=$2 WHERE id=$1',[id,outcome]);
const due=id=>query("UPDATE transcript_score_dispatch SET available_at=now()-interval '1 second',transcript_ready_at=now()-interval '1 second' WHERE call_id=$1",[id]);
const cardCount=async id=>Number((await query('SELECT count(*) n FROM compliance_scorecards WHERE call_id=$1',[id]))[0].n);
const oldSecret=process.env.SCORE_CALL_JOB_SECRET;
const preExisting=[];
before(async()=>{
 process.env.SCORE_CALL_JOB_SECRET='sale-test';
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 const source=migration('001_compliance_engine.sql');
 for(const table of ['compliance_intents','scoring_templates','scoring_template_items','call_records','intent_detections',
  'compliance_scorecards','scorecard_items','corrective_actions','phi_redactions','agent_compliance_profiles']) {
  const start=source.indexOf('CREATE TABLE IF NOT EXISTS '+table+' (');
  await pg.exec(source.slice(start,source.indexOf('\n);',start)+4));
 }
 await pg.exec(`ALTER TABLE call_records ADD tenant_id uuid, ADD compliance_scorecard_id uuid, ADD transcript_id uuid,
  ADD session_id uuid, ADD twilio_call_sid text, ADD contact_id uuid, ADD call_outcome text;
  ALTER TABLE compliance_scorecards ADD tenant_id uuid;
  CREATE TABLE tenants(id uuid PRIMARY KEY,name text,agency_display_name text);
  CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,name text,clerk_user_id text,is_active boolean);
  CREATE TABLE tenant_agents(tenant_id uuid,clerk_user_id text,agent_slug text,is_active boolean);
  CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,call_record_id uuid);
  CREATE TABLE agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,agency text,is_active boolean);
  CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,call_record_id uuid,ended_at timestamptz);
  CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,parent_call_sid text,agent_id text,
   direction text,created_at timestamptz DEFAULT now(),contact_id uuid,inbound_call_id uuid,call_record_id uuid,
   answered_at timestamptz,ended_at timestamptz,talk_seconds integer);
  CREATE TABLE media_stream_leases(attempt_id uuid,expires_at timestamptz);
  CREATE TABLE call_transcripts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,
   owner_agent_id uuid,call_record_id uuid,session_id uuid,call_date timestamptz,direction text,product_line text,
   transcript_text text,source_system text,source_id text,phi_scrubbed boolean,last_checkpoint_at timestamptz,updated_at timestamptz);
  CREATE TABLE subscriptions(tenant_id uuid PRIMARY KEY,plan text,status text,seat_count integer);
  CREATE TABLE usage_records(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,record_type text,quantity integer,metadata jsonb);
  INSERT INTO subscriptions VALUES('${tenant}','internal','active',99);
  INSERT INTO tenants VALUES('${tenant}','Agency','Agency');
  INSERT INTO enrolled_agents VALUES('${agent}','${tenant}','Fixture Agent','subject',true);
  INSERT INTO tenant_agents VALUES('${tenant}','subject','agent',true);
  INSERT INTO compliance_intents(id,intent_code,intent_name,category,description)
   VALUES('${intent}','CALL_OPEN_001_RECORDING_ANNOUNCE','Recording','opening','Fixture');
  INSERT INTO scoring_templates(id,template_name,product_type,total_possible_points,passing_threshold,categories)
   VALUES('${template}','Fixture','MA',10,80,'{}');
  INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,display_order)
   VALUES('${template}','${intent}','Announce recording','opening',10,1);`);
 const landscape=migration('054_cms_landscape_2027.sql');
 await pg.exec(landscape.slice(landscape.indexOf('CREATE TABLE IF NOT EXISTS public.cms_plans_py2027'),landscape.indexOf('CREATE INDEX')));
 for(const name of ['072_scoring_integrity.sql','084_durable_transcripts.sql','103_resumable_scoring_jobs.sql'])
  await pg.exec(migration(name));
 // Calls that exist before the rollout: one already a sale, one dispositioned as a sale afterwards.
 preExisting.push(await newCall(),await newCall());
 await setOutcome(preExisting[0],'enrolled');
 await pg.exec(migration('110_sale_disposition_compliance.sql'));
 // Reproduce the deployed race before applying the fix: an accepted background
 // delivery advances the retry timer before the scorer starts.
 const stalled=await newCall();await setOutcome(stalled,'enrolled');
 await query("UPDATE transcript_score_dispatch SET available_at=now()+interval '60 seconds' WHERE call_id=$1",[stalled]);
 const before=modelCalls.length;
 assert.equal((await score(stalled)).status,202);
 assert.equal((await record(stalled)).compliance_status,'queued');assert.equal(modelCalls.length,before);
 await setOutcome(stalled,'test_call');
 await pg.exec(migration('113_scoring_dispatch_retry_bounds.sql'));
 await pg.exec(migration('114_manual_scoring_retry.sql'));
});
after(async()=>{ if(oldSecret===undefined)delete process.env.SCORE_CALL_JOB_SECRET;else process.env.SCORE_CALL_JOB_SECRET=oldSecret;await pg.close(); });

const retryArgs=(id,requestId)=>['--call-id',id,'--tenant-id',tenant,...(requestId?
 ['--execute','--request-id',requestId,'--operator','Fixture operator','--reason','Provider issue corrected']:[])];
const retry=(id,requestId)=>retryFailedScoring(retryArgs(id,requestId),{getDb:async()=>db,log:()=>{}});

test('operator recovery dry-run changes nothing; execution rearms exhausted dispatch once and preserves evidence',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 for(let i=0;i<4;i++){
  await runTranscriptDispatch({db,scoringUrl:'https://test/score',secret:'sale-test',transport:async()=>new Response(null,{status:202})});
  if(i<3)await due(id);
 }
 const original=await record(id),dispatch=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(original.compliance_status,'failed');
 assert.equal((await retry(id)).dry_run,true);
 assert.deepEqual(await record(id),original);
 assert.deepEqual((await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0],dispatch);
 assert.equal((await query('SELECT * FROM scoring_manual_retries WHERE call_id=$1',[id])).length,0);
 const requestId=randomUUID();assert.equal((await retry(id,requestId)).status,'queued');
 const reset=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(Number(reset.revision),Number(dispatch.revision)+1);assert.equal(reset.dispatch_attempts,0);
 assert.equal(reset.last_error,null);assert.equal((await record(id)).compliance_status,'queued');
 assert.equal((await record(id)).transcript_raw,original.transcript_raw);
 assert.deepEqual((await record(id)).transcript_diarized,original.transcript_diarized);
 assert.equal((await record(id)).call_outcome,original.call_outcome);
 assert.equal((await retry(id,requestId)).status,'already_requested');
 assert.deepEqual((await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0],reset);
 const audit=(await query('SELECT * FROM scoring_manual_retries WHERE request_id=$1',[requestId]))[0];
 assert.equal(audit.previous_dispatch.dispatch_attempts,3);assert.equal(audit.requested_by,'Fixture operator');
 await due(id);await score(id);assert.equal((await record(id)).compliance_status,'complete');
 assert.equal((await retry(id,randomUUID())).status,'already_complete');assert.equal(await cardCount(id),1);
});

test('operator recovery resets failed job attempts, fences stale tokens and retains cached segments and cumulative token usage',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 const c=await record(id);
 const job=(await db.rpc('begin_scoring_job',{p_call_id:id,p_template_id:template,
  p_transcript:{raw:c.transcript_raw,diarized:c.transcript_diarized,duration:c.call_duration_seconds}})).data;
 await query("INSERT INTO scoring_segment_progress(job_id,segment_index,result) VALUES($1,0,'{\"kept\":true}')",[job.jobId]);
 await query('UPDATE scoring_jobs SET estimated_input_tokens=1234,attempt_count=3 WHERE id=$1',[job.jobId]);
 await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:'Provider unavailable'});
 const before=await record(id);
 assert.equal((await retry(id,randomUUID())).status,'queued');
 const reset=(await query('SELECT * FROM scoring_jobs WHERE id=$1',[job.jobId]))[0];
 assert.equal(reset.attempt_count,0);assert.equal(reset.estimated_input_tokens,1234);
 assert.notEqual(reset.attempt_token,job.attemptToken);assert.equal(reset.error,null);
 assert.deepEqual((await query('SELECT result FROM scoring_segment_progress WHERE job_id=$1',[job.jobId]))[0].result,{kept:true});
 const audit=(await query('SELECT * FROM scoring_manual_retries WHERE call_id=$1',[id]))[0];
 assert.equal(audit.previous_jobs[0].attempt_count,3);assert.equal(audit.previous_jobs[0].error,'Provider unavailable');
 assert.equal((await record(id)).transcript_raw,before.transcript_raw);
 assert.equal((await record(id)).metadata.scoring_error,undefined);
 assert.equal((await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:'stale worker'})).data,false);
 await due(id);
 const resumed=(await db.rpc('begin_scoring_job',{p_call_id:id,p_template_id:template,
  p_transcript:{raw:c.transcript_raw,diarized:c.transcript_diarized,duration:c.call_duration_seconds}})).data;
 assert.equal(resumed.status,'claimed');assert.equal(resumed.attemptCount,1);
 assert.equal(resumed.jobId,job.jobId);assert.notEqual(resumed.attemptToken,job.attemptToken);
 assert.equal((await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:'late old worker'})).data,false);
 await setOutcome(id,'test_call');
});

test('operator recovery refuses active workers, non-sales, queued calls, wrong tenants and token budget resets',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 await assert.rejects(retry(id,randomUUID()),/not failed/);
 const c=await record(id);
 const job=(await db.rpc('begin_scoring_job',{p_call_id:id,p_template_id:template,
  p_transcript:{raw:c.transcript_raw,diarized:c.transcript_diarized,duration:c.call_duration_seconds}})).data;
 await assert.rejects(retry(id,randomUUID()),/still active/);
 await query("UPDATE scoring_jobs SET lease_until=now()-interval '1 second',status='failed',estimated_input_tokens=500001 WHERE id=$1",[job.jobId]);
 await assert.rejects(retry(id,randomUUID()),/token budget exhausted/);
 const wrongTenant=retryArgs(id,randomUUID());wrongTenant[3]=randomUUID();
 await assert.rejects(retryFailedScoring(wrongTenant,{getDb:async()=>db,log:()=>{}}),/unavailable for this tenant/);
 await setOutcome(id,'test_call');await assert.rejects(retry(id,randomUUID()),/not eligible/);
 assert.equal((await query('SELECT * FROM scoring_manual_retries WHERE call_id=$1',[id])).length,0);
});

test('recovery CLI refuses execution without audit arguments before connecting to a database',async()=>{
 await assert.rejects(retryFailedScoring(['--call-id',randomUUID(),'--tenant-id',tenant,'--execute'],{
  getDb:()=>assert.fail('must not connect'),log:()=>{},
 }),/requires --request-id/);
});

test('Netlify 202 returns before scoring starts; retry scheduling cannot block the job claim',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 let accepted;
 await runTranscriptDispatch({db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:async(url,init)=>{
  accepted=new Request(url,init);
  // Netlify returns acceptance without executing the handler yet.
  return new Response(null,{status:202});
 }});
 const dispatch=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(dispatch.dispatch_attempts,1);assert.ok(new Date(dispatch.available_at)>new Date());
 assert.equal((await worker(accepted,{})).status,200);
 assert.equal((await record(id)).compliance_status,'complete');assert.equal(await cardCount(id),1);
});

for(const transportFails of [false,true])test(`dispatch stops after three ${transportFails?'transport failures':'accepted jobs that never claim'}; content changes reset the budget`,async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);let deliveries=0;
 const options={db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:async()=>{
  deliveries++;if(transportFails)throw Error('offline');return new Response(null,{status:202});
 }};
 for(let i=0;i<3;i++){
  await runTranscriptDispatch(options);
  await runTranscriptDispatch(options); // A second worker cannot claim the same delivery.
  assert.equal(deliveries,i+1);await due(id);
 }
 await runTranscriptDispatch(options);assert.equal(deliveries,3);
 let d=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(d.delivered_revision,d.revision);assert.equal(d.last_error,'scoring_attempts_exhausted');
 assert.equal((await record(id)).compliance_status,'failed');
 // Reconciliation and unrelated metadata writes must not revive exhausted work.
 await query("UPDATE call_records SET metadata=metadata||'{\"unrelated\":true}' WHERE id=$1",[id]);
 await runTranscriptDispatch(options);assert.equal(deliveries,3);
 await query("UPDATE call_records SET transcript_raw=transcript_raw||' new final' WHERE id=$1",[id]);
 d=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(d.dispatch_attempts,0);assert.equal(d.last_error,null);
 await due(id);await score(id);assert.equal((await record(id)).compliance_status,'complete');
});

test('active scoring lease suppresses redelivery without consuming the dispatch budget',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 const c=await record(id);
 const claimed=(await db.rpc('begin_scoring_job',{p_call_id:id,p_template_id:template,
  p_transcript:{raw:c.transcript_raw,diarized:c.transcript_diarized,duration:c.call_duration_seconds}})).data;
 assert.equal(claimed.status,'claimed');
 await runTranscriptDispatch({db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:()=>assert.fail('active job cannot redeliver')});
 const d=(await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id]))[0];
 assert.equal(d.dispatch_attempts,0);assert.ok(new Date(d.available_at)>new Date());
 await setOutcome(id,'test_call');
});

test('subscription failures before job creation are logged and cannot dispatch forever',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);
 const before=modelCalls.length;let deliveries=0;
 await query("UPDATE subscriptions SET plan='pro',status='canceled' WHERE tenant_id=$1",[tenant]);
 try{
  const options={db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:async(url,init)=>{
   deliveries++;
   const response=await worker(new Request(url,init),{});
   assert.equal(response.status,503);assert.equal((await response.json()).code,'scoring_subscription_blocked');
   return new Response(null,{status:202});
  }};
  for(let i=0;i<3;i++){await runTranscriptDispatch(options);await due(id);}
  await runTranscriptDispatch(options);await runTranscriptDispatch(options);
  assert.equal(deliveries,3);assert.equal(modelCalls.length,before);
  assert.equal((await record(id)).compliance_status,'failed');
  assert.equal((await query('SELECT * FROM scoring_jobs WHERE call_id=$1',[id])).length,0);
 }finally{await query("UPDATE subscriptions SET plan='internal',status='active' WHERE tenant_id=$1",[tenant]);}
});

for(const outcome of ['enrolled','enrolled_pending_verification']) {
 test(`${outcome} queues and scores the full stored transcript exactly once`,async()=>{
  const id=await newCall();
  assert.equal((await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id])).length,0);
  await setOutcome(id,outcome);
  assert.equal((await record(id)).compliance_status,'queued');
  // Respect the final-transcript settling window, even for a direct worker invocation.
  const before=modelCalls.length;
  assert.equal((await score(id)).status,202); assert.equal(modelCalls.length,before);
  await due(id);
  assert.equal((await score(id)).status,200);
  const c=await record(id);assert.ok(c.compliance_run_at);assert.ok(c.compliance_transcript_hash);
  assert.equal(c.compliance_status,'complete');assert.equal(await cardCount(id),1);
  const prompts=modelCalls.slice(before).join('\n');
  for(const text of ['FULL_AGENT_START','FULL_CUSTOMER_MIDDLE','FULL_AGENT_END','FULL_CUSTOMER_TAIL'])assert.ok(prompts.includes(text),text);
  assert.ok(!prompts.includes('CLIENT PARTIAL MUST BE IGNORED'));
  const calls=modelCalls.length;
  assert.equal((await score(id)).status,200);assert.equal(modelCalls.length,calls);assert.equal(await cardCount(id),1);
 });
}

test('calls that existed before the rollout are never queued or scored, even when a sale disposition is saved',async()=>{
 const before=modelCalls.length;
 await setOutcome(preExisting[0],'enrolled');await setOutcome(preExisting[1],'enrolled_pending_verification');
 await query(`UPDATE call_records SET metadata=metadata||'{"touched":true}' WHERE id=ANY($1)`,[preExisting]);
 for(const id of preExisting){
  const c=await record(id);assert.equal(c.compliance_eligible,false);assert.equal(c.compliance_requested_at,null);assert.equal(c.compliance_status,'not_requested');
  assert.equal((await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id])).length,0);
  assert.equal((await (await score(id)).json()).skipped,true);
 }
 assert.equal(modelCalls.length,before);
 assert.equal((await record(await newCall())).compliance_eligible,true);
});

test('every non-sale disposition, including ancillary sales and partial enrollment, cannot queue or score',async()=>{
 const outcomes=[null,'not_enrolled','incomplete','partial_enrollment','sale_ancillary','callback_scheduled','interested_needs_info',
  'spouse_poa_callback','transferred','application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
  'customer_hung_up','short_call_hangup','do_not_call','requested_removal','no_answer','voicemail_left','wrong_number','bad_lead_data',
  'language_barrier','mentally_unfit','possible_cognitive_impairment','third_party_needed','hostile_caller','suspected_fraud',
  'dropped_call','test_call','duplicate_lead'];
 const calls=modelCalls.length;
 for(const outcome of outcomes){
  assert.equal(isComplianceSale(outcome),false);
  const id=await newCall();await setOutcome(id,outcome);
  assert.equal((await query('SELECT * FROM transcript_score_dispatch WHERE call_id=$1',[id])).length,0,outcome);
  assert.equal((await (await score(id)).json()).skipped,true,outcome);
  const lower=await generateScorecard({supabase:db,callRecord:await record(id),callLLM:()=>{throw Error('must not classify');}});
  assert.equal(lower.skipped,true,outcome);
  assert.equal(await cardCount(id),0);
 }
 assert.equal(modelCalls.length,calls);
});

test('sale re-disposition and duration-only edits reuse the transcript hash; a changed transcript gets one new result',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);await score(id);
 const first=await record(id),calls=modelCalls.length;
 for(const outcome of ['enrolled_pending_verification','enrolled','enrolled_pending_verification']){
  await setOutcome(id,outcome);await query('UPDATE call_records SET call_duration_seconds=call_duration_seconds+1 WHERE id=$1',[id]);
  await score(id);
  assert.equal((await record(id)).compliance_transcript_hash,first.compliance_transcript_hash);
 }
 assert.equal(modelCalls.length,calls);assert.equal(await cardCount(id),1);
 const revised=[...segments,{speaker:'customer',text:'A late customer final.',start_ms:180000,end_ms:181000}];
 await query('UPDATE call_records SET transcript_diarized=$2,transcript_raw=transcript_raw||$3 WHERE id=$1',
  [id,JSON.stringify(revised),'\nCUSTOMER: A late customer final.']);
 await due(id);await score(id);await score(id);
 assert.notEqual((await record(id)).compliance_transcript_hash,first.compliance_transcript_hash);
 assert.equal(await cardCount(id),2);
});

test('sale before transcript completion stays queued and runs when final stored dual-channel evidence lands',async()=>{
 const id=await newCall({finished:false,diarized:[]});await setOutcome(id,'enrolled_pending_verification');
 assert.equal((await record(id)).compliance_status,'transcript_pending');
 const before=modelCalls.length;
 assert.equal((await score(id)).status,202);assert.equal(modelCalls.length,before);
 const jobs=await query('SELECT * FROM get_sale_compliance_dispatch()');assert.ok(!jobs.some(j=>j.call_id===id));
 await query(`UPDATE call_records SET call_end=now(),transcript_raw=$2,transcript_diarized=$3,
  metadata=jsonb_build_object('transcript_finalized_at',now()) WHERE id=$1`,
 [id,segments.map(u=>u.speaker+': '+u.text).join('\n'),JSON.stringify(segments)]);
 await due(id);
 const dispatched=[];
 await runTranscriptDispatch({db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:async(url,init)=>{
  const body=JSON.parse(init.body);dispatched.push(body.callId);
  return worker(new Request(url,init),{});
 }});
 assert.ok(dispatched.includes(id));assert.equal(await cardCount(id),1);
 await runTranscriptDispatch({db,scoringUrl:'https://example.test/score',secret:'sale-test',transport:()=>{throw Error('must not dispatch again');}});
 assert.equal(await cardCount(id),1);
});

test('sale to non-sale retains existing results and flags dispo changed; reverting to sale reuses them',async()=>{
 const id=await newCall();await setOutcome(id,'enrolled');await due(id);await score(id);
 const first=await record(id),calls=modelCalls.length;
 await setOutcome(id,'not_interested');
 const changed=await record(id);
 assert.equal(changed.compliance_scorecard_id,first.compliance_scorecard_id);
 assert.equal(changed.compliance_status,'dispo_changed');assert.ok(changed.compliance_dispo_changed_at);
 assert.equal(await cardCount(id),1);await score(id);assert.equal(modelCalls.length,calls);
 await setOutcome(id,'enrolled_pending_verification');await score(id);
 assert.equal((await record(id)).compliance_status,'complete');assert.equal((await record(id)).compliance_dispo_changed_at,null);
 assert.equal(modelCalls.length,calls);assert.equal(await cardCount(id),1);
});

test('canceling a transcript-pending sale suppresses late transcript dispatch',async()=>{
 const id=await newCall({finished:false});await setOutcome(id,'enrolled');await setOutcome(id,'callback_scheduled');
 await query("UPDATE call_records SET call_end=now(),metadata=jsonb_build_object('transcript_finalized_at',now()) WHERE id=$1",[id]);
 await due(id);await pg.exec('SELECT reconcile_telephony_transcripts()');
 assert.ok(!(await query('SELECT * FROM get_sale_compliance_dispatch()')).some(j=>j.call_id===id));
 assert.equal((await record(id)).compliance_status,'not_requested');assert.equal(await cardCount(id),0);
});

test('an open call or media stream keeps a sale pending; an interrupted sale cannot commit a new score',async()=>{
 const id=await newCall(),attempt=randomUUID();
 await query("INSERT INTO telephony_call_attempts(id,call_record_id,direction) VALUES($1,$2,'outbound')",[attempt,id]);
 await setOutcome(id,'enrolled');await due(id);assert.equal((await score(id)).status,202);
 await query('UPDATE telephony_call_attempts SET ended_at=now() WHERE id=$1',[attempt]);
 await query("INSERT INTO media_stream_leases VALUES($1,now()+interval '1 minute')",[attempt]);
 await pg.exec('SELECT reconcile_telephony_transcripts()');await due(id);assert.equal((await score(id)).status,202);
 await query('DELETE FROM media_stream_leases WHERE attempt_id=$1',[attempt]);
 await pg.exec('SELECT reconcile_telephony_transcripts()');await due(id);
 let flipped=false;
 const result=await generateScorecard({supabase:db,callRecord:await record(id),callLLM:async(...args)=>{
  if(!flipped){flipped=true;await setOutcome(id,'not_interested');}return classify(...args);
 }});
 assert.equal(result.skipped,true);assert.equal(await cardCount(id),0);
});

test('only service roles can inspect the compliance dispatch queue or call scoring RPCs',async()=>{
 for(const role of ['anon','authenticated']){
  await pg.exec('SET ROLE '+role);
  await assert.rejects(pg.query('SELECT * FROM get_sale_compliance_dispatch()'),/permission denied/);
  await assert.rejects(pg.query('SELECT * FROM transcript_score_dispatch'),/permission denied/);
  await assert.rejects(pg.query('SELECT * FROM scoring_manual_retries'),/permission denied/);
  await assert.rejects(pg.query('SELECT retry_failed_scoring($1,$2,$3,$4,$5,false)',[randomUUID(),tenant,randomUUID(),'reason','operator']),/permission denied/);
  await pg.exec('RESET ROLE');
 }
});
