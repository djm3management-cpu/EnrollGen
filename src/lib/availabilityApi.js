export async function availabilityRequest(getToken, body = null, { signal } = {}) {
  const token = await getToken?.();
  if (!token) throw new Error('Sign in to change availability.');
  const response = await fetch('/.netlify/functions/set-availability', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Availability request failed (${response.status}).`);
  return payload;
}
