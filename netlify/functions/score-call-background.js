/**
 * Background function for scoring a call via the compliance engine.
 * Uses the -background suffix so Netlify returns 202 immediately
 * and runs the function asynchronously (up to 15 min).
 *
 * POST /.netlify/functions/score-call-background
 * Body: { callId: "uuid" }
 */

import { createClient } from "@supabase/supabase-js";
import { generateScorecard } from "../../src/compliance/engine/ScorecardGenerator.js";

const AI_TIMEOUT_MS = 120000;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`);
    return data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
  } finally {
    clearTimeout(timeout);
  }
}

export default async (request) => {
  if (request.method !== "POST") return;

  let body;
  try { body = await request.json(); } catch { return; }

  const { callId } = body;
  if (!callId) {
    console.error("score-call-background: missing callId");
    return;
  }

  console.log(`[score-bg] Starting scoring for call ${callId}`);
  const sb = getSupabase();

  const { data: callRecord, error } = await sb
    .from("call_records")
    .select("*")
    .eq("id", callId)
    .single();

  if (error || !callRecord) {
    console.error(`[score-bg] Call not found: ${callId}`, error);
    return;
  }

  try {
    const result = await generateScorecard({
      supabase: sb,
      callRecord,
      callLLM: callClaude,
    });
    console.log(`[score-bg] Scoring complete for ${callId}: ${result.scorecard?.overall_grade} (${result.scorecard?.overall_score?.toFixed(1)}%)`);
  } catch (err) {
    console.error(`[score-bg] Scoring failed for ${callId}:`, err);
    // Store error on the call record so the client can detect failure
    await sb.from("call_records").update({
      metadata: {
        ...(callRecord.metadata || {}),
        scoring_error: err.message,
        scoring_failed_at: new Date().toISOString(),
      },
    }).eq("id", callId);
  }
};
