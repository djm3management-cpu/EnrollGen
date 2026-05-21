import { createClient } from "@supabase/supabase-js";
import {
  applyDeepgramRedactionParams,
  redactDiarizedTranscript,
  redactSensitiveText,
} from "./_redaction.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const PAGE_SIZE = 100;

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase service-role env vars not configured");
  return createClient(url, serviceRoleKey);
}

function isAuthorized(request) {
  const secret = process.env.BACKFILL_SECRET || process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return true;
  return request.headers.get("x-backfill-secret") === secret
    || request.headers.get("x-knowledge-update-secret") === secret;
}

function sentimentLabel(score) {
  if (score > 0.05) return "positive";
  if (score < -0.05) return "negative";
  return "neutral";
}

function computeSentimentTrajectory(segments, totalWords) {
  const wordCount = Number(totalWords || 0);
  const quarterSize = wordCount > 0 ? wordCount / 4 : 0;
  const buckets = Array.from({ length: 4 }, () => ({ sum: 0, count: 0 }));

  for (const segment of Array.isArray(segments) ? segments : []) {
    const score = Number(segment?.sentiment_score);
    if (!Number.isFinite(score)) continue;

    const startWord = Number(segment?.start_word);
    const endWord = Number(segment?.end_word);
    let quarterIndex = 0;

    if (quarterSize > 0 && Number.isFinite(startWord)) {
      const midpoint = Number.isFinite(endWord) ? (startWord + endWord) / 2 : startWord;
      quarterIndex = Math.min(3, Math.max(0, Math.floor(midpoint / quarterSize)));
    }

    buckets[quarterIndex].sum += score;
    buckets[quarterIndex].count += 1;
  }

  return buckets.map((bucket, index) => {
    const avg = bucket.count > 0 ? bucket.sum / bucket.count : 0;
    return {
      quarter: index + 1,
      avg_score: Math.round(avg * 100) / 100,
      label: sentimentLabel(avg),
    };
  });
}

function parseSentimentData(dgData, bestAlt) {
  const segments = dgData.results?.sentiments?.segments || [];
  const average = dgData.results?.sentiments?.average || {};

  return {
    average_sentiment: average.sentiment || "neutral",
    average_score: Number.isFinite(Number(average.sentiment_score))
      ? Number(average.sentiment_score)
      : 0,
    segments: segments.map((segment) => ({
      text: redactSensitiveText(segment.text || ""),
      sentiment: segment.sentiment || "neutral",
      score: Number.isFinite(Number(segment.sentiment_score)) ? Number(segment.sentiment_score) : 0,
      start_word: segment.start_word,
      end_word: segment.end_word,
    })),
    trajectory: computeSentimentTrajectory(segments, bestAlt?.words?.length || 0),
  };
}

function parseIntentsData(dgData) {
  return (dgData.results?.intents?.segments || []).map((segment) => ({
    text: redactSensitiveText(segment.text || ""),
    intent: segment.intent || "",
    confidence: Number.isFinite(Number(segment.confidence_score))
      ? Number(segment.confidence_score)
      : 0,
  }));
}

function parseTopicsData(dgData) {
  const topicsByName = new Map();

  for (const segment of dgData.results?.topics?.segments || []) {
    for (const topic of segment.topics || []) {
      const name = topic.topic || "";
      if (!name) continue;
      const confidence = Number.isFinite(Number(topic.confidence_score))
        ? Number(topic.confidence_score)
        : 0;
      const current = topicsByName.get(name);
      if (!current || confidence > current.confidence) {
        topicsByName.set(name, { topic: name, confidence });
      }
    }
  }

  return Array.from(topicsByName.values()).sort((a, b) => b.confidence - a.confidence);
}

function computeTalkTimeRatio(utterances) {
  let agentMs = 0;
  let customerMs = 0;
  for (const utterance of utterances || []) {
    const durationMs = Math.max(0, Math.round(((utterance.end || 0) - (utterance.start || 0)) * 1000));
    if (utterance.speaker === 0) agentMs += durationMs;
    else customerMs += durationMs;
  }
  const totalMs = agentMs + customerMs;
  return {
    agent_talk_pct: totalMs > 0 ? Math.round((agentMs / totalMs) * 100) : 50,
    customer_talk_pct: totalMs > 0 ? Math.round((customerMs / totalMs) * 100) : 50,
    agent_ms: agentMs,
    customer_ms: customerMs,
    total_ms: totalMs,
  };
}

