import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {loadDeploymentRoster} from '../../telephony/src/lib/deploymentRoster.js';
export default async request=>{
 const auth=await requireClerkAuth(request);if(auth.response)return auth.response;
 if(request.method!=='GET')return evidenceJson(405,{error:'Roster is managed by a service operator.'});
 try {const db=getEvidenceServiceClient(),identity=await resolveCallAccessIdentity(db,auth),profile=deploymentProfile();
 if(identity.tenant.id!==profile.tenantId)throw new EvidenceError(403,'Agency unavailable.');
 const roster=await loadDeploymentRoster(db,profile);
 return evidenceJson(200,{roster:roster.map(({ghl_user_id,sunfire_agent_id,ams_producer_id,...agent})=>agent)});
 }catch(error){return evidenceFailure(error);}
};
export const config={path:'/api/deployment-roster'};
