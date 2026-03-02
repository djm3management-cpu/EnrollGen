export async function fetchWithClerk(getToken, input, init = {}) {
  const token = await getToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