function computeWPM(utterances) {
  const speakers = { agent: { words: 0, ms: 0 }, customer: { words: 0, ms: 0 } };
  for (const utterance of utterances || []) {
    const key = utterance.speaker === 0 ? "agent" : "customer";
    speakers[key].words += (utterance.transcript || "").split(/\s+/).filter(Boolean).length;
    speakers[key].ms += Math.max(0, Math.round(((utterance.end || 0) - (utterance.start || 0)) * 1000));
  }
  return {
    agent_wpm: speakers.agent.ms > 0 ? Math.round((speakers.agent.words / speakers.agent.ms) * 60000) : 0,
    customer_wpm: speakers.customer.ms > 0 ? Math.round((speakers.customer.words / speakers.customer.ms) * 60000) : 0,
  };
}

function computePauses(utterances) {
  const rows = Array.isArray(utterances) ? utterances : [];
  const pauses = [];
  const callEnd = rows.length > 0 ? rows[rows.length - 1].end || 0 : 0;

  for (let i = 1; i < rows.length; i++) {
    const gap = (rows[i].start || 0) - (rows[i - 1].end || 0);
    if (gap > 2.0) {
      pauses.push({
        after_speaker: rows[i - 1].speaker === 0 ? "agent" : "customer",
        before_speaker: rows[i].speaker === 0 ? "agent" : "customer",
        duration_ms: Math.round(gap * 1000),
        position_pct: callEnd > 0 ? Math.round(((rows[i].start || 0) / callEnd) * 100) : 0,
      });
    }
  }

  return {
    total_pauses: pauses.length,
    avg_pause_ms: pauses.length > 0
      ? Math.round(pauses.reduce((sum, pause) => sum + pause.duration_ms, 0) / pauses.length)
      : 0,
    longest_pause_ms: pauses.length > 0 ? Math.max(...pauses.map((pause) => pause.duration_ms)) : 0,
    pauses: pauses.slice(0, 20),
  };
}

function computeInterruptions(utterances) {
  let agentInterruptions = 0;
  let customerInterruptions = 0;
  const rows = Array.isArray(utterances) ? utterances : [];

  for (let i = 1; i < rows.length; i++) {
    const overlap = (rows[i - 1].end || 0) - (rows[i].start || 0);
    if (overlap > 0.3 && rows[i].speaker !== rows[i - 1].speaker) {
      if (rows[i].speaker === 0) agentInterruptions += 1;
      else customerInterruptions += 1;
    }
  }

  return { agent_interruptions: agentInterruptions, customer_interruptions: customerInterruptions };
}

function computeConfidenceByChannel(utterances) {
  const agentConf = [];
  const customerConf = [];
  for (const utterance of utterances || []) {
    const confidence = Number(utterance.confidence);
    if (!Number.isFinite(confidence)) continue;
    if (utterance.speaker === 0) agentConf.push(confidence);
    else customerConf.push(confidence);
  }
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  return {
    agent_avg_confidence: Math.round(avg(agentConf) * 100) / 100,
    customer_avg_confidence: Math.round(avg(customerConf) * 100) / 100,
  };
}

function hasSentiment(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value).length > 0 && value.average_score !== undefined;
  }
  return true;
}

function resolveAudioUrl(row) {
  return row.recording_url
    || row.metadata?.recording_url
    || row.metadata?.audio_url
    || row.metadata?.call_recording_url
    || row.metadata?.recordingUrl
    || null;
}

