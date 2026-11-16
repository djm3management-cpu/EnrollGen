import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {resolveCallAccessIdentity,getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError,checked} from './_evidenceAccess.js';
import {serverRequest,adminActionClient,accessReviewAction} from '../../telephony/src/lib/adminActions.js';
import {buildAccessReview,accessReviewCsv,accessReviewHtml} from '../../telephony/src/lib/accessReview.js';
export function createAccessReviewHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient,env=process.env}={}){
 return serverRequest('access-review',async request=>{
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=adminActionClient(getDb()),identity=await resolveCallAccessIdentity(db,auth);
   if(identity.access.authority!=='admin')throw new EvidenceError(403,'Protected admin required.');
   let record;
   if(request.method==='POST'){
    const input=await request.json();
    if(input.action!=='signoff'||input.attest!==true||!/^[a-f0-9-]{36}$/i.test(input.reviewId||''))throw new EvidenceError(400,'Review ID and explicit attestation required.');
    record=await accessReviewAction(db,{actor:auth.userId,org:auth.orgId||auth.tokenPayload?.o?.id,id:input.reviewId});
   }else{
    const format=new URL(request.url).searchParams.get('format')||'html';
    if(!['html','csv','json'].includes(format))throw new EvidenceError(400,'Invalid review format.');
    const reviewId=new URL(request.url).searchParams.get('reviewId');
    if(reviewId){record=await accessReviewAction(db,{actor:auth.userId,org:auth.orgId||auth.tokenPayload?.o?.id,id:reviewId,read:true});}else{
    const data=checked(await db.rpc('staff_access_review',{p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null}));
    const report=buildAccessReview(data,{env,maxAdmins:Number(env.ACCESS_REVIEW_MAX_ADMINS||3)});
    record=await accessReviewAction(db,{actor:auth.userId,org:auth.orgId||auth.tokenPayload?.o?.id,report});}
    if(format!=='json')return new Response(format==='csv'?accessReviewCsv(record.report,record):accessReviewHtml(record,deploymentProfile().appOrigin),{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':format==='csv'?'attachment; filename="staff-access-review.csv"':'inline'}});
   }
   return evidenceJson(200,record);
  }catch(error){return evidenceFailure(error);}
 });
}
export default createAccessReviewHandler();
export const config={path:'/api/access-review'};
