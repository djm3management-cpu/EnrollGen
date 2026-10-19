// A failed lazy import must reject normally so the panel's error boundary can
// handle it. Never turn a speculative download failure into a page reload.
export function createPreloadRecovery(host = globalThis.window) {
  let failed = false;
  const listeners = new Set();
  const publish = value => {
    if (failed === value) return;
    failed = value;
    for (const listener of listeners) listener();
  };
  const onError = () => publish(true);
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