async function transcribeAudio(audioUrl) {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) throw new Error("DEEPGRAM_API_KEY not configured");

  const dgUrl = new URL("https://api.deepgram.com/v1/listen");
  dgUrl.searchParams.set("model", "nova-2");
  dgUrl.searchParams.set("smart_format", "true");
  dgUrl.searchParams.set("punctuate", "true");
  dgUrl.searchParams.set("diarize", "true");
  dgUrl.searchParams.set("utterances", "true");
  dgUrl.searchParams.set("detect_language", "true");
  dgUrl.searchParams.set("sentiment", "true");
  dgUrl.searchParams.set("intents", "true");
  dgUrl.searchParams.set("topics", "true");
  dgUrl.searchParams.set("summarize", "v2");
  applyDeepgramRedactionParams(dgUrl);

  const dgResp = await fetch(dgUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Token ${dgKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  if (!dgResp.ok) {
    const errText = await dgResp.text();
    throw new Error(`Deepgram transcription failed (${dgResp.status}): ${errText}`);
  }

  const dgData = await dgResp.json();
  const channel = dgData.results?.channels?.[0];
  const bestAlt = channel?.alternatives?.[0];
  const utterances = dgData.results?.utterances || [];
  const diarized = redactDiarizedTranscript(utterances.map((utterance) => ({
    speaker: utterance.speaker === 0 ? "agent" : "customer",
    text: utterance.transcript || "",
    start_ms: Math.round((utterance.start || 0) * 1000),
    end_ms: Math.round((utterance.end || 0) * 1000),
    confidence: utterance.confidence || 0,
  })));
  const durationSeconds = dgData.metadata?.duration
    ? Math.round(dgData.metadata.duration)
    : diarized.length > 0
      ? Math.round(diarized[diarized.length - 1].end_ms / 1000)
      : 0;

  return {
    transcript_raw: redactSensitiveText(bestAlt?.transcript || ""),
    transcript_diarized: diarized,
    call_duration_seconds: durationSeconds,
    dg_sentiment: parseSentimentData(dgData, bestAlt),
    dg_intents: parseIntentsData(dgData),
    dg_topics: parseTopicsData(dgData),
    dg_summary: redactSensitiveText(dgData.results?.summary?.short || ""),
    call_analytics: {
      talk_time: computeTalkTimeRatio(utterances),
      wpm: computeWPM(utterances),
      pauses: computePauses(utterances),
      interruptions: computeInterruptions(utterances),
      confidence: computeConfidenceByChannel(utterances),
    },
    updated_at: new Date().toISOString(),
  };
}

async function fetchPage(supabase, from, to) {
  const { data, error } = await supabase
    .from("call_records")
    .select("id, recording_url, transcript_raw, dg_sentiment, metadata")
    .not("transcript_raw", "is", null)
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data || [];
}

async function parseBody(request) {
  if (request.method !== "POST") return {};
  return request.json().catch(() => ({}));
}

export default async (request) => {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const body = await parseBody(request);
  const limit = Number(body.limit || 25);

  try {
    const supabase = getSupabase();
    let scanned = 0;
    let eligible = 0;
    let updated = 0;
    let skippedMissingAudio = 0;
    const errors = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = await fetchPage(supabase, from, from + PAGE_SIZE - 1);
      scanned += rows.length;

      for (const row of rows) {
        if (hasSentiment(row.dg_sentiment)) continue;
        eligible += 1;

        if (updated >= limit) {
          return json(200, {
            ok: true,
            scanned,
            eligible,
            updated,
            skipped_missing_audio: skippedMissingAudio,
            capped_at: limit,
            errors,
          });
        }

        const audioUrl = resolveAudioUrl(row);
        if (!audioUrl) {
          skippedMissingAudio += 1;
          continue;
        }

        try {
          const updatePayload = await transcribeAudio(audioUrl);
          const { error } = await supabase
            .from("call_records")
            .update(updatePayload)
            .eq("id", row.id);

          if (error) throw error;
          updated += 1;
        } catch (error) {
          errors.push({
            call_id: row.id,
            error: error?.message || String(error),
          });
        }
      }

      if (rows.length < PAGE_SIZE) break;
    }

    return json(200, {
      ok: true,
      scanned,
      eligible,
      updated,
      skipped_missing_audio: skippedMissingAudio,
      errors,
    });
  } catch (error) {
    console.error("[backfill-deepgram-intelligence] Failed:", error);
    return json(500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
};
