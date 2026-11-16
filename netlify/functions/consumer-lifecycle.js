import {securityEvent} from '../../telephony/src/lib/logger.js';
import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveCallAccessIdentity,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {auditedEvidenceAccess} from '../../telephony/src/lib/evidenceAudit.js';
import {serverRequest,logAdminDispatch} from '../../telephony/src/lib/adminActions.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {admit} from './_admission.js';
import {lifecyclePage,EVENT_TYPES} from '../lib/lifecycle/model.js';
import {buildLifecyclePacket,packetFileIndex} from '../lib/lifecycle/packet.js';
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||'');
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));
export function createConsumerLifecycleHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,env=process.env}={}){
 return serverRequest('consumer-lifecycle',async request=>{
  // A disabled route is absent before identity/client work, including direct URLs.
  if(!featureEnabled('CONSUMER_LIFECYCLE_ENABLED',env)){securityEvent('feature_disabled');return evidenceJson(404,{error:'Not found.'});}
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const db=getDb(),params=new URL(request.url).searchParams,contact=params.get('contact_id'),exporting=request.method==='POST';
   if(!uuid(contact))throw new EvidenceError(400,'Consumer ID required.');
   return await auditedEvidenceAccess(db,{actor:auth.userId,tenant:deploymentProfile(env).tenantId,resource:'consumer_lifecycle',resourceId:contact,action:exporting?'export':'read'},async()=>{
    const identity=await resolveCallAccessIdentity(db,auth);
    if(exporting){
     if(identity.access.authority !== 'admin')throw new EvidenceError(403,'Protected admin required.');
     const body=await request.json();if(body.action!=='export')throw new EvidenceError(400,'Choose an export.');
     await admit(db,'lifecycleExport',auth.userId,deploymentProfile(env));
    }
    let access=null;try{if(params.has('access_cursor'))access=JSON.parse(Buffer.from(params.get('access_cursor'),'base64url').toString());}catch{throw new EvidenceError(400,'Invalid access page.');}
    if(access&&(!timestamp(access.time)||!uuid(access.id)))throw new EvidenceError(400,'Invalid access page.');
    const evidence=params.get('evidence')?.split(':');
    if(evidence&&(evidence.length!==2||!uuid(evidence[1])||!/^\w{1,64}$/.test(evidence[0])))throw new EvidenceError(400,'Invalid evidence reference.');
    const limit=Number(params.get('limit')||50),type=params.get('type')||null;
    let cursor=null;try{if(params.has('cursor'))cursor=JSON.parse(Buffer.from(params.get('cursor'),'base64url').toString());}catch{throw new EvidenceError(400,'Invalid lifecycle page.');}
    if(!Number.isInteger(limit)||limit<1||limit>200||type&&(!EVENT_TYPES.includes(type)||type==='recap'&&!featureEnabled('CLIENT_RECAP_ENABLED',env))||cursor&&(!timestamp(cursor.time)||!timestamp(cursor.asOf)||typeof cursor.key!=='string'||cursor.key.length>180||cursor.contact!==contact||cursor.type!==type))throw new EvidenceError(400,'Invalid lifecycle page.');
    const read=async(after=null)=>{
     const r=await db.rpc('read_consumer_lifecycle',{p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null,p_contact:contact,p_after_time:after?.time||null,p_after_key:after?.key||null,p_as_of:after?.asOf||null,p_type:exporting?null:type,p_limit:exporting?200:limit,p_export:exporting,p_evidence_table:exporting?null:evidence?.[0]||null,p_evidence_id:exporting?null:evidence?.[1]||null,p_access_time:exporting?null:access?.time||null,p_access_id:exporting?null:access?.id||null});
     if(r.error)throw new EvidenceError(r.error.code==='42501'?403:503,'Lifecycle unavailable.');
     return lifecyclePage(r.data,featureEnabled('CLIENT_RECAP_ENABLED',env));
    };
    const first=await read(exporting?null:cursor);
    if(!exporting){if(first.nextAccess)first.nextAccess=Buffer.from(JSON.stringify(first.nextAccess)).toString('base64url');if(first.next)first.next=Buffer.from(JSON.stringify({...first.next,contact,type})).toString('base64url');return evidenceJson(200,first);}
    const events=[...first.events];let next=first.next;
    while(next){if(events.length>=20000)throw new EvidenceError(413,'Audit packet exceeds the local export limit.');const page=await read(next);events.push(...page.events);next=page.next;}
    const manifest=await db.rpc('consumer_lifecycle_files',{p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null,p_contact:contact});
    if(manifest.error)throw new EvidenceError(503,'Packet evidence unavailable.');
    const files=await packetFileIndex(db,manifest.data);
    const bytes=buildLifecyclePacket({agency:deploymentProfile(env).agencyName,consumerId:contact,asOf:first.asOf,events,checks:first.checks,files});
    await logAdminDispatch(db,identity,'consumer_lifecycle',contact);
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="consumer-audit-packet.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   });
  }catch(error){return evidenceFailure(error);}
 });
}
export default createConsumerLifecycleHandler();
export const config={path:'/api/consumer-lifecycle'};
