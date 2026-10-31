import {canonicalCarrier} from './converselySelection.js';
import {SunfireIxClient,IxError} from './ixClient.js';
import {postJson} from './transport.js';
import {mediaUrl,twilioHeaders,providerJson,fetchRecordingMedia} from '../telephony/src/recordings.js';
const checked=({data,error})=>{if(error)throw Error('database_error');return data;};
const attention = code => new IxError(code,{outcome:'needs_attention'});
function uploadUrl(target) {
  let url;try{url=new URL(target.presignedUrl);}catch{throw attention('invalid_ix_upload_url');}
  if(url.protocol!=='https:' || url.username || url.password || !url.hostname.endsWith('.amazonaws.com') || url.port)
    throw attention('invalid_ix_upload_url');
  return url.href;
}
export function ixMetadata(call,recordings) {
  const m=call.metadata || {};
  const result={recordings:recordings.map(({filename,startTime,endTime})=>({filename,startTime,endTime})),teamName:'New Gen Health Solutions'};
  const fields={leadSource:call.lead_source || m.lead_source,leadChannel:m.lead_channel || m.channel,leadMedium:m.lead_medium || m.utm_medium,
    leadCampaign:m.campaign_name || m.lead_campaign || m.utm_campaign || call.campaign_name};
  for(const [key,value] of Object.entries(fields))if(typeof value==='string' && value.trim())result[key]=value;
  const cost=call.lead_cost ?? call.call_cost ?? call.cost ?? m.lead_cost ?? m.call_cost ?? m.cost;
  if(cost!==null && cost!==undefined && cost!=='' && Number.isFinite(Number(cost)))result.leadCost=Number(cost);
  return result;
}

export async function ixCallAttribution(db,call,recordings) {
  const inboundId=recordings.find(recording=>recording.inbound_call_id)?.inbound_call_id;
  if(!inboundId)return call;
  const inbound=checked(await db.from('inbound_calls').select('lead_source_id').eq('id',inboundId).eq('tenant_id',call.tenant_id).maybeSingle());
  let source;
  if(inbound?.lead_source_id)source=checked(await db.from('lead_sources').select('name').eq('id',inbound.lead_source_id).eq('tenant_id',call.tenant_id).maybeSingle());
  const billing=checked(await db.from('paragon_billing_facts').select('amount_due').eq('inbound_call_id',inboundId).eq('tenant_id',call.tenant_id).not('finalized_at','is',null).maybeSingle());
  return {...call,lead_source:call.lead_source || source?.name,lead_cost:billing?.amount_due ?? call.lead_cost};
}

