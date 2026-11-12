import {transcriptCoverage} from '../../src/compliance/rules/transcript.js';
import {DEEPGRAM_BATCH_PER_MINUTE_USD} from '../../src/compliance/shared/scoringConfig.js';
import {checked} from '../functions/_evidenceAccess.js';
import {sendProviderFailureAlert} from './postCallProvider.js';

export const RECOVERY_LIMITS = Object.freeze({costUsd:0.50, dailyCostUsd:10, ranges:4, attempts:1});
// Only an ordinary two-party Dial recording has a provable speaker/timeline map.
// Twilio Dial dual: channel 0 is parent, channel 1 is child. Never infer conference speakers.
export function verifiedRecordingPlan(call, recordings, attempts, conferences = []) {
 if (!call.call_end || conferences.length) return null;
 const candidates = recordings.filter(r => r.call_record_id === call.id && r.tenant_id === call.tenant_id &&
  r.provider_status === 'completed' && r.recording_source === 'DialVerb' && r.recording_channels === 2 &&
  r.parent_call_sid === call.twilio_call_sid && ['inbound','outbound'].includes(r.direction) &&
  Math.abs(r.recording_duration_seconds - call.call_duration_seconds) <= 1 &&
  attempts.some(a => a.id === r.attempt_id && a.ended_at && a.answered_at &&
   Math.abs(Date.parse(r.provider_created_at) - Date.parse(a.answered_at)) <= 1000));
 if (candidates.length !== 1 || attempts.length !== 1) return null;
 const recording = candidates[0];
 return {recording, mapping:recording.direction === 'inbound' ? ['customer','agent'] : ['agent','customer'], offset:0};
}
export async function loadRecordingPlan(db, call) {
 const recordings=checked(await db.from('recording_ingestion').select('*').eq('call_record_id',call.id).eq('tenant_id',call.tenant_id));
 const attempts=checked(await db.from('telephony_call_attempts').select('id,answered_at,ended_at').eq('call_record_id',call.id).eq('tenant_id',call.tenant_id));
 const conferences=checked(await db.from('call_conferences').select('call_id').eq('call_id',call.id).eq('tenant_id',call.tenant_id));
 return verifiedRecordingPlan(call,recordings,attempts,conferences);
}
// Repair missing channel endpoints without changing transcriptCoverage's grading gate.
export function recoveryRanges(call) {
 const c=transcriptCoverage(call),ranges=[...c.missingRanges];
 for(const [speaker,channel] of Object.entries(c.channels)) {
  if(channel.firstMs==null)ranges.push({start_ms:0,end_ms:c.durationMs});
  else {
   if(channel.firstMs>Math.min(c.durationMs*.05,speaker==='agent'?120000:Infinity))ranges.push({start_ms:0,end_ms:channel.firstMs});
   if(channel.endMs<c.durationMs*.95)ranges.push({start_ms:channel.endMs,end_ms:c.durationMs});
  }
 }
 const merged=[];
 for(const r of ranges.sort((a,b)=>a.start_ms-b.start_ms)) {
  if(r.end_ms<=r.start_ms)continue;
  const last=merged.at(-1);
  if(last&&r.start_ms<=last.end_ms)last.end_ms=Math.max(last.end_ms,r.end_ms);else merged.push({...r});
 }
 return merged;
}
export function recoveryEstimate(call, plan) {
 const coverage=transcriptCoverage(call);
 const ranges=recoveryRanges(call);
 const minutes=ranges.reduce((n,r)=>n+(r.end_ms-r.start_ms)/60000,0);
 const cost=minutes*(plan?.mapping.length||2)*DEEPGRAM_BATCH_PER_MINUTE_USD;
 const reason=coverage.complete?'already_complete':coverage.durationNeedsVerification?'duration_unverified':!plan?'recording_mapping_unverified':!ranges.length?'channel_coverage_unresolved':ranges.length>RECOVERY_LIMITS.ranges?'too_many_gaps':cost>RECOVERY_LIMITS.costUsd?'recovery_cost_cap':null;
 return {coverage,ranges,minutes,cost,reason};
}
export async function recoveryBlocked(db,call,reason,sendAlert=sendProviderFailureAlert) {
 const notify=checked(await db.rpc('mark_transcript_recovery_blocked',{p_call_id:call.id,p_tenant_id:call.tenant_id,p_reason:reason}));
 if(notify) {
  try {await sendAlert(db,call.session_id,`transcript_recovery call=${call.id}`,reason,{dailyClaim:`recovery-${call.id}-${reason}`});
   checked(await db.from('transcript_recovery_alerts').update({alerted_at:new Date().toISOString()}).eq('call_id',call.id).eq('tenant_id',call.tenant_id).eq('reason',reason));}
  catch {console.error(JSON.stringify({event:'transcript_recovery_alert_delivery_failed',call_record_id:call.id,reason}));}
 }
 return {incomplete:true,reason};
}
export async function recoverBeforeScoring({db,call,runGapJob,env=globalThis.process.env,sendAlert}) {
 if(env.TRANSCRIPT_AUTO_RECOVERY_ENABLED!=='true')return recoveryBlocked(db,call,'automatic_recovery_disabled',sendAlert);
 const plan=await loadRecordingPlan(db,call),estimate=recoveryEstimate(call,plan);
 if(estimate.reason)return recoveryBlocked(db,call,estimate.reason,sendAlert);
 const claimed=checked(await db.rpc('claim_automatic_transcript_recovery',{
  p_call_id:call.id,p_tenant_id:call.tenant_id,p_recording_id:plan.recording.id,
  p_ranges:estimate.ranges,p_mapping:plan.mapping,p_cost:estimate.cost,
 }));
 if(claimed.status!=='claimed') {
  if(claimed.status==='busy')return {pending:true,reason:'recording_recovery_in_progress'};
  return recoveryBlocked(db,call,claimed.reason||'automatic_recovery_already_attempted',sendAlert);
 }
 try {
  const response=await runGapJob(claimed.job_id);
  if(!response.ok)return recoveryBlocked(db,call,'recording_recovery_failed',sendAlert);
  const fresh=checked(await db.from('call_records').select('*').eq('id',call.id).eq('tenant_id',call.tenant_id).single());
  if(!transcriptCoverage(fresh).complete)return recoveryBlocked(db,fresh,'coverage_still_incomplete',sendAlert);
  // Reopen the ordinary dispatcher only after the unchanged coverage test passes.
  checked(await db.rpc('finish_automatic_transcript_recovery',{p_call_id:call.id,p_tenant_id:call.tenant_id,p_job_id:claimed.job_id}));
  return {recovered:true};
 }catch {return recoveryBlocked(db,call,'recording_recovery_failed',sendAlert);}
}
