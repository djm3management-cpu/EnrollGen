import {evidenceIndex} from '../netlify/lib/lifecycle/packet.js';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {whisperFixture,env,id,hash} from './helpers/supervisorWhisperFixture.js';
import {createSupervisorFloorHandler} from '../netlify/functions/supervisor-floor.js';
import {whisperEnabled} from '../telephony/src/supervisorWhisper.js';
import {deploymentFeatures,featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {parseDeploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import {lifecyclePage} from '../netlify/lib/lifecycle/model.js';
import {assertWhisperRecordingSafe} from '../telephony/src/lib/whisperRecording.js';
import {conferenceRuntime} from '../telephony/src/conferenceRuntime.js';
let f;before(async()=>{f=await whisperFixture();});after(async()=>{await f?.pg.close();});
beforeEach(async()=>{f.resetProvider();await f.pg.exec('BEGIN');});afterEach(async()=>{conferenceRuntime.whisper=null;f.failure=null;await f.pg.exec('ROLLBACK;SET ROLE service_role');f.states.clear();f.timers.clear();});
for(const disabled of [{},{SUPERVISOR_WHISPER_ENABLED:'true'},{...env,SUPERVISOR_FLOOR_ENABLED:'false'},{...env,CONFERENCE_CALLING_ENABLED:'false'},{...env,SUPERVISOR_WHISPER_ENABLED:'false'}])test('whisper requires all three exact switches: '+JSON.stringify(disabled),async()=>{
 assert.equal(whisperEnabled(disabled),false);
 const handler=createSupervisorFloorHandler({env:disabled,authenticate:()=>assert.fail('auth'),getDb:()=>assert.fail('db')});
 assert.equal((await handler(new Request('https://app.test/api/supervisor-floor',{method:'POST',body:JSON.stringify({action:'whisper',attempt_id:f.A})}))).status,404);
});
test('strict switch parser and profile bounds retain defaults',()=>{
 assert.equal(deploymentFeatures({}).SUPERVISOR_WHISPER_ENABLED,false);assert.equal(whisperEnabled(env),true);
 for(const value of ['TRUE','1','yes',' false '])assert.throws(()=>deploymentFeatures({SUPERVISOR_WHISPER_ENABLED:value}));
 assert.deepEqual(parseDeploymentProfile(profile,{}).supervisorWhisper,{maxSeconds:1800});
 for(const supervisorWhisper of [{maxSeconds:0},{maxSeconds:7201},{maxSeconds:1.5},{perCall:2}])assert.throws(()=>parseDeploymentProfile({...profile,supervisorWhisper},{}));
});
test('grant offered only for connected scoped manager or admin; floor exposes no provider identifiers',async()=>{
 for(const n of [0,2])assert.ifError((await f.mint(n,{p_hash:String(n+1).repeat(64)})).error);
 const who=f.who(2),handler=createSupervisorFloorHandler({env,authenticate:async()=>({userId:who.sub,sessionId:who.sid,orgId:who.org_id}),getDb:()=>f.db});
 const result=await handler(new Request('https://app.test/api/supervisor-floor'));assert.equal(result.status,200);const page=await result.json();assert.equal(page.rows.length,1);assert.equal(page.rows[0].whisper_available,true);assert.doesNotMatch(JSON.stringify(page),/CA[a-f0-9]{32}|call_id|token_hash/);
 const grant=await handler(new Request('https://app.test/api/supervisor-floor',{method:'POST',body:JSON.stringify({action:'whisper',attempt_id:f.A})}));assert.equal(grant.status,200);assert.equal((await grant.json()).grant.length,43);
});
for(const [name,change] of [
 ['agent',()=>f.mint(1)],['foreign agency',()=>f.mint(0,{p_org:'org_foreign'})],['missing subject',()=>f.mint(0,{p_actor:'user_unknown'})],['missing session',()=>f.mint(0,{p_session:''})],
 ['other team',async()=>{await f.q("UPDATE deployment_authorities SET team_agent_ids='{}' WHERE clerk_user_id=$1",[f.who(2).sub]);return f.mint(2);}],
 ['ringing',async()=>{await f.q('UPDATE telephony_call_attempts SET answered_at=NULL WHERE id=$1',[f.A]);return f.mint();}],
 ['finished attempt',async()=>{await f.q('UPDATE telephony_call_attempts SET ended_at=clock_timestamp() WHERE id=$1',[f.A]);return f.mint();}],
 ['finished call',async()=>{await f.q('UPDATE call_records SET call_end=clock_timestamp() WHERE id=$1',[f.C]);return f.mint();}],
 ['wrap up',async()=>{await f.q("INSERT INTO call_wrap_ups(attempt_id,tenant_id,agent_id,agent_slug,call_sid,status,ended_at) SELECT id,tenant_id,$2,agent_id,parent_call_sid,'pending',clock_timestamp() FROM telephony_call_attempts WHERE id=$1",[f.A,f.agent(1)]);return f.mint();}],
 ['locked session',async()=>{await f.q("INSERT INTO telephony_events(tenant_id,event,payload) VALUES($1,'session_lock',$2)",[f.T,{clerk_user_id:f.who(0).sub}]);return f.mint();}],
])test('grant refuses '+name,async()=>assert.ok((await change()).error));
for(const phase of ['warm','blind','recovering','voicemail','ended','upgrading'])test('grant refuses conference phase '+phase,async()=>{
 await f.conference.upgrade((await f.q('SELECT * FROM telephony_call_attempts WHERE id=$1',[f.A]))[0],null);await f.q('UPDATE call_conferences SET phase=$1 WHERE call_id=$2',[phase,f.C]);assert.ok((await f.mint()).error);
});
test('grant refuses another operation lease',async()=>{
 await f.start();await f.q("UPDATE call_conferences SET operation_until=clock_timestamp()+interval '30 seconds' WHERE call_id=$1",[f.C]);assert.ok((await f.mint()).error);
});
for(const [name,args] of [['missing',{p_hash:null}],['wrong hash',{p_hash:'f'.repeat(64)}],['wrong call',{p_attempt:id(999)}],['wrong actor',{p_actor:'user_unknown'}],['wrong session',{p_session:'other'}]])test('redemption refuses '+name,async()=>{assert.ifError((await f.mint()).error);assert.ok((await f.connect(0,args)).error);});
test('expired and reused grants fail, listen cannot redeem whisper',async()=>{
 await f.mint();await f.pg.exec('RESET ROLE');await f.q("UPDATE supervisor_listen_grants SET expires_at=clock_timestamp()-interval '1 second'");await f.pg.exec('SET ROLE service_role');assert.ok((await f.connect()).error);await f.mint();assert.ok((await f.db.rpc('connect_supervisor_listen',{...f.args(),p_hash:hash,p_attempt:f.A,p_seconds:100,p_call_limit:2,p_agency_limit:6})).error);assert.ifError((await f.connect()).error);assert.ok((await f.connect()).error);
});
for(const table of ['evidence_access_log','admin_action_log'])test(table+' failure rolls back grant consumption and adds nobody',async()=>{
 await f.mint();await f.pg.exec(`RESET ROLE;CREATE FUNCTION synthetic_whisper_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$;CREATE TRIGGER synthetic_whisper_fail BEFORE INSERT ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION synthetic_whisper_failure();SET ROLE service_role;`);
 assert.ok((await f.connect()).error);assert.equal((await f.q('SELECT count(*)::int n FROM call_participants'))[0].n,0);await f.pg.exec('RESET ROLE');assert.equal((await f.q('SELECT used_at FROM supervisor_listen_grants'))[0].used_at,null);
});
test('concurrent attempts admit one supervisor for a call',async()=>{
 await f.mint();await f.mint(2,{p_hash:'2'.repeat(64)});const results=await Promise.all([f.connect(),f.connect(2,{p_hash:'2'.repeat(64)})]);assert.equal(results.filter(r=>!r.error).length,1);
});
test('one supervisor cannot acquire a second call or a second tab',async()=>{
 await f.mint();assert.ifError((await f.connect()).error);await f.mint();assert.ok((await f.connect()).error);
 await f.q("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,child_call_sid,agent_id,direction,status,answered_at) VALUES($1,$2,$3,$4,'pilot_agent_03','outbound','answered',clock_timestamp())",[id(50),f.T,'CA'+'e'.repeat(32),'CA'+'f'.repeat(32)]);
 const m=await f.mint(0,{p_attempt:id(50)});assert.ifError(m.error);assert.ok((await f.connect(0,{p_attempt:id(50)})).error);
 const indexes=await f.q("SELECT indexdef FROM pg_indexes WHERE indexname IN ('supervisor_one_listen','supervisor_one_whisper_call')");assert.equal(indexes.length,2);
});
test('starting whisper ends that supervisor listen relay, without duplicate audit start',async()=>{
 await f.db.rpc('mint_supervisor_listen',{...f.args(),p_attempt:f.A,p_hash:hash});const listen=await f.db.rpc('connect_supervisor_listen',{...f.args(),p_hash:hash,p_attempt:f.A,p_seconds:100,p_call_limit:2,p_agency_limit:6});assert.ifError(listen.error);
 await f.mint();const s=await f.connect();assert.ifError(s.error);assert.ok((await f.q('SELECT ended_at FROM supervisor_listen_sessions WHERE id=$1',[listen.data.id]))[0].ended_at);
 for(const [table,column,value] of [['evidence_access_log','resource_type','supervisor_whisper'],['admin_action_log','action','supervisor_whisper_start']])assert.equal((await f.q(`SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`,[value]))[0].n,1);
});
test('Talk and Mute append timed records; end is idempotent with duration and total talk time',async()=>{
 const {session}=await f.start();await f.whisper.control(f.who(0),session.id,'talk');await f.q('SELECT pg_sleep(0.015)');await f.whisper.control(f.who(0),session.id,'mute');await f.whisper.stop(await f.current());await f.whisper.stop(await f.current());const s=await f.current();assert.ok(s.ended_at);assert.equal(typeof s.duration_seconds,'number');assert.ok(Number(s.talk_seconds)>0);
 const logs=await f.q("SELECT action,occurred_at FROM admin_action_log WHERE target_id=$1 ORDER BY occurred_at",[s.id]);assert.deepEqual(logs.map(r=>r.action),['supervisor_whisper_start','supervisor_whisper_talk','supervisor_whisper_mute','supervisor_whisper_end']);assert.ok(logs.every(r=>r.occurred_at));
});
test('admin Listen history and lifecycle retain whisper with talk time and evidence index',async()=>{
 const {session}=await f.start();await f.whisper.stop(session);const history=await f.db.rpc('supervisor_listen_history',{p_actor:f.who(0).sub,p_org:profile.organizationId});assert.ifError(history.error);assert.equal(history.data[0].mode,'whisper');assert.equal(history.data[0].talk_seconds,0);
 assert.ok((await f.db.rpc('supervisor_listen_history',{p_actor:f.who(2).sub,p_org:profile.organizationId})).error);
 await f.q('INSERT INTO contacts(id,tenant_id) VALUES($1,$2)',[id(80),f.T]);await f.q('UPDATE call_records SET contact_id=$1 WHERE id=$2',[id(80),f.C]);await f.pg.exec('RESET ROLE');const events=await f.q("SELECT * FROM consumer_lifecycle_rows($1,$2) WHERE type='whisper'",[id(80),f.T]);assert.equal(events.length,1);assert.equal(events[0].summary,'Supervisor whispered to agent');assert.equal(events[0].staff,f.who(0).sub);assert.equal(events[0].evidence[0].table,'supervisor_listen_sessions');
 const page=lifecyclePage({consumerId:id(80),events,accesses:[],checkInputs:[],hasMore:false});assert.ok(page.types.includes('whisper'));assert.equal(page.checks.length,0);assert.ok(evidenceIndex(events).some(e=>e.table==='supervisor_listen_sessions'&&e.id===session.id));
});
for(const role of ['anon','authenticated'])test(role+' has no coach mutation or history access',async()=>{await f.pg.exec('SET ROLE '+role);assert.ok((await f.mint()).error);await assert.rejects(f.q('SELECT * FROM supervisor_listen_sessions'));assert.ok((await f.db.rpc('control_supervisor_whisper',{p_id:id(100),p_actor:f.who(0).sub,p_session:f.who(0).sid,p_action:'end'})).error);});
test('supervisor participant cannot stream, record, transcribe, or own disposition',async()=>{
 const {session}=await f.start(),p=session.participant_id;
 assert.equal((await f.db.rpc('claim_conference_media',{p_participant_id:p,p_call_sid:f.coachSid,p_generation:0,p_stream_sid:'MZ'+'d'.repeat(32),p_owner:id(10)})).data,false);
 assert.ok((await f.db.rpc('persist_conference_transcript',{p_participant_id:p,p_segment_id:id(12),p_speaker:'agent',p_text:'private coach',p_captured_at:new Date().toISOString(),p_start_ms:0,p_end_ms:10})).error);
 assert.ok((await f.db.rpc('enqueue_conference_recording',{p_participant_id:p,p_callback:{CallSid:f.coachSid}})).error);
 assert.ok((await f.db.rpc('complete_conference_agent_transfer',{p_call_id:f.C,p_participant_id:p})).error);
 await assert.rejects(f.q("UPDATE call_participants SET recording_sid='REsynthetic' WHERE id=$1",[p]));
 const snapshot=await f.conference.snapshot(f.C);assert.equal(snapshot.participants.length,2);assert.ok(snapshot.participants.every(p=>p.role!=='supervisor'));
 assert.equal((await f.q('SELECT agent_id FROM call_records WHERE id=$1',[f.C]))[0].agent_id,f.agent(1));
 const call=(await f.q('SELECT * FROM call_records WHERE id=$1',[f.C]))[0];assert.throws(()=>assertWhisperRecordingSafe(call),/cannot be transcribed/);assert.doesNotThrow(()=>assertWhisperRecordingSafe({metadata:{}}));
});
test('recording-to-text consumers enforce the persisted marker before provider dispatch',()=>{
 for(const file of ['transcribe.js','transcript-gaps-background.js','backfill-deepgram-intelligence.js'])assert.match(readFileSync('netlify/functions/'+file,'utf8'),/assertWhisperRecordingSafe\(/);
});
test('database rejects coach phone routing, availability, presence and reservations',async()=>{
 for(const sql of ["INSERT INTO agent_availability(agent_id) VALUES('coach_forbidden')","INSERT INTO agent_phone_sessions(session_id,agent_id,expires_at) VALUES(gen_random_uuid(),'coach_forbidden',clock_timestamp())"])await assert.rejects(f.q(sql));
 await assert.rejects(f.q("UPDATE tenant_agents SET agent_slug='coach_forbidden' WHERE clerk_user_id=$1",[f.who(0).sub]));
});
test('disabled SQL refuses new coach grants even with a forged browser authority field',async()=>{
 await f.q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders({}))]);assert.ok((await f.mint()).error);
});
