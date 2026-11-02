// Process-local notifications accelerate persisted answer checks. Database polling
// remains authoritative when Twilio callbacks land on a different replica.
const listeners = new Set();
export function onMediaLifecycle(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function signalMediaLifecycle(event) { for (const listener of listeners) listener(event); }
