// Warm code only (never customer data), one module at a time after page load.
// Hover/focus imports remain available when background warming is disabled.
export function preloadWorkspace(loaders, host = window) {
  const connection = host.navigator?.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return () => {};
  let stopped = false;
  let handle;
  const queue = [...loaders];
  const idle = typeof host.requestIdleCallback === "function";

  function schedule() {
    if (stopped || !queue.length) return;
    handle = idle
      ? host.requestIdleCallback(run)
      : host.setTimeout(run, 750);
  }
  async function run() {
    if (stopped) return;
    if (host.document.visibilityState === "hidden") {
      host.document.addEventListener("visibilitychange", resume);
      return;
    }
    const load = queue.shift();
    try { await load(); } catch {
      // Speculative loading must not break navigation. The panel's own lazy
      // loader/error boundary will handle a real navigation failure.
    }
    schedule();
  }
  function resume() {
    if (host.document.visibilityState !== "hidden") {
      host.document.removeEventListener("visibilitychange", resume);
      schedule();
    }
  }
  if (host.document.readyState === "complete") schedule();
  else host.addEventListener("load", schedule, { once: true });

  return () => {
    stopped = true;
    host.removeEventListener("load", schedule);
    host.document.removeEventListener("visibilitychange", resume);
    if (idle) host.cancelIdleCallback(handle);
    else host.clearTimeout(handle);
  };
}