// State is checkpointed under the queue lease before any audio is sent, and after each PUT.
// Retrying a successful PUT is safe; registering the same enrollment again is not.
export async function uploadIx(job, recordings, client, {env=process.env,fetchImpl=fetch,now=()=>Date.now(),checkpoint,call={}}={}) {
  const config={twilioAccountSid:env.TWILIO_ACCOUNT_SID,twilioAuthToken:env.TWILIO_AUTH_TOKEN};
  if(!checkpoint)throw Error('ix_checkpoint_required');
  let state=job.ix_state || {};
  if(state.environment && state.environment!==client.environment)throw attention('ix_environment_mismatch');
  const signal=AbortSignal.timeout(20*60_000);
  if(!state.callRecordingId){
    if(!config.twilioAuthToken || !config.twilioAccountSid)throw Error('twilio_not_configured');
    const legs=[];
    for(const recording of [...recordings].sort((a,b)=>a.recording_sid.localeCompare(b.recording_sid))){
      if(recording.account_sid!==config.twilioAccountSid)throw Error('recording_identity_mismatch');
      const response=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${recording.account_sid}/Recordings/${recording.recording_sid}.json`,
        {headers:twilioHeaders(config),signal,redirect:'error'});
      if(!response.ok)throw Error('twilio_metadata_failed');
      const info=await providerJson(response,16384);
      if(info.sid!==recording.recording_sid || info.account_sid!==recording.account_sid || info.call_sid!==recording.callback_call_sid)
        throw Error('recording_identity_mismatch');
      if(info.channels!==2)throw attention('full_call_dual_channel_required');
      const start=Date.parse(info.start_time),duration=Number(info.duration);
      if(!Number.isFinite(start) || !Number.isFinite(duration) || duration<=0)throw attention('recording_times_missing');
      if(legs.some(leg=>leg.recording_sid===recording.recording_sid))continue;
      legs.push({filename:`${job.call_id}_${legs.length}.mp3`,startTime:new Date(start).toISOString(),endTime:new Date(start+duration*1000).toISOString(),
        recording_sid:recording.recording_sid,account_sid:recording.account_sid,callback_call_sid:recording.callback_call_sid});
    }
    if(!legs.length)throw Error('recordings_missing');
    const registration=await client.register({sunfireEnrollmentCode:job.confirmation_code,callMetadata:ixMetadata(call,legs)});
    if(typeof registration?.callRecordingId!=='string' || !registration.callRecordingId)throw attention('ix_invalid_registration');
    state={environment:client.environment,callRecordingId:registration.callRecordingId,recordings:legs,
      recordingUploads:Array.isArray(registration.recordingUploads)?registration.recordingUploads.map(target=>({filename:target?.filename,presignedUrl:target?.presignedUrl,expiresAt:target?.expiresAt})):[],uploadedFilenames:[]};
    await checkpoint(state); // Persist even malformed targets: never register again after receiving an ID.
  }
  if(!Array.isArray(state.recordings) || !Array.isArray(state.recordingUploads) || !Array.isArray(state.uploadedFilenames))throw attention('ix_invalid_upload_targets');
  const targets=new Map(state.recordingUploads.map(target=>[target.filename,target]));
  if(targets.size!==state.recordings.length || targets.size!==state.recordingUploads.length || state.recordings.some(leg=>!targets.has(leg.filename)))
    throw attention('ix_invalid_upload_targets');
  for(const leg of state.recordings){
    if(state.uploadedFilenames.includes(leg.filename))continue;
    const target=targets.get(leg.filename),url=uploadUrl(target);
    if(!Number.isFinite(Date.parse(target.expiresAt)) || Date.parse(target.expiresAt)<=now())throw attention('upload_url_expired');
    if(!config.twilioAuthToken || leg.account_sid!==config.twilioAccountSid)throw Error('twilio_not_configured');
    const audio=await fetchRecordingMedia(mediaUrl(leg.account_sid,leg.recording_sid,2).replace('.wav?','.mp3?'),config,{signal},fetchImpl);
    if(!audio.ok || !audio.body)throw Error('recording_download_failed');
    let response;
    try{
      response=await fetchImpl(url,{method:'PUT',headers:{'Content-Type':'audio/mpeg'},body:audio.body,duplex:'half',signal,redirect:'error'});
      if(!response.ok){
        if(Date.parse(target.expiresAt)<=now())throw attention('upload_url_expired');
        throw new IxError(`ix_audio_http_${response.status}`,{outcome:response.status>=500?'retry':'failed'});
      }
    }finally{await response?.body?.cancel();await audio.body.cancel().catch(()=>{});}
    state={...state,uploadedFilenames:[...state.uploadedFilenames,leg.filename]};
    await checkpoint(state);
  }
  const receipt=await client.finalize(state.callRecordingId);
  if(!['finalized','already_finalized'].includes(receipt?.status))throw Error('ix_receipt_missing');
  return {callRecordingId:state.callRecordingId,status:receipt.status};
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

export function createIxIntegration(db,{env=process.env,send=postJson,now=()=>Date.now(),fetchImpl=fetch,ixClient=new SunfireIxClient(env,{fetchImpl,now})}={}) {
  let nextSweep=0,nextSummary=0;
  return {
    providers:{ix:{available:ixClient.available,claim:async()=>checked(await db.rpc('claim_ix_upload')),deliver:async(job,call)=>{
      if(canonicalCarrier(call.carrier_name)!=='UnitedHealthcare')throw Error('carrier_no_longer_eligible');
      if(call.sunfire_code!==job.confirmation_code)throw new IxError('confirmation_code_changed',{outcome:'needs_attention'});
      const saved=checked(await db.from('ix_uploads').select('ix_state').eq('id',job.id).eq('tenant_id',job.tenant_id).single());
      const recordings=checked(await db.from('recording_ingestion').select('*').eq('tenant_id',job.tenant_id)
        .eq('call_record_id',job.call_id).eq('provider_status','completed').not('recording_sid','is',null));
      const checkpoint=async state=>{
        const rows=checked(await db.from('ix_uploads').update({ix_state:state,updated_at:new Date(now()).toISOString()})
          .eq('id',job.id).eq('lease_token',job.lease_token).eq('status','uploading').gte('lease_until',new Date(now()).toISOString()).select('id'));
        if(!rows?.length)throw Error('ix_lease_lost');
      };
      const attributed= saved.ix_state?.callRecordingId?call:await ixCallAttribution(db,call,recordings);
      return uploadIx({...job,ix_state:saved.ix_state},recordings,ixClient,{env,fetchImpl,now,checkpoint,call:attributed});
    },finish:async(job,{success,receipt,error,failure})=>{
      checked(await db.rpc('finish_ix_upload',{p_id:job.id,p_token:job.lease_token,
        p_outcome:success?'uploaded':failure instanceof IxError?failure.outcome:'retry',p_error:error,
        p_message:failure instanceof IxError?failure.providerMessage:'',p_receipt:receipt}));
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
