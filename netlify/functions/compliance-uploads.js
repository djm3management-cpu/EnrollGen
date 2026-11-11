import {ixConfiguration} from '../../integrations/ixClient.js';
import {currentConverselyWeek} from '../../integrations/converselySelection.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { checked, EvidenceError, evidenceJson, evidenceFailure, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity, authorizeRecordingTarget } from './_recordingAccess.js';

async function namedRunResults(db,tenantId,results){
  if(!results.length)return results;
  const ids=[...new Set(results.map(row=>row.agent_id).filter(Boolean))];
  const agents=checked(await db.from('enrolled_agents').select('id,clerk_user_id,name').eq('tenant_id',tenantId).in('id',ids));
  const clerkIds=[...new Set(agents.map(agent=>agent.clerk_user_id).filter(Boolean))];
  let tenantAgents=[];
  if(clerkIds.length){try{tenantAgents=checked(await db.from('tenant_agents').select('clerk_user_id,name,agent_slug').eq('tenant_id',tenantId).in('clerk_user_id',clerkIds));}catch{/* Enrollment identity remains available if roster lookup is unavailable. */}}
  const byId=new Map(agents.map(agent=>[agent.id,agent]));
  const byClerk=new Map(tenantAgents.map(agent=>[agent.clerk_user_id,agent]));
  const usefulName=value=>value&&value.trim()&&!/^agent$/i.test(value.trim())?value.trim():null;
  return results.map(row=>{
    const agent=byId.get(row.agent_id),tenantAgent=byClerk.get(agent?.clerk_user_id);
    return {...row,agent_name:usefulName(tenantAgent?.name)||usefulName(agent?.name)||usefulName(row.agent_name)||tenantAgent?.agent_slug||agent?.clerk_user_id||row.agent_id};
  });
}

