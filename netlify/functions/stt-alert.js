import {getEvidenceServiceClient,checked,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
import {sendProviderFailureAlert} from '../lib/postCallProvider.js';
export function createSttAlertHandler({getDb=getEvidenceServiceClient,sendAlert=sendProviderFailureAlert,env=process.env}={}){
 return async request=>{
  if(request.method!=='POST'||!env.SCORE_CALL_JOB_SECRET||request.headers.get('x-enrollgen-job-secret')!==env.SCORE_CALL_JOB_SECRET)return evidenceJson(401,{error:'Unauthorized'});
  try{const body=await request.json();
   if(body.call_id){
    const db=getDb();
    const alert=checked(await db.from('transcript_recovery_alerts').select('call_id,reason').eq('call_id',body.call_id).eq('tenant_id',body.tenant_id).eq('reason',body.reason).is('alerted_at',null).maybeSingle());
    if(!alert)return evidenceJson(200,{status:'already_alerted'});
    const call=checked(await db.from('call_records').select('id,session_id').eq('id',alert.call_id).eq('tenant_id',body.tenant_id).single());
    await sendAlert(db,call.session_id,`transcript_recovery call=${call.id}`,alert.reason,{dailyClaim:`recovery-${call.id}-${alert.reason}`});
    checked(await db.from('transcript_recovery_alerts').update({alerted_at:new Date().toISOString()}).eq('call_id',call.id).eq('tenant_id',body.tenant_id).eq('reason',alert.reason));
    return evidenceJson(200,{status:'alerted'});
   }
   if(!/^CA[0-9a-f]{32}$/i.test(body.call_sid||''))return evidenceJson(400,{error:'Invalid call'});
   const db=getDb();const attempt=checked(await db.from('telephony_call_attempts').select('call_record_id').eq('tenant_id',body.tenant_id).eq('parent_call_sid',body.call_sid).order('created_at',{ascending:false}).limit(1).single());
   const call=checked(await db.from('call_records').select('id,session_id').eq('id',attempt.call_record_id).eq('tenant_id',body.tenant_id).single());
   const reason=['media_lease_ended','media_binding_unavailable','media_transport_closed','media_transport_error','media_heartbeat_timeout'].includes(body.reason)?body.reason:'stt_reconnect_limit';
   await sendAlert(db,call.session_id,`live_transcription call=${call.id}`,reason,{dailyClaim:`stt-${call.id}-${reason}`});return evidenceJson(200,{status:'alerted'});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createSttAlertHandler();
