// Install the network fence BEFORE importing application dependencies.
import '../../tests/fixtures/local-only.js';
import {assertLoadSafety,assertSafeEnvironment} from './load-safety.js';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {EventEmitter} from 'node:events';
const require=createRequire(new URL('../../telephony/package.json',import.meta.url));
const twilio=require('twilio');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:0;
export async function runLocalLoad({mode='short',output,cohort='standard'}={}) {
 assertSafeEnvironment(process.env);
 const long=mode==='long';assert.ok(['short','long'].includes(mode));assert.ok(['standard','conference'].includes(cohort));
 const plan=assertLoadSafety({synthetic:true,targets:['http://localhost:1'],account:'synthetic-local-phone',project:'synthetic-local-database',maxCalls:100,maxDurationSeconds:long?120:30});
 if(cohort==='conference')throw Error('Conference cohort uses telephony/tests/conferenceCalling.test.js separately; standard run never enables it');
 // Fixture profile is code-reviewed synthetic configuration, never a .env file.
 const profile=JSON.parse(readFileSync(new URL('../../tests/fixtures/deployment-profile.json',import.meta.url),'utf8'));
 profile.tenantId=randomUUID();profile.organizationId='org_SyntheticLoad';
 const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile)};
 const saved=process.env.DEPLOYMENT_PROFILE_JSON;process.env.DEPLOYMENT_PROFILE_JSON=env.DEPLOYMENT_PROFILE_JSON;
 const fakeVars={SUPABASE_URL:'http://localhost:1',SUPABASE_SECRET_KEY:'synthetic-local-key',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-local-token',TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-local-secret',TWILIO_TWIML_APP_SID:'AP'+'0'.repeat(32),DEEPGRAM_API_KEY:'synthetic-local-token',INBOUND_VENDOR_API_KEY:'synthetic-local-vendor',CLERK_SECRET_KEY:'sk_test_synthetic',AGENT_WS_SIGNING_SECRET:'synthetic-local-websocket-signing-secret'};
 const {FEATURE_NAMES}=await import('../../telephony/src/lib/deploymentFeatures.js');
 Object.assign(fakeVars,Object.fromEntries(FEATURE_NAMES.map(name=>[name,'false'])));
 const savedVars=Object.fromEntries(Object.keys(fakeVars).map(k=>[k,process.env[k]]));Object.assign(process.env,fakeVars);
 const {freshDatabase}=await import('../../tests/helpers/freshInstall.js');
 const {freshInstallClient}=await import('../../tests/helpers/freshInstallClient.js');
 const {provisionDeployment}=await import('../../telephony/src/lib/deploymentProvisioning.js');
 const {openDeepgramTrack}=await import('../../telephony/src/media/deepgramTrack.js');
 const {attachPhonePresence}=await import('../../telephony/src/phonePresence.js');
 const {inspectAgentWsToken,mintAgentWsToken}=await import('../../telephony/src/wsToken.js');
 const pg=await freshDatabase();const db=freshInstallClient(pg);
 const delay=monitorEventLoopDelay({resolution:10});delay.enable();
 const start=performance.now(),cpu=process.cpuUsage(),request=[],routing=[],ack=[],lag=[],streamLag=[],queueAge=[],rss=[];
 let calls=0,overflows=0,conflicts=0,falseOverflow=0,callbacks=0,segments=0,uploads=0,unauthorized=0,crossLeaks=0,expiredJobs=0;
 const q=async(sql,args=[])=>{const at=performance.now();try{return (await pg.query(sql,args)).rows;}finally{request.push(performance.now()-at);}};
 const rpc=async(name,args)=>{const at=performance.now();try{const result=await db.rpc(name,args);assert.ifError(result.error);return result.data;}finally{request.push(performance.now()-at);}};
 const agents=Array.from({length:12},(_,i)=>({id:randomUUID(),tenant_id:profile.tenantId,name:`Synthetic Agent ${i+1}`,npn:String(91000000+i),clerk_user_id:`user_synthetic_${i}`,agent_slug:`synthetic_${i}`,identity_aliases:[`Synthetic Alias ${i}`],licensed_states:i%3===0?['NY','NJ']:i%3===1?['CA','NY']:['FL','NY'],is_active:true,team:'synthetic'}));
 const account='AC'+'0'.repeat(32),secret='synthetic-local-signing-secret',signatureUrl='http://localhost/twilio/callback';
 const signed=async(body,work)=>{
  const signature=twilio.getExpectedTwilioSignature(secret,signatureUrl,body);
  assert.ok(twilio.validateRequest(secret,signature,signatureUrl,body));
  assert.equal(body.AccountSid,account);callbacks++;const at=performance.now();try{return await work();}finally{ack.push(performance.now()-at);}
 };
 const sessions=[];
 const cleanup=[];
 try {
  await pg.exec('SET ROLE service_role');
  assert.equal(await provisionDeployment(db,agents,env),12);
  await pg.exec('RESET ROLE');
  for(const agent of agents)agent.enrolledId=(await q('SELECT id FROM enrolled_agents WHERE clerk_user_id=$1',[agent.clerk_user_id]))[0].id;
  await q('UPDATE telephony_presence_policy SET enforced=true');
  // Real phonePresence logic with fake browser sockets; 15s timer is advanced explicitly.
  for(const agent of agents){
   const ws=new EventEmitter();ws.OPEN=1;ws.readyState=1;ws.send=()=>{};ws.ping=()=>ws.emit('pong');ws.terminate=()=>ws.emit('close');let beat;
   const presence=attachPhonePresence(ws,agent.agent_slug,{rpc:(name,args)=>db.rpc(name,args),interval:fn=>{beat=fn;return 1;},clear:()=>{}});
   ws.emit('message',JSON.stringify({type:'phone-ready',ready:true}));await presence.settled();
   sessions.push({ws,presence,beat});
  }
  await q("UPDATE agent_availability SET status='available',available=true");
  for(let i=0;i<4;i++){for(const session of sessions)session.beat();await Promise.all(sessions.map(s=>s.presence.settled()));}
  assert.equal((await q('SELECT count(*)::int n FROM agent_phone_sessions'))[0].n,12);
  // Signed and expired/foreign tokens are checked without any Clerk/provider connection.
  const token=mintAgentWsToken(agents[0].agent_slug,agents[0].clerk_user_id,'synthetic-session');
  assert.ok(inspectAgentWsToken(token).claims);
  assert.equal(inspectAgentWsToken(token,Date.now()+16*60000).claims,null);
  assert.equal(inspectAgentWsToken(token+'foreign').claims,null);
  // Actual row-policy negative reads, with a verified signed subject/org fixture.
  await q("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:agents[0].clerk_user_id,org_id:profile.organizationId,role:'authenticated'})]);
  const rounds=long?4:1;
  for(let round=0;round<rounds;round++){
   for(const session of sessions)session.beat();await Promise.all(sessions.map(s=>s.presence.settled()));
   await q("UPDATE agent_availability SET status='available',available=true WHERE active_call_sid IS NULL");
   const arrivals=Array.from({length:20},()=>({sid:'CA'+randomUUID().replaceAll('-',''),attempt:randomUUID(),inbound:randomUUID(),received:performance.now()}));
   calls+=arrivals.length;assert.ok(calls<=plan.maxCalls);assert.ok(performance.now()-start<plan.maxDurationSeconds*1000);
   const reservations=await Promise.all(arrivals.map(async call=>{
    const at=performance.now();
    const rows=await signed({AccountSid:account,CallSid:call.sid},()=>q('SELECT * FROM claim_call_agent($1)',[call.sid]));routing.push(performance.now()-at);
    if(!rows.length){overflows++;return {...call,overflow:'voicemail'};}return {...call,agent:rows[0].agent_id};
   }));
   const active=reservations.filter(c=>c.agent);assert.equal(active.length,12);assert.equal(reservations.length-active.length,8);assert.equal(new Set(active.map(c=>c.agent)).size,12);
   assert.equal((await q('SELECT count(*)::int n FROM agent_availability WHERE active_call_sid IS NOT NULL'))[0].n,12);
   // Lost response after commit + duplicate routing always reuses the reservation.
   assert.equal((await q('SELECT * FROM claim_call_agent($1)',[active[0].sid]))[0].agent_id,active[0].agent);
   assert.equal((await q('SELECT release_call_agent($1,$2) released',['CA'+'f'.repeat(32),active[0].agent]))[0].released,false);
   for(const call of active){
    const agent=agents.find(a=>a.agent_slug===call.agent);
    await q("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,status,from_number,to_number) VALUES($1,$2,$3,'accepted','+12025550100','+12025550101')",[call.inbound,profile.tenantId,call.sid]);
    await q("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,inbound_call_id,answered_at) VALUES($1,$2,$3,$4,'inbound',$5,now())",[call.attempt,profile.tenantId,call.sid,call.agent,call.inbound]);
    const rid=await rpc('ensure_inbound_transcript_record',{p_attempt_id:call.attempt});call.record=rid;call.owner=agent;
    // Persist both speakers across a 20-minute synthetic timeline, including duplicate/reordered finals.
    const count=long?40:4;
    for(let n=0;n<count;n++){
     const id=randomUUID(),at=performance.now();
     const params={p_attempt_id:call.attempt,p_segment_id:id,p_speaker:n%2?'agent':'customer',p_text:`Synthetic phrase ${n}`,p_captured_at:new Date(Date.now()+n*1200000/count).toISOString(),p_start_ms:n*1200000/count,p_end_ms:(n+1)*1200000/count};
     await rpc('persist_telephony_transcript',params);segments++;lag.push(performance.now()-at);
     if(n===0)await rpc('persist_telephony_transcript',params);
    }
    await signed({AccountSid:account,CallSid:call.sid,CallStatus:'completed'},()=>q("UPDATE inbound_calls SET status='completed',ended_at=now(),duration_seconds=1200 WHERE id=$1",[call.inbound]));
    await q("UPDATE telephony_call_attempts SET ended_at=now(),talk_seconds=1200 WHERE id=$1",[call.attempt]);
    await rpc('finalize_telephony_transcript',{p_call_sid:call.sid});
    // Reordered status callback cannot reopen a terminal call in this cohort.
    await signed({AccountSid:account,CallSid:call.sid,CallStatus:'ringing'},()=>q("UPDATE inbound_calls SET status='ringing' WHERE id=$1 AND ended_at IS NULL",[call.inbound]));
    const recording={AccountSid:account,CallSid:call.sid,RecordingSid:'RE'+randomUUID().replaceAll('-',''),RecordingStatus:'completed',RecordingChannels:'2',RecordingDuration:'1200',RecordingSource:'DialVerb'};
    const id=await signed(recording,()=>rpc('enqueue_recording',{p_callback:recording,p_attempt_id:call.attempt}));
    assert.equal(await signed(recording,()=>rpc('enqueue_recording',{p_callback:recording,p_attempt_id:call.attempt})),id);
    // Fake immutable object store + DB linkage; provider audio never fetched.
    const path=`${profile.tenantId}/${call.sid}.wav`;
    await q("UPDATE recording_ingestion SET copy_status='stored',storage_path=$2,stored_bytes=160,stored_at=now() WHERE id=$1",[id,path]);uploads++;
    await q("UPDATE call_records SET call_outcome='not_interested',call_type='service',call_end=now() WHERE id=$1",[rid]);
    await q('SELECT release_call_agent($1,$2)',[call.sid,call.agent]);
    const owner=(await q('SELECT agent_id,transcript_id,recording_storage_path FROM call_records WHERE id=$1',[rid]))[0];
    assert.equal(owner.agent_id,agent.enrolledId);assert.ok(owner.transcript_id);assert.equal(owner.recording_storage_path,path);
   }
   // Burst post-call queue: one durable result per key, duplicate/lost acknowledgment.
   await Promise.all(active.map(async call=>{
    const begun=await rpc('start_telephony_session',{p_tenant_id:profile.tenantId,p_agent_id:call.owner.enrolledId,p_call_sid:call.sid,p_flow:'ma'});
    const key=createHash('sha256').update(call.sid).digest('hex'),args={p_session_id:begun.session_id,p_tenant_id:profile.tenantId,p_agent_id:call.owner.enrolledId,p_user_id:call.owner.clerk_user_id,p_org_id:profile.organizationId,p_clerk_session_id:'synthetic-session',p_request_key:key,p_action:'checkpoint',p_payload:{synthetic:true}};
    await rpc('enqueue_post_call_request',args);await rpc('enqueue_post_call_request',args);
    let worker=randomUUID();assert.equal(await rpc('claim_post_call_worker',{p_session_id:begun.session_id,p_worker_id:worker}),true);
    if(call===active[0]){
     // Worker dies mid-lease; force only this synthetic fixture's clock past expiry.
     await q("UPDATE post_call_jobs SET started_at=now()-interval '17 minutes' WHERE session_id=$1",[begun.session_id]);
     await rpc('expire_post_call_worker',{p_session_id:begun.session_id});worker=randomUUID();
     assert.equal(await rpc('claim_post_call_worker',{p_session_id:begun.session_id,p_worker_id:worker}),false);
     await q("UPDATE post_call_requests SET status='queued',error_code=NULL WHERE session_id=$1",[begun.session_id]);
     assert.equal(await rpc('claim_post_call_worker',{p_session_id:begun.session_id,p_worker_id:worker}),true);
    }
    const next=await rpc('next_post_call_request',{p_session_id:begun.session_id,p_worker_id:worker});assert.ok(next);
    queueAge.push(performance.now()-call.received);
    await rpc('finish_post_call_request',{p_session_id:begun.session_id,p_worker_id:worker,p_request_key:key,p_result:{synthetic:true},p_error_code:call===active[1]?'synthetic_provider_exhausted':null});
    if(call===active[1])expiredJobs++;
   }));
   rss.push(process.memoryUsage().rss);
  }
  // Forty independent real track state machines, fake provider frames paced at 20ms.
  class FakeStt extends EventEmitter {
   constructor(){super();this.readyState=0;this.bufferedAmount=0;this.frames=0;queueMicrotask(()=>{this.readyState=1;this.emit('open');});}
   send(frame,done){if(typeof frame==='string'){if(JSON.parse(frame).type==='CloseStream')this.terminate();return;}this.frames++;if(this.frames%50===0)this.emit('message',JSON.stringify({type:'Results',is_final:true,start:(this.frames-50)*0.02,duration:1,channel:{alternatives:[{transcript:'Synthetic audio frame'}]}}));done?.();}
   terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close',1000);}
  }
  let transcriptEvents=0;const tracks=Array.from({length:40},(_,i)=>openDeepgramTrack({speaker:i%2?'agent':'customer',Socket:FakeStt,claims:{tenantId:profile.tenantId,callSid:'CA'+String(i).padStart(32,'0')},notify:e=>{if(e.type==='transcript'){transcriptEvents++;streamLag.push(Date.now()-e.timestamp);}},registerStream:()=>true,reserveReconnect:()=>true,reportUsage:async()=>{},onLimit:async()=>{}}));
  cleanup.push(()=>tracks.forEach(t=>t.close()));
  const mediaStart=performance.now(),mediaMs=long?60000:1200,frame=Buffer.alloc(160,0xff);
  let frames=0,lastHeartbeat=mediaStart;
  while(performance.now()-mediaStart<mediaMs||frames<60){frames++;
   if(performance.now()-lastHeartbeat>=15000){for(const session of sessions)session.beat();await Promise.all(sessions.map(s=>s.presence.settled()));lastHeartbeat=performance.now();}for(const track of tracks)track.send(frame,performance.now()-mediaStart);await pause(20);rss.push(process.memoryUsage().rss);assert.ok(performance.now()-start<plan.maxDurationSeconds*1000);}
  for(const track of tracks){assert.ok(track.stats().queuedBytes<=2*1024*1024);track.close();}assert.ok(transcriptEvents>=40);
  // Provider 429/disconnect/5xx: real retry state machine, local fake transport.
  let failuresVisible=0;
  class FailingStt extends FakeStt {
   constructor(){super();queueMicrotask(()=>this.emit('message',JSON.stringify({type:'Error',code:429})));}
  }
  const broken=openDeepgramTrack({speaker:'customer',Socket:FailingStt,claims:{tenantId:profile.tenantId,callSid:'CA'+'e'.repeat(32)},notify:e=>{if(e.status==='unavailable')failuresVisible++;},registerStream:()=>true,reserveReconnect:()=>true,reportUsage:async()=>{},onLimit:async()=>{},limits:{queueFrames:10,queueBytes:1024,bufferedBytes:1024,reconnects:2,connectMs:100}});
  for(let n=0;n<8;n++){broken.send(frame);await pause(1);}assert.ok(broken.stats().exhausted);assert.ok(broken.stats().retries<=2);assert.ok(failuresVisible>0);broken.close();
  // Caller hangup and slow response after commit must not free a newer call.
  await q("UPDATE agent_availability SET status='available',available=true WHERE active_call_sid IS NULL");
  assert.ok(calls+2<=plan.maxCalls);
  const hangSid='CA'+'a'.repeat(32),newSid='CA'+'b'.repeat(32);
  const hang=(await q('SELECT * FROM claim_call_agent($1)',[hangSid]))[0];assert.ok(hang);
  await pause(25);await q('SELECT release_call_agent($1,$2)',[hangSid,hang.agent_id]);
  assert.equal((await q('SELECT * FROM claim_call_agent($1,$2,$3)',[newSid,[],hang.agent_id]))[0].agent_id,hang.agent_id);
  assert.equal((await q('SELECT release_call_agent($1,$2)',[hangSid,hang.agent_id]))[0].release_call_agent,false);
  await q('SELECT release_call_agent($1,$2)',[newSid,hang.agent_id]);
  // Disconnect + process loss: expired lease is removed by the actual sweeper.
  for(const session of sessions)session.ws.emit('close');await Promise.all(sessions.map(s=>s.presence.settled()));
  await q("UPDATE agent_phone_sessions SET expires_at=now()-interval '1 second'");const presenceStart=performance.now();await rpc('expire_agent_phone_sessions',{});const presenceRemoval=performance.now()-presenceStart;
  assert.equal((await q('SELECT count(*)::int n FROM agent_availability WHERE available'))[0].n,0);
  // Evidence cannot be read by an unprovisioned subject or across agent boundaries.
  await pg.exec('SET ROLE authenticated');
  await assert.rejects(q('SELECT * FROM call_records'),e=>e.code==='42501'); // P0-8 raw browser reads are closed.
  const evidence=await q('SELECT * FROM read_evidence_call_records()');
  crossLeaks=evidence.filter(row=>row.agent_id!==agents[0].enrolledId).length;assert.equal(crossLeaks,0);assert.ok(evidence.length>0);
  await q("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'user_unprovisioned_synthetic',org_id:profile.organizationId,role:'authenticated'})]);
  unauthorized=(await q('SELECT * FROM read_evidence_call_records()')).length;assert.equal(unauthorized,0);
  await pg.exec('RESET ROLE');
  const storedRecordings=(await q("SELECT count(*)::int n FROM recording_ingestion WHERE copy_status='stored'"))[0].n;assert.equal(storedRecordings,uploads);
  const totals=(await q("SELECT count(*)::int n FROM call_records WHERE transcript_id IS NULL OR recording_storage_path IS NULL"))[0].n;
  const failed=(await q("SELECT count(*)::int n FROM post_call_requests WHERE status='failed' AND error_code IS NOT NULL"))[0].n;
  const backlog=(await q("SELECT count(*)::int n FROM post_call_requests WHERE status IN ('pending','running','queued')"))[0].n;
  const duration=performance.now()-start;
  const metrics={mode,cohort,wall_seconds:duration/1000,synthetic_call_minutes:20,calls,fault_calls:2,overflows,tracks:40,segments,callbacks,uploads,
   request_ms:{p50:percentile(request,.5),p95:percentile(request,.95),p99:percentile(request,.99)},routing_p95_ms:percentile(routing,.95),
   false_overflow_rate:falseOverflow/calls,lease_conflicts:conflicts,transcript_p95_ms:percentile(streamLag,.95),transcript_persistence_p95_ms:percentile(lag,.95),webhook_ack_p99_ms:percentile(ack,.99),post_call_p95_ms:percentile(queueAge,.95),
   presence_removal_ms:presenceRemoval,rss_peak_bytes:Math.max(...rss),rss_tail_growth_bytes:rss.at(-1)-rss[Math.floor(rss.length/2)],
   event_loop_p99_ms:delay.percentile(99)/1e6,cpu_ms:(process.cpuUsage(cpu).user+process.cpuUsage(cpu).system)/1000,
   db_lock_time_ms:null,queue_backlog:backlog,visible_exhausted_jobs:failed,paid_cost_usd:0};
  const gates={unauthorized_successes:{measured:unauthorized,pass:unauthorized===0},double_assignments:{measured:conflicts,pass:conflicts===0},cross_agent_leaks:{measured:crossLeaks,pass:crossLeaks===0},
   missing_terminal_linkage:{measured:totals,pass:totals===0},duplicate_uploads:{measured:storedRecordings-calls*.6,pass:storedRecordings===calls*.6},presence_removal:{measured:presenceRemoval,threshold_ms:60000,pass:presenceRemoval<60000},routing:{measured:metrics.routing_p95_ms,threshold_ms:2000,pass:metrics.routing_p95_ms<2000},
   webhook_ack:{measured:metrics.webhook_ack_p99_ms,threshold_ms:15000,pass:metrics.webhook_ack_p99_ms<15000},transcript:{measured:metrics.transcript_p95_ms,threshold_ms:3000,pass:metrics.transcript_p95_ms<3000},post_call:{measured:metrics.post_call_p95_ms,threshold_ms:120000,pass:metrics.post_call_p95_ms<120000},
   no_backlog:{measured:backlog,pass:backlog===0},visible_exhaustion:{measured:failed,expected:expiredJobs,pass:failed===expiredJobs},
   stable_memory:{measured:metrics.rss_tail_growth_bytes,pass:metrics.rss_tail_growth_bytes<=0},
   real_duration_soak:{measured:mediaMs/1000,required_seconds:3600,pass:false},multi_connection_db_locks:{measured:null,pass:false}};
  const result={metrics,gates,limitations:['WASM database serializes queries: independent PostgreSQL backends and lock wait are unverified.','20-minute call timestamps are accelerated; media is paced for the measured wall duration. Full 60-minute churn and longer wall-clock soak remain unverified.','Local SQL/track/presence adapters do not prove deployed HTTP, browser device, real provider, recording bytes or hosted quotas.']};
  if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');return result;
 }finally{await pg.exec('RESET ROLE');for(const session of sessions)session.ws.emit('close');await Promise.all(sessions.map(s=>s.presence.settled()));for(const [k,v] of Object.entries(savedVars)){if(v===undefined)delete process.env[k];else process.env[k]=v;}delay.disable();for(const stop of cleanup)stop();await pg.close();if(saved===undefined)delete process.env.DEPLOYMENT_PROFILE_JSON;else process.env.DEPLOYMENT_PROFILE_JSON=saved;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const mode=process.argv.includes('--long')?'long':'short',index=process.argv.indexOf('--output');const result=await runLocalLoad({mode,output:index>=0?process.argv[index+1]:undefined});console.log(JSON.stringify(result,null,2));if(Object.values(result.gates).some(gate=>!gate.pass))process.exitCode=1;}
 catch(error){console.error(error.stack);process.exitCode=1;}
}