export function createComplianceUploadsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient,now=()=>Date.now(),env=process.env}={}) {
  return async request=>{
    if(!['GET','PATCH','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
    const auth=await authenticate(request);if(auth.response)return auth.response;
    try{
      const db=getDb(),identity=await recordingIdentity(db,auth);
      if(!identity.admin)throw new EvidenceError(403,'Organization admin access required.');
      if(request.method==='PATCH'){
        const input=await request.json();
        if(typeof input.sunfire_code!=='string' || input.sunfire_code.length>10000)throw new EvidenceError(400,'Enter SunFire confirmation codes, one per line.');
        await authorizeRecordingTarget(db,identity,{call_record_id:input.call_id});
        const codes=[...new Set(input.sunfire_code.split(/[,;\n]+/).map(code=>code.trim()).filter(Boolean))];
        if(!codes.length)throw new EvidenceError(400,'SunFire Confirmation Code is required.');
        checked(await db.from('call_records').update({sunfire_code:codes.join('\n')}).eq('id',input.call_id).eq('tenant_id',identity.tenant.id));
        return evidenceJson(200,{saved:true});
      }
      if(request.method==='POST'){
        let input;try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid JSON.');}
        if(input?.action==='retry_ix_upload'){
          if(!/^[0-9a-f-]{36}$/i.test(input.id||''))throw new EvidenceError(400,'Upload ID is required.');
          const result=checked(await db.rpc('retry_ix_upload',{p_id:input.id,p_tenant:identity.tenant.id,p_actor:auth.userId}));
          const retried=Array.isArray(result)?result[0]?.retry_ix_upload:result;
          if(!retried)throw new EvidenceError(409,'Only unfinalized failed uploads or uploads needing attention can be retried.');
          return evidenceJson(200,{retried:true});
        }
        if(input?.action!=='run_conversely_now')throw new EvidenceError(400,'Invalid compliance action.');
        const worker=checked(await db.from('conversely_worker_status').select('enabled,heartbeat_at').eq('singleton',true).maybeSingle());
        if(!worker?.enabled)throw new EvidenceError(409,'Conversely uploads are disabled on the worker.');
        if(now()-Date.parse(worker.heartbeat_at)>5*60_000)throw new EvidenceError(409,'Conversely worker is unavailable. Please retry when it is running.');
        const id=checked(await db.rpc('request_conversely_run',{p_tenant:identity.tenant.id,p_actor:auth.userId}));
        return evidenceJson(202,{accepted:true,run_id:id});
      }
      let weekly;
      try{
        const worker=checked(await db.from('conversely_worker_status').select('enabled,heartbeat_at').eq('singleton',true).maybeSingle());
        let nextCheckAt=null;
        try{nextCheckAt=checked(await db.from('conversely_worker_status').select('next_check_at').eq('singleton',true).maybeSingle())?.next_check_at||null;}catch{/* Migration may still be pending. */}
        const last=checked(await db.from('conversely_runs').select('id,week_start,trigger,requested_at,started_at,completed_at,status,last_error')
          .eq('tenant_id',identity.tenant.id).order('requested_at',{ascending:false}).order('id',{ascending:false}).limit(1));
        const run=last?.[0]||null;
        const results=run?await namedRunResults(db,identity.tenant.id,checked(await db.rpc('conversely_run_results',{p_run:run.id,p_tenant:identity.tenant.id}))):[];
        const history=checked(await db.from('conversely_runs').select('id,week_start,requested_at,started_at,completed_at,status').eq('tenant_id',identity.tenant.id).order('requested_at',{ascending:false}).limit(40));
        const weeks=[...new Set(history.map(item=>item.week_start))].slice(0,8);
        const historyResults=await Promise.all(weeks.map(async week=>{
          const weekRun=history.find(item=>item.week_start===week);
          const rows=weekRun.id===run?.id?results:checked(await db.rpc('conversely_run_results',{p_run:weekRun.id,p_tenant:identity.tenant.id}));
          return {week_start:week,run:weekRun,submitted:rows.filter(row=>row.status==='submitted').length,skipped:rows.filter(row=>row.status==='skipped').length,failed:rows.filter(row=>row.status==='failed').length,other_skipped:rows.filter(row=>row.status==='skipped'&&!['no_eligible_calls','no_eligible_call'].includes(row.reason)).length};
        }));
        const audit=run?checked(await db.from('conversely_weekly_audit').select('call_id,eligible,selected').eq('tenant_id',identity.tenant.id).eq('week_start',run.week_start).limit(5000)):[];
        let events=[];
        if(run){try{events=checked(await db.from('conversely_run_events').select('id,created_at,kind,message').eq('tenant_id',identity.tenant.id).eq('run_id',run.id).order('id').limit(500));}catch{/* Migration may still be pending. */}}
        weekly={available:true,enabled:worker?.enabled===true,worker_available:!!worker&&now()-Date.parse(worker.heartbeat_at)<=5*60_000,next_check_at:nextCheckAt,
          current_week:currentConverselyWeek(now()),run,results,history:historyResults,events,stages:{calls:audit.filter(row=>row.call_id).length,eligible:audit.filter(row=>row.eligible).length,selected:audit.filter(row=>row.selected).length,submitted:results.filter(row=>row.status==='submitted').length}};
      }catch{weekly={available:false,enabled:false,worker_available:false,run:null,results:[],error:'Conversely run history is unavailable. Apply migration 127 and start the updated worker.'};}
      const enrollmentType=new URL(request.url).searchParams.get('enrollment_type')||'all';
      if(!['all','test','real'].includes(enrollmentType))throw new EvidenceError(400,'Invalid enrollment type.');
      let ixQuery=db.from('ix_upload_admin_rows')
        .select('id,call_id,twilio_recording_sid,confirmation_code,status,attempts,last_error,updated_at,next_attempt_at,provider_message,finalized_at,ix_receipt_id,is_test_enrollment')
        .eq('tenant_id',identity.tenant.id);
      if(enrollmentType!=='all')ixQuery=ixQuery.eq('is_test_enrollment',enrollmentType==='test');
      const [conversely,ix,missing,reconciliation]=await Promise.all([
        enrollmentType==='test'?Promise.resolve({data:[],error:null}):db.from('conversely_submissions')
          .select('id,call_id,twilio_recording_sid,confirmation_code,status,attempts,last_error,updated_at,next_attempt_at')
          .eq('tenant_id',identity.tenant.id).in('status',['failed','pending']).not('last_error','is',null).order('updated_at',{ascending:false}).limit(200),
        ixQuery.order('updated_at',{ascending:false}).limit(200),
        db.from('compliance_missing_codes').select('*').eq('tenant_id',identity.tenant.id).order('call_start').limit(200),
        db.from('compliance_reconciliation').select('*').eq('tenant_id',identity.tenant.id).order('day',{ascending:false}).limit(30),
      ]);
      return evidenceJson(200,{admin:true,ix_environment:ixConfiguration(env).environment.toUpperCase(),failures:[...checked(conversely).map(row=>({...row,provider:'Conversely'})),...checked(ix).map(row=>({...row,provider:'UHC IX'}))],
        missing:checked(missing),reconciliation:checked(reconciliation),weekly});
    }catch(error){return evidenceFailure(error);}
  };
}
export default createComplianceUploadsHandler();
