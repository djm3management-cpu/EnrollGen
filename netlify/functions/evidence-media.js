import {evidenceCheckpoint} from '../../telephony/src/lib/evidenceAudit.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {auditedEvidenceRequest,resolveCallAccessIdentity,getEvidenceServiceClient,checked,EvidenceError,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
export function createEvidenceMediaHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient}={}){
 return async request=>{
  if(request.method!=='GET')return evidenceJson(405,{error:'Method not allowed'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb();return await auditedEvidenceRequest(db,auth,request,'message_media',resolveCallAccessIdentity,async identity=>{
    const id=new URL(request.url).searchParams.get('id');
    if(!/^[0-9a-f-]{36}$/i.test(id || ''))throw new EvidenceError(400,'Choose an attachment.');
    const media=checked(await db.from('message_media').select('id,message_id,storage_path,content_type').eq('id',id).eq('tenant_id',identity.tenant.id).maybeSingle());
    if(!media)throw new EvidenceError(403,'Attachment unavailable.');
    const message=checked(await db.from('messages').select('contact_id').eq('id',media.message_id).eq('tenant_id',identity.tenant.id).maybeSingle());
    let contact=db.from('contacts').select('id').eq('id',message?.contact_id).eq('tenant_id',identity.tenant.id);
    if(!identity.admin)contact=contact.eq('assigned_agent_id',identity.access.agent_slug);
    if(!checked(await contact.maybeSingle()))throw new EvidenceError(403,'Attachment unavailable.');
    if(!media.storage_path || media.storage_path.split('/').some(p=>!p || p==='.' || p==='..'))throw new EvidenceError(403,'Attachment unavailable.');
    await evidenceCheckpoint(db);
    const data=checked(await db.storage.from('message-media').download(media.storage_path));
    return new Response(data,{headers:{'Content-Type':media.content_type || data.type || 'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   });
  }catch(error){return evidenceFailure(error);}
 };
}
export default createEvidenceMediaHandler();
