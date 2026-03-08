import { requireClerkAuth } from "./_clerkAuth.js";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) {
    return auth.response;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is not set");
    return jsonResponse(500, {
      error: "Server configuration error",
      detail: "Set OPENAI_API_KEY in Netlify environment variables.",
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const input = (body?.input || "").toString().trim();
    const model = (body?.model || OPENAI_EMBEDDING_MODEL).toString();

    if (!input) {
      return jsonResponse(400, {
        error: "Bad request",
        detail: "Embedding input is required.",
      });
    }

    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenAI embeddings API error:", response.status, JSON.stringify(data));
      const detail = data?.error?.message || `OpenAI embeddings request failed (${response.status})`;
      return jsonResponse(response.status, { error: "Embedding request failed", detail });
    }

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return jsonResponse(502, {
        error: "Embedding response invalid",
        detail: "Embedding response did not return a 1536-dim vector.",
      });
    }

    return jsonResponse(200, {
      embedding,
      model,
    });
  } catch (error) {
    console.error("embeddings function error:", error);
    return jsonResponse(500, {
      error: "Embedding request failed",
      detail: String(error),
    });
  }
};
