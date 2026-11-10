import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from './lib/redaction.js';

// Each final gets a stable ID across retries; never log transcript contents.
export function createTranscriptWriter({ db, claims, retryMs = 1000, notify = () => {} }) {
  let tail = Promise.resolve();
  return message => {
    if(message.type==='transcription_incident') {
      const args={p_attempt_id:claims.attemptId||null,p_participant_id:claims.participantId||null,p_reason:message.reason,p_at_ms:Math.round(claims.participantId?Math.max(0,message.timestamp-Date.parse(claims.startedAt)):message.atMs||0)};
      // Incident failure must never block the transcript write queue.
      return db.rpc('record_transcription_incident',args).then(({error})=>{if(error)console.error(JSON.stringify({event:'transcription_incident_write_failed',call_sid:claims.parentCallSid||claims.callSid}));}).catch(()=>console.error(JSON.stringify({event:'transcription_incident_write_failed',call_sid:claims.parentCallSid||claims.callSid})));
    }
    if(message.type==='transcription_gap'){
      const offset=claims.participantId?Math.max(0,message.timestamp-Date.parse(claims.startedAt)-message.startMs):0;
      const args={p_attempt_id:claims.attemptId||null,p_participant_id:claims.participantId||null,p_gap_id:randomUUID(),p_start_ms:Math.round(offset+message.startMs),p_end_ms:Math.round(offset+message.endMs)};
      tail=tail.then(async()=>{for(;;){try{const {error}=await db.rpc('append_transcription_gap',args);if(!error)return;}catch{/* Persist known loss independently from provider recovery. */}notify({type:'transcription_error',speaker:message.speaker,status:'unavailable',message:'Transcript coverage logging delayed'});await new Promise(resolve=>setTimeout(resolve,Math.min(retryMs,5000)));}});
      return tail;
    }
    if (message.type !== 'transcript' || !message.isFinal || !message.text?.trim()) return;
    const offset = claims.participantId ? Math.max(0, message.timestamp - Date.parse(claims.startedAt) - (message.startMs || 0)) : 0;
    const args = { ...(claims.participantId ? { p_participant_id: claims.participantId } : { p_attempt_id: claims.attemptId }), p_segment_id: randomUUID(),
      p_speaker: message.speaker, p_text: redactSensitiveText(message.text),
      p_captured_at: new Date(message.timestamp).toISOString(),
      p_start_ms: Math.round(offset + (message.startMs || 0)), p_end_ms: Math.round(offset + (message.endMs || 0)) };
    tail = tail.then(async () => {
      // Retain this segment until acknowledged; retries remain independent of browser/media closure.
      let failures = 0;
      for (;;) {
        try {
          const { error } = await db.rpc(claims.participantId ? 'persist_conference_transcript' : 'persist_telephony_transcript', args);
          if (!error) return;
        } catch { /* retry transport failure */ }
        notify({ type: 'transcription_error', speaker: message.speaker, status: 'unavailable',
          message: 'Transcript persistence delayed; server is retrying.' });
        await new Promise(resolve => setTimeout(resolve, Math.min(60000, retryMs * 2 ** Math.min(failures++, 16))));
      }
    });
    return tail;
  };
}

export async function runTranscriptDispatch({ db, scoringUrl, secret, transport = fetch, scoringEnabled = process.env.SCORING_ENABLED === 'true' }) {
  // Store/reconcile terminal transcripts independently. Only disposition-created
  // sale requests can be returned for dispatch; call end cannot create eligibility.
  const reconciled = await db.rpc('reconcile_telephony_transcripts');
  if (reconciled.error) throw reconciled.error;
  if (!scoringUrl || !secret) throw new Error('Transcript scoring URL/secret is not configured');
  if(!scoringEnabled)return;
  const { data, error } = await db.rpc('get_sale_compliance_dispatch');
  if (error) throw error;
  try {await sendPendingRecoveryAlerts({db,scoringUrl,secret,transport});}
  catch {console.error(JSON.stringify({event:'recovery_alert_dispatch_failed'}));}
  for (const job of data || []) {
    if (job.delivered_revision >= job.revision) continue;
    let lastError = null;
    try {
      const response = await transport(scoringUrl, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enrollgen-job-secret': secret },
        body: JSON.stringify({ callId: job.call_id, tenantId: job.tenant_id }),
        signal: AbortSignal.timeout(10_000) });
      if (!response.ok) lastError = `HTTP ${response.status}`;
    } catch { lastError = 'scoring_transport_failed'; }
    console[lastError ? 'error' : 'log'](JSON.stringify({ event: 'scoring_dispatch', call_record_id: job.call_id,
      revision: job.revision, attempt: job.dispatch_attempts, error: lastError }));
    // 202 is only acceptance. Reconciliation confirms the current snapshot was actually scored.
    // The RPC already claimed/scheduled this delivery. Never move transcript readiness.
    const updated = await db.from('transcript_score_dispatch').update({ last_error: lastError })
      .eq('call_id', job.call_id).eq('revision', job.revision).eq('delivered_revision', job.delivered_revision)
      .eq('dispatch_attempts', job.dispatch_attempts);
    if (updated.error) throw updated.error;
  }
}

export function startTranscriptWorker(options) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runTranscriptDispatch(options); }
    catch (error) { console.error(JSON.stringify({ event: 'transcript_dispatch_failed', code: error.code || null,
      message: redactSensitiveText(String(error.message || 'Reconciliation/dispatch failed')).slice(0, 1000) })); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 15_000); timer.unref();
  void tick();
  return () => clearInterval(timer);
}

// Notifications carry IDs and reason codes only, never recordings or transcript text.
export async function sendPendingRecoveryAlerts({db,scoringUrl,secret,transport=fetch}) {
 const {data,error}=await db.from('transcript_recovery_alerts').select('call_id,tenant_id,reason').is('alerted_at',null).order('created_at').limit(20);
 if(error)throw error;
 for(const alert of data||[]) {
  const response=await transport(new URL('/.netlify/functions/stt-alert',scoringUrl),{method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':secret},body:JSON.stringify(alert),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Recovery alert delivery failed');
 }
}
