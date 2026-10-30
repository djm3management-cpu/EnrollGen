import { requireClerkAuth } from './_clerkAuth.js';
import { checked, EvidenceError, evidenceJson, evidenceFailure, getEvidenceServiceClient } from './_evidenceAccess.js';
import { recordingIdentity, authorizeRecordingTarget } from './_recordingAccess.js';

export function createComplianceUploadsHandler({authenticate=requireClerkAuth,getDb=getEvidenceServiceClient}={}) {
  return async request=>{
    if(!['GET','PATCH'].includes(request.method))return evidenceJson(405,{error:'Method not allowed'});
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
      const [conversely,ix,missing,reconciliation]=await Promise.all([
        ...['conversely_submissions','ix_uploads'].map(table=>db.from(table)
          .select('id,call_id,twilio_recording_sid,confirmation_code,status,attempts,last_error,updated_at,next_attempt_at')
          .eq('tenant_id',identity.tenant.id).in('status',['failed','pending']).not('last_error','is',null).order('updated_at',{ascending:false}).limit(200)),
        db.from('compliance_missing_codes').select('*').eq('tenant_id',identity.tenant.id).order('call_start').limit(200),
        db.from('compliance_reconciliation').select('*').eq('tenant_id',identity.tenant.id).order('day',{ascending:false}).limit(30),
      ]);
      return evidenceJson(200,{failures:[...checked(conversely).map(row=>({...row,provider:'Conversely'})),...checked(ix).map(row=>({...row,provider:'UHC IX'}))],
        missing:checked(missing),reconciliation:checked(reconciliation)});
    }catch(error){return evidenceFailure(error);}
  };
}
export default createComplianceUploadsHandler();
