import { supabase } from "./supabase";
import { getQueryEmbedding } from "./embeddings";

function formatCallDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString();
}

function buildReferenceId(result, index) {
  const callDate = formatCallDate(result.call_date);
  const agent = result.agent_name || "Unknown Agent";
  const productLine = result.product_line || "Unknown Product";
  const disposition = result.disposition || "Unknown Disposition";
  return `R${index + 1} · ${agent} · ${callDate} · ${productLine} · ${disposition}`;
}

function toContextBlock(results) {
  if (!results.length) return "";

  const body = results
    .map((result, index) => {
      const refId = buildReferenceId(result, index);
      const topics = Array.isArray(result.topics) ? result.topics.join(", ") : "";
      const similarity =
        typeof result.similarity === "number" ? result.similarity.toFixed(3) : "n/a";

      return [
        `Reference ${index + 1} [${refId}]`,
        `Speaker: ${result.speaker || "unknown"}`,
        `Topics: ${topics || "none"}`,
        `Similarity: ${similarity}`,
        `Excerpt: ${result.chunk_text || ""}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "<enrollment_call_references>",
    "The following excerpts are from real, scrubbed calls retrieved from Supabase.",
    "Use them for reference and include citations using [R#] tags when you rely on them.",
    "",
    body,
    "</enrollment_call_references>",
  ].join("\n");
}

function toCitationSources(results) {
  return results.map((result, index) => buildReferenceId(result, index));
}

export async function fetchTranscriptReferences({
  query,
  productLine = null,
  carrier = null,
  disposition = null,
  topics = null,
  matchCount = 5,
  similarityThreshold = 0.7,
} = {}) {
  const normalizedQuery = (query || "").trim();
  if (!normalizedQuery) {
    return {
      results: [],
      contextBlock: "",
      sources: [],
      error: null,
    };
  }

  try {
    const embedding = await getQueryEmbedding(normalizedQuery);
    const { data, error } = await supabase.rpc("search_transcript_chunks", {
      query_embedding: embedding,
      match_count: matchCount,
      filter_product_line: productLine,
      filter_carrier: carrier,
      filter_disposition: disposition,
      filter_topics: topics,
      similarity_threshold: similarityThreshold,
    });

    if (error) throw error;

    const results = Array.isArray(data) ? data : [];
    return {
      results,
      contextBlock: toContextBlock(results),
      sources: toCitationSources(results),
      error: null,
    };
  } catch (error) {
    console.error("Supabase transcript retrieval failed:", error);
    return {
      results: [],
      contextBlock: "",
      sources: [],
      error: error?.message || "Transcript retrieval failed",
    };
  }
}
