import '../fixtures/whisper-env.js';
import {createHash} from 'node:crypto';
import {freshDatabase} from './freshInstall.js';
import {freshInstallClient} from './freshInstallClient.js';
import {provisionDeployment} from '../../scripts/provision-deployment.js';
import profile from '../fixtures/deployment-profile.json' with {type:'json'};
import roster from '../fixtures/deployment-roster.json' with {type:'json'};
import {featureHeaders} from '../../telephony/src/lib/deploymentFeatures.js';
import {createConferenceStore} from '../../telephony/src/conferenceStore.js';
import {createConferenceService} from '../../telephony/src/conferenceCalling.js';
import {createSupervisorWhisper,coachIdentity} from '../../telephony/src/supervisorWhisper.js';
import {provider,settings as conferenceSettings} from '../../telephony/tests/helpers/conferenceHarness.js';
export const id=n=>`e1680000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),SUPERVISOR_FLOOR_ENABLED:'true',SUPERVISOR_LISTEN_ENABLED:'true',SUPERVISOR_WHISPER_ENABLED:'true',CONFERENCE_CALLING_ENABLED:'true'};
export const settings={...conferenceSettings,twilioApiKeySid:'SK'+'b'.repeat(32),twilioApiKeySecret:'fixture',twilioTwimlAppSid:'AP'+'c'.repeat(32)};
export const grant='G'.repeat(43),hash=createHash('sha256').update(grant).digest('hex');
export async function whisperFixture() {
 const pg=await freshDatabase(),db=freshInstallClient(pg),T=profile.tenantId,A=id(1),C=id(2),parent='CA'+'a'.repeat(32),child='CA'+'b'.repeat(32),coachSid='CA'+'d'.repeat(32),room='CF'+'c'.repeat(32);
 const q=(sql,args=[])=>pg.query(sql,args).then(r=>r.rows);
 await pg.exec('SET ROLE service_role');await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);await provisionDeployment(db,roster,env);await q("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 const agents=await q('SELECT id,clerk_user_id FROM enrolled_agents'),agent=n=>agents.find(e=>e.clerk_user_id===roster[n].clerk_user_id).id;
 const who=n=>({sub:roster[n].clerk_user_id,sid:'sess_whisper_'+n,org_id:profile.organizationId,deploymentIdentity:{agent_slug:roster[n].agent_slug,tenant_id:T}});
 const args=(n=0)=>({p_actor:who(n).sub,p_org:profile.organizationId,p_session:who(n).sid});
 await q("INSERT INTO deployment_authorities VALUES($1,$2,'admin','{}'),($1,$3,'manager',$4)",[T,who(0).sub,who(2).sub,[agent(1)]]);
 await q("INSERT INTO call_records(id,tenant_id,agent_id,call_direction,call_type,product_type,call_start,twilio_call_sid) VALUES($1,$2,$3,'outbound','sales','MA',clock_timestamp()-interval '90 seconds',$4)",[C,T,agent(1),parent]);
 await q("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,child_call_sid,agent_id,direction,status,call_record_id,answered_at) VALUES($1,$2,$3,$4,$5,'outbound','answered',$6,clock_timestamp()-interval '90 seconds')",[A,T,parent,child,roster[1].agent_slug,C]);
 await q("INSERT INTO media_stream_leases(call_sid,attempt_id,stream_sid,owner,expires_at) VALUES($1,$2,$3,gen_random_uuid(),clock_timestamp()+interval '1 hour')",[parent,A,'MZ'+'a'.repeat(32)]);
 const store=createConferenceStore(db),p=provider({parent,child}),states=new Map(),operations=p.operations;
 let failure=null;
 const originalCalls=p.client.calls;
 function calls(sid){const resource=originalCalls(sid);return {...resource,update:async data=>{if(failure==='remove')throw Error('synthetic remove failed');return resource.update(data);}};}calls.create=originalCalls.create;
 const conferences=sid=>{
  const participants=callSid=>({
   fetch:async()=>{operations.push(['fetch-participant',callSid]);if(failure==='fetch')throw Error('synthetic fetch failed');return structuredClone(states.get(callSid)||{accountSid:settings.twilioAccountSid,conferenceSid:room,callSid,status:'connected'});},
   update:async data=>{operations.push(['coach-control',callSid,data]);if(failure==='update')throw Error('synthetic update failed');if(!states.has(callSid))states.set(callSid,{});if('hold' in data)p.holds.push({id:callSid,...data});Object.assign(states.get(callSid),data);return states.get(callSid);},
  });participants.list=async()=>[...p.members.values(),...states.values()];
  return {participants,update:async data=>operations.push(['conference-update',sid,data])};
 };conferences.list=p.client.conferences.list;
 const client={...p.client,calls,conferences},timers=new Map();let timerId=0;
 const conference=createConferenceService({store,settings,client});
 const whisper=createSupervisorWhisper({conference,settings,client,enabled:()=>true,profile:()=>({supervisorWhisper:{maxSeconds:1800}}),schedule:fn=>{timers.set(++timerId,fn);return timerId;},cancel:key=>timers.delete(key),notify:(_agent,message)=>whisper.acknowledge(who(1),message.requestId)});
 const mint=(n=0,extra={})=>db.rpc('mint_supervisor_whisper',{...args(n),p_attempt:A,p_hash:hash,...extra});
 const connect=(n=0,extra={})=>db.rpc('connect_supervisor_whisper',{...args(n),p_hash:hash,p_attempt:A,p_seconds:1800,...extra});
 const current=()=>q("SELECT * FROM supervisor_listen_sessions WHERE mode='whisper' ORDER BY started_at DESC LIMIT 1").then(r=>r[0]);
 async function start() {const m=await mint();if(m.error)throw m.error;const bundle=await whisper.token(who(0),{grant,attempt:A});await q("UPDATE call_participants SET status='connected',joined_at=clock_timestamp() WHERE call_id=$1",[C]);p.calls.set(coachSid,{sid:coachSid,accountSid:settings.twilioAccountSid,status:'in-progress'});const xml=await whisper.join(coachIdentity(bundle.id),coachSid);const s=await current();states.set(coachSid,{accountSid:settings.twilioAccountSid,conferenceSid:room,callSid:coachSid,status:'connected',coaching:true,callSidToCoach:s.agent_leg_sid,startConferenceOnEnter:false,endConferenceOnExit:false,muted:true});await q("UPDATE call_participants SET status='connected',joined_at=clock_timestamp() WHERE id=$1",[s.participant_id]);await whisper.confirm(s);return {bundle,xml,session:await current()};}
 // Model the per-request rollback boundary while keeping the fixture transaction
 // isolated. PGlite has one backend; this does not assert native lock timing.
 const originalRpc=db.rpc.bind(db);db.rpc=(...args)=>{const result=originalRpc(...args);result.abortSignal=()=>result;return result;};
 const originalQuery=pg.query.bind(pg);let queue=Promise.resolve();
 pg.query=(...args)=>{const run=queue.then(async()=>{await pg.exec('SAVEPOINT whisper_query');try{const result=await originalQuery(...args);await pg.exec('RELEASE SAVEPOINT whisper_query');return result;}catch(error){await pg.exec('ROLLBACK TO SAVEPOINT whisper_query;RELEASE SAVEPOINT whisper_query');throw error;}});queue=run.catch(()=>{});return run;};
 const resetProvider=()=>{p.calls.clear();p.recordings.clear();p.streams.clear();p.members.clear();operations.length=0;p.holds.length=0;p.calls.set(parent,{sid:parent,parentCallSid:null,accountSid:settings.twilioAccountSid,status:'in-progress'});p.calls.set(child,{sid:child,parentCallSid:parent,accountSid:settings.twilioAccountSid,status:'in-progress'});};
 return {resetProvider,pg,db,q,T,A,C,parent,child,coachSid,room,agent,who,args,store,conference,whisper,client,p,states,operations,timers,mint,connect,current,start,set failure(value){failure=value;}};
}
