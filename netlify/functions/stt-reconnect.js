import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveEvidenceIdentity,checked,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {sendProviderFailureAlert} from '../lib/postCallProvider.js';
export function createSttReconnectHandler({getDb=getEvidenceServiceClient,authenticate=r=>requireClerkAuth(r,{allowBypass:false}),sendAlert=sendProviderFailureAlert}={}){
 return async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{const body=await request.json();if(!/^CA[0-9a-f]{32}$/i.test(body.call_sid||''))throw new EvidenceError(400,'Active call ID required');
   const db=getDb(),identity=await resolveEvidenceIdentity(db,auth);
   const subject=checked(await db.from('availability_agent_subjects').select('agent_slug').eq('tenant_id',identity.tenant.id).eq('clerk_user_id',auth.userId).eq('is_active',true).single());
   const attempt=checked(await db.from('telephony_call_attempts').select('call_record_id,ended_at').eq('parent_call_sid',body.call_sid).eq('tenant_id',identity.tenant.id).eq('agent_id',subject.agent_slug).single());
   if(attempt.ended_at)throw new EvidenceError(409,'Call ended');
   if(body.initial&&checked(await db.from('media_stream_leases').select('call_sid').eq('call_sid',body.call_sid).gt('expires_at',new Date().toISOString()).maybeSingle()))throw new EvidenceError(409,'Server transcription owns this call');
   if(body.initial&&checked(await db.from('call_conferences').select('call_id').eq('parent_call_sid',body.call_sid).eq('tenant_id',identity.tenant.id).is('ended_at',null).maybeSingle()))throw new EvidenceError(409,'Conference transcription owns this call');
   const allowed=checked(await db.rpc(body.initial?'register_stt_stream':'reserve_stt_reconnect',{p_tenant_id:identity.tenant.id,p_call_sid:body.call_sid,...(body.initial?{p_channel:'customer:primary'}:{})}));
   if(!allowed){const call=checked(await db.from('call_records').select('session_id').eq('id',attempt.call_record_id).eq('tenant_id',identity.tenant.id).single());await sendAlert(db,call.session_id,'live_transcription','stt_reconnect_limit').catch(()=>{});}
   return evidenceJson(200,{allowed:allowed===true});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createSttReconnectHandler();
