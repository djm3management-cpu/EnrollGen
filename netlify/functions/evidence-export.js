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
    else await authorizeRecordingTarget(db,await recordingIdentity(db,auth),input);
    return evidenceJson(200,{allowed:true});
   });
  }catch(error){return evidenceFailure(error);}
 };
}
export default createEvidenceExportHandler();
