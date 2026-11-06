import {getEvidenceServiceClient,checked,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
import {sendProviderFailureAlert} from '../lib/postCallProvider.js';
export function createSttAlertHandler({getDb=getEvidenceServiceClient,sendAlert=sendProviderFailureAlert,env=process.env}={}){
 return async request=>{
  if(request.method!=='POST'||!env.SCORE_CALL_JOB_SECRET||request.headers.get('x-enrollgen-job-secret')!==env.SCORE_CALL_JOB_SECRET)return evidenceJson(401,{error:'Unauthorized'});
  try{const body=await request.json();if(!/^CA[0-9a-f]{32}$/i.test(body.call_sid||''))return evidenceJson(400,{error:'Invalid call'});
   const db=getDb();const attempt=checked(await db.from('telephony_call_attempts').select('call_record_id').eq('tenant_id',body.tenant_id).eq('parent_call_sid',body.call_sid).single());
   const call=checked(await db.from('call_records').select('id,session_id').eq('id',attempt.call_record_id).eq('tenant_id',body.tenant_id).single());
   await sendAlert(db,call.session_id,'live_transcription','stt_reconnect_limit');return evidenceJson(200,{status:'alerted'});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createSttAlertHandler();
