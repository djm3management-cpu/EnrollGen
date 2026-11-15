import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceFailure,evidenceJson} from './_evidenceAccess.js';
export function createScriptSettingsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}){
 return serverRequest('script-settings',async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Use POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth);
   if(!identity.admin)throw new EvidenceError(403,'Administrator required.');
   const input=await request.json();
   if(!['medsup','aca','u65','ancillary'].includes(input.flow)||!Array.isArray(input.sections)||input.sections.length>1000)throw new EvidenceError(400,'Invalid script template.');
   const existing=input.id?checked(await db.from('script_templates').select('id,tenant_id,flow_type').eq('id',input.id).maybeSingle()):null;
   if(input.id&&(!existing||existing.flow_type!==input.flow||(existing.tenant_id&&existing.tenant_id!==identity.tenant.id)))throw new EvidenceError(403,'Template unavailable.');
   const table=db.from('script_templates');
   const write=existing?.tenant_id ? table.update({sections:input.sections,updated_at:new Date().toISOString()}).eq('tenant_id',identity.tenant.id).eq('id',existing.id)
    :table.insert({tenant_id:identity.tenant.id,flow_type:input.flow,version:1,is_active:true,sections:input.sections});
   return evidenceJson(200,{template:checked(await write.select('id,tenant_id,flow_type,version,is_active,sections,updated_at').single())});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createScriptSettingsHandler();
