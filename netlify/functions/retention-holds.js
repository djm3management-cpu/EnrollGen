import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError,checked} from './_evidenceAccess.js';
export function createRetentionHoldsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}) {
  return async request=>{
    if(request.method!=='POST')return evidenceJson(405,{error:'Method not allowed'});
    const auth=await authenticate(request);if(auth.response)return auth.response;
    try {
      const db=getDb(),identity=await resolveCallAccessIdentity(db,auth);
      // This control intentionally requires the protected database authority.
      if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected admin required.');
      let body;try{body=await request.json();}catch{throw new EvidenceError(400,'Invalid hold request.');}
      if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw new EvidenceError(400,'Reason required.');
      const common={p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null,p_reason:body.reason.trim()};
      let result;
      if(body.action==='create')result=await db.rpc('retention_place_hold',{...common,p_type:body.targetType,p_target:body.targetId});
      else if(body.action==='release')result=await db.rpc('retention_release_hold',{...common,p_hold:body.holdId});
      else if(body.action==='flag_complaint')result=await db.rpc('retention_flag_complaint',{...common,p_contact:body.contactId});
      else if(body.action==='resolve_complaint')result=await db.rpc('retention_resolve_complaint',{...common,p_contact:body.contactId});
      else throw new EvidenceError(400,'Invalid hold action.');
      return evidenceJson(200,{id:checked(result)||null});
    }catch(error){return evidenceFailure(error);}
  };
}
export default createRetentionHoldsHandler();
export const config={path:'/api/retention-holds'};
