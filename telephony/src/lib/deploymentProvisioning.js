import {deploymentProfile,publicDeploymentProfile} from './deploymentProfile.js';
import {validateRoster} from './deploymentRoster.js';
import {deploymentFeatures} from './deploymentFeatures.js';
export async function provisionDeployment(db,agents,env=process.env){
 const profile=deploymentProfile(env),features=deploymentFeatures(env);
 validateRoster(agents,{ghl:features.GHL_ENABLED});
 if(agents.some(a=>a.tenant_id && a.tenant_id!==profile.tenantId))throw Error('Roster tenant mismatch');
 // Provider IDs stay server-side. Roles never grant permissions here.
 const fields=['id','name','npn','clerk_user_id','agent_slug','ghl_user_id','is_active','identity_aliases','licensed_states','team','sunfire_agent_id','ams_producer_id'];
 const rows=agents.map(a=>Object.fromEntries(fields.map(key=>[key,a[key]??null])));
 const {data,error}=await db.rpc('provision_deployment_roster',{p_profile:publicDeploymentProfile(profile),p_agents:rows});
 if(error)throw Error('Deployment provisioning failed');
 if(features.PARAGON_ENABLED){const result=await db.rpc('configure_deployment_vendor',{p_vendor:profile.paragon});if(result.error)throw Error('Vendor provisioning failed; roster saved, rerun after correcting vendor configuration');}
 return data;
}
