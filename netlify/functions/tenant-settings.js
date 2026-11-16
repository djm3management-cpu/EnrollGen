import {practiceFeatures,practiceSettings} from '../../src/lib/practiceCaller.js';
import {recapTemplates} from '../../src/lib/clientRecap.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {coachingSettings} from '../../src/lib/postCallCoaching.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceFailure,evidenceJson} from './_evidenceAccess.js';
export function createTenantSettingsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient,env=process.env}={}) {
 return serverRequest('tenant-settings',async request=>{
  const practiceRead=request.method==='GET'&&new URL(request.url).searchParams.get('section')==='practice';
  if(practiceRead&&!practiceFeatures(env).PRACTICE_CALLER_ENABLED)return evidenceJson(404,{error:'Not found.'});
  const recapRead=request.method==='GET'&&new URL(request.url).searchParams.get('section')==='client_recap';
  if(recapRead&&!featureEnabled('CLIENT_RECAP_ENABLED',env))return evidenceJson(404,{error:'Not found.'});
  if(request.method!=='POST'&&!recapRead&&!practiceRead)return evidenceJson(405,{error:'Use POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try {
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth);
   if(practiceRead){if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected administrator required.');return evidenceJson(200,{settings:identity.tenant.practice_settings});}
   if(recapRead){if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected administrator required.');return evidenceJson(200,{templates:identity.tenant.client_recap_templates});}
   if(!identity.admin)throw new EvidenceError(403,'Administrator required.');
   const body=await request.json(),fields={};
   for(const key of ['agency_npn','licensed_states','carrier_options','coop_rates','compliance_config','coaching_settings'])if(Object.hasOwn(body,key))fields[key]=body[key];
   if(Object.hasOwn(body,'practice_settings')){
    if(!practiceFeatures(env).PRACTICE_CALLER_ENABLED)throw new EvidenceError(404,'Not found.');
    try{fields.practice_settings=practiceSettings(body.practice_settings);}catch{throw new EvidenceError(400,'Invalid practice settings.');}
   }
   if(Object.hasOwn(body,'client_recap_templates')){
    if(!featureEnabled('CLIENT_RECAP_ENABLED',env))throw new EvidenceError(404,'Not found.');
    try{fields.client_recap_templates=recapTemplates(body.client_recap_templates);}catch{throw new EvidenceError(400,'Invalid recap templates.');}
   }
   if(Object.hasOwn(fields,'coaching_settings')){try{fields.coaching_settings=coachingSettings(fields.coaching_settings);}catch{throw new EvidenceError(400,'Invalid coaching settings.');}}
   if(!Object.keys(fields).length)throw new EvidenceError(400,'No supported settings.');
   if(fields.agency_npn!=null&&!/^\d{0,12}$/.test(fields.agency_npn))throw new EvidenceError(400,'Invalid agency NPN.');
   if(fields.licensed_states&&(!Array.isArray(fields.licensed_states)||fields.licensed_states.some(s=>!(/^[A-Z]{2}$/).test(s))))throw new EvidenceError(400,'Invalid licensed states.');
   if(fields.carrier_options&&(!Array.isArray(fields.carrier_options)||fields.carrier_options.some(s=>typeof s!=='string'||s.length>200)))throw new EvidenceError(400,'Invalid carriers.');
   for(const key of ['coop_rates','compliance_config','coaching_settings'])if(fields[key]&&(typeof fields[key]!=='object'||Array.isArray(fields[key])))throw new EvidenceError(400,'Invalid settings.');
   checked(await db.from('tenants').update(fields).eq('id',identity.tenant.id));
   return evidenceJson(200,{saved:true});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createTenantSettingsHandler();
