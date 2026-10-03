export async function evidenceRequest(getToken, endpoint, body = null) {
  const token = await getToken?.();
  if (!token) throw new Error("Sign in to access evidence.");
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Evidence request failed (${response.status}).`);
  return data;
}
