import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from './lib/redaction.js';

// Each final gets a stable ID across retries; never log transcript contents.
export function createTranscriptWriter({ db, claims, retryMs = 1000, notify = () => {} }) {
  let tail = Promise.resolve();
  return message => {
    if (message.type !== 'transcript' || !message.isFinal) return;
    const args = { p_attempt_id: claims.attemptId, p_segment_id: randomUUID(),
      p_speaker: message.speaker, p_text: redactSensitiveText(message.text),
      p_captured_at: new Date(message.timestamp).toISOString(),
      p_start_ms: Math.round(message.startMs || 0), p_end_ms: Math.round(message.endMs || 0) };
    tail = tail.then(async () => {
      // Retain this segment until acknowledged; retries remain independent of browser/media closure.
      for (;;) {
        try {
          const { error } = await db.rpc('persist_telephony_transcript', args);
          if (!error) return;
        } catch { /* retry transport failure */ }
        notify({ type: 'transcription_error', speaker: message.speaker, status: 'unavailable',
          message: 'Transcript persistence delayed; server is retrying.' });
        await new Promise(resolve => setTimeout(resolve, retryMs));
      }
    });
    return tail;
  };
}

export async function runTranscriptDispatch({ db, scoringUrl, secret, transport = fetch }) {
  // Store/reconcile terminal transcripts independently. Only disposition-created
  // sale requests can be returned for dispatch; call end cannot create eligibility.
  const reconciled = await db.rpc('reconcile_telephony_transcripts');
  if (reconciled.error) throw reconciled.error;
  if (!scoringUrl || !secret) throw new Error('Transcript scoring URL/secret is not configured');
  const { data, error } = await db.rpc('get_sale_compliance_dispatch');
  if (error) throw error;
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
