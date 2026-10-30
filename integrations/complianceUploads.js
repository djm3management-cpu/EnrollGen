import {converselyConfiguration,carrierEligibility,previousConverselyWeek,selectWeeklySamples} from './converselySelection.js';
import { recordingComplianceGrant } from './recordingComplianceGrant.js';
import { postJson } from './transport.js';
import { mediaUrl, fetchRecordingMedia } from '../telephony/src/recordings.js';

const checked = ({data,error}) => { if(error) throw Error('database_error'); return data; };
export const uploadEnabled = value => value === 'true';
export function converselyPayload(call, recordingPath, agent = {}) {
  const m = call.metadata || {};
  return {
    Target: 'New Gen Health Solutions', CallID: call.id, CallType: call.call_type || '',
    RecordingPath: recordingPath, CallDateTime: call.call_start || '',
    AgentID: call.agent_id || '', AgentName: call.agent_name || '', AgentEmail: agent.email || m.agent_email || '',
    ApplicantFirstName: call.customer_first_name || '', ApplicantLastName: call.customer_last_name || '',
    ApplicantPhoneNumber: call.customer_phone || '', ApplicantState: call.customer_state || call.state_code || '',
    ApplicantZip: call.zip_code || '', CallDuration: call.call_duration_seconds || 0,
    Disposition: call.call_outcome || '', CampaignName: m.campaign_name || call.lead_source || '',
    PlanName: call.plan_name || '', CarrierName: call.carrier_name || '', EffectiveDate: call.effective_date || '',
    SubmissionDate: m.submission_date || call.created_at || '', EnrollmentID: call.enrollment_confirmation_number || call.id,
    ContractYear: m.contract_year || call.effective_date?.slice(0,4) || '', ContractID: m.contract_id || '',
    PlanID: call.plan_id || '', SegmentID: m.segment_id || '',
  };
}

export async function playableMp3(candidate,{env=process.env,fetchImpl=fetch}={}) {
  if(!candidate.recording_sid)return false;
  if(!env.TWILIO_AUTH_TOKEN || !env.TWILIO_ACCOUNT_SID)throw Error('twilio_not_configured');
  if(candidate.account_sid!==env.TWILIO_ACCOUNT_SID)return false;
  let response;
  try{
    const url=mediaUrl(candidate.account_sid,candidate.recording_sid,candidate.recording_channels || 2).replace('.wav?','.mp3?');
    response=await fetchRecordingMedia(url,{twilioAccountSid:env.TWILIO_ACCOUNT_SID,twilioAuthToken:env.TWILIO_AUTH_TOKEN},
      {range:'bytes=0-0',signal:AbortSignal.timeout(15000)},fetchImpl);
    if([404,410].includes(response.status))return false;
    if(![200,206].includes(response.status))throw Error('recording_probe_failed');
    return [200,206].includes(response.status) && /audio\/(mpeg|mp3)/i.test(response.headers.get('content-type') || '') && !!response.body;
  }finally{await response?.body?.cancel().catch(()=>{});}
}
export async function scheduleConverselyWeek(db,{env=process.env,log=console.log,now=()=>Date.now(),isPlayable=playableMp3,fetchImpl=fetch}={}) {
  if(!uploadEnabled(env.CONVERSELY_UPLOAD_ENABLED))return;
  const config=converselyConfiguration(env),week=previousConverselyWeek(now());
  const existing=checked(await db.from('conversely_weekly_runs').select('week_start').eq('week_start',week).maybeSingle());
  if(existing)return;
  const candidates=checked(await db.rpc('conversely_week_candidates',{p_week:week}));
  // Every candidate is evaluated, including low-scoring alternatives, for the audit.
  for(const candidate of candidates){
    candidate.playable=false;
    if(candidate.call_id && !carrierEligibility(candidate,config) && candidate.compliance_status==='complete' && candidate.score!=null && !candidate.already_submitted)
      candidate.playable=await isPlayable(candidate,{env,fetchImpl});
  }
  const decisions=selectWeeklySamples(candidates,config);
  const audit=checked(await db.rpc('reserve_conversely_week',{p_week:week,p_samples:config.samples,p_decisions:decisions}));
  for(const row of audit)log(JSON.stringify({event:'conversely_weekly_selection',week,tenant_id:row.tenant_id,agent_id:row.agent_id,
    call_id:row.call_id,score:row.score,eligible:row.eligible,selected:row.selected,reason:row.reason,submission_id:row.submission_id}));
  if(audit.length)log(JSON.stringify({event:'conversely_weekly_run',week,selected:audit.filter(row=>row.selected).length}));
}

