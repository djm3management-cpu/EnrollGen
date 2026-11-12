const RELOAD_KEY = 'enrollgen_chunk_reload_at';
const RELOAD_WINDOW_MS = 10_000;

export function createPreloadRecovery(host = globalThis.window) {
  let failed = false;
  let lastReloadAt = 0;
  const listeners = new Set();
  const publish = value => {
    if (failed === value) return;
    failed = value;
    for (const listener of listeners) listener();
  };
  const reloadOnce = () => {
    const now = Date.now();
    let previous = lastReloadAt;
    try { previous = Math.max(previous, Number(host?.sessionStorage?.getItem(RELOAD_KEY)) || 0); } catch { /* Storage can be disabled. */ }
    if (now - previous < RELOAD_WINDOW_MS) {
      publish(true);
      return false;
    }
    lastReloadAt = now;
    try { host?.sessionStorage?.setItem(RELOAD_KEY, String(now)); } catch { /* In-memory guard still applies. */ }
    host?.location?.reload();
    return true;
  };
  const onError = event => {
    event?.preventDefault?.();
    reloadOnce();
  };
  return {
    install() {
      host?.addEventListener('vite:preloadError', onError);
      return () => host?.removeEventListener('vite:preloadError', onError);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => failed,
    dismiss: () => publish(false),
    reloadOnce,
    reloadIfIdle(isCallActive) {
      // Recheck at click time: a call may have started since the last render.
      if (isCallActive()) return false;
      host.location.reload();
      return true;
    },
  };
}

export function isAppCallActive({ liveCall, phone, callActive }) {
  return Boolean(callActive || liveCall?.callStarted || phone?.hasCallInProgress?.()
    || phone?.incomingCall || phone?.dialingCall || phone?.activeCall);
}

export const preloadRecovery = createPreloadRecovery();
