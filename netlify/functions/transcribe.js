/**
 * Deepgram batch transcription — transcribes a pre-recorded audio file.
 *
 * POST /transcribe
 * Body: { url: "https://...", callId: "uuid" }
 * Returns: { transcript_raw, transcript_diarized, duration_seconds }
 *
 * Uses Deepgram REST API (pre-recorded) with diarization + speaker labels.
 * If callId is provided, updates the call_records row with transcript data.
 */

import { requireClerkAuth } from "./_clerkAuth.js";
import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };
function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key);
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
      text: segment.text || "",
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
    text: segment.text || "",
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

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    return json(500, { error: "DEEPGRAM_API_KEY not configured in environment variables." });
  }

  let body;
  try { body = await request.json(); } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { url: audioUrl, callId } = body;
  if (!audioUrl) return json(400, { error: "Missing 'url' in request body" });

  try {
    // Call Deepgram pre-recorded API
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

    const dgResp = await fetch(dgUrl.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Token ${dgKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    });

    if (!dgResp.ok) {
      const errText = await dgResp.text();
      console.error("Deepgram API error:", dgResp.status, errText);
      return json(dgResp.status, { error: "Deepgram transcription failed", detail: errText });
    }

    const dgData = await dgResp.json();

    // Extract results
    const channel = dgData.results?.channels?.[0];
    const alternatives = channel?.alternatives || [];
    const bestAlt = alternatives[0];

    // Build raw transcript
    const transcriptRaw = bestAlt?.transcript || "";

    // Build diarized transcript from utterances
    const utterances = dgData.results?.utterances || [];
    const diarized = utterances.map(u => ({
      speaker: u.speaker === 0 ? "agent" : "customer",
      text: u.transcript || "",
      start_ms: Math.round((u.start || 0) * 1000),
      end_ms: Math.round((u.end || 0) * 1000),
      confidence: u.confidence || 0,
    }));

    // Calculate duration
    const durationSeconds = dgData.metadata?.duration
      ? Math.round(dgData.metadata.duration)
      : diarized.length > 0
        ? Math.round(diarized[diarized.length - 1].end_ms / 1000)
        : 0;

    const sentimentData = parseSentimentData(dgData, bestAlt);
    const intentsData = parseIntentsData(dgData);
    const topicsData = parseTopicsData(dgData);
    const summaryText = dgData.results?.summary?.short || "";
    const talkTimeRatio = computeTalkTimeRatio(utterances);
    const wpmData = computeWPM(utterances);
    const pauseData = computePauses(utterances);
    const interruptionData = computeInterruptions(utterances);
    const confidenceData = computeConfidenceByChannel(utterances);
    const callAnalytics = {
      talk_time: talkTimeRatio,
      wpm: wpmData,
      pauses: pauseData,
      interruptions: interruptionData,
      confidence: confidenceData,
    };

    const result = {
      transcript_raw: transcriptRaw,
      transcript_diarized: diarized,
      duration_seconds: durationSeconds,
      utterance_count: diarized.length,
      word_count: bestAlt?.words?.length || 0,
      language: dgData.results?.channels?.[0]?.detected_language || "en",
      sentiment: sentimentData,
      intents: intentsData,
      topics: topicsData,
      summary: summaryText,
      analytics: callAnalytics,
    };

    // If callId provided, update the call record
    if (callId) {
      const sb = getSupabase();
      const { error } = await sb.from("call_records").update({
        transcript_raw: transcriptRaw,
        transcript_diarized: diarized,
        call_duration_seconds: durationSeconds,
        dg_sentiment: sentimentData,
        dg_intents: intentsData,
        dg_topics: topicsData,
        dg_summary: summaryText,
        call_analytics: callAnalytics,
        updated_at: new Date().toISOString(),
      }).eq("id", callId);

      if (error) console.error("Failed to update call record:", error);
      result.call_updated = !error;
    }

    return json(200, result);
  } catch (err) {
    console.error("transcribe function error:", err);
    return json(500, { error: err.message });
  }
};
