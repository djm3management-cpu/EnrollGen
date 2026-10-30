import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveEvidenceIdentity} from './_evidenceAccess.js';
import {normalizeOutcome} from '../lib/postCallWork.js';
import {ancillarySaleError} from '../../src/lib/ancillarySale.js';
import {connectedCallSeconds} from '../../src/lib/callDisposition.js';

export function createCallDispositionHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient}={}) {
 return async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try {
   const db=getDb(),{agent,tenant}=await resolveEvidenceIdentity(db,auth);
   const roster=checked(await db.from('availability_agent_subjects').select('agent_slug').eq('tenant_id',tenant.id)
    .eq('clerk_user_id',auth.userId).eq('is_active',true).single());
   const availability=checked(await db.from('agent_availability').select('active_call_sid').eq('agent_id',roster.agent_slug).single());
   // Never show/submit wrap-up based on a transfer leg while any agent call
   // still owns a reservation. The browser also independently checks its SDK.
   if(availability.active_call_sid){
    if(request.method==='POST')throw new EvidenceError(409,'Finish the active call before saving its disposition.');
    return evidenceJson(200,{in_progress:true,disposition:null});
   }
   const openCalls=checked(await db.from('telephony_call_attempts').select('id').eq('tenant_id',tenant.id)
    .eq('agent_id',roster.agent_slug).not('answered_at','is',null).is('ended_at',null).limit(1));
   if(openCalls.length){
    if(request.method==='POST')throw new EvidenceError(409,'Finish the active call before saving its disposition.');
    return evidenceJson(200,{in_progress:true,disposition:null});
   }
   let input={};
   if(request.method==='POST'){
    try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid JSON.');}
    if(!/^CA[0-9a-f]{32}$/i.test(input.call_sid||''))throw new EvidenceError(400,'Invalid call SID.');
   }
   let attempts=db.from('telephony_call_attempts').select('id,parent_call_sid,child_call_sid,agent_id,direction,status,answered_at,ended_at,talk_seconds,call_record_id')
    .eq('tenant_id',tenant.id).eq('agent_id',roster.agent_slug).eq('status','completed').not('ended_at','is',null).not('answered_at','is',null)
    .order('ended_at',{ascending:false}).limit(1);
   if(input.call_sid)attempts=attempts.eq('parent_call_sid',input.call_sid);
   else {
    // Do not turn deployment into a historical disposition backlog.
    const policy=checked(await db.from('call_wrap_up_policy').select('updated_at').eq('singleton',true).single());
    attempts=attempts.gte('created_at',policy.updated_at);
   }
   // Only the latest connected call can prompt. Saving it must not uncover
   // older incomplete records as an endless historical disposition queue.
   let selected;
   for(const attempt of checked(await attempts)){
    // Inbound child SID is the persisted answering agent leg; outbound's
    // browser/agent leg is the parent. Unknown/unbound legs never prompt.
    const leg=attempt.direction==='inbound'?attempt.child_call_sid:attempt.parent_call_sid;
    if(!/^CA[0-9a-f]{32}$/i.test(leg||''))continue;
    if(attempt.direction==='outbound'){
     const terminal=checked(await db.from('telephony_events').select('payload').eq('tenant_id',tenant.id)
      .eq('twilio_call_sid',attempt.parent_call_sid).eq('event','call_completed').limit(5));
     if(!terminal.some(event=>event.payload?.CallSid===attempt.parent_call_sid && event.payload?.CallStatus==='completed'))continue;
    }
    const session=checked(await db.from('sessions').select('id,call_record_id').eq('tenant_id',tenant.id).eq('agent_id',agent.id)
     .eq('twilio_call_sid',attempt.parent_call_sid).maybeSingle());
    if(!session)continue;
    const record=checked(await db.from('call_records').select('id,session_id,transcript_id,call_outcome,metadata,product_type,contact_id')
     .eq('tenant_id',tenant.id).eq('agent_id',agent.id).eq('twilio_call_sid',attempt.parent_call_sid).maybeSingle());
    if(record?.metadata?.wrap_up_saved_at){
     if(input.call_sid)return evidenceJson(200,{saved:true,session_id:session.id,call_record_id:record.id,call_outcome:record.call_outcome});
     continue;
    }
    if(!record || (record.call_outcome && !['incomplete','pending'].includes(record.call_outcome)))continue;
    selected={attempt,session,record,task:{call_sid:attempt.parent_call_sid,call_record_id:record.id,product_type:record.product_type,session_id:session.id,agent_leg_sid:leg,
     ended_at:attempt.ended_at,connected_seconds:connectedCallSeconds(attempt)}};break;
   }
   if(request.method==='GET')return evidenceJson(200,{in_progress:false,disposition:selected?.task||null});
   if(!selected)throw new EvidenceError(409,'This call has no confirmed completed agent leg.');
   const outcome=normalizeOutcome(input.call_outcome);
   if(!input.call_outcome || outcome==='incomplete')throw new EvidenceError(400,'Choose what happened on the call.');
   if(['enrolled','enrolled_pending_verification'].includes(outcome) && String(selected.record.product_type||'').toUpperCase()==='MA'){
    const intakes=checked(await db.from('enrollment_intakes').select('id').eq('call_id',selected.record.id).eq('tenant_id',tenant.id).not('completed_at','is',null).limit(1));
    if(!intakes.length)throw new EvidenceError(400,'Complete the Medicare enrollment intake before saving this disposition.');
   }
   const productError=ancillarySaleError(outcome,input.ancillary_product_type);
   if(productError)throw new EvidenceError(400,productError);
   if(outcome==='short_call_hangup' && input.automatic && selected.task.connected_seconds>=15)
    throw new EvidenceError(409,'This call needs a disposition selected by the agent.');
   if(input.sunfire_code != null){
    if(typeof input.sunfire_code!=='string' || input.sunfire_code.length>10000)throw new EvidenceError(400,'Invalid SunFire confirmation codes.');
    if(input.sunfire_code.trim())checked(await db.from('call_records').update({sunfire_code:input.sunfire_code.trim()})
     .eq('id',selected.record.id).eq('tenant_id',tenant.id).eq('agent_id',agent.id));
   }
   const result=await db.rpc('save_agent_call_disposition',{
    p_tenant_id:tenant.id,p_agent_id:agent.id,p_agent_slug:roster.agent_slug,p_call_sid:input.call_sid,
    p_outcome:outcome,p_product:input.ancillary_product_type||null,p_automatic:input.automatic===true,
   });
   if(result.error?.message?.includes('SunFire Confirmation Code is required'))throw new EvidenceError(400,'SunFire Confirmation Code is required for UHC enrollment.');
   if(result.error?.code==='P0001')throw new EvidenceError(409,'Call state changed. Refresh the disposition and try again.');
   return evidenceJson(200,checked(result));
  }catch(error){return evidenceFailure(error);}
 };
}
export default createCallDispositionHandler();
