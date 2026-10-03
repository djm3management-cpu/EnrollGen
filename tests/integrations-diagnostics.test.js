import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,deliver} from '../integrations/worker.js';
import {deliveryDiagnostic} from '../integrations/diagnostics.js';

test('missing worker mail variables survive in both ledger RPC and logs without sending', async () => {
  for (const env of [{},{RESEND_API_KEY:'secret'},{INTEGRATIONS_REPORT_FROM:'reports@example.test'}]) {
    const job={id:'job',kind:'report',source_id:'source',payload:{date:'2026-10-01',calls:[]},attempts:1,lease_token:'lease',expires_at:new Date(Date.now()+86400000).toISOString()};
    const queue=[job],finished=[],logs=[];
    const db={rpc:async(name,params)=>{
      if(name==='claim_integration_delivery')return {data:queue.splice(0,1)};
      if(name==='finish_integration_delivery')finished.push(params);
      return {data:null};
    },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{active:true,report_emails:['dispo@example.test']}})})})})};
    await createWorker(db,{env,send:async()=>assert.fail('mail must not be sent'),log:l=>logs.push(JSON.parse(l))})({schedule:false});
    assert.equal(finished[0].p_result,'delivery_error');
    assert.equal(finished[0].p_error.message,'Report mail not configured');
    assert.deepEqual(finished[0].p_error.missing_env,['RESEND_API_KEY','INTEGRATIONS_REPORT_FROM'].filter(k=>!env[k]));
    assert.deepEqual(logs[0].error,finished[0].p_error);
  }
});
test('network and CSV exceptions retain safe diagnostics; arbitrary text and stacks never escape', () => {
  assert.equal(deliveryDiagnostic(new RangeError('Invalid time value')).message,'Invalid time value');
  const raw=Object.assign(new Error('Bearer secret re_secret https://user:password@example.test/?token=secret person@example.test +16097787669 transcript'),{code:'ENOTFOUND'});
  assert.deepEqual(deliveryDiagnostic(raw),{name:'Error',message:'Error text withheld (may contain secrets or personal data)',code:'ENOTFOUND'});
  assert.equal(deliveryDiagnostic({name:'secret',message:'secret',code:'secret'}).code,undefined);
});
test('report HTTP rejection preserves safe provider reason and stable delivery key', async () => {
  const job={id:'stable-id',kind:'report',payload:{date:'2026-10-01',calls:[]}};
  const result=await deliver(job,{active:true,report_emails:['dispo@example.test']},{env:{RESEND_API_KEY:'secret',INTEGRATIONS_REPORT_FROM:'reports@example.test'},send:async(url,body,headers)=>{
    assert.equal(headers['Idempotency-Key'],'stable-id');
    assert.equal(JSON.parse(body).attachments.length,1);
    return {status:403,error:{name:'validation_error',message:'The secret.example domain is not verified; bearer secret'}};
  }});
  assert.deepEqual(result,{status:403,result:'http_error',error:{name:'Error',code:'validation_error',message:'Resend sender domain is not verified'}});
});
test('Paragon dormant controls are preserved even with a transport configured', async () => {
  const send=async()=>assert.fail('disabled destinations must not send');
  assert.deepEqual(await deliver({kind:'push'},{active:true,push_enabled:false},{send}),{status:0,result:'disabled'});
  assert.deepEqual(await deliver({kind:'postback',payload:{call_start_time:'2026-10-01T00:00:00Z'}},{active:true,postback_url:null},{send}),{status:0,result:'disabled'});
});
