import {randomUUID} from 'node:crypto';
import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveCallAccessIdentity,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {auditedEvidenceAccess,evidenceCheckpoint} from '../../telephony/src/lib/evidenceAudit.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {admitReshop} from './_admission.js';
import {reshopFeatures,RESHOP_OUTCOMES,RESHOP_REASONS} from '../../src/lib/reshopList.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function checked(r){if(r.error)throw new EvidenceError({'42501':403,'22023':400,'40001':409}[r.error.code]||503,'Re-shop list unavailable.');return r.data;}
export function createReshopListHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,env=process.env}={}){
 return serverRequest('reshop-list',async request=>{
  if(!reshopFeatures(env).RESHOP_LIST_ENABLED)return evidenceJson(404,{error:'Not found.'});
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(env),profile=deploymentProfile(env),post=request.method==='POST';
   return await auditedEvidenceAccess(db,{actor:auth.userId,tenant:profile.tenantId,resource:'reshop_list',action:post?'read':'list'},async()=>{
    const identity=await resolveCallAccessIdentity(db,auth),actor={p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null};
    if(!post){
     const p=new URL(request.url).searchParams,filters={};
     for(const name of ['reason','agent','carrier','state','review'])if(p.get(name))filters[name]=p.get(name);
     if(filters.reason&&!Object.hasOwn(RESHOP_REASONS,filters.reason)||filters.review&&filters.review!=='unreviewed'&&!Object.hasOwn(RESHOP_OUTCOMES,filters.review)||Object.values(filters).some(v=>v.length>200))throw new EvidenceError(400,'Invalid filters.');
     const offset=Number(p.get('offset')||0),limit=Number(p.get('limit')||100);
     if(!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>200)throw new EvidenceError(400,'Invalid page.');
     await admitReshop(db,'reshopRead',auth.userId,profile);
     return evidenceJson(200,checked(await db.rpc('read_reshop_list',{...actor,p_filters:filters,p_offset:offset,p_limit:limit})));
    }
    let input;try{const text=await request.text();if(text.length>2000)throw Error();input=JSON.parse(text);}catch{throw new EvidenceError(400,'Invalid action.');}
    if(!uuid(input?.id)||!['task','review'].includes(input.action)||input.action==='review'&&!Object.hasOwn(RESHOP_OUTCOMES,input.outcome))throw new EvidenceError(400,'Invalid action.');
    await admitReshop(db,input.action==='task'?'reshopTask':'reshopReview',auth.userId,profile);
    await evidenceCheckpoint(db);
    const args={...actor,p_id:input.id,p_action:input.action,p_outcome:input.action==='review'?input.outcome:null};
    // Extend the existing transactional administrator trail without changing the
    // independently deployed phone service's handler or RPC registries.
    const result=identity.access.authority==='admin'
     ?await db.rpc('execute_admin_action',{...actor,p_action:'reshop_list',p_request:randomUUID(),p_command:{kind:'rpc',name:'act_on_reshop',args},p_verified_admin:false})
     :await db.rpc('act_on_reshop',args);
    return evidenceJson(200,checked(result));
   });
  }catch(error){return evidenceFailure(error);}
 });
}
export default createReshopListHandler();
export const config={path:'/api/reshop-list'};
