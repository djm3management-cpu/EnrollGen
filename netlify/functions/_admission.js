import {setVerifiedLogSubject} from '../../telephony/src/lib/logger.js';
import {admit,AdmissionError,admissionResponse} from '../../telephony/src/lib/admission.js';
import {resolveDeploymentAccess} from '../../telephony/src/lib/deploymentAccess.js';
export {admit,AdmissionError,admissionResponse};
export async function admitAgent(db,route,auth) {
 await resolveDeploymentAccess(db,auth.userId,auth.orgId||null);
 setVerifiedLogSubject(auth.userId);
 await admit(db,route,auth.userId);
}
// Background identities come from protected persisted ownership, never request JSON.
export async function admitCall(db,route,call) {
 const {data,error}=await db.from('enrolled_agents').select('clerk_user_id').eq('id',call.agent_id).eq('tenant_id',call.tenant_id).eq('is_active',true).single();
 if(error||!data?.clerk_user_id)throw new AdmissionError(503);
 await admitAgent(db,route,{userId:data.clerk_user_id});
}
