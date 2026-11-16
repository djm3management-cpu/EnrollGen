import {reshopFeatures} from '../../src/lib/reshopList.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError,checked} from './_evidenceAccess.js';
import {deploymentFeatures} from '../../telephony/src/lib/deploymentFeatures.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
export function createDeploymentStatusHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient,env=process.env}={}){
 return serverRequest('deployment-status',async request=>{
  if(request.method!=='GET')return evidenceJson(405,{error:'Use GET.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected admin required.');
   const m=checked(await db.rpc('operational_status'));
   // Explicit projection; internal subject hashes and operational details never
   // enter this HTTP contract. No roster, contact, transcript or recipient data.
   return evidenceJson(200,{queues:m.queues,failed_jobs:m.failed_jobs,active_alerts:m.active_alerts,last_success:m.last_success,last_purge_dry_run:m.last_purge_dry_run,features:{...deploymentFeatures(env),...reshopFeatures(env)}});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createDeploymentStatusHandler();
export const config={path:'/api/deployment-status'};
