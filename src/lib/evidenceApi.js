export async function evidenceRequest(getToken, endpoint, body = null) {
  const token = await getToken?.();
  if (!token) throw new Error("Sign in to access evidence.");
  const response = await fetchWithClerk(getToken, `/.netlify/functions/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try { data = await response.json(); }
  catch {
    // A Vite/static-server fallback can return index.html with HTTP 200.
    // Never let callers mistake that response for successful API data.
    throw new Error(response.ok
      ? 'API returned an invalid response. Check that the API server is running.'
      : `Evidence request failed (${response.status}).`);
  }
  if (!response.ok) throw new Error(data?.error || `Evidence request failed (${response.status}).`);
  return data;
}
import { fetchWithClerk } from './clerkFetch.js';
