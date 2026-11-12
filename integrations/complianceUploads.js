import {selectConverselyWeek,processManualConverselyRun} from './converselyRuns.js';
import {intakeCallFields} from '../src/lib/enrollmentIntake.js';
import {converselyConfiguration,carrierEligibility,previousConverselyWeek} from './converselySelection.js';
import { recordingComplianceGrant } from './recordingComplianceGrant.js';
import { postJson } from './transport.js';
import { mediaUrl, fetchRecordingMedia } from '../telephony/src/recordings.js';

const checked = ({data,error}) => { if(error) throw Error('database_error'); return data; };
export const uploadEnabled = value => value === 'true';
const requiredConversely = (value,field) => {
  const text=String(value??'').trim();
  if(!text)throw Error(`conversely_missing_${field}`);
  return text;
};
const converselyDate = (value,field) => {
  const date=new Date(requiredConversely(value,field));
  if(!Number.isFinite(date.getTime()))throw Error(`conversely_invalid_${field}`);
  return date.toISOString().slice(0,10);
};
export function converselyPayload(call, recordingPath, agent = {}) {
  const m = call.metadata || {};
  const callTime=new Date(requiredConversely(call.call_start,'call_datetime'));
  if(!Number.isFinite(callTime.getTime()))throw Error('conversely_invalid_call_datetime');
  const effectiveDate=converselyDate(call.effective_date,'effective_date');
  const planId=requiredConversely(call.plan_id,'plan_id');
  if(!/^\d{1,3}$/.test(planId))throw Error('conversely_invalid_plan_id');
  const contractYear=requiredConversely(m.contract_year || effectiveDate.slice(0,4),'contract_year');
  if(!/^\d{4}$/.test(contractYear))throw Error('conversely_invalid_contract_year');
  const record={
    CallID:requiredConversely(call.id,'call_id'), CallType:'Medicare',
    RecordingPath:requiredConversely(recordingPath,'recording_path'), Target:'New Gen Health Solutions',
    ApplicantFirstName:requiredConversely(call.customer_first_name,'applicant_first_name'),
    ApplicantLastName:requiredConversely(call.customer_last_name,'applicant_last_name'),
    ApplicantPhoneNumber:requiredConversely(call.customer_phone,'applicant_phone_number'),
    ApplicantState:requiredConversely(call.customer_state || call.state_code,'applicant_state'),
    ApplicantZip:requiredConversely(call.zip_code,'applicant_zip'),
    AgentID:requiredConversely(call.agent_id,'agent_id'), AgentName:requiredConversely(call.agent_name,'agent_name'),
    CallDateTime:callTime.toISOString().slice(0,19).replace('T',' '), EffectiveDate:effectiveDate,
    PlanName:requiredConversely(call.plan_name,'plan_name'), CarrierName:requiredConversely(call.carrier_name,'carrier_name'),
    SubmissionDate:converselyDate(m.submission_date,'submission_date'),
    EnrollmentID:requiredConversely(call.enrollment_confirmation_number,'enrollment_id'),
    ContractYear:contractYear, ContractID:requiredConversely(m.contract_id,'contract_id'),
    PlanID:planId.padStart(3,'0'), SegmentID:String(m.segment_id??'').trim() || '0', Conversion:'1', Billable:'1',
  };
  const optional={AgentEmail:agent.email || m.agent_email, Disposition:call.call_outcome,
    CampaignName:m.campaign_name || call.lead_source, PCPName:agent.pcpName};
  for(const [key,value] of Object.entries(optional))if(String(value??'').trim())record[key]=String(value).trim();
  if(call.call_duration_seconds!=null && Number.isFinite(Number(call.call_duration_seconds)) && Number(call.call_duration_seconds)>=0)
    record.CallDuration=Number(call.call_duration_seconds);
  return record;
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
  const week=previousConverselyWeek(now());
  const existing=checked(await db.from('conversely_weekly_runs').select('week_start').eq('week_start',week).not('scheduled_at','is',null).maybeSingle());
  if(existing)return;
  const {config,decisions}=await selectConverselyWeek(db,week,{env,now,isPlayable,fetchImpl});
  const audit=checked(await db.rpc('reserve_conversely_week',{p_week:week,p_samples:config.samples,p_decisions:decisions}));
  for(const row of audit)log(JSON.stringify({event:'conversely_weekly_selection',week,tenant_id:row.tenant_id,agent_id:row.agent_id,
    call_id:row.call_id,score:row.score,eligible:row.eligible,selected:row.selected,reason:row.reason,submission_id:row.submission_id}));
  if(audit.length)log(JSON.stringify({event:'conversely_weekly_run',week,selected:audit.filter(row=>row.selected).length}));
}

