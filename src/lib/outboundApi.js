import {fetchWithClerk} from './clerkFetch.js';
import { normalizePhoneE164 } from './phone.js';
const BASE = (import.meta.env.VITE_TELEPHONY_BASE_URL || '').replace(/\/$/, '');
export async function outboundRequest(getToken, path, body) {
  const response = await fetchWithClerk(getToken,`${BASE}/api/voice/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Outbound lookup failed'), { status: response.status });
  return data;
}
export async function checkOutbound(getToken, phone) {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) throw new Error('Enter a valid phone number.');
  return outboundRequest(getToken, 'outbound-check', { phone: normalized });
}
export async function canonicalOutbound(getToken, callSid, { isCurrent = () => true,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let retry = 0; retry < 20; retry++) {
    if (!isCurrent()) return null;
    try {
      const result = await outboundRequest(getToken, 'outbound-status', { callSid, waitForAttempt: true });
      if (!isCurrent()) return null;
      if (!result.pending) return result;
    }
    catch (error) {
      // Compatibility with an older Railway deployment during rollout.
      if (error.status !== 404 || retry === 19) throw error;
    }
    if (retry < 19) await wait(250);
  }
  throw new Error('Outbound identity is still pending');
}
