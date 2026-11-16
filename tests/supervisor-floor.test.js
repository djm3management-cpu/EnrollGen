import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from './fixtures/deployment-profile.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {featureHeaders,deploymentFeatures} from '../telephony/src/lib/deploymentFeatures.js';
import {parseDeploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {createSupervisorFloorHandler} from '../netlify/functions/supervisor-floor.js';
import {sortFloor,floorSeconds,startFloorPolling} from '../src/lib/supervisorFloor.js';
import {createSupervisorPlayback} from '../src/lib/supervisorPlayback.js';
let pg,db,ids;const T=profile.tenantId,id=n=>`e1660000-0000-4000-8000-${String(n).padStart(12,'0')}`,sid='CA'+'6'.repeat(32),A=id(1),C=id(2),S=id(3),HASH=createHash('sha256').update('synthetic-grant').digest('hex');
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),SUPERVISOR_FLOOR_ENABLED:'true',SUPERVISOR_LISTEN_ENABLED:'true'};
const q=(s,args=[])=>pg.query(s,args).then(r=>r.rows);
const auth=n=>({userId:roster[n].clerk_user_id,sessionId:'sess_floor_'+n,orgId:profile.organizationId,tokenPayload:{}});
const run=(name,args={})=>db.rpc(name,{...(name==='finish_supervisor_listen'?{}:{p_actor:auth(0).userId,p_org:profile.organizationId}),...args});
const floor=who=>db.rpc('read_supervisor_floor',{p_actor:who.userId,p_org:who.orgId});
const handler=(who=auth(0),settings=env,client=db)=>createSupervisorFloorHandler({authenticate:async()=>who,getDb:()=>client,env:settings});
const req=(method='GET',body=null,headers={})=>new Request('https://app.example.test/api/supervisor-floor',{method,headers,...(body?{body:JSON.stringify(body)}:{})});
const mint=()=>run('mint_supervisor_listen',{p_session:auth(0).sessionId,p_attempt:A,p_hash:HASH});
const connect=(args={})=>run('connect_supervisor_listen',{p_session:auth(0).sessionId,p_hash:HASH,p_attempt:A,p_seconds:1800,p_call_limit:2,p_agency_limit:6,...args});
async function live(){
 await q("UPDATE telephony_call_attempts SET answered_at=clock_timestamp()-interval '90 seconds',ended_at=NULL,status='answered' WHERE id=$1",[A]);
 await q('UPDATE call_records SET call_end=NULL WHERE id=$1',[C]);
 await q('UPDATE media_stream_leases SET expires_at=clock_timestamp()+interval \'1 hour\' WHERE attempt_id=$1',[A]);
}
before(async()=>{
 pg=await freshDatabase();db=freshInstallClient(pg);await pg.exec('SET ROLE service_role');await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);await provisionDeployment(db,roster,env);
 ids=await q('SELECT id,clerk_user_id FROM enrolled_agents');const aid=n=>ids.find(a=>a.clerk_user_id===roster[n].clerk_user_id).id;
 await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[T,auth(0).userId,auth(2).userId,[aid(1)]]);
 await q("INSERT INTO call_records(id,tenant_id,agent_id,call_direction,call_type,product_type,call_start,twilio_call_sid) VALUES($1,$2,$3,'outbound','sales','MA',clock_timestamp()-interval '90 seconds',$4)",[C,T,aid(1),sid]);
 await q("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,status,call_record_id,answered_at) VALUES($1,$2,$3,$4,'outbound','answered',$5,clock_timestamp()-interval '90 seconds')",[A,T,sid,roster[1].agent_slug,C]);
 await q("INSERT INTO media_stream_leases(call_sid,attempt_id,stream_sid,owner,expires_at) VALUES($1,$2,$3,gen_random_uuid(),clock_timestamp()+interval '1 hour')",[sid,A,'MZ'+'6'.repeat(32)]);
 await q("INSERT INTO agent_phone_sessions(session_id,agent_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[S,roster[1].agent_slug]);
});
after(async()=>{if(pg)await pg.close();});
const tile=async()=>{const r=await floor(auth(0));assert.ifError(r.error);return r.data.rows.find(r=>r.agent_id===ids.find(a=>a.clerk_user_id===roster[1].clerk_user_id).id);};
test('default off and strict parser, bounded deployment listen policy',()=>{
 assert.equal(deploymentFeatures({}).SUPERVISOR_FLOOR_ENABLED,false);assert.equal(deploymentFeatures({}).SUPERVISOR_LISTEN_ENABLED,false);
 for(const name of ['SUPERVISOR_FLOOR_ENABLED','SUPERVISOR_LISTEN_ENABLED'])assert.throws(()=>deploymentFeatures({[name]:'TRUE'}));
 assert.deepEqual(parseDeploymentProfile(profile,{}).supervisorListen,{maxSeconds:1800,perCall:2,perAgency:6});
 for(const bad of [{maxSeconds:0},{maxSeconds:7201},{perCall:11},{perAgency:101},{unknown:1}])assert.throws(()=>parseDeploymentProfile({...profile,supervisorListen:bad},{}));
});
test('off routes do no auth or client work, listen subordinate to floor',async()=>{
 for(const settings of [{},{SUPERVISOR_LISTEN_ENABLED:'true'}]){
 const h=createSupervisorFloorHandler({env:settings,authenticate:()=>assert.fail('auth'),getDb:()=>assert.fail('db')});assert.equal((await h(req())).status,404);assert.equal((await h(req('POST',{}))).status,404);
 }
 const h=handler(auth(0),{...env,SUPERVISOR_LISTEN_ENABLED:'false'});assert.equal((await h(req('POST',{}))).status,404);
 const r=await h(req());assert.equal(r.status,200);const d=await r.json();assert.equal(d.listen,false);assert.ok(d.rows.every(r=>!r.listen_available&&!('attempt_id'in r)));
});
test('database and HTTP deny agent, unprovisioned, foreign org; manager exact team, admin agency',async()=>{
 for(const who of [auth(1),{...auth(0),userId:'user_unprovisioned'},{...auth(0),orgId:'org_Foreign'}]){assert.ok((await floor(who)).error);assert.equal((await handler(who)(req())).status,403);}
 const manager=await floor(auth(2));assert.ifError(manager.error);assert.equal(manager.data.rows.length,1);assert.equal(manager.data.admin,false);
 assert.equal((await floor(auth(0))).data.rows.length,12);
 await q('UPDATE enrolled_agents SET is_active=false WHERE clerk_user_id=$1',[auth(2).userId]);try{assert.ok((await floor(auth(2))).error);}finally{await q('UPDATE enrolled_agents SET is_active=true WHERE clerk_user_id=$1',[auth(2).userId]);}
});
test('connected call wins over available, timer connected timestamp, ending wins over stale availability reservation',async()=>{
 await q("UPDATE agent_availability SET status='available',available=true WHERE agent_id=$1",[roster[1].agent_slug]);
 assert.equal((await tile()).status,'on_call');assert.equal((await tile()).listen_available,true);assert.ok((await tile()).connected_at);
 await q("UPDATE telephony_call_attempts SET ended_at=clock_timestamp(),status='completed' WHERE id=$1",[A]);
 await q('UPDATE call_records SET call_end=clock_timestamp() WHERE id=$1',[C]);
 await q("UPDATE agent_availability SET active_call_sid=$1,status='busy',resume_status='available' WHERE agent_id=$2",[sid,roster[1].agent_slug]);
 assert.equal((await tile()).status,'available');assert.equal((await tile()).listen_available,false);
 await q('UPDATE agent_availability SET active_call_sid=NULL WHERE agent_id=$1',[roster[1].agent_slug]);
});
test('manual and presence statuses derive from existing rows without writes',async()=>{
 for(const status of ['available','callbacks_only','busy','offline']){
 await q('UPDATE agent_availability SET status=$1,available=$2,active_call_sid=NULL,resume_status=NULL WHERE agent_id=$3',[status,status==='available',roster[1].agent_slug]);assert.equal((await tile()).status,status);
 }
 await q("UPDATE agent_phone_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[S]);assert.equal((await tile()).status,'offline');
 await q("UPDATE agent_phone_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE session_id=$1",[S]);
 await q('UPDATE agent_availability SET status=\'available\',available=true WHERE agent_id=$1',[roster[1].agent_slug]);
});
test('ringing from attempt, reservation, wrap-up from existing pending state',async()=>{
 await q("UPDATE telephony_call_attempts SET ended_at=NULL,answered_at=NULL,status='ringing' WHERE id=$1",[A]);await q('UPDATE call_records SET call_end=NULL WHERE id=$1',[C]);assert.equal((await tile()).status,'ringing');
 await q("UPDATE telephony_call_attempts SET ended_at=clock_timestamp(),status='completed' WHERE id=$1",[A]);
 await q("INSERT INTO call_wrap_ups(attempt_id,tenant_id,agent_id,agent_slug,call_sid,status,ended_at) VALUES($1,$2,$3,$4,$5,'pending',clock_timestamp()) ON CONFLICT(attempt_id) DO UPDATE SET status='pending',ended_at=clock_timestamp()",[A,T,ids.find(a=>a.clerk_user_id===roster[1].clerk_user_id).id,roster[1].agent_slug,sid]);assert.equal((await tile()).status,'wrap_up');
 await q("UPDATE call_wrap_ups SET status='saved',saved_at=clock_timestamp() WHERE attempt_id=$1",[A]);await live();
});
test('conference hold displayed, listen always disabled for conference including converted direct stream',async()=>{
 await q("INSERT INTO call_conferences(call_id,tenant_id,attempt_id,parent_call_sid,original_agent_id,owner_agent_id,name,phase,customer_held) VALUES($1,$2,$3,$4,$5,$5,'synthetic-floor','active',true)",[C,T,A,sid,roster[1].agent_slug]);
 try{assert.equal((await tile()).status,'on_hold');assert.equal((await tile()).listen_available,false);assert.ok((await mint()).error);await q('UPDATE call_conferences SET customer_held=false WHERE call_id=$1',[C]);assert.equal((await tile()).status,'on_call');assert.equal((await tile()).listen_available,false);}finally{await q('DELETE FROM call_conferences WHERE call_id=$1',[C]);}
});
test('safe current-call flags only, fixed rule categories, no message or free-text category escapes',async()=>{
 const aid=ids.find(a=>a.clerk_user_id===roster[1].clerk_user_id).id;
 await q("INSERT INTO sessions(id,agent_id,tenant_id,flow,call_record_id) VALUES($1,$2,$3,'ma',$4)",[id(4),aid,T,C]);
 await q("INSERT INTO compliance_flags(session_id,section_label,level,issue_tag,message) VALUES($1,'Private consumer','critical','hard_stop_prohibited_claim','123-45-6789 private transcript'),($1,'Private','warn','private_name','private body')",[id(4)]);
 const row=await tile();assert.deepEqual(row.flags,[{category:'hard_stop_prohibited_claim',count:1},{category:'other',count:1}]);assert.doesNotMatch(JSON.stringify(row),/private|123-45|consumer/i);
});
test('change detection still reauthorizes, has server timestamp, admission enforced',async()=>{
 const h=handler(),first=await h(req());assert.equal(first.status,200);const etag=first.headers.get('etag');assert.ok(first.headers.get('x-server-time'));
 const unchanged=await h(req('GET',null,{'If-None-Match':etag}));assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');assert.ok(unchanged.headers.get('x-server-time'));
 const bad={...db,rpc:async(name,args)=>name==='consume_admission'?{data:{allowed:false,retry_after:60}}:db.rpc(name,args)};
 assert.equal((await handler(auth(0),env,bad)(req())).status,429);
});
test('single-use grants bind call, actor and session; expired and inactive authority rejected',async()=>{
 assert.ifError((await mint()).error);
 for(const args of [{p_session:'other'},{p_attempt:id(999)},{p_actor:auth(2).userId},{p_hash:'0'.repeat(64)}])assert.ok((await connect(args)).error);
 await pg.exec('RESET ROLE');await q('UPDATE supervisor_listen_grants SET expires_at=clock_timestamp()-interval \'1 second\'');await pg.exec('SET ROLE service_role');assert.ok((await connect()).error);
 await mint();const connected=await connect();assert.ifError(connected.error);assert.ok(connected.data.id);assert.ok((await connect()).error);
 const sid=connected.data.id;
 assert.equal((await q('SELECT count(*)::integer n FROM evidence_access_log WHERE grant_id=$1 AND resource_type=\'supervisor_listen\'',[sid]))[0].n,1);
 assert.equal((await q('SELECT count(*)::integer n FROM admin_action_log WHERE target_id=$1 AND action=\'supervisor_listen_start\'',[sid]))[0].n,1);
 assert.equal((await run('renew_supervisor_listen',{p_id:sid,p_session:auth(0).sessionId})).data,true);
 await run('finish_supervisor_listen',{p_id:sid});await run('finish_supervisor_listen',{p_id:sid});
 assert.equal((await q('SELECT count(*)::integer n FROM admin_action_log WHERE target_id=$1 AND action=\'supervisor_listen_end\'',[sid]))[0].n,1);
 const history=await run('supervisor_listen_history');assert.ifError(history.error);assert.equal(history.data[0].id,sid);assert.equal(typeof history.data[0].duration_seconds,'number');
 assert.ok((await db.rpc('supervisor_listen_history',{p_actor:auth(2).userId,p_org:profile.organizationId})).error);
});
test('either start audit failure rolls back session and grant consumption',async()=>{
 for(const table of ['evidence_access_log','admin_action_log']){
 await mint();await pg.exec(`RESET ROLE;CREATE FUNCTION public.synthetic_listen_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END$$;CREATE TRIGGER synthetic_listen_fail BEFORE INSERT ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION public.synthetic_listen_audit_failure();SET ROLE service_role;`);
 try{assert.ok((await connect()).error);await pg.exec('RESET ROLE');const grants=await q('SELECT used_at FROM supervisor_listen_grants WHERE token_hash=$1',[HASH]);assert.equal(grants[0].used_at,null);await pg.exec('SET ROLE service_role');}finally{await pg.exec(`RESET ROLE;DROP TRIGGER synthetic_listen_fail ON ${table};DROP FUNCTION public.synthetic_listen_audit_failure();SET ROLE service_role;`);}
 }
});
test('one listen per supervisor, call cap and agency cap are enforced transactionally',async()=>{
 await mint();const first=await connect();assert.ifError(first.error);await mint();assert.ok((await connect()).error);
 const second=auth(2);await db.rpc('mint_supervisor_listen',{p_actor:second.userId,p_org:second.orgId,p_session:second.sessionId,p_attempt:A,p_hash:'2'.repeat(64)});
 for(const args of [{p_call_limit:1},{p_agency_limit:1}])assert.ok((await connect({p_actor:second.userId,p_session:second.sessionId,p_hash:'2'.repeat(64),...args})).error);
 await run('finish_supervisor_listen',{p_id:first.data.id});
});
test('lock, revocation, call end, lease and maximum expiry stop authorization',async()=>{
 for(const mode of ['lock','revoked','ended','lease','maximum']){
 await live();await mint();const c=await connect();assert.ifError(c.error);const session=c.data.id;
 if(mode==='lock')await q("INSERT INTO telephony_events(tenant_id,event,payload) VALUES($1,'session_lock',$2)",[T,{clerk_user_id:auth(0).userId}]);
 if(mode==='revoked')await q("UPDATE deployment_authorities SET authority='manager',team_agent_ids='{}' WHERE clerk_user_id=$1",[auth(0).userId]);
 if(mode==='ended')await q('UPDATE call_records SET call_end=clock_timestamp() WHERE id=$1',[C]);
 if(['lease','maximum'].includes(mode)){await pg.exec('RESET ROLE');await q(`UPDATE supervisor_listen_sessions SET ${mode==='lease'?'lease_until':'expires_at'}=clock_timestamp()-interval '1 second' WHERE id=$1`,[session]);await pg.exec('SET ROLE service_role');}
 const r=await run('renew_supervisor_listen',{p_id:session,p_session:auth(0).sessionId});assert.ok(r.error||r.data===false,mode);
 await run('finish_supervisor_listen',{p_id:session});
 if(mode==='lock')await q("INSERT INTO telephony_events(tenant_id,event,payload) VALUES($1,'session_unlock',$2)",[T,{clerk_user_id:auth(0).userId}]);
 if(mode==='revoked')await q("UPDATE deployment_authorities SET authority='admin' WHERE clerk_user_id=$1",[auth(0).userId]);
 }
 await live();
});
test('browser and anonymous roles cannot read grants/history or execute relay routines',async()=>{
 for(const role of ['authenticated','anon']){await pg.exec('SET ROLE '+role);assert.ok((await floor(auth(0))).error);assert.ok((await mint()).error);await assert.rejects(q('SELECT * FROM supervisor_listen_grants'));await assert.rejects(q('SELECT * FROM supervisor_listen_sessions'));}await pg.exec('SET ROLE service_role');
 for(const table of ['supervisor_listen_grants','supervisor_listen_sessions'])await assert.rejects(q('UPDATE '+table+' SET tenant_id=$1',[T]));
});
test('lifecycle contains fixed separate listen events and evidence index without new checks',async()=>{
 const contact=id(10);await q('INSERT INTO contacts(id,tenant_id,assigned_agent_id) VALUES($1,$2,$3)',[contact,T,roster[1].agent_slug]);await q('UPDATE call_records SET contact_id=$1 WHERE id=$2',[contact,C]);
 await pg.exec('RESET ROLE');
 const rows=await q("SELECT * FROM consumer_lifecycle_rows($1,$2) WHERE type='listen'",[contact,T]);assert.ok(rows.length);for(const row of rows){assert.equal(row.summary,'Supervisor listened to call');assert.equal(row.staff,auth(0).userId);assert.equal(row.evidence[0].table,'supervisor_listen_sessions');}await pg.exec('SET ROLE service_role');
});
test('sorting and server-anchored monotonic timers handle call precedence and browser wall-clock skew',()=>{
 const rows=[{agent_id:'a',name:'A',status:'available'},{agent_id:'b',name:'B',status:'on_call',connected_at:'2026-01-01T00:02Z'},{agent_id:'c',name:'C',status:'on_call',connected_at:'2026-01-01T00:01Z'}];assert.deepEqual(sortFloor(rows).map(r=>r.agent_id),['c','b','a']);assert.equal(floorSeconds('2026-01-01T00:00Z','2026-01-01T00:01Z',100,2100),62);
});
test('polling suppresses unchanged payload, cancels hidden work, avoids overlap and resumes focus',async()=>{
 let pending,received=0,requests=0,visible=true;const schedules=[];
 const poll=startFloorPolling({visible:()=>visible,fetchFloor:()=>{requests++;return new Promise(r=>pending=r);},onData:()=>received++,onError:()=>assert.fail(),schedule:f=>{schedules.push(f);return 1;},cancel:()=>{}});
 poll.refresh();poll.refresh();assert.equal(requests,1);visible=false;poll.pause();pending({});await new Promise(r=>setImmediate(r));assert.equal(received,0);visible=true;poll.refresh();pending({etag:'synthetic'});await new Promise(r=>setImmediate(r));assert.equal(received,1);assert.equal(schedules.length,1);poll.stop();
});
test('browser uses existing mu-law decoder, plays two tracks, closes output on stop and never captures a microphone',async()=>{
 const played=[],sockets=[];let heartbeat,closed=0;
 class Audio{constructor(){this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}createBuffer(_channels,length){return{getChannelData:()=>new Float32Array(length)};}createBufferSource(){return{connect(){},disconnect(){},start:t=>played.push(t),stop(){}};}}
 class Socket{constructor(){this.readyState=1;sockets.push(this);}send(){}close(){this.onclose?.();}}
 const player=createSupervisorPlayback({Audio,Socket,getToken:async()=>'synthetic-token',schedule:f=>{heartbeat=f;return 1;},cancel:()=>{}});await player.connect({url:'ws://localhost',grant:'synthetic',attempt:A});const ws=sockets[0];ws.onopen();ws.onmessage({data:JSON.stringify({type:'started'})});for(const track of ['inbound','outbound'])ws.onmessage({data:JSON.stringify({track,timestamp:0,audio:Buffer.alloc(160,255).toString('base64')})});assert.equal(played.length,2);assert.equal(played[0],played[1]);await heartbeat();player.stop();assert.equal(closed,1);
 const source=readFileSync('src/lib/supervisorPlayback.js','utf8')+readFileSync('src/components/SupervisorFloor.jsx','utf8');assert.doesNotMatch(source,/getUserMedia|MediaRecorder|createMediaStreamSource|microphone:/);
});

test('floor projection never writes availability, reservations, calls or transcription state',async()=>{
 const snapshot=async()=>JSON.stringify(await q("SELECT (SELECT jsonb_agg(to_jsonb(a) ORDER BY agent_id) FROM agent_availability a) availability,(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM telephony_call_attempts a) attempts,(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM call_records c) calls,(SELECT jsonb_agg(to_jsonb(s) ORDER BY session_id) FROM agent_phone_sessions s) presence"));
 const before=await snapshot();for(let n=0;n<5;n++)assert.ifError((await floor(auth(0))).error);assert.equal(await snapshot(),before);
});
test('manager outside team, removed target mapping and missing media cannot mint grants',async()=>{
 const manager=auth(2),agent=ids.find(a=>a.clerk_user_id===roster[1].clerk_user_id).id;
 await q("UPDATE deployment_authorities SET team_agent_ids='{}' WHERE clerk_user_id=$1",[manager.userId]);
 try{assert.ok((await db.rpc('mint_supervisor_listen',{p_actor:manager.userId,p_org:manager.orgId,p_session:manager.sessionId,p_attempt:A,p_hash:HASH})).error);}finally{await q('UPDATE deployment_authorities SET team_agent_ids=$1 WHERE clerk_user_id=$2',[[agent],manager.userId]);}
 await q('UPDATE availability_agent_subjects SET is_active=false WHERE agent_slug=$1',[roster[1].agent_slug]);try{assert.ok((await mint()).error);}finally{await q('UPDATE availability_agent_subjects SET is_active=true WHERE agent_slug=$1',[roster[1].agent_slug]);}
 await q("UPDATE media_stream_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE attempt_id=$1",[A]);try{assert.ok((await mint()).error);}finally{await live();}
});
test('a recorded lock prevents new listen grants until the existing unlock event arrives',async()=>{
 await q("INSERT INTO telephony_events(tenant_id,event,payload) VALUES($1,'session_lock',$2)",[T,{clerk_user_id:auth(0).userId}]);assert.ok((await mint()).error);
 await q("INSERT INTO telephony_events(tenant_id,event,payload) VALUES($1,'session_unlock',$2)",[T,{clerk_user_id:auth(0).userId}]);assert.ifError((await mint()).error);
});
test('ended canonical call beats a stale active attempt and reservation',async()=>{
 await live();await q("UPDATE agent_availability SET active_call_sid=$1,status='busy',resume_status='available' WHERE agent_id=$2",[sid,roster[1].agent_slug]);
 await q('UPDATE call_records SET call_end=clock_timestamp() WHERE id=$1',[C]);
 try{assert.equal((await tile()).status,'available');assert.equal((await tile()).listen_available,false);}finally{await q('UPDATE agent_availability SET active_call_sid=NULL WHERE agent_id=$1',[roster[1].agent_slug]);await live();}
});
test('durable sweeper closes lost sockets once, with both end records and bounded duration',async()=>{
 await mint();const c=await connect();assert.ifError(c.error);await pg.exec('RESET ROLE');await q("UPDATE supervisor_listen_sessions SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[c.data.id]);await pg.exec('SET ROLE service_role');
 assert.ifError((await db.rpc('sweep_supervisor_listens')).error);assert.ifError((await db.rpc('sweep_supervisor_listens')).error);
 const h=await run('supervisor_listen_history');const row=h.data.find(r=>r.id===c.data.id);assert.ok(row.ended_at);assert.equal(typeof row.duration_seconds,'number');
 assert.equal((await q("SELECT count(*)::integer n FROM evidence_access_log WHERE grant_id=$1 AND resource_type='supervisor_listen_end'",[c.data.id]))[0].n,1);
 assert.equal((await q("SELECT count(*)::integer n FROM admin_action_log WHERE target_id=$1 AND action='supervisor_listen_end'",[c.data.id]))[0].n,1);
});
