const failureListeners = new Set();
export function reportAuthFailure() { for (const listener of failureListeners) listener(); }
export function onAuthFailure(listener) { failureListeners.add(listener); return () => failureListeners.delete(listener); }

// Retry credentials, never replay business mutations or sign out. A single
// failed refresh is recoverable; keep trying with capped exponential backoff.
export function createAuthRecovery({getToken, onChange, onRecovered = () => {}, schedule = setTimeout, cancel = clearTimeout}) {
  let stopped = false, timer = null, pending = null, failures = 0;
  const queue = () => {
    if (stopped || timer !== null) return;
    const delay = Math.min(60000, 1000 * 2 ** Math.min(failures++, 6));
    timer = schedule(() => { timer = null; void refresh(); }, delay);
  };
  const refresh = () => {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(() => getToken({skipCache: true})).then(async token => {
      if (!token) throw new Error('Session unavailable');
      if (stopped) return;
      failures = 0;
      if (timer !== null) { cancel(timer); timer = null; }
      onChange(false);
      await onRecovered();
    }).catch(() => { if (!stopped) { onChange(true); queue(); } }).finally(() => { pending = null; });
    return pending;
  };
  return {
    fail() { if (!stopped) { onChange(true); queue(); } },
    refresh,
    dispose() { stopped = true; if (timer !== null) cancel(timer); },
  };
}
