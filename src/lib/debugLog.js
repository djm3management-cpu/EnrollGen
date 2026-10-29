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
