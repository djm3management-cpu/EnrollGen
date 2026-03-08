import { supabase } from "./supabase";
import { getQueryEmbedding } from "./embeddings";

const DEFAULT_REAL_SYSTEMS = ["conversely", "enrollhere", "manual"];

function formatCallDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString();
}

function normalizeSourceSystem(value) {
  return (value || "").toString().trim().toLowerCase();
}

function classifySourceType(sourceSystem) {
  const normalized = normalizeSourceSystem(sourceSystem);
  if (!normalized) return "unknown";
  if (normalized.includes("synthetic")) return "synthetic";
  if (DEFAULT_REAL_SYSTEMS.includes(normalized)) return "real";
  return "real";
}

function buildReferenceId(result, index) {
  const callDate = formatCallDate(result.call_date);
  const agent = result.agent_name || "Unknown Agent";
  const productLine = result.product_line || "Unknown Product";
  const disposition = result.disposition || "Unknown Disposition";
  const sourceTypeLabel =
    result.sourceType === "synthetic" ? "SYNTHETIC" : "REAL";
  return `R${index + 1} · ${sourceTypeLabel} · ${agent} · ${callDate} · ${productLine} · ${disposition}`;
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
  getToken = null,
  query,
  productLine = null,
  carrier = null,
  disposition = null,
  topics = null,
  matchCount = 5,
  similarityThreshold = 0.7,
  realFirst = true,
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
    const embedding = await getQueryEmbedding(normalizedQuery, getToken);
    const { data, error } = await supabase.rpc("search_transcript_chunks", {
      query_embedding: embedding,
      match_count: Math.max(matchCount * 3, matchCount),
      filter_product_line: productLine,
      filter_carrier: carrier,
      filter_disposition: disposition,
      filter_topics: topics,
      similarity_threshold: similarityThreshold,
    });

    if (error) throw error;

    const initialResults = Array.isArray(data) ? data : [];
    const transcriptIds = Array.from(
      new Set(initialResults.map((row) => row.transcript_id).filter(Boolean))
    );

    let sourceSystemByTranscript = new Map();
    if (transcriptIds.length > 0) {
      const { data: transcriptMeta, error: transcriptMetaError } = await supabase
        .from("call_transcripts")
        .select("id, source_system")
        .in("id", transcriptIds);

      if (transcriptMetaError) {
        throw transcriptMetaError;
      }

      sourceSystemByTranscript = new Map(
        (transcriptMeta || []).map((row) => [row.id, row.source_system])
      );
    }

    const decorated = initialResults.map((result) => {
      const sourceSystem = sourceSystemByTranscript.get(result.transcript_id) || null;
      return {
        ...result,
        source_system: sourceSystem,
        sourceType: classifySourceType(sourceSystem),
      };
    });

    let results = decorated;
    if (realFirst) {
      const realResults = decorated.filter((row) => row.sourceType !== "synthetic");
      const syntheticResults = decorated.filter((row) => row.sourceType === "synthetic");
      const selectedReal = realResults.slice(0, matchCount);
      const remaining = Math.max(0, matchCount - selectedReal.length);
      results = selectedReal.concat(syntheticResults.slice(0, remaining));
    } else {
      results = decorated.slice(0, matchCount);
    }

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
