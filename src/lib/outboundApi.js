import { normalizePhoneE164 } from './phone.js';
const BASE = (import.meta.env.VITE_TELEPHONY_BASE_URL || '').replace(/\/$/, '');
export async function outboundRequest(getToken, path, body) {
  const token = await getToken();
  const response = await fetch(`${BASE}/api/voice/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
export async function canonicalOutbound(getToken, callSid) {
  for (let retry = 0; retry < 20; retry++) {
    try { return await outboundRequest(getToken, 'outbound-status', { callSid }); }
    catch (error) {
      if (error.status !== 404 || retry === 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
