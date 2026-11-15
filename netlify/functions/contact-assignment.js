import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceFailure,evidenceJson} from './_evidenceAccess.js';
import {resolveDeploymentAccess} from '../../telephony/src/lib/deploymentAccess.js';
export function createContactAssignmentHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}){
 return serverRequest('contact-assignment',async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Use POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth);
   if(!identity.admin)throw new EvidenceError(403,'Administrator required to reassign contacts.');
   const input=await request.json();
   const contact=checked(await db.from('contacts').select('id').eq('tenant_id',identity.tenant.id).eq('id',input.contact_id).maybeSingle());
   if(!contact)throw new EvidenceError(403,'Contact unavailable.');
   let slug=null;
   if(input.assigned_agent_id){
    const target=checked(await db.from('tenant_agents').select('clerk_user_id').eq('tenant_id',identity.tenant.id).eq('agent_slug',input.assigned_agent_id).eq('is_active',true).maybeSingle());
    if(!target)throw new EvidenceError(403,'Assignee unavailable.');
    const access=await resolveDeploymentAccess(db,target.clerk_user_id);
    if(access.tenant_id!==identity.tenant.id)throw new EvidenceError(403,'Assignee unavailable.');
    slug=access.agent_slug;
   }
   checked(await db.from('contacts').update({assigned_agent_id:slug}).eq('id',contact.id).eq('tenant_id',identity.tenant.id));
   return evidenceJson(200,{saved:true});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createContactAssignmentHandler();