export function createComplianceWorker(db,{env=process.env,send=postJson,log=console.log,now=()=>Date.now(),fetchImpl=fetch,
 isPlayable=playableMp3,providers={},scheduleExtras=async()=>{}}={}) {
  const rpc=async(name,params={})=>checked(await db.rpc(name,params));
  let nextWeeklyCheck=0,nextHeartbeat=0,nextFinalize=0;
  return async ({schedule=true,deliveries=true}={})=>{
    if(schedule){
      if(now()>=nextHeartbeat){
        nextHeartbeat=now()+30_000;
        try{await rpc('heartbeat_conversely_worker',{p_enabled:uploadEnabled(env.CONVERSELY_UPLOAD_ENABLED)});}catch{log(JSON.stringify({event:'conversely_worker_heartbeat_failed'}));}
      }
      try{await processManualConverselyRun(db,{env,now,isPlayable,fetchImpl});}catch{log(JSON.stringify({event:'conversely_manual_run_failed'}));}
    }
    if(schedule && now()>=nextWeeklyCheck){
      nextWeeklyCheck=now()+60*60_000;
      try{await db.from('conversely_worker_status').update({next_check_at:new Date(nextWeeklyCheck).toISOString()}).eq('singleton',true);}catch{/* Older schema remains operational. */}
      try{await scheduleConverselyWeek(db,{env,log,now,isPlayable,fetchImpl});}
      catch{log(JSON.stringify({event:'compliance_schedule_failed',stage:'conversely_weekly'}));}
    }
    if(schedule){try{await scheduleExtras();}catch{log(JSON.stringify({event:'compliance_schedule_failed',stage:'ix'}));}}
    if(!deliveries)return;
    for(const provider of ['conversely',...Object.keys(providers)]){
      if(!uploadEnabled(env[provider==='conversely'?'CONVERSELY_UPLOAD_ENABLED':'IX_UPLOAD_ENABLED']))continue;
      if(providers[provider]?.available===false)continue;
      for(let n=0;n<10;n++){
        const [job]=providers[provider]?.claim?await providers[provider].claim():await rpc('claim_compliance_upload',{p_provider:provider});if(!job)break;
        let runEvent=null;
        if(provider==='conversely'){
          try{
            const slot=checked(await db.from('conversely_week_slots').select('week_start,agent_id').eq('submission_id',job.id).eq('tenant_id',job.tenant_id).maybeSingle());
            if(slot){const agentRun=checked(await db.from('conversely_run_agents').select('run_id').eq('submission_id',job.id).eq('tenant_id',job.tenant_id).limit(1));runEvent=agentRun?.[0]?.run_id||null;}
            if(runEvent)await db.from('conversely_run_events').insert({run_id:runEvent,tenant_id:job.tenant_id,kind:'attempt',message:`Submitting call ${job.call_id} · attempt ${job.attempts}/5`});
          }catch{/* Telemetry must not stop delivery. */}
        }
        let success=false,receipt=null,error=null,failure=null;
        try{
          let call=checked(await db.from('call_records').select('*').eq('id',job.call_id).eq('tenant_id',job.tenant_id).single());
          if(!['enrolled','enrolled_pending_verification'].includes(call.call_outcome))throw Error('enrollment_no_longer_eligible');
          const intake=checked(await db.from('enrollment_intakes').select('id,data,submitted_at,completed_at,is_test_enrollment').eq('id',job.enrollment_key).eq('call_id',job.call_id).eq('tenant_id',job.tenant_id).not('completed_at','is',null).single());
          if(!intake)throw Error('intake_incomplete');
          if(provider==='conversely' && intake.is_test_enrollment)throw Error('test_enrollment_excluded');
          if(provider==='ix' && intake.is_test_enrollment!==((env.IX_ENV||'test')==='test'))throw Error('ix_enrollment_environment_mismatch');
          call=intakeCallFields(call,intake);
          const recording=checked(await db.from('recording_ingestion').select('*').eq('tenant_id',job.tenant_id)
            .eq('call_record_id',job.call_id).eq('recording_sid',job.twilio_recording_sid).eq('provider_status','completed').single());
          if(provider==='conversely'){
            // Never send a raw queue insert that was not selected by the weekly run.
            const selection=checked(await db.from('conversely_week_slots').select('agent_id,agent_slug,week_start').eq('submission_id',job.id).eq('tenant_id',job.tenant_id).maybeSingle());
            if(!selection)throw Error('weekly_submission_not_reserved');
            if(selection.agent_id!==call.agent_id)throw Error('agent_attribution_changed');
            if(call.compliance_status!=='complete')throw Error('score_incomplete');
            const owner=checked(await db.from('enrolled_agents').select('clerk_user_id').eq('id',call.agent_id).eq('tenant_id',job.tenant_id).single());
            const reason=carrierEligibility({...call,agent_slug:selection.agent_slug,clerk_user_id:owner.clerk_user_id},converselyConfiguration(env));
            if(reason)throw Error(reason);
            if(!env.CONVERSELY_API_KEY)throw Error('conversely_key_missing');
            const grant=await recordingComplianceGrant(db,{admin:true,tenant:{id:job.tenant_id},auth:{userId:'integrations-worker'}},recording,{env,format:'mp3'});
            const result=await send('https://sms.converselyai.com/api/metadata/import',JSON.stringify({metadata:[converselyPayload(call,grant.url,{pcpName:intake.data?.pcpName})]}),
              {'Api-Key':env.CONVERSELY_API_KEY,'Idempotency-Key':job.id});
            log(JSON.stringify({event:'conversely_response',id:job.id,status:result.status,
              body:typeof result.body==='string'?result.body.replaceAll(env.CONVERSELY_API_KEY,'[REDACTED]'):null}));
            if(result.status<200 || result.status>=300)throw Error(`conversely_http_${result.status}`);
            if(result.body && /invalid api key|unauthori[sz]ed|forbidden|denied/i.test(result.body))throw Error('conversely_response_error');
            if(result.body){
              let response;
              try{response=JSON.parse(result.body);}catch{/* Non-JSON acceptance body. */}
              if(response && (response.success===false || response.error || /error|fail|reject/i.test(String(response.status))))
                throw Error('conversely_response_error');
              if((typeof response==='string' || !response) && !/^(ok|success)$/i.test(String(response || result.body).trim()))
                throw Error('conversely_response_error');
            }
          }else receipt=await providers[provider].deliver(job,call,recording);
          success=true;
        }catch(e){failure=e;error=/^[a-z_]+(?:_\d{3})?$/.test(e.message)?e.message:'upload_failed';}
        if(providers[provider]?.finish)await providers[provider].finish(job,{success,receipt,error,failure});
        else await rpc('finish_compliance_upload',{p_provider:provider,p_id:job.id,p_token:job.lease_token,p_success:success,p_error:error,p_receipt:receipt});
        if(runEvent){try{await db.from('conversely_run_events').insert({run_id:runEvent,tenant_id:job.tenant_id,kind:success?'submitted':'error',message:`Call ${job.call_id}: ${success?'submitted':error}`});}catch{/* Telemetry must not stop delivery. */}}
        log(JSON.stringify({event:'compliance_upload',provider,id:job.id,call_id:job.call_id,attempt:job.attempts,success,error}));
      }
    }
    if(now()>=nextFinalize){nextFinalize=now()+1000;try{await rpc('finalize_conversely_runs');}catch{log(JSON.stringify({event:'conversely_run_status_failed'}));}}
  };
}
