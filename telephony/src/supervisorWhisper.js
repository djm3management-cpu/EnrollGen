import {createHash,randomUUID} from 'node:crypto';
import twilio from 'twilio';
import {checked,ConferenceError} from './conferenceStore.js';
import {featureEnabled} from './lib/deploymentFeatures.js';
import {deploymentProfile} from './lib/deploymentProfile.js';
import {voiceAccessToken} from './voiceAccessToken.js';
import {sendToAgent} from './media/agentSocket.js';
import {createLogger,securityEvent} from './lib/logger.js';
const logger=createLogger('telephony','supervisorwhisper');
export const whisperEnabled=(env=process.env)=>featureEnabled('SUPERVISOR_WHISPER_ENABLED',env)&&featureEnabled('SUPERVISOR_FLOOR_ENABLED',env)&&featureEnabled('CONFERENCE_CALLING_ENABLED',env);
export const coachIdentity=id=>'coach_'+id.replaceAll('-','');
const fail=()=>{throw new ConferenceError(409,'Whisper unavailable.');};
// A coach can only enter via TwiML with a valid target. There is no ordinary
// participant fallback, upgrade-to-coach operation, or public unmute path.
export function coachTwiml(c,s,settings) {
 if(!/^CA[a-f0-9]{32}$/i.test(s.agent_leg_sid||''))fail();
 const response=new twilio.twiml.VoiceResponse();
 response.dial({action:settings.publicBaseUrl+`/twilio/conference/exit?participantId=${s.participant_id}`,method:'POST'}).conference({
  coach:s.agent_leg_sid,muted:true,beep:false,startConferenceOnEnter:false,endConferenceOnExit:false,
  participantLabel:s.participant_id,waitUrl:'',record:'do-not-record',
 },c.name);
 return response.toString();
}
export function coachingConfirmed(p,s,c,{muted}={}) {
 return p?.accountSid===c.accountSid&&p.conferenceSid===c.twilio_conference_sid&&p.callSid===s.coachSid&&
 p.coaching===true&&p.callSidToCoach===s.agent_leg_sid&&p.startConferenceOnEnter===false&&p.endConferenceOnExit===false&&
 p.status==='connected'&&(muted===undefined||p.muted===muted);
}
export function createSupervisorWhisper({conference,settings,profile=()=>deploymentProfile(),enabled=whisperEnabled,
 client=twilio(settings.twilioAccountSid,settings.twilioAuthToken,{timeout:2000,autoRetry:false}),
 notify=sendToAgent,now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}) {
 const store=conference.store,db=store.db,timers=new Map(),pendingCheckpoints=new Map(),guards=new Map(),known=new Map();
 const rpc=async(name,args)=>{const result=await db.rpc(name,args).abortSignal(AbortSignal.timeout(2000));if(result.error?.code==='P1571')securityEvent('audit_write_failed');if(result.error?.code==='P1611')securityEvent('admin_log_write_failed');return checked(result,name);};
 const get=id=>db.from('supervisor_listen_sessions').select('*').eq('id',id).eq('mode','whisper').maybeSingle().abortSignal(AbortSignal.timeout(2000)).then(checked);
 const leg=s=>store.participant(s.participant_id);
 const whoArgs=who=>({p_actor:who.sub,p_org:who.org_id||who.o?.id||null,p_session:who.sid});
 async function renew(s,who) {
  if(!enabled()||!who.sid||!await rpc('renew_supervisor_whisper',{p_id:s.id,...whoArgs(who)}))fail();
  if(known.has(s.id))arm({...s,lease_until:new Date(now()+6000).toISOString()});
 }
 function arm(s) {
  cancel(guards.get(s.id));
  const delay=Math.max(0,Math.min(6000,Date.parse(s.expires_at)-now()));
  guards.set(s.id,schedule(()=>void stop(s).catch(()=>logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id})),delay));
 }
 async function stop(s) {
  if(!s||s.ended_at)return;
  cancel(timers.get(s.id));timers.delete(s.id);cancel(guards.get(s.id));guards.delete(s.id);
  try {
   if(s.participant_id) {
    // The local deadline can remove the known coach without a database read.
    // A database outage must not leave a live authenticated audio listener.
    const sid=known.get(s.id)?.sid||(await leg(s))?.twilio_call_sid;
    if(sid){try{await client.calls(sid).update({status:'completed'});}catch(error){if(error.code!==20404)throw error;}}
    await store.patchParticipant(s.participant_id,{status:'left',left_at:new Date(now()).toISOString()});
   }
   await rpc('control_supervisor_whisper',{p_id:s.id,p_actor:s.actor_id,p_session:s.session_id,p_action:'end'});
   known.delete(s.id);
  }catch(error){guards.set(s.id,schedule(()=>void stop(s).catch(()=>logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id})),1000));throw error;}
 }
 async function providerState(s,{muted}={}) {
  const c=await store.get(s.call_id),p=await leg(s);
  if(!c||c.ended_at||!p||p.status==='left'||!p.twilio_call_sid)fail();
  const agent=(await store.participants(c.call_id)).find(a=>a.role==='agent'&&a.twilio_call_sid===s.agent_leg_sid&&a.status==='connected');
  if(!agent||!['active','warm_completed'].includes(c.phase))fail();
  const room=await conference.roomSid(c),state=await client.conferences(room).participants(p.twilio_call_sid).fetch();
  if(!coachingConfirmed(state,{...s,coachSid:p.twilio_call_sid},{...c,accountSid:settings.twilioAccountSid,twilio_conference_sid:room},{muted}))fail();
  return {c,p,room};
 }
 async function confirm(s) {
  try {
   if(!enabled()||Date.parse(s.lease_until)<=now()||Date.parse(s.expires_at)<=now())fail();
   await providerState(s,{muted:true});
   await rpc('control_supervisor_whisper',{p_id:s.id,p_actor:s.actor_id,p_session:s.session_id,p_action:'confirm'});
  }catch(error){await stop(s);throw error;}
 }
 function watch(s) {
  const deadline=now()+3000;
  const check=async()=>{
   try{await confirm(s);}
   catch{
    // A provider error fails immediately. Cleanup errors are retried by the
    // existing recovery sweep; no unmute is ever granted on uncertainty.
    if(now()<deadline){try{await stop(s);}catch{logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id});}}
   }
   finally{timers.delete(s.id);}
  };
  timers.set(s.id,schedule(()=>void check(),250));
 }
 async function checkpoint(attempt) {
  if(attempt.direction!=='outbound')return;
  const id=randomUUID();
  await new Promise((resolve,reject)=>{
   const timer=schedule(()=>{pendingCheckpoints.delete(id);reject(new ConferenceError(409,'Whisper unavailable.'));},3000);
   pendingCheckpoints.set(id,{attempt,resolve:()=>{cancel(timer);pendingCheckpoints.delete(id);resolve();}});
   notify(attempt.agent_id,{type:'whisper_checkpoint',requestId:id,callSid:attempt.parent_call_sid});
  });
 }
 async function token(who,input) {
  if(!enabled()||!who.sid||typeof input.grant!=='string'||input.grant.length!==43)fail();
  const s=await rpc('connect_supervisor_whisper',{...whoArgs(who),p_hash:createHash('sha256').update(input.grant).digest('hex'),p_attempt:input.attempt,p_seconds:profile().supervisorWhisper.maxSeconds});
  try {
   let c=s.call_id&&await store.get(s.call_id);
   if(!c) {
    const attempt=checked(await db.from('telephony_call_attempts').select('*').eq('id',s.attempt_id).eq('tenant_id',s.tenant_id).single());
    await checkpoint(attempt);
    // This is the same upgrade routine used by agent controls, without edits.
    c=await conference.upgrade(attempt,attempt.to_number);
    await store.patch(c.call_id,{whisper_conversion:true});
   }
   // Do not dispatch a new control action or alter hold/transfer state. The
   // existing conversion owns its original operation lease and recovery.
   await store.locked(c.call_id,async current=>{
    if(current.phase==='upgrading')await conference.connectOriginal(current);
   });
   // The signed browser join rechecks authority after the original callbacks.
   if(Date.parse(s.lease_until)<=now())fail();
   return {token:voiceAccessToken(coachIdentity(s.id),{incoming:false,ttl:45,settings}),id:s.id};
  }catch(error){await stop(s);throw error;}
 }
 async function join(identity,callSid) {
  if(!enabled()||!/^coach_[0-9a-f]{32}$/.test(identity))fail();
  const raw=identity.slice(6),id=[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20)].join('-');
  const s=await get(id);if(!s||s.ended_at)fail();
  try {
   await renew(s,{sub:s.actor_id,sid:s.session_id});
   const attempt=checked(await db.from('telephony_call_attempts').select('call_record_id').eq('id',s.attempt_id).single());
   return await store.locked(attempt.call_record_id,async c=>{
    const attached=await rpc('attach_supervisor_whisper',{p_id:id,p_actor:s.actor_id,p_org:null,p_session:s.session_id,p_call:c.call_id,p_sid:callSid});
    known.set(id,{sid:callSid,session:attached});arm(attached);
    // Verify the target is really in this room before handing out join TwiML.
    const room=await conference.roomSid(c),agent=await client.conferences(room).participants(attached.agent_leg_sid).fetch();
    if(agent.accountSid!==settings.twilioAccountSid||agent.conferenceSid!==room||agent.callSid!==attached.agent_leg_sid||agent.status!=='connected')fail();
    watch(attached);
    return coachTwiml(c,attached,settings);
   });
  }catch(error){await stop(known.get(id)?.session||s);throw error;}
 }
 async function control(who,id,action) {
  const s=await get(id);if(!s||s.actor_id!==who.sub||s.session_id!==who.sid)fail();
  if(action==='stop'){await stop(s);return {active:false};}
  try {
   await renew(s,who);
   if(action==='renew')return {active:true,confirmed:Boolean(s.confirmed_at)};
   if(!['talk','mute'].includes(action))fail();
   return await store.locked(s.call_id,async()=>{
    const {p,room}=await providerState(s);
    // Audit authorizes the requested transition before provider dispatch. Any
    // audit/provider/confirmation failure ends only the coach leg.
    await rpc('control_supervisor_whisper',{p_id:id,p_actor:who.sub,p_session:who.sid,p_action:action});
    await client.conferences(room).participants(p.twilio_call_sid).update({muted:action==='mute',coaching:true,callSidToCoach:s.agent_leg_sid,endConferenceOnExit:false});
    await providerState(s,{muted:action==='mute'});
    return {active:true,muted:action==='mute'};
   });
  }catch(error){await stop(known.get(id)?.session||s);throw error;}
 }
 async function forCall(callId) {return checked(await db.from('supervisor_listen_sessions').select('*').eq('call_id',callId).eq('mode','whisper').is('ended_at',null));}
 return {enabled,token,join,control,stop,confirm,providerState,
  acknowledge(who,id){const p=pendingCheckpoints.get(id);if(!p||who.deploymentIdentity?.agent_slug!==p.attempt.agent_id||who.deploymentIdentity?.tenant_id!==p.attempt.tenant_id)fail();p.resolve();},
  async indicator(callId){const s=(await forCall(callId)).find(s=>s.confirmed_at);if(!s)return null;const p=await leg(s);if(p?.status==='left')return null;const supervisor=checked(await db.from('enrolled_agents').select('name').eq('tenant_id',s.tenant_id).eq('clerk_user_id',s.actor_id).maybeSingle());return supervisor?.name||null;},
  async endCall(c){try{for(const s of await forCall(c.call_id))try{await stop(s);}catch{logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id});}}catch{logger.error('supervisor_whisper_cleanup_failed');}},
  async beforeAction(c,input){if(c.whisper_conversion&&['dial','hold'].includes(input.action))await store.patch(c.call_id,{whisper_conversion:false});if(input.action==='dial'&&['warm','blind'].includes(input.mode))for(const s of await forCall(c.call_id))await stop(s);},
  async departed(c,p){try{for(const s of await forCall(c.call_id))if(p.role==='supervisor'&&p.id===s.participant_id||p.twilio_call_sid===s.agent_leg_sid||p.role==='customer')try{await stop(s);}catch{logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id});}}catch{logger.error('supervisor_whisper_cleanup_failed');}},
  async recover(c){
   for(const s of await forCall(c.call_id)) {
    try {
     if(!enabled()||Date.parse(s.lease_until)<=now()||Date.parse(s.expires_at)<=now())await stop(s);
     else {
      // Current authority and lock diagnostics are checked even if the browser
      // disappeared immediately after its last successful renewal.
      const a=await rpc('supervisor_whisper_authorize',{p_actor:s.actor_id,p_org:null,p_attempt:s.attempt_id,p_check_lock:false});
      if(a.agent!==s.agent_id)fail();
      await providerState(s);
     }
    }catch{try{await stop(s);}catch{logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id});}}
   }
  },
  async sweep(){const sessions=checked(await db.from('supervisor_listen_sessions').select('*').eq('mode','whisper').is('ended_at',null));for(const s of sessions)if(!enabled()||Date.parse(s.lease_until)<=now()||Date.parse(s.expires_at)<=now())try{await stop(s);}catch{logger.error('supervisor_whisper_cleanup_failed',{grant_id:s.id});}},
 };
}
