import {requireClerkAuth} from './_clerkAuth.js';
import {EvidenceError,checked,evidenceJson,evidenceFailure,getEvidenceServiceClient,resolveCallAccessIdentity} from './_evidenceAccess.js';
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
export function createParagonResidenceHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient}={}){
 return async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
   if(request.method==='GET'){
    if(!identity.admin)throw new EvidenceError(403,'Administrator access required.');
    const offset=Number(new URL(request.url).searchParams.get('offset')||0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new EvidenceError(400,'Invalid page.');
    const result=await db.from('v_paragon_residence_review').select('inbound_call_id,call_record_id,twilio_call_sid,created_at,call_status,capture,metadata,review_reason,attempts,last_error',{count:'exact'})
     .eq('tenant_id',identity.tenant.id).order('created_at',{ascending:false}).order('inbound_call_id').range(offset,offset+49);
    return evidenceJson(200,{rows:checked(result),count:result.count||0});
   }
   const body=await request.json();
   const agent=checked(await db.from('tenant_agents').select('agent_slug').eq('tenant_id',identity.tenant.id).eq('clerk_user_id',auth.userId).eq('is_active',true).maybeSingle());
   if(body.action==='contact_zip_edit'){
    if(!uuid(body.contact_id)||(body.zip!==null&&!/^\d{5}$/.test(body.zip||'')))throw new EvidenceError(400,'Enter a five-digit ZIP or clear the field.');
    const contact=checked(await db.from('contacts').select('id,assigned_agent_id').eq('tenant_id',identity.tenant.id).eq('id',body.contact_id).maybeSingle());
    if(!contact||(!identity.admin&&contact.assigned_agent_id&&contact.assigned_agent_id!==agent?.agent_slug))throw new EvidenceError(403,'Contact unavailable.');
    checked(await db.rpc('save_paragon_contact_zip',{p_contact:contact.id,p_tenant:identity.tenant.id,p_zip:body.zip,p_user:auth.userId}));
    return evidenceJson(200,{saved:true});
   }
   if(body.action!=='sep_lookup'||!uuid(body.inbound_call_id)||!/^CA[0-9a-f]{32}$/i.test(body.call_sid||'')||!/^\d{5}$/.test(body.zip||'')||!agent?.agent_slug||body.entry!=='agent_typed')throw new EvidenceError(400,'A call-bound agent-entered lookup is required.');
   if(!/^[A-Z]{2}$/.test(body.state||'')||(body.county_fips!==null&&body.county_fips!==undefined&&!/^\d{5}$/.test(body.county_fips)))throw new EvidenceError(400,'Invalid lookup area.');
   if(body.county_name!==undefined&&body.county_name!==null&&(typeof body.county_name!=='string'||body.county_name.length>80))throw new EvidenceError(400,'Invalid county.');
   const queued=await db.rpc('enqueue_paragon_sep_residence',{p_call:body.inbound_call_id,p_tenant:identity.tenant.id,p_agent:agent.agent_slug,p_sid:body.call_sid,p_zip:body.zip,p_state:body.state,p_county:body.county_fips||body.county_name||null});
   if(queued.error?.code==='P0001')throw new EvidenceError(409,'The live call or lookup area is no longer eligible for capture.');
   checked(queued);
   return evidenceJson(202,{queued:true});
  }catch(error){return evidenceFailure(error);}
 };
}
export default createParagonResidenceHandler();