export function createComplianceWorker(db,{env=process.env,send=postJson,log=console.log,now=()=>Date.now(),fetchImpl=fetch,
 isPlayable=playableMp3,providers={},scheduleExtras=async()=>{}}={}) {
  const rpc=async(name,params={})=>checked(await db.rpc(name,params));
  let nextWeeklyCheck=0;
  return async ({schedule=true,deliveries=true}={})=>{
    if(schedule && now()>=nextWeeklyCheck){
      nextWeeklyCheck=now()+60*60_000;
      try{await scheduleConverselyWeek(db,{env,log,now,isPlayable,fetchImpl});}
      catch{log(JSON.stringify({event:'compliance_schedule_failed',stage:'conversely_weekly'}));}
    }
    if(schedule){try{await scheduleExtras();}catch{log(JSON.stringify({event:'compliance_schedule_failed',stage:'ix'}));}}
    if(!deliveries)return;
    for(const provider of ['conversely',...Object.keys(providers)]){
      if(!uploadEnabled(env[provider==='conversely'?'CONVERSELY_UPLOAD_ENABLED':'IX_UPLOAD_ENABLED']))continue;
      if(providers[provider]?.available===false)continue;
      for(let n=0;n<10;n++){
        const [job]=await rpc('claim_compliance_upload',{p_provider:provider});if(!job)break;
        let success=false,receipt=null,error=null;
        try{
          const call=checked(await db.from('call_records').select('*').eq('id',job.call_id).eq('tenant_id',job.tenant_id).single());
          if(!['enrolled','enrolled_pending_verification'].includes(call.call_outcome))throw Error('enrollment_no_longer_eligible');
          const recording=checked(await db.from('recording_ingestion').select('*').eq('tenant_id',job.tenant_id)
            .eq('call_record_id',job.call_id).eq('recording_sid',job.twilio_recording_sid).eq('provider_status','completed').single());
          if(provider==='conversely'){
            // Never send a raw queue insert that was not selected by the weekly run.
            const selection=checked(await db.from('conversely_weekly_audit').select('id,agent_id,agent_slug').eq('submission_id',job.id).eq('selected',true).single());
            if(call.compliance_status!=='complete')throw Error('score_incomplete');
            const reason=carrierEligibility({...call,agent_slug:selection.agent_slug},converselyConfiguration(env));
            if(reason)throw Error(reason);
            if(!env.CONVERSELY_API_KEY)throw Error('conversely_key_missing');
            const grant=await recordingComplianceGrant(db,{admin:true,tenant:{id:job.tenant_id},auth:{userId:'integrations-worker'}},recording,{env,format:'mp3'});
            const result=await send('https://sms.converselyai.com/api/metadata/import',JSON.stringify(converselyPayload(call,grant.url)),
              {'X-API-Key':env.CONVERSELY_API_KEY,'Idempotency-Key':job.id});
            if(result.status<200 || result.status>=300)throw Error(`conversely_http_${result.status}`);
          }else receipt=await providers[provider].deliver(job,call,recording);
          success=true;
        }catch(e){error=/^[a-z_]+(?:_\d{3})?$/.test(e.message)?e.message:'upload_failed';}
        await rpc('finish_compliance_upload',{p_provider:provider,p_id:job.id,p_token:job.lease_token,p_success:success,p_error:error,p_receipt:receipt});
        log(JSON.stringify({event:'compliance_upload',provider,id:job.id,call_id:job.call_id,attempt:job.attempts,success,error}));
      }
    }
  };
}
