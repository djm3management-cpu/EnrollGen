import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceFailure,evidenceJson} from './_evidenceAccess.js';
export function createPipelineSettingsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}){
 return async request=>{
  if(request.method!=='POST')return evidenceJson(405,{error:'Use POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   if(!identity.admin)throw new EvidenceError(403,'Administrator required.');
   const input=await request.json(),tenant=identity.tenant.id,actor=identity.access.roster_id;
   if(input.action==='save'){
    if(input.pipeline_id&&!checked(await db.from('pipelines').select('id').eq('tenant_id',tenant).eq('id',input.pipeline_id).maybeSingle()))throw new EvidenceError(403,'Pipeline unavailable.');
    // RPC validates stages, positions, types and relationships transactionally.
    const id=checked(await db.rpc('save_opportunity_pipeline',{p_tenant_id:tenant,p_requesting_agent_id:actor,p_pipeline_id:input.pipeline_id||null,p_name:input.name,p_line_of_business:input.line_of_business||null,p_stages:input.stages}));
    return evidenceJson(200,{id});
   }
   if(input.action==='delete_stage'){
    const stage=checked(await db.from('pipeline_stages').select('id').eq('tenant_id',tenant).eq('id',input.stage_id).maybeSingle());
    if(!stage)throw new EvidenceError(403,'Stage unavailable.');
    if(input.move_to_stage_id&&!checked(await db.from('pipeline_stages').select('id').eq('tenant_id',tenant).eq('id',input.move_to_stage_id).maybeSingle()))throw new EvidenceError(403,'Stage unavailable.');
    checked(await db.rpc('delete_opportunity_stage',{p_stage_id:stage.id,p_requesting_agent_id:actor,p_move_to_stage_id:input.move_to_stage_id||null}));
    return evidenceJson(200,{saved:true});
   }
   throw new EvidenceError(400,'Unknown pipeline operation.');
  }catch(error){return evidenceFailure(error);}
 };
}
export default createPipelineSettingsHandler();
