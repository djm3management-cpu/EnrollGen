import { fetchWithClerk } from '../../lib/clerkFetch';

// One request to ping-buyer or ping-operator. Reads are GET with the action
// and inputs as query parameters; writes are POST with a JSON body. A failure
// throws the server's own error text.
export async function exchangeRequest(getToken, fn, action, params = {}, write = false) {
  // Local demo only: the condition is false in every production build, so the
  // bundler drops this branch and demoData.js is never included.
  if (import.meta.env.DEV && import.meta.env.VITE_PING_DEMO === '1') {
    const { demoRequest } = await import('./demoData.js');
    return demoRequest(fn, action, params, write);
  }
  const path = `/.netlify/functions/${fn === 'operator' ? 'ping-operator' : 'ping-buyer'}`;
  const query = new URLSearchParams(Object.entries({ action, ...params }).filter(([, value]) => value !== undefined && value !== ''));
  const response = write
    ? await fetchWithClerk(getToken, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...params }) })
    : await fetchWithClerk(getToken, `${path}?${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.error || `Request failed (${response.status})`);
  return body;
}
