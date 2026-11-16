import {createHash,randomBytes} from 'node:crypto';
import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {securityEvent} from '../../telephony/src/lib/logger.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {resolveDeploymentAccess} from '../../telephony/src/lib/deploymentAccess.js';
import {admit} from './_admission.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createSupervisorFloorHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,env=process.env}={}) {
 return serverRequest('supervisor-floor',async request=>{
  if(!featureEnabled('SUPERVISOR_FLOOR_ENABLED',env))return evidenceJson(404,{error:'Not found.'});
  const listen=featureEnabled('SUPERVISOR_LISTEN_ENABLED',env),url=new URL(request.url);
  if((request.method==='POST'||url.searchParams.has('history'))&&!listen)return evidenceJson(404,{error:'Not found.'});
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed.'});
  try {
   const auth=await authenticate(request);if(auth.response)return auth.response;
   const db=getDb(),org=auth.orgId||auth.tokenPayload?.o?.id||null,profile=deploymentProfile(env);
   let identity;try{identity=await resolveDeploymentAccess(db,auth.userId,org);}catch(error){throw new EvidenceError(error.status||503,'Supervisor access unavailable.');}
   if(!['admin','manager'].includes(identity.authority))throw new EvidenceError(403,'Supervisor required.');
   await admit(db,request.method==='POST'?'supervisorListen':'supervisorFloor',auth.userId,profile);
   const rpc=async(name,args)=>{const r=await db.rpc(name,{p_actor:auth.userId,p_org:org,...args});if(r.error){if(r.error.code==='P1611')securityEvent('admin_log_write_failed',{subject:auth.userId});throw new EvidenceError(r.error.code==='42501'?403:503,'Supervisor floor unavailable.');}return r.data;};
   if(request.method==='POST') {
    const text=await request.text();if(text.length>2048)throw new EvidenceError(400,'Request too large.');
    let input;try{input=JSON.parse(text);}catch{throw new EvidenceError(400,'Invalid request.');}if(input.action!=='listen'||!uuid(input.attempt_id)||!auth.sessionId)throw new EvidenceError(400,'Choose a connected call.');
    const token=randomBytes(32).toString('base64url');
    await rpc('mint_supervisor_listen',{p_session:auth.sessionId,p_attempt:input.attempt_id,p_hash:createHash('sha256').update(token).digest('hex')});
    return evidenceJson(200,{grant:token,attempt:input.attempt_id,url:new URL('/supervisor-listen',profile.telephonyOrigin).toString().replace(/^https:/,'wss:')});
   }
   if(url.searchParams.has('history')) {
    const before=url.searchParams.get('before'),beforeId=url.searchParams.get('before_id');
    if(Boolean(before)!==Boolean(beforeId)||before&&(!/^\d{4}-\d\d-\d\dT/.test(before)||!Number.isFinite(Date.parse(before))||!uuid(beforeId)))throw new EvidenceError(400,'Invalid history page.');
    const rows=await rpc('supervisor_listen_history',{p_before:before||null,p_before_id:beforeId||null}),last=rows.at(-1);
    return evidenceJson(200,{rows,next:rows.length===100?{before:last.started_at,before_id:last.id}:null});
   }
   const data=await rpc('read_supervisor_floor',{});
   for(const row of data.rows) {
    row.listen_available=listen&&row.listen_available;
    delete row.call_id;
    if(!listen)delete row.attempt_id;
   }
   const etag='"'+createHash('sha256').update(JSON.stringify({rows:data.rows,admin:data.admin,listen})).digest('hex')+'"';
   const headers={'Cache-Control':'private, no-store',ETag:etag,'X-Server-Time':data.serverTime,'Content-Type':'application/json'};
   if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
   return new Response(JSON.stringify({...data,listen}),{headers});
  }catch(error){return evidenceFailure(error);}
 });
}
export default createSupervisorFloorHandler();
export const config={path:'/api/supervisor-floor'};
