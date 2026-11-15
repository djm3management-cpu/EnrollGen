import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceFailure,evidenceJson} from './_evidenceAccess.js';
export function createTenantSettingsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}) {
 return serverRequest('tenant-settings',async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Use POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try {
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth);
   if(!identity.admin)throw new EvidenceError(403,'Administrator required.');
   const body=await request.json(),fields={};
   for(const key of ['agency_npn','licensed_states','carrier_options','coop_rates','compliance_config'])if(Object.hasOwn(body,key))fields[key]=body[key];
   if(!Object.keys(fields).length)throw new EvidenceError(400,'No supported settings.');
   if(fields.agency_npn!=null&&!/^\d{0,12}$/.test(fields.agency_npn))throw new EvidenceError(400,'Invalid agency NPN.');
   if(fields.licensed_states&&(!Array.isArray(fields.licensed_states)||fields.licensed_states.some(s=>!(/^[A-Z]{2}$/).test(s))))throw new EvidenceError(400,'Invalid licensed states.');
   if(fields.carrier_options&&(!Array.isArray(fields.carrier_options)||fields.carrier_options.some(s=>typeof s!=='string'||s.length>200)))throw new EvidenceError(400,'Invalid carriers.');
   for(const key of ['coop_rates','compliance_config'])if(fields[key]&&(typeof fields[key]!=='object'||Array.isArray(fields[key])))throw new EvidenceError(400,'Invalid settings.');
   checked(await db.from('tenants').update(fields).eq('id',identity.tenant.id));
   return evidenceJson(200,{saved:true});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createTenantSettingsHandler();
