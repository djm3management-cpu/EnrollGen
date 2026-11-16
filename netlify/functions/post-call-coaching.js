import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveCallAccessIdentity,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {admit} from './_admission.js';
import {OBJECTION_CATEGORIES} from '../../src/lib/postCallCoaching.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
export function createPostCallCoachingHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,env=process.env}={}){
 return serverRequest('post-call-coaching',async request=>{
  if(!featureEnabled('POST_CALL_COACHING_ENABLED',env))return evidenceJson(404,{error:'Not found.'});
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth),params=new URL(request.url).searchParams;
   const actor={p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null};
   if(request.method==='POST'){
    const body=await request.json();if(!uuid(body.call_id)||!['review','regenerate'].includes(body.action))throw new EvidenceError(400,'Invalid action.');
    if(body.action==='regenerate'){
     if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected admin required.');
     await admit(db,'coachingRegenerate',auth.userId);
    }
    const r=await db.rpc(body.action==='review'?'review_post_call_coaching':'regenerate_post_call_coaching',{...actor,p_call:body.call_id});
    if(r.error)throw new EvidenceError(r.error.code==='42501'?403:r.error.code==='55000'?409:503,'Coaching unavailable.');
    return evidenceJson(200,{saved:r.data});
   }
   const call=params.get('call_id'),agent=params.get('agent_id'),category=params.get('category'),from=params.get('from'),to=params.get('to'),limit=Number(params.get('limit')||30);
   let cursor=null;try{if(params.has('cursor'))cursor=JSON.parse(Buffer.from(params.get('cursor'),'base64url').toString());}catch{throw new EvidenceError(400,'Invalid page.');}
   if(call&&!uuid(call)||agent&&!uuid(agent)||category&&!OBJECTION_CATEGORIES.includes(category)||from&&!timestamp(from)||to&&!timestamp(to)||from&&to&&from>to||!Number.isInteger(limit)||limit<1||limit>100||cursor&&(!timestamp(cursor.time)||!uuid(cursor.id)||cursor.filter!==JSON.stringify([call,agent,category,from,to])))throw new EvidenceError(400,'Invalid page.');
   const r=await db.rpc('read_post_call_coaching',{...actor,p_call:call,p_agent:agent,p_category:category,p_from:from,p_to:to,p_before_time:cursor?.time||null,p_before_id:cursor?.id||null,p_limit:limit});
   if(r.error)throw new EvidenceError(r.error.code==='42501'?403:503,'Coaching unavailable.');
   const data=r.data,more=data.notes.length>limit,notes=data.notes.slice(0,limit),last=notes.at(-1);
   const next=more?Buffer.from(JSON.stringify({time:last.generated_at,id:last.id,filter:JSON.stringify([call,agent,category,from,to])})).toString('base64url'):null;
   return evidenceJson(200,{...data,notes,next});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createPostCallCoachingHandler();
export const config={path:'/api/post-call-coaching'};
