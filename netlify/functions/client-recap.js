import {createHash} from 'node:crypto';
import {requireClerkAuth} from './_clerkAuth.js';
import {getEvidenceServiceClient,resolveCallAccessIdentity,evidenceJson,evidenceFailure,EvidenceError} from './_evidenceAccess.js';
import {auditedEvidenceAccess,evidenceCheckpoint} from '../../telephony/src/lib/evidenceAudit.js';
import {serverRequest,adminActionClient} from '../../telephony/src/lib/adminActions.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {admit} from './_admission.js';
import {renderRecap,RECAP_CHANNELS} from '../../src/lib/clientRecap.js';
import {buildRecapPdf} from '../lib/recap/pdf.js';
import {deliverRecapSms} from '../lib/recap/delivery.js';
import {validateOutboundSms} from '../../telephony/src/piiValidation.js';
import {outboundSmsReason} from '../../telephony/src/lib/outboundSms.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export const recapHash=content=>createHash('sha256').update(content).digest('hex');
function checked(result){if(result.error){const status={'42501':403,'22023':422,'40001':409,'23505':409,'54000':429}[result.error.code]||503;throw new EvidenceError(status,status===409?'Recap changed or already approved. Reload the preview.':'Recap unavailable.');}return result.data;}
export function createClientRecapHandler({authenticate=r=>requireClerkAuth(r,{allowBypass:false}),getDb=getEvidenceServiceClient,env=process.env,transport}={}){
 return serverRequest('client-recap',async request=>{
  if(!featureEnabled('CLIENT_RECAP_ENABLED',env))return evidenceJson(404,{error:'Not found.'});
  if(!['GET','POST'].includes(request.method))return evidenceJson(405,{error:'Use GET or POST.'});
  const auth=await authenticate(request);if(auth.response)return auth.response;
  try{
   const post=request.method==='POST',input=post?await request.json():Object.fromEntries(new URL(request.url).searchParams);
   if(!uuid(input.enrollment_id)||post&&!['send','download'].includes(input.action))throw new EvidenceError(400,'Choose an enrollment and action.');
   const profile=deploymentProfile(env),baseDb=getDb(env),db=adminActionClient(baseDb);
   return await auditedEvidenceAccess(db,{actor:auth.userId,tenant:profile.tenantId,resource:'client_recap',resourceId:input.enrollment_id,action:post?(input.action==='download'?'download':'export'):'read'},async()=>{
    await resolveCallAccessIdentity(db,auth);const actor={p_actor:auth.userId,p_org:auth.orgId||auth.tokenPayload?.o?.id||null,p_id:input.enrollment_id};
    const status=checked(await db.rpc('client_recap_source',{...actor,p_status_only:true}));
    if(!status.can_send){if(post)throw new EvidenceError(403,'Recap status only.');return evidenceJson(200,status);}
    const source=checked(await db.rpc('client_recap_source',{...actor,p_status_only:false}));
    if(source.missing.length){
     const error='Missing: '+source.missing.join(', ')+'.';
     if(!post)return evidenceJson(422,{...status,can_send:false,error});
     throw new EvidenceError(422,error);
    }
    const channels={};
    for(const channel of RECAP_CHANNELS){
     try{
      const text=renderRecap(source.templates[channel],source.fields,channel);
      if(validateOutboundSms(text).blocked)throw Error('Invalid recap fields');
      if(channel==='pdf')buildRecapPdf(text);
      channels[channel]={text,sha256:recapHash(text),version:source.templates[channel].version,reason:channel==='sms'?source.sms_reason:null};
     }catch{channels[channel]={reason:'Recap exceeds the channel limit or contains invalid fields.'};}
    }
    if(!post)return evidenceJson(200,{...status,revision:source.revision,channels});
    const channel=input.action==='download'?'pdf':input.channel;
    if(!RECAP_CHANNELS.includes(channel)||input.approved!==true)throw new EvidenceError(400,'Explicit approval required.');
    const chosen=channels[channel];
    if(chosen.reason)throw new EvidenceError(422,chosen.reason);
    if(input.sha256!==chosen.sha256||input.revision!==source.revision)throw new EvidenceError(409,'Recap changed. Reload the preview.');
    if(channel==='sms'){
     if(!transport&&(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN))throw new EvidenceError(503,'Text delivery unavailable.');
     // Existing routing numbers remain transport-only, never recap fields.
     new URL('/twilio/sms-status',profile.telephonyOrigin);
    }
    const bytes=channel==='pdf'?buildRecapPdf(chosen.text):null;
    await admit(db,'clientRecap',auth.userId,profile);
    // A failed access trail refuses both reservation and external dispatch.
    await evidenceCheckpoint(db);
    const reservation=checked(await db.rpc('approve_client_recap',{...actor,p_channel:channel,p_approved:true,p_checksum:chosen.sha256,p_revision:source.revision,p_resend:input.resend===true}));
    if(channel==='pdf')return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="enrollment-recap.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    if(outboundSmsReason({phone:reservation.phone}))throw new EvidenceError(422,'Consumer phone is invalid.');
    const deliveryStatus=await deliverRecapSms(baseDb,reservation,profile,env,transport);
    return evidenceJson(200,{id:reservation.id,status:deliveryStatus});
   });
  }catch(error){return evidenceFailure(error);}
 });
}
export default createClientRecapHandler();
export const config={path:'/api/client-recap'};
