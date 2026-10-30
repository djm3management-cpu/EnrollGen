import {canonicalCarrier} from './converselySelection.js';
import {StubIxClient} from './ixClient.js';
import {postJson} from './transport.js';
import {mediaUrl,twilioHeaders,providerJson,fetchRecordingMedia} from '../telephony/src/recordings.js';
const checked=({data,error})=>{if(error)throw Error('database_error');return data;};
export async function uploadIx(job, recording, client, {env=process.env, fetchImpl=fetch}={}) {
  const config={twilioAccountSid:env.TWILIO_ACCOUNT_SID,twilioAuthToken:env.TWILIO_AUTH_TOKEN};
  if (!config.twilioAuthToken || recording.account_sid !== config.twilioAccountSid) throw Error('twilio_not_configured');
  const signal=AbortSignal.timeout(20*60_000);
  const metadata=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${recording.account_sid}/Recordings/${recording.recording_sid}.json`,
    {headers:twilioHeaders(config),signal,redirect:'error'});
  if(!metadata.ok)throw Error('twilio_metadata_failed');
  const info=await providerJson(metadata,16384);
  if(info.sid!==recording.recording_sid || info.account_sid!==recording.account_sid || info.call_sid!==recording.callback_call_sid)
    throw Error('recording_identity_mismatch');
  // Dual-channel full-call recording is mandatory; do not silently upload a single leg.
  if(info.channels!==2)throw Error('full_call_dual_channel_required');
  const args={confirmationCode:job.confirmation_code,idempotencyKey:job.id,metadata:job.enrollment_metadata};
  const destination=await client.createUpload(args);
  const url=new URL(destination.url);
  if(url.protocol!=='https:' || url.username || url.password || !url.hostname.endsWith('.amazonaws.com'))throw Error('invalid_ix_upload_url');
  const audio=await fetchRecordingMedia(mediaUrl(recording.account_sid,recording.recording_sid,2),config,{signal},fetchImpl);
  if(!audio.ok || !audio.body)throw Error('recording_download_failed');
  const response=await fetchImpl(url.href,{method:'PUT',headers:{'Content-Type':'audio/wav',...destination.headers},body:audio.body,duplex:'half',signal,redirect:'error'});
  if(!response.ok)throw Error('ix_audio_upload_failed');
  await response.body?.cancel();
  const receipt=await client.confirmUpload(args);
  if(!receipt?.receiptId)throw Error('ix_receipt_missing');
  return receipt.receiptId;
}

export async function dailySummaries(db,{env,send,now}) {
  if(!env.RESEND_API_KEY || !env.INTEGRATIONS_REPORT_FROM)return;
  const date=new Date(now()-86400000).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const rows=checked(await db.from('compliance_reconciliation').select('*').eq('day',date)) || [];
  for(const row of rows){
    checked(await db.from('compliance_daily_summaries').upsert({tenant_id:row.tenant_id,report_date:date,counts:row},{onConflict:'tenant_id,report_date',ignoreDuplicates:true}));
    const summary=checked(await db.from('compliance_daily_summaries').select('*').eq('tenant_id',row.tenant_id).eq('report_date',date).single());
    if(summary.sent_at)continue;
    const result=await send('https://api.resend.com/emails',JSON.stringify({from:env.INTEGRATIONS_REPORT_FROM,to:['mike@newgenhealthsolutions.com'],
      subject:`UHC IX uploads — ${date}`,text:`Enrollments: ${row.enrollments}\nExpected uploads: ${row.expected_uploads}\nUploaded: ${row.uploaded}\nFailed: ${row.failed}\nMissing codes: ${row.missing_codes}`}),
      {Authorization:`Bearer ${env.RESEND_API_KEY}`,'Idempotency-Key':summary.id});
    if(result.status>=200 && result.status<300)checked(await db.from('compliance_daily_summaries').update({sent_at:new Date(now()).toISOString()}).eq('id',summary.id));
  }
}

export function createIxIntegration(db,{env=process.env,send=postJson,now=()=>Date.now(),fetchImpl=fetch,ixClient=new StubIxClient(env)}={}) {
  let nextSweep=0,nextSummary=0;
  return {
    providers:{ix:{available:ixClient.available,deliver:async(job,call,recording)=>{
      if(canonicalCarrier(call.carrier_name)!=='UnitedHealthcare')throw Error('carrier_no_longer_eligible');
      if(!String(call.sunfire_code || '').split(/[,;\n]+/).map(s=>s.trim()).includes(job.confirmation_code))throw Error('confirmation_code_changed');
      return uploadIx({...job,enrollment_metadata:{CarrierName:call.carrier_name,PlanName:call.plan_name,ContractID:call.metadata.contract_id,PlanID:call.plan_id,SegmentID:call.metadata.segment_id,EnrollmentID:call.enrollment_confirmation_number,EffectiveDate:call.effective_date,SubmissionDate:call.metadata.submission_date,ApplicantFirstName:call.customer_first_name,ApplicantLastName:call.customer_last_name,ApplicantPhoneNumber:call.customer_phone,ApplicantState:call.customer_state,ApplicantZip:call.zip_code}},recording,ixClient,{env,fetchImpl});
    }}},
    scheduleExtras:async()=>{
      if(now()>=nextSweep){
        nextSweep=now()+15*60_000;
        checked(await db.rpc('enqueue_compliance_uploads'));
      }
      if(now()>=nextSummary){nextSummary=now()+60*60_000;await dailySummaries(db,{env,send,now});}
    },
  };
}
