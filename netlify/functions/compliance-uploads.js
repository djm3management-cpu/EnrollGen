import {currentConverselyWeek} from '../../integrations/converselySelection.js';
import { requireClerkAuth } from './_clerkAuth.js';
import { checked, EvidenceError, evidenceJson, evidenceFailure, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity, authorizeRecordingTarget } from './_recordingAccess.js';

export function createComplianceUploadsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient,now=()=>Date.now()}={}) {
  return async request=>{
    if(!['GET','PATCH','POST'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
    const auth=await authenticate(request);if(auth.response)return auth.response;
    try{
      const db=getDb(),identity=await recordingIdentity(db,auth);
      if(request.method==='PATCH'){
        const input=await request.json();
        if(typeof input.sunfire_code!=='string' || input.sunfire_code.length>10000)throw new EvidenceError(400,'Enter SunFire confirmation codes, one per line.');
        await authorizeRecordingTarget(db,identity,{call_record_id:input.call_id});
        const codes=[...new Set(input.sunfire_code.split(/[,;\n]+/).map(code=>code.trim()).filter(Boolean))];
        if(!codes.length)throw new EvidenceError(400,'SunFire Confirmation Code is required.');
        checked(await db.from('call_records').update({sunfire_code:codes.join('\n')}).eq('id',input.call_id).eq('tenant_id',identity.tenant.id));
        return evidenceJson(200,{saved:true});
      }
      if(!identity.admin)throw new EvidenceError(403,'Organization admin access required.');
      if(request.method==='POST'){
        let input;try{input=await request.json();}catch{throw new EvidenceError(400,'Invalid JSON.');}
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
        const last=checked(await db.from('conversely_runs').select('id,week_start,trigger,requested_at,started_at,completed_at,status,last_error')
          .eq('tenant_id',identity.tenant.id).order('requested_at',{ascending:false}).order('id',{ascending:false}).limit(1));
        const run=last?.[0]||null;
        const results=run?checked(await db.rpc('conversely_run_results',{p_run:run.id,p_tenant:identity.tenant.id})):[];
        weekly={available:true,enabled:worker?.enabled===true,worker_available:!!worker&&now()-Date.parse(worker.heartbeat_at)<=5*60_000,
          current_week:currentConverselyWeek(now()),run,results};
      }catch{weekly={available:false,enabled:false,worker_available:false,run:null,results:[],error:'Conversely run history is unavailable. Apply migration 127 and start the updated worker.'};}
      const [conversely,ix,missing,reconciliation]=await Promise.all([
        ...['conversely_submissions','ix_uploads'].map(table=>db.from(table)
          .select('id,call_id,twilio_recording_sid,confirmation_code,status,attempts,last_error,updated_at,next_attempt_at')
          .eq('tenant_id',identity.tenant.id).in('status',['failed','pending']).not('last_error','is',null).order('updated_at',{ascending:false}).limit(200)),
        db.from('compliance_missing_codes').select('*').eq('tenant_id',identity.tenant.id).order('call_start').limit(200),
        db.from('compliance_reconciliation').select('*').eq('tenant_id',identity.tenant.id).order('day',{ascending:false}).limit(30),
      ]);
      return evidenceJson(200,{failures:[...checked(conversely).map(row=>({...row,provider:'Conversely'})),...checked(ix).map(row=>({...row,provider:'UHC IX'}))],
        missing:checked(missing),reconciliation:checked(reconciliation),weekly});
    }catch(error){return evidenceFailure(error);}
  };
}
export default createComplianceUploadsHandler();
