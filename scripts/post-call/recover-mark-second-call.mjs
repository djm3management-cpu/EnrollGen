/** Explicit recovery for the October 19 call/session collision. No other session
 * is queued or scored. Default: inspect only. Pass --execute to run once.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSupabaseAdminClient} from '../sep-data/common.js';
import {postCallRequestKey} from '../../netlify/functions/post-call.js';
const SOURCE_SESSION='0409b058-a62b-4460-9ac7-3b34584246da';
const SOURCE_KEY='65b8a62fa0043dd57a23f032b6084d6ff7adb1939f792d1860658ef57e18a1b6';
const ATTEMPT='ae2e8bab-051c-4278-a6d3-3c4cdde75b9d';
const SID='CAc5c31087f2ab0bffae56b289c5767d98';
const checked=r=>{if(r.error)throw r.error;return r.data;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db=await createSupabaseAdminClient();
const source=checked(await db.from('post_call_requests').select('*').eq('session_id',SOURCE_SESSION).eq('request_key',SOURCE_KEY).single());
if(source.status==='completed' && source.result?.recovered_session_id){
 console.log(JSON.stringify({status:'already_recovered',session_id:source.result.recovered_session_id}));process.exit(0);
}
const oldJob=checked(await db.from('post_call_jobs').select('*').eq('session_id',SOURCE_SESSION).single());
const attempt=checked(await db.from('telephony_call_attempts').select('*').eq('id',ATTEMPT).eq('parent_call_sid',SID).single());
const priorSession=checked(await db.from('sessions').select('*').eq('id',SOURCE_SESSION).single());
const priorRecord=checked(await db.from('call_records').select('*').eq('id',priorSession.call_record_id).single());
const priorTranscript=checked(await db.from('call_transcripts').select('*').eq('id',priorRecord.transcript_id).single());
const segments=checked(await db.from('telephony_transcript_segments').select('id').eq('attempt_id',ATTEMPT));
if(oldJob.worker_id || source.status!=='failed' || source.action!=='finalize' || source.payload.twilio_call_sid!==SID ||
 source.payload.session_id!==SOURCE_SESSION || attempt.agent_id!=='mark_endres' || attempt.tenant_id!==oldJob.tenant_id ||
 priorSession.agent_id!==oldJob.agent_id || priorRecord.twilio_call_sid===SID || !source.payload.transcript_text?.trim())throw Error('Recovery identity preconditions failed');
if(!attempt.answered_at || !attempt.ended_at || attempt.talk_seconds>=15)throw Error('Short-call recovery preconditions changed');
if(segments.length)throw Error('Server transcript segments exist; review canonical transcript before recovery');
console.log(JSON.stringify({dry_run:!process.argv.includes('--execute'),source_session_id:SOURCE_SESSION,call_sid:SID,attempt_id:ATTEMPT,
 retained_transcript_chars:source.payload.transcript_text.length,server_segments:segments.length,connected_seconds:attempt.talk_seconds}));
if(!process.argv.includes('--execute'))process.exit(0);
const beforeHash=hash({priorRecord,priorTranscript});
const fresh=checked(await db.rpc('start_telephony_session',{p_tenant_id:oldJob.tenant_id,p_agent_id:oldJob.agent_id,p_call_sid:SID,p_flow:'ma'}));
if(fresh.session_id===SOURCE_SESSION || fresh.call_record_id===priorRecord.id)throw Error('Recovery attempted to reuse the first call');
let record=checked(await db.from('call_records').select('*').eq('id',fresh.call_record_id).eq('session_id',fresh.session_id).eq('twilio_call_sid',SID).single());
if(record.compliance_scorecard_id)throw Error('Second call is already scored; do not rescore');
if(record.transcript_raw?.trim() || record.transcript_id)throw Error('Canonical transcript already exists; do not overwrite it');
const payload={...source.payload,action:'recover',session_id:fresh.session_id,call_record_id:fresh.call_record_id,transcript_id:null,
 twilio_call_sid:SID,call_direction:attempt.direction,call_start:attempt.created_at,call_duration_seconds:attempt.talk_seconds,
 call_outcome:'short_call_hangup',
 recovery_source_request_key:SOURCE_KEY,recovery_source_session_id:SOURCE_SESSION};
const key=postCallRequestKey(payload);
const priorRequest=checked(await db.from('post_call_requests').select('status').eq('session_id',fresh.session_id).eq('request_key',key).maybeSingle());
if(priorRequest)throw Error(`Recovery already ${priorRequest.status}; no repeat dispatch`);
checked(await db.from('call_records').update({call_start:attempt.created_at,call_end:attempt.ended_at,call_duration_seconds:attempt.talk_seconds,
 metadata:{...record.metadata,transcript_source:'enrollgen_live',transcript_recovery_source:'retained_post_call_request',
 recovered_from_session_id:SOURCE_SESSION,recovered_from_request_key:SOURCE_KEY}}).eq('id',record.id).eq('session_id',fresh.session_id));
// Re-evaluate only this terminal attempt under the new short-call rule.
checked(await db.from('telephony_call_attempts').update({status:attempt.status}).eq('id',ATTEMPT).eq('parent_call_sid',SID));
const queued=checked(await db.rpc('enqueue_post_call_request',{p_session_id:fresh.session_id,p_tenant_id:oldJob.tenant_id,p_agent_id:oldJob.agent_id,
 p_user_id:oldJob.clerk_user_id,p_org_id:oldJob.clerk_org_id,p_clerk_session_id:null,p_request_key:key,p_action:'recover',p_payload:payload}));
if(!queued.dispatch)throw Error('Recovery was not newly queued; no dispatch');
const response=await fetch('https://enrollgen.com/.netlify/functions/post-call-background',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({session_id:fresh.session_id,dispatch_token:queued.dispatch_token}),signal:AbortSignal.timeout(10000)});
const evidence={source_session_id:SOURCE_SESSION,session_id:fresh.session_id,call_record_id:fresh.call_record_id,request_key:key,
 dispatch_status:response.status,netlify_request_id:response.headers.get('x-nf-request-id'),started_at:new Date().toISOString()};
await fs.writeFile('/private/tmp/enrollgen-mark-second-recovery.json',JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify(evidence));
if(response.status!==202)throw Error('Dispatch failed; queued request retained, no second dispatch');
let request;
for(let poll=0;poll<90;poll++){
 request=checked(await db.from('post_call_requests').select('status,error_code,result').eq('session_id',fresh.session_id).eq('request_key',key).single());
 if(['completed','failed'].includes(request.status))break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}
if(request.status!=='completed')throw Error(`Recovery ${request.status}: ${request.error_code || 'still processing'}; no retry`);
record=checked(await db.from('call_records').select('*').eq('id',fresh.call_record_id).single());
const transcript=checked(await db.from('call_transcripts').select('id,session_id,call_record_id,transcript_text').eq('id',record.transcript_id).single());
const session=checked(await db.from('sessions').select('id,ended_at,call_record_id,twilio_call_sid').eq('id',fresh.session_id).single());
if(!transcript.transcript_text?.trim() || transcript.session_id!==fresh.session_id || transcript.call_record_id!==record.id ||
 !record.compliance_scorecard_id || session.twilio_call_sid!==SID || !session.ended_at || record.call_outcome!=='short_call_hangup')throw Error('Recovery output verification failed');
const afterRecord=checked(await db.from('call_records').select('*').eq('id',priorRecord.id).single());
const afterTranscript=checked(await db.from('call_transcripts').select('*').eq('id',priorTranscript.id).single());
if(beforeHash!==hash({priorRecord:afterRecord,priorTranscript:afterTranscript}))throw Error('First-call evidence changed; stop before reconciliation');
// Resolve only the two failed requests that carried this second call SID.
// Preserve the original error and prior retry history instead of deleting it.
const failed=checked(await db.from('post_call_requests').select('*').eq('session_id',SOURCE_SESSION).eq('status','failed'));
for(const row of failed.filter(r=>r.payload.twilio_call_sid===SID)){
 checked(await db.from('post_call_requests').update({status:'completed',error_code:null,completed_at:new Date().toISOString(),
  result:{recovered_session_id:fresh.session_id,recovered_request_key:key},retry_history:[...(row.retry_history||[]),
   {previous_status:row.status,error_code:row.error_code,result:row.result,completed_at:row.completed_at,reconciled_at:new Date().toISOString(),
    reason:'Second call recovered in its own SID-bound session; original first-call transcript and scorecard unchanged'}]})
  .eq('session_id',SOURCE_SESSION).eq('request_key',row.request_key).eq('status','failed'));
}
const remaining=checked(await db.from('post_call_requests').select('request_key').eq('session_id',SOURCE_SESSION).in('status',['failed','queued','running']));
if(!remaining.length && !Object.keys(oldJob.provider_errors||{}).length){
 checked(await db.from('post_call_jobs').update({status:'completed',error_code:null,progress:'recovered_in_new_session',updated_at:new Date().toISOString()})
  .eq('session_id',SOURCE_SESSION).is('worker_id',null).eq('status','failed'));
}
const output={...evidence,status:request.status,transcript_id:transcript.id,transcript_chars:transcript.transcript_text.length,
 scorecard_id:record.compliance_scorecard_id,outcome:record.call_outcome,session_closed_at:session.ended_at,first_call_unchanged:true};
await fs.writeFile('/private/tmp/enrollgen-mark-second-recovery.json',JSON.stringify(output,null,2),{mode:0o600});
console.log(JSON.stringify(output));
