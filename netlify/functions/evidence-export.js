import {hasWhisperRecording,outsideRecordings,whisperCallForRecording} from '../../telephony/src/lib/whisperRecording.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {auditedEvidenceRequest,resolveCallAccessIdentity,requireOwnedSession,getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {recordingIdentity,authorizeRecordingTarget} from './_recordingAccess.js';
export function createEvidenceExportHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient}={}){
 return async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb();return await auditedEvidenceRequest(db,auth,request,'call_evidence',resolveCallAccessIdentity,async identity=>{
    let input;try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid export request.');}
    if(input.action!=='export')throw new EvidenceError(400,'Choose an export.');
    if(input.session_id)await requireOwnedSession(db,input.session_id,identity);
    else {
      const target=await authorizeRecordingTarget(db,await recordingIdentity(db,auth),input);
      const call=await whisperCallForRecording(db,{...target.record,call_record_id:target.field==='call_record_id'?target.id:target.record.call_record_id});
      if(hasWhisperRecording(call))await outsideRecordings(db,call,[]);
    }
    return evidenceJson(200,{allowed:true});
   });
  }catch(error){return evidenceFailure(error);}
 };
}
export default serverRequest('evidence-export',createEvidenceExportHandler());
