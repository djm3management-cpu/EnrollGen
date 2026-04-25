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

    const result = {
      transcript_raw: transcriptRaw,
      transcript_diarized: diarized,
      duration_seconds: durationSeconds,
      utterance_count: diarized.length,
      word_count: bestAlt?.words?.length || 0,
      language: dgData.results?.channels?.[0]?.detected_language || "en",
    };

    // If callId provided, update the call record
    if (callId) {
      const sb = getSupabase();
      const { error } = await sb.from("call_records").update({
        transcript_raw: transcriptRaw,
        transcript_diarized: diarized,
        call_duration_seconds: durationSeconds,
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
