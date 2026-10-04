// Only static event labels belong here. Never pass an exception or customer data.
// Production builds cannot enable browser diagnostics.
export function debugLog(event) {
  if (import.meta.env?.DEV && import.meta.env?.VITE_DEBUG_LOGS === 'true') {
    console.debug(event);
  }
}
