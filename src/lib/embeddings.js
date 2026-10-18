const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
import { fetchWithClerk } from "./clerkFetch";
import {getActiveSessionMetadata} from '../hooks/useSessionTracker';

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
      session_id:getActiveSessionMetadata().sessionId || undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.detail ||
      (typeof data?.error==='string'?data.error:data?.error?.message) ||
      `OpenAI embeddings request failed (${response.status})`;
    throw Object.assign(new Error(`${detail}${data.code?` (${data.code})`:''}`),{code:data.code || `embedding_http_${response.status}`});
  }

  const embedding = data?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 1536) {
    throw new Error("Embedding response did not return a 1536-dim vector");
  }

  return embedding;
}
