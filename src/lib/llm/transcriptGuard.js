// A request acknowledges only the transcript revision it captured. A segment
// arriving during retrieval or an in-flight completion must remain pending.
export function createTranscriptGuard(sessionId = crypto.randomUUID()) {
  let revision = 0;
  let acknowledged = 0;
  let hasDispatched = false;
  let skippedTicks = 0;
  const observed = new Map();
  return {
    sessionId,
    get hasNewTranscript() { return revision > acknowledged; },
    get hasDispatched() { return hasDispatched; },
    get skippedTicks() { return skippedTicks; },
    segment(text) { if (text?.trim()) revision++; },
    // Also covers restored/capped transcripts and MA's final customer segments.
    observe(source, text = '') {
      if (observed.get(source) !== text) {
        observed.set(source, text);
        if (text.trim()) revision++;
      }
    },
    capture() { return revision; },
    dispatched(capturedRevision) {
      acknowledged = Math.max(acknowledged, capturedRevision);
      hasDispatched = true;
    },
    shouldDispatch({ timer = false, manual = false } = {}) {
      if (!timer || manual || !hasDispatched || revision > acknowledged) return true;
      skippedTicks++;
      return false;
    },
  };
}

// Cumulative counts make retries idempotent. No transcript or prompt is retained.
// Skipped ticks only update memory; a separate background flush sends aggregates.
export function createSkipCounterReporter(send) {
  const pending = new Map();
  let flushing = null;
  return {
    record(guard) { if (guard.skippedTicks) pending.set(guard.sessionId, guard.skippedTicks); },
    flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        for (const [sessionId, count] of [...pending]) {
          try {
            await send({ session_id: sessionId, skipped_ticks: count });
            if (pending.get(sessionId) === count) pending.delete(sessionId);
          } catch {
            // Retain this session's count for the next flush, without blocking coaching.
          }
        }
      })().finally(() => { flushing = null; });
      return flushing;
    },
  };
}
