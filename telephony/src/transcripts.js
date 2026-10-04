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
  // Reconcile terminal calls too: missed/reordered callbacks and late finals recover here.
  const reconciled = await db.rpc('reconcile_telephony_transcripts');
  if (reconciled.error) throw reconciled.error;
  const { data, error } = await db.from('transcript_score_dispatch').select('*')
    .lte('available_at', new Date().toISOString()).limit(20);
  if (error) throw error;
  for (const job of data || []) {
    if (job.delivered_revision >= job.revision) continue;
    if (!scoringUrl || !secret) throw new Error('Transcript scoring URL/secret is not configured');
    let lastError = null;
    try {
      const response = await transport(scoringUrl, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enrollgen-job-secret': secret },
        body: JSON.stringify({ callId: job.call_id, tenantId: job.tenant_id }),
        signal: AbortSignal.timeout(10_000) });
      if (!response.ok) lastError = `HTTP ${response.status}`;
    } catch { lastError = 'scoring_transport_failed'; }
    // 202 is only acceptance. Reconciliation confirms the current snapshot was actually scored.
    const updated = await db.from('transcript_score_dispatch').update({ last_error: lastError,
      available_at: new Date(Date.now() + 60_000).toISOString() })
      .eq('call_id', job.call_id).eq('revision', job.revision);
    if (updated.error) throw updated.error;
  }
}

export function startTranscriptWorker(options) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runTranscriptDispatch(options); }
    catch { console.error('[transcripts] reconciliation/dispatch failed; check database and scoring configuration'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 15_000); timer.unref();
  void tick();
  return () => clearInterval(timer);
}
