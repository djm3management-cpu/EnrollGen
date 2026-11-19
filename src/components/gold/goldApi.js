import { fetchWithClerk } from '../../lib/clerkFetch';

const PATHS = { gold: '/api/gold-standards', activation: '/api/activation-tasks' };

// One request to gold-standards or activation-tasks. Reads are GET with the
// inputs as query parameters; writes are POST with a JSON body. `csv` returns
// text. A failure throws the server's own error text.
export async function goldRequest(getToken, api, params = {}, { body = null, csv = false } = {}) {
  // Local demo only: false in every production build, so demoGold.js is dropped.
  if (import.meta.env.DEV && import.meta.env.VITE_PING_DEMO === '1') {
    const { demoGoldRequest } = await import('./demoGold.js');
    return demoGoldRequest(api, params, body, csv);
  }
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null));
  const url = `${PATHS[api]}${query.size ? `?${query}` : ''}`;
  const response = body
    ? await fetchWithClerk(getToken, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : await fetchWithClerk(getToken, url);
  if (csv && response.ok) return response.text();
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error || `Request failed (${response.status})`);
  return parsed;
}
