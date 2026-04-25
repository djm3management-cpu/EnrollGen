import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const DEFAULT_TTL_SECONDS = 60;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) {
    return auth.response;
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "Server configuration error",
      detail: "Set DEEPGRAM_API_KEY in Netlify environment variables.",
    });
  }

  const response = await fetch(DEEPGRAM_GRANT_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: DEFAULT_TTL_SECONDS }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("Deepgram token grant failed:", response.status, payload);
    return json(502, { error: "Deepgram token grant failed" });
  }

  return json(200, {
    access_token: payload.access_token,
    expires_in: payload.expires_in,
  });
};

export const config = { path: "/api/deepgram-token" };
