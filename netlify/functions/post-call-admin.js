import {randomUUID} from 'node:crypto';
import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveCallAccessIdentity,scopeCallToIdentity} from './_evidenceAccess.js';
import {verifyPostCallEnded} from '../lib/postCallGuard.js';
import {postCallRequestKey} from './post-call.js';
export function createPostCallAdminHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,verifyEnded=verifyPostCallEnded,send=fetch}={}) {
 return async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try {
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   const id=new URL(request.url).searchParams.get('call_record_id');
   if(!/^[0-9a-f-]{36}$/i.test(id||''))throw new EvidenceError(400,'Call record ID is required.');
   const record=checked(await scopeCallToIdentity(db.from('call_records').select(request.method==='GET'?'id,tenant_id,agent_id,post_call_status,post_call_last_error':'*').eq('id',id),identity).maybeSingle());
   if(!record)throw new EvidenceError(403,'Call is unavailable.');
   if(request.method==='GET')return evidenceJson(200,{status:record.post_call_status,last_error:identity.admin?record.post_call_last_error:null,can_retry:identity.admin});
   if(!identity.admin)throw new EvidenceError(403,'Administrator access is required.');
   await verifyEnded(db,{session_id:record.session_id,call_record_id:record.id});
   // Requeue only transcript finalization. Never replay disposition or vendor posts.
   const original=checked(await db.from('post_call_jobs').select('*').eq('session_id',record.session_id).single());
   const payload={action:'finalize',session_id:record.session_id,call_record_id:record.id,transcript_id:record.transcript_id,
    transcript_text:record.transcript_raw || '',transcript_diarized:record.transcript_diarized || [],telephony_call:Boolean(record.twilio_call_sid),twilio_call_sid:record.twilio_call_sid};
   const key=postCallRequestKey(payload);
   if(record.compliance_status==='failed'||record.metadata?.scoring_status==='failed') {
     checked(await db.rpc('retry_failed_scoring',{p_call_id:record.id,p_tenant_id:record.tenant_id,p_request_id:randomUUID(),p_requested_by:auth.userId,p_reason:'Admin post-call retry',p_execute:true}));
   }
   const queued=checked(await db.rpc('retry_post_call_transcript',{p_session_id:record.session_id,p_request_key:key,p_payload:payload}));
   const response=await send(new URL('/.netlify/functions/post-call-background',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:record.session_id,dispatch_token:original.dispatch_token}),signal:AbortSignal.timeout(8000)});
   if(response.status!==202)throw new EvidenceError(503,'Request saved; dispatch needs retry.');
   return evidenceJson(202,{status:'pending',request_key:queued});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createPostCallAdminHandler();
