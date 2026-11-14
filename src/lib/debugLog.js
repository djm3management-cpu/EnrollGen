// Only static event labels belong here. Never pass an exception or customer data.
// Production builds cannot enable browser diagnostics.
export function debugLog(event) {
  if (import.meta.env?.DEV && import.meta.env?.VITE_DEBUG_LOGS === 'true') {
    console.debug(event);
  }
}

// Audio fallback must be visible in production. Call only with processing errors;
// omit stacks, streams, user identity and call data from this diagnostic.
export function logAudioProcessingError(label, error) {
  console.error(label, error instanceof Error ? error.message : String(error));
}

// STT ownership diagnostics intentionally include only the provider call SID.
export function warnSttOverlap(callSid) {
  console.warn('[stt] Duplicate transcription prevented', /^CA[0-9a-f]{32}$/i.test(callSid || '') ? callSid : null);
}
export function logSttUsageFailure(callSid) {
  console.error('[stt] Browser usage report failed', /^CA[0-9a-f]{32}$/i.test(callSid || '') ? callSid : null);
}

// Reauthentication diagnostics are always visible in development, with only
// allowlisted SDK codes/status. Arbitrary error messages/metadata stay private.
export function logSessionLockError(diagnostic) {
  if (import.meta.env?.DEV) console.error('Session lock error', diagnostic);
}
