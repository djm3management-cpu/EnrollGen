export function createClerkFetch(getToken, { tokenOptions = {}, send = (...args) => fetch(...args) } = {}) {
  return async (input, init = {}) => {
    const retryInput = input instanceof Request ? input.clone() : input;
    const perform = async (target, options) => {
      const token = await getToken(options);
      if (!token) throw new Error('Sign in to continue.');
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      headers.set('Authorization', `Bearer ${token}`);
      return send(target, { ...init, headers });
    };
    const response = await perform(input, tokenOptions);
    if (response.status !== 401 || init.signal?.aborted) return response;
    await response.body?.cancel();
    return perform(retryInput, { ...tokenOptions, skipCache: true });
  };
}

export const fetchWithClerk = (getToken, input, init = {}) => createClerkFetch(getToken)(input, init);

export function installTokenRefresh({ getToken, windowTarget, documentTarget, onRefresh = () => {} }) {
  let pending = null;
  const refresh = () => {
    if (!pending) pending = Promise.resolve().then(() => getToken({ skipCache: true }))
      .then(() => onRefresh()).catch(() => {}).finally(() => { pending = null; });
    return pending;
  };
  const visible = () => { if (documentTarget.visibilityState === 'visible') void refresh(); };
  windowTarget.addEventListener('online', refresh);
  documentTarget.addEventListener('visibilitychange', visible);
  return () => {
    windowTarget.removeEventListener('online', refresh);
    documentTarget.removeEventListener('visibilitychange', visible);
  };
}
