// Lives above Clerk's signed-in subtree. Claim synchronously before a call is
// exposed to React so an auth transition cannot unmount the owning device.
export function createCallContinuity() {
  let owner = null;
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => owner !== null,
    begin(call) { owner = call; publish(); },
    replace(previous, call) { if (owner === previous) { owner = call; publish(); } },
    end(call) { if (owner === call) { owner = null; publish(); } },
  };
}
export const callContinuity = createCallContinuity();

export function installCallNavigationGuard({host = window, documentTarget = document, isActive = callContinuity.getSnapshot} = {}) {
  const beforeUnload = event => {
    if (!isActive()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const click = event => {
    const link = event.target?.closest?.('a[href]');
    if (!isActive() || !link || link.hasAttribute('download') || link.target === '_blank') return;
    event.preventDefault();
    event.stopPropagation();
  };
  host.addEventListener('beforeunload', beforeUnload);
  documentTarget.addEventListener('click', click, true);
  return () => {
    host.removeEventListener('beforeunload', beforeUnload);
    documentTarget.removeEventListener('click', click, true);
  };
}

// Clerk's own navigation callbacks must obey the same rule as app links.
export function createCallSafeClerkRouter(host = globalThis.window, isActive = callContinuity.getSnapshot) {
  return {
    routerPush(to) { if (!isActive()) host.location.assign(to); },
    routerReplace(to) { if (!isActive()) host.location.replace(to); },
  };
}
