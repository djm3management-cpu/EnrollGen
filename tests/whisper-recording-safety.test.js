import {featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {whisperFixture,env,id,settings} from './helpers/supervisorWhisperFixture.js';
import {conferenceRuntime} from '../telephony/src/conferenceRuntime.js';
import {outsideRecordings,whisperCustomerRecordings,assertWhisperRecordingSafe,whisperChannelUtterances} from '../telephony/src/lib/whisperRecording.js';
import {recordingComplianceGrant} from '../integrations/recordingComplianceGrant.js';
import {uploadIx} from '../integrations/ixUploads.js';
import {createComplianceWorker,playableMp3} from '../integrations/complianceUploads.js';
import {createTranscribeHandler} from '../netlify/functions/transcribe.js';
import {transcribeAudio,createIntelligenceBackfillHandler} from '../netlify/functions/backfill-deepgram-intelligence.js';
import {createGapFillHandler} from '../netlify/functions/transcript-gaps-background.js';
import {loadRecordingPlan,recoverBeforeScoring} from '../netlify/lib/transcriptRecovery.js';
import {createRecordingComplianceHandler} from '../telephony/src/recordingCompliance.js';
import {whisperPacketEvidence,buildLifecyclePacket,packetFileIndex} from '../netlify/lib/lifecycle/packet.js';
import {conferencePlayback} from '../netlify/functions/_conferencePlayback.js';
import {mergeRecordingWavs,readRecordingWav} from '../src/lib/mergedRecording.js';
import {recordingWav} from './helpers/recordingWav.js';
import {evaluateAlerts} from '../integrations/alerts.js';
import {dispositionPayload,csvReport} from '../integrations/payloads.js';
import {allowlistedGhlPayload} from '../src/lib/ghlFields.js';
import {reportCsv} from '../netlify/functions/paragon-vendor-report.js';
import {createComplianceUploadsHandler} from '../netlify/functions/compliance-uploads.js';
const account=settings.twilioAccountSid,customerSid='RE'+'1'.repeat(32),agentSid='RE'+'2'.repeat(32);
const time='2026-11-15T12:00:00Z';
const audio=recordingWav(),array=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
let f;
before(async()=>{f=await whisperFixture();});after(async()=>{await f?.pg.close();});
beforeEach(async()=>{f.resetProvider();await f.pg.exec('BEGIN');});
afterEach(async()=>{conferenceRuntime.whisper=null;await f.pg.exec('ROLLBACK;SET ROLE service_role');f.states.clear();f.timers.clear();});
async function call(){return (await f.q('SELECT * FROM call_records WHERE id=$1',[f.C]))[0];}
async function seed({customer=true}={}){
 await f.start();
 await f.q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders({...env,TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true',TRANSCRIPT_GAP_FILL_ENABLED:'true',CONVERSELY_UPLOAD_ENABLED:'true'}))]);
 await f.q("INSERT INTO contacts(id,tenant_id) VALUES($1,$2)",[id(88),f.T]);
 await f.q("INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,pii_encrypted,data,carrier_key) VALUES($1,$2,$3,'"+id(88)+"','{}',$4,'UnitedHealthcare')",[id(89),f.T,f.C,{newCarrier:'UHC',planName:'Synthetic',firstName:'Synthetic',lastName:'Applicant',phone:'2125550101',state:'NY',zip:'10001',effectiveDate:'2027-01-01',sunfireCode:'synthetic',enrollmentId:'synthetic',contractId:'H1234',planId:'001'}]);
 await f.q("UPDATE call_records SET call_start=$1,call_end=$1::timestamptz+interval '1 second',call_duration_seconds=1,transcript_diarized='[]',call_outcome='enrolled' WHERE id=$2",[time,f.C]);
 const participants=await f.q("SELECT * FROM call_participants WHERE call_id=$1 AND role IN ('customer','agent')",[f.C]);
 const rows={};
 for(const p of participants){
  const sid=p.role==='customer'?customerSid:agentSid;
  await f.q('UPDATE call_participants SET recording_sid=$1 WHERE id=$2',[sid,p.id]);
  if(p.role==='customer'&&!customer)continue;
  const r=await f.db.rpc('enqueue_conference_recording',{p_participant_id:p.id,p_callback:{CallSid:p.twilio_call_sid,AccountSid:account,RecordingSid:sid,RecordingStatus:'completed',RecordingChannels:'2',RecordingDuration:'1',RecordingStartTime:time,RecordingSource:'StartCallRecordingAPI',RecordingUrl:`https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${sid}`}});
  assert.ifError(r.error);rows[p.role]=(await f.q('SELECT * FROM recording_ingestion WHERE id=$1',[r.data]))[0];
 }
 return {...rows,call:await call(),participants};
}
const identity=()=>({admin:true,tenant:{id:f.T},auth:{userId:f.who(0).sub}});
const auth=(n=0)=>({userId:f.who(n).sub,orgId:f.who(n).org_id,sessionId:f.who(n).sid});
const request=(body,url='https://app.test/api/transcribe')=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const result=()=>({results:{channels:[{alternatives:[{transcript:'customer words',words:[]}]}],utterances:[{channel:0,speaker:0,transcript:'customer words',start:0,end:.001},{channel:1,speaker:7,transcript:'agent words',start:.001,end:.002}]},metadata:{duration:1}});

test('service attribution selects only the exact customer CallSid and RecordingSid, independent of outbound direction',async()=>{
 const s=await seed();const safe=await outsideRecordings(f.db,s.call,[s.agent,s.customer]);
 assert.deepEqual(safe.map(r=>r.id),[s.customer.id]);assert.equal(safe[0].callback_call_sid,f.child);
 assert.throws(()=>assertWhisperRecordingSafe(s.call,s.agent,safe),/cannot be transcribed/);
 assert.doesNotThrow(()=>assertWhisperRecordingSafe(s.call,s.customer,safe));
 for(const sql of ["UPDATE recording_ingestion SET recording_source='Conference' WHERE id=$1","UPDATE recording_ingestion SET callback_call_sid='CAcccccccccccccccccccccccccccccccc' WHERE id=$1","UPDATE recording_ingestion SET recording_channels=1 WHERE id=$1"]){
  await f.pg.exec('SAVEPOINT invalid_source');await f.q(sql,[s.customer.id]);assert.deepEqual(await whisperCustomerRecordings(f.db,s.call),[]);await f.pg.exec('ROLLBACK TO SAVEPOINT invalid_source');
 }
});
test('reviewer links requested for the agent leg mint only a customer ticket',async()=>{
 const s=await seed();const grant=await recordingComplianceGrant(f.db,identity(),s.agent,{env,format:'mp3'});
 assert.match(grant.url,/\.mp3$/);const [ticket]=await f.q('SELECT * FROM recording_compliance_tickets');
 assert.equal(ticket.recording_sid,customerSid);assert.equal(ticket.recording_id,s.customer.id);assert.equal(ticket.expected_call_sid,f.child);
});
test('carrier register, stream PUT, saved registration and finalize contain only the customer leg',async()=>{
 const s=await seed(),requests=[];let state;
 const client={environment:'test',register:async body=>{requests.push(body);return {callRecordingId:id(91),recordingUploads:body.callMetadata.recordings.map(r=>({filename:r.filename,presignedUrl:'https://bucket.s3.amazonaws.com/customer',expiresAt:'2099-01-01T00:00:00Z'}))};},finalize:async()=>({status:'finalized'})};
 const providerEnv={...env,IX_UPLOAD_ENABLED:'true',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'fixture'};
 const fetchImpl=async(url,options)=>{assert.ok(!url.includes(agentSid));requests.push(url);return url.endsWith('.json')?Response.json({sid:customerSid,account_sid:account,call_sid:f.child,channels:2,start_time:time,duration:'1'}):new Response(options?.method==='PUT'?null:new Uint8Array([1,2]));};
 await uploadIx({id:id(90),call_id:f.C,tenant_id:f.T,confirmation_code:'synthetic'},[s.agent,s.customer],client,{db:f.db,env:providerEnv,call:s.call,fetchImpl,checkpoint:async value=>{state=structuredClone(value);}});
 assert.equal(state.recordings.length,1);assert.equal(state.recordings[0].recording_sid,customerSid);assert.equal(requests[1].callMetadata.recordings.length,1);
 // A registration saved by older code must never upload/finalize unsafe legs.
 await assert.rejects(uploadIx({call_id:f.C,ix_state:{...state,recordings:[{...state.recordings[0],recording_sid:agentSid}]}},[s.agent,s.customer],client,{db:f.db,env:providerEnv,call:s.call,checkpoint:()=>assert.fail('checkpoint'),fetchImpl:()=>assert.fail('provider')}),/whisper_customer/);
});
test('missing customer audio persists one hold and one operational alert and retains the hold after audio arrives',async()=>{
 const s=await seed({customer:false});
 for(let n=0;n<3;n++)await assert.rejects(outsideRecordings(f.db,await call(),[s.agent]),/whisper_customer/);
 assert.equal((await call()).metadata.whisper_upload_hold.held,true);
 assert.equal((await f.q("SELECT count(*)::int n FROM operational_alert_history WHERE rule='whisper_upload_held' AND state='raised'"))[0].n,1);
 const metrics=(await f.db.rpc('operational_status',{})).data;
 const conditions=evaluateAlerts(metrics,{queueDepth:99999,queueAgeSeconds:99999,secretReviewDays:-9999});
 assert.equal(conditions.filter(c=>c.rule==='whisper_upload_held').length,1);
 assert.ifError((await f.db.rpc('transition_operational_alerts',{p_conditions:conditions})).error);
 assert.equal((await f.q("SELECT count(*)::int n FROM operational_alert_history WHERE rule='whisper_upload_held' AND state='raised'"))[0].n,1);
 const p=s.participants.find(p=>p.role==='customer');
 const arrived=await f.db.rpc('enqueue_conference_recording',{p_participant_id:p.id,p_callback:{CallSid:p.twilio_call_sid,AccountSid:account,RecordingSid:customerSid,RecordingStatus:'completed',RecordingChannels:'2',RecordingDuration:'1',RecordingStartTime:time,RecordingSource:'StartCallRecordingAPI'}});assert.ifError(arrived.error);
 await assert.rejects(outsideRecordings(f.db,s.call,[s.agent]),/whisper_customer/);
 assert.ifError((await f.db.rpc('release_whisper_upload',{p_actor:f.who(0).sub,p_org:f.who(0).org_id,p_call:f.C,p_recording:arrived.data})).error);
 assert.equal((await outsideRecordings(f.db,await call(),[s.agent]))[0].id,arrived.data);
});
for(const n of [0,1,2,3])test(`role ${n} cannot release a held call with the agent recording`,async()=>{
 const s=await seed();await f.db.rpc('hold_whisper_upload',{p_call:f.C,p_tenant:f.T});
 const r=await f.db.rpc('release_whisper_upload',{p_actor:f.who(n).sub,p_org:f.who(n).org_id,p_call:f.C,p_recording:s.agent.id});assert.ok(r.error);
 assert.equal((await call()).metadata.whisper_upload_hold.held,true);
});
test('only a protected admin can choose the existing customer recording and re-enable held work',async()=>{
 const s=await seed();await f.db.rpc('hold_whisper_upload',{p_call:f.C,p_tenant:f.T});
 for(const n of [1,2,3])assert.ok((await f.db.rpc('release_whisper_upload',{p_actor:f.who(n).sub,p_org:f.who(n).org_id,p_call:f.C,p_recording:s.customer.id})).error);
 const handler=createComplianceUploadsHandler({getDb:()=>f.db,authenticate:async()=>auth(),env:{...env,IX_UPLOAD_ENABLED:'true'}});
 const response=await handler(request({action:'release_whisper_upload',call_id:f.C,recording_id:s.customer.id},'https://app.test/api/compliance-uploads'));assert.equal(response.status,200,await response.text());
 assert.equal((await call()).metadata.whisper_upload_hold.held,false);
 assert.deepEqual((await outsideRecordings(f.db,s.call,[s.agent])).map(r=>r.id),[s.customer.id]);
});
test('a held carrier or reviewer job contacts no provider, even through retry',async()=>{
 const s=await seed({customer:false});
 await assert.rejects(recordingComplianceGrant(f.db,identity(),s.agent,{env}),/whisper_customer/);
 await assert.rejects(uploadIx({call_id:f.C},[s.agent],{environment:'test',register:()=>assert.fail('register')},{db:f.db,env:{...env,IX_UPLOAD_ENABLED:'true'},call:await call(),checkpoint:()=>assert.fail('checkpoint'),fetchImpl:()=>assert.fail('provider')}),/whisper_customer/);
});
test('marked batch transcription uses a customer capability and channels rather than diarized speaker numbers',async()=>{
 const s=await seed();let contacted=0;
 const handler=createTranscribeHandler({getDb:()=>f.db,authenticate:async()=>auth(),env:{...env,DEEPGRAM_API_KEY:'fixture'},transport:async(url,options)=>{contacted++;assert.equal(new URL(url).searchParams.get('multichannel'),'true');const [ticket]=await f.q('SELECT * FROM recording_download_tickets');assert.equal(ticket.recording_id,s.customer.id);assert.equal(ticket.purpose,'transcription');assert.ok(JSON.parse(options.body).url);return Response.json(result());}});
 const response=await handler(request({callId:f.C,recordingId:s.customer.id}));assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.deepEqual(data.transcript_diarized.map(u=>u.speaker),['customer','agent']);assert.match(data.transcript_raw,/agent words/);assert.equal(contacted,1);
});
test('agent batch transcription fails before a capability or speech request',async()=>{
 const s=await seed();const handler=createTranscribeHandler({getDb:()=>f.db,authenticate:async()=>auth(),env:{...env,DEEPGRAM_API_KEY:'fixture'},transport:()=>assert.fail('speech provider')});
 const response=await handler(request({callId:f.C,recordingId:s.agent.id}));assert.equal(response.status,409);assert.equal((await f.q('SELECT count(*)::int n FROM recording_download_tickets'))[0].n,0);
});
test('backfill replaces a legacy agent URL with a customer capability and assigns speakers by channel',async()=>{
 const s=await seed();const data=await transcribeAudio('https://unsafe.example.test/'+agentSid,f.db,s.call,{env:{...env,DEEPGRAM_API_KEY:'fixture'},transport:async(url,options)=>{assert.equal(new URL(url).searchParams.get('multichannel'),'true');assert.ok(!JSON.stringify(options).includes(agentSid));return Response.json(result());}});
 assert.deepEqual(data.transcript_diarized.map(u=>u.speaker),['customer','agent']);const [ticket]=await f.q('SELECT * FROM recording_download_tickets');assert.equal(ticket.recording_id,s.customer.id);
});
test('automatic recovery uses the customer recording and preserves single-pass limits and channel mapping',async()=>{
 const s=await seed();const plan=await loadRecordingPlan(f.db,s.call);assert.equal(plan.recording.id,s.customer.id);assert.deepEqual(plan.mapping,['customer','agent']);assert.equal(plan.offset,0);
 const r=await recoverBeforeScoring({db:f.db,call:s.call,env:{...env,TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true'},runGapJob:async jobId=>{const [job]=await f.q('SELECT * FROM manual_transcript_gap_fills WHERE id=$1',[jobId]);assert.equal(job.recording_id,s.customer.id);assert.deepEqual(job.channel_speakers,['customer','agent']);return {ok:false};},sendAlert:async()=>{}});
 assert.equal(r.reason,'recording_recovery_failed');assert.equal((await f.q('SELECT count(*)::int n FROM manual_transcript_gap_fills'))[0].n,1);
 assert.ok((await f.db.rpc('claim_automatic_transcript_recovery',{p_call_id:f.C,p_tenant_id:f.T,p_recording_id:s.agent.id,p_ranges:[{start_ms:0,end_ms:1}],p_mapping:['agent','customer'],p_cost:.01})).data.status==='busy');
});
for(const safe of [true,false])test(`gap worker ${safe?'transcribes customer channels':'rejects agent audio before storage or provider'}`,async()=>{
 const s=await seed(),recording=safe?s.customer:s.agent,path=f.T+'/synthetic.wav';
 await f.q('UPDATE recording_ingestion SET storage_path=$1 WHERE id=$2',[path,recording.id]);
 const job=id(98);await f.q("INSERT INTO manual_transcript_gap_fills(id,request_id,call_id,tenant_id,recording_id,requested_by,source_transcript,ranges,channel_speakers,timeline_offset_ms,estimated_cost_usd) VALUES($1,$1,$2,$3,$4,'synthetic','[]','[{\"start_ms\":0,\"end_ms\":2}]','[\"customer\",\"agent\"]',0,.01)",[job,f.C,f.T,recording.id]);
 let requests=0,reads=0;
 const db={...f.db,storage:{from:()=>({download:async()=>{reads++;return {data:new Blob([audio])};}})}};
 const handler=createGapFillHandler({getDb:()=>db,env:{...env,TRANSCRIPT_GAP_FILL_ENABLED:'true',SCORE_CALL_JOB_SECRET:'fixture',DEEPGRAM_API_KEY:'fixture'},transport:async(url)=>{requests++;assert.equal(new URL(url).searchParams.get('multichannel'),'true');return Response.json(result());}});
 const req=new Request('https://app.test/gaps',{method:'POST',headers:{'x-enrollgen-job-secret':'fixture'},body:JSON.stringify({job_id:job})});const response=await handler(req);
 assert.equal(response.status,safe?200:503);assert.equal(requests,safe?1:0);assert.equal(reads,safe?1:0);
 if(safe){const [c]=await f.q('SELECT transcript_diarized FROM call_records WHERE id=$1',[f.C]);assert.deepEqual(c.transcript_diarized.map(u=>u.speaker),['customer','agent']);}
});
for(const table of ['recording_compliance_tickets','recording_download_tickets'])test(`stale ${table} pointing to agent audio is refused before any provider request`,async()=>{
 const s=await seed(),token='A'.repeat(43),hash=createHash('sha256').update(token).digest('hex');
 if(table==='recording_compliance_tickets')await f.q("INSERT INTO recording_compliance_tickets(token_hash,tenant_id,recording_id,minted_by,format,account_sid,recording_sid,expected_call_sid,channels,expires_at) VALUES($1,$2,$3,'synthetic','wav',$4,$5,$6,2,clock_timestamp()+interval '1 hour')",[hash,f.T,s.agent.id,account,agentSid,f.parent]);
 else await f.q("INSERT INTO recording_download_tickets(token_hash,tenant_id,recording_id,actor_id,download,purpose,account_sid,recording_sid,expected_call_sid,channels,expires_at) VALUES($1,$2,$3,'synthetic',false,'transcription',$4,$5,$6,2,clock_timestamp()+interval '1 hour')",[hash,f.T,s.agent.id,account,agentSid,f.parent]);
 const res={code:200,setHeader(){},on(){},off(){},removeHeader(){},status(code){this.code=code;return this;},end(){this.ended=true;}};
 await createRecordingComplianceHandler({db:f.db,config:settings,ticketTable:table,fetchImpl:()=>assert.fail('Provider contacted'),log:()=>{}})({method:'GET',params:{token},header:()=>null},res);
 assert.equal(res.code,404);assert.equal(res.ended,true);
});
test('downloaded merged WAV uses only customer samples while internal merged playback retains held agent samples',async()=>{
 const s=await seed();const playback=await conferencePlayback(f.db,identity(),{id:f.C,field:'call_record_id',record:s.call},[s.customer,s.agent]);
 const agent=Buffer.from(audio);for(let i=44;i<agent.length;i+=2)agent.writeInt16LE(30000,i);
 playback.events=[{event:'customer_hold_changed',at:time,payload:{held:true}}];
 const buffers=new Map([[s.customer.id,array(audio)],[s.agent.id,array(agent)]]);
 const internal=mergeRecordingWavs(playback,buffers),download=mergeRecordingWavs(playback,buffers,{download:true});
 assert.equal(readRecordingWav(internal.buffer).sample(0,0),30000);
 assert.equal(readRecordingWav(download.buffer).sample(0,0),1000);assert.equal(readRecordingWav(download.buffer).sample(0,1),-1000);
 assert.ok(download.clips.every(c=>c.id===s.customer.id));
 assert.throws(()=>mergeRecordingWavs({...playback,downloadRecordingIds:[]},buffers,{download:true}),/unavailable/);
});
test('exported audit packets exclude agent recording references and checksums before hashing or rendering',async()=>{
 const s=await seed();const events=[s.agent,s.customer].map(r=>({type:'recording',time,status:'stored',summary:'Recording',staff:'synthetic',details:{callId:f.C,sha256:r.recording_sid===customerSid?'1'.repeat(64):'2'.repeat(64),stored:true},evidence:[{table:'recording_ingestion',id:r.id,time}]}));
 const manifest=[s.agent,s.customer].map(r=>({source_table:'recording_ingestion',id:r.id,storage_path:'synthetic',occurred_at:time,sha256:r.recording_sid===customerSid?'1'.repeat(64):'2'.repeat(64)}));
 const checks=[{enrollmentId:id(87),checks:[{name:'Recording',status:'present',evidence:events.flatMap(e=>e.evidence)}]}];
 const safe=await whisperPacketEvidence(f.db,events,manifest,checks);
 const files=await packetFileIndex({storage:{from:()=>assert.fail('No unneeded audio read')}},safe.manifest);
 const pdf=buildLifecyclePacket({agency:'Synthetic',consumerId:id(88),asOf:time,events:safe.events,checks:safe.checks,files});
 const body=new TextDecoder().decode(pdf);assert.ok(!body.includes(s.agent.id));assert.ok(!body.includes('2'.repeat(64)));assert.ok(body.includes(s.customer.id));assert.ok(body.includes('1'.repeat(64)));
});
test('vendor CSV/report, disposition postbacks and CRM webhooks exclude all recording fields',()=>{
 const poison={id:id(86),call_id:id(86),received_at:time,call_start_time:time,disposition_code:'enrolled',recording_url:'https://unsafe.example.test/'+agentSid,RecordingPath:agentSid,recordings:[agentSid],metadata:{audio:agentSid}};
 for(const payload of [dispositionPayload(poison),csvReport([poison]),reportCsv([poison]),allowlistedGhlPayload(poison)])assert.ok(!JSON.stringify(payload).includes(agentSid));
});
test('marker and safe source policy survive Stop, switches off and attempted metadata replacement',async()=>{
 const s=await seed();await f.whisper.stop(await f.current());await f.q("UPDATE call_records SET metadata='{}' WHERE id=$1",[f.C]);
 await f.q("SELECT set_config('request.headers','{}',false)");assert.equal((await call()).metadata.supervisor_whisper,true);
 assert.deepEqual((await outsideRecordings(f.db,await call(),[s.agent])).map(r=>r.id),[s.customer.id]);
});
test('unmarked selections and speaker handling retain their exact input and do not call the database',async()=>{
 const rows=[{id:'agent'},{id:'customer'}],utterances=[{speaker:0,transcript:'synthetic'}];
 assert.equal(await outsideRecordings({from:()=>assert.fail(),rpc:()=>assert.fail()},{metadata:{}},rows),rows);
 assert.equal(whisperChannelUtterances({metadata:{}},utterances),utterances);assertWhisperRecordingSafe({metadata:{}});
 const playback={startedAt:time,whisper:false,segments:[{id:'agent',role:'agent',startedAt:time}],events:[]};
 const buffers=new Map([['agent',array(audio)]]);assert.deepEqual(mergeRecordingWavs(playback,buffers),mergeRecordingWavs(playback,buffers,{download:true}));
});
test('schema routines remain service-only and styles and recording controls are unchanged',async()=>{
 for(const role of ['anon','authenticated']){
  await f.pg.exec('SET ROLE '+role);assert.ok((await f.db.rpc('whisper_customer_recordings',{p_call:f.C,p_tenant:f.T})).error);assert.ok((await f.db.rpc('hold_whisper_upload',{p_call:f.C,p_tenant:f.T})).error);
 }
 const source=readFileSync('telephony/src/conferenceCalling.js','utf8');assert.match(source,/recordingChannels: 'dual', recordingTrack: 'both'/);
 assert.match(readFileSync('src/components/callDetail/RecordingPanel.jsx','utf8'),/>Whisper<\/span>/);
});
test('reviewer worker replaces an agent queue selection before POST and a missing customer is held without POST',async()=>{
 for(const available of [true,false]){
  await f.pg.exec('SAVEPOINT worker_scenario');
  await seed({customer:available});const jobId=id(93),lease=id(94);
  await f.q("UPDATE call_records SET compliance_status='complete' WHERE id=$1",[f.C]);
  await f.q("INSERT INTO conversely_submissions(id,tenant_id,call_id,twilio_recording_sid,enrollment_key,status,attempts,lease_token,lease_until) VALUES($1,$2,$3,$4,$5,'uploading',1,$6,clock_timestamp()+interval '1 hour')",[jobId,f.T,f.C,agentSid,id(89),lease]);
  await f.q("INSERT INTO conversely_week_slots(tenant_id,agent_id,agent_slug,week_start,submission_id) VALUES($1,$2,'pilot_agent_02','2026-11-09',$3)",[f.T,f.agent(1),jobId]);
  let claimed=false,posts=0;
  const db={...f.db,rpc:async(name,args)=>{
   if(name==='claim_compliance_upload'){if(claimed)return {data:[],error:null};claimed=true;return {data:await f.q('SELECT * FROM conversely_submissions WHERE id=$1',[jobId]),error:null};}
   return f.db.rpc(name,args);
  }};
  const tick=createComplianceWorker(db,{env:{...env,CONVERSELY_UPLOAD_ENABLED:'true',CONVERSELY_API_KEY:'fixture'},log:()=>{},send:async(_url,body)=>{
   posts++;assert.ok(!body.includes(agentSid));const [ticket]=await f.q('SELECT * FROM recording_compliance_tickets');assert.equal(ticket.recording_sid,customerSid);return {status:200};
  }});
  await tick({schedule:false});assert.equal(posts,available?1:0);
  const [job]=await f.q('SELECT * FROM conversely_submissions WHERE id=$1',[jobId]);assert.equal(job.status,available?'uploaded':'failed');if(!available){assert.equal(job.last_error,'whisper_customer_recording_required');assert.equal((await call()).metadata.whisper_upload_hold.held,true);}
  await f.pg.exec('ROLLBACK TO SAVEPOINT worker_scenario');f.states.clear();f.timers.clear();f.resetProvider();
 }
});
test('reviewer probe reads only the customer rendition and a provider-absent customer raises a durable hold',async()=>{
 const s=await seed(),candidate={...s.agent,call_id:f.C};
 const providerEnv={...env,CONVERSELY_UPLOAD_ENABLED:'true',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'fixture'};
 assert.equal(await playableMp3(candidate,{db:f.db,env:providerEnv,fetchImpl:async url=>{assert.ok(url.includes(customerSid));assert.ok(!url.includes(agentSid));return new Response('x',{headers:{'Content-Type':'audio/mpeg'}});}}),true);
 assert.equal(await playableMp3(candidate,{db:f.db,env:providerEnv,fetchImpl:async()=>new Response(null,{status:404})}),false);
 assert.equal((await call()).metadata.whisper_upload_hold.held,true);
});
test('legacy inbound links resolve the canonical permanent marker before any reviewer capability',async()=>{
 const s=await seed();await f.q("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,call_record_id,from_number,to_number,status) VALUES($1,$2,$3,$4,'+12125550101','+12125550102','completed')",[id(85),f.T,'CA'+'f'.repeat(32),f.C]);
 await recordingComplianceGrant(f.db,identity(),{...s.agent,id:'legacy:'+id(85),call_record_id:null},{env});
 assert.equal((await f.q('SELECT * FROM recording_compliance_tickets'))[0].recording_sid,customerSid);
});
test('customer transcription timestamps use recording start and preserve the full call duration',async()=>{
 const s=await seed();await f.q("UPDATE call_records SET call_start=$1::timestamptz-interval '1 second',call_duration_seconds=2 WHERE id=$2",[time,f.C]);
 const handler=createTranscribeHandler({getDb:()=>f.db,authenticate:async()=>auth(),env:{...env,DEEPGRAM_API_KEY:'fixture'},transport:async()=>Response.json(result())});
 const response=await handler(request({callId:f.C,recordingId:s.customer.id}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.transcript_diarized[0].start_ms,1000);assert.equal(data.duration_seconds,2);
});
test('an empty saved carrier recording manifest cannot finalize an unverified registration',async()=>{
 const s=await seed();await assert.rejects(uploadIx({call_id:f.C,ix_state:{callRecordingId:id(84),recordings:[],recordingUploads:[],uploadedFilenames:[]}},[s.agent,s.customer],{environment:'test',finalize:()=>assert.fail('unsafe finalize')},{db:f.db,env:{...env,IX_UPLOAD_ENABLED:'true'},call:s.call,checkpoint:()=>assert.fail('checkpoint'),fetchImpl:()=>assert.fail('provider')}),/whisper_customer/);
});
test('a packet export with no customer recording is held before any file hashing',async()=>{
 await seed({customer:false});await assert.rejects(whisperPacketEvidence(f.db,[{type:'call',details:{callId:f.C},evidence:[]}],[],[]),/whisper_customer/);assert.equal((await call()).metadata.whisper_upload_hold.held,true);
});

test('backfill page loads customer timing and processes a marked call without a legacy audio URL',async()=>{
 const s=await seed();await f.q("UPDATE call_records SET transcript_raw='previous speech',recording_url=NULL,call_start=$1::timestamptz-interval '1 second',call_duration_seconds=2 WHERE id=$2",[time,f.C]);
 let requests=0;
 const handler=createIntelligenceBackfillHandler({authorize:()=>true,getDb:()=>f.db,env:{...env,DEEPGRAM_API_KEY:'fixture'},transport:async()=>{requests++;return Response.json(result());}});
 const response=await handler(request({limit:1},'https://app.test/backfill'));assert.equal(response.status,200);assert.equal((await response.json()).updated,1);assert.equal(requests,1);
 const updated=await call();assert.equal(updated.transcript_diarized[0].start_ms,1000);assert.equal(updated.call_duration_seconds,2);
 const [ticket]=await f.q('SELECT * FROM recording_download_tickets');assert.equal(ticket.recording_id,s.customer.id);
});
