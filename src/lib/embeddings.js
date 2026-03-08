const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
import { fetchWithClerk } from "./clerkFetch";

export async function getQueryEmbedding(text, getToken) {
  const input = (text || "").trim();
  if (!input) {
    throw new Error("Cannot generate embedding for empty query text");
  }

  const response = await fetchWithClerk(getToken, "/.netlify/functions/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.detail ||
      data?.error?.message ||
      `OpenAI embeddings request failed (${response.status})`;
    throw new Error(detail);
  }

  const embedding = data?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 1536) {
    throw new Error("Embedding response did not return a 1536-dim vector");
  }

  return embedding;
}
