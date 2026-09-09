import { complete } from "../../src/lib/llm/client.ts";
import { resolveEngine } from "../../src/lib/llm/config.js";
import { llmRuntime } from "./_llmTelemetry.js";
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
import {
  checkSeatLimit,
  logUsageRecord,
  requireActiveSubscription,
} from "./_subscriptionGate.js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export default async (request, context) => {
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

  const subscription = await requireActiveSubscription(sb, callRecord.tenant_id);
  if (subscription.response) {
    console.warn(`[score-bg] Subscription gate blocked scoring for call ${callId}`);
    return;
  }

  const seatLimit = await checkSeatLimit(sb, callRecord.tenant_id, subscription);
  if (seatLimit.response) {
    console.warn(`[score-bg] Seat limit blocked scoring for call ${callId}`);
    return;
  }

  try {
    const result = await generateScorecard({
      supabase: sb,
      callRecord,
      callLLM: async (system, user, options = {}) => {
        const response = await complete({
          engine: resolveEngine(callRecord.product_type || 'MA'), path: 'summary',
          system, messages: [{ role: 'user', content: user }], max_completion_tokens: 16384,
          response_format: options.response_format,
        }, llmRuntime(sb, callRecord.tenant_id, context, { endpoint: 'score-call-background', call_record_id: callId }));
        return response.content.filter(block => block.type === 'text').map(block => block.text).join('');
      },
    });
    try {
      let updateQuery = sb.from("call_records").update({
        metadata: {
          ...(callRecord.metadata || {}),
          scoring_status: "complete",
          scoring_completed_at: new Date().toISOString(),
        },
        compliance_scorecard_id: result.scorecard?.id || callRecord.compliance_scorecard_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", callId);
      if (callRecord.tenant_id) updateQuery = updateQuery.eq("tenant_id", callRecord.tenant_id);
      await updateQuery;
    } catch (updateError) {
      console.warn(`[score-bg] Could not mark scoring complete for ${callId}:`, updateError);
    }

    await logUsageRecord(sb, callRecord.tenant_id, "compliance_score", 1, {
      call_record_id: callId,
      scorecard_id: result.scorecard?.id || null,
      overall_score: result.scorecard?.overall_score ?? null,
      overall_grade: result.scorecard?.overall_grade || null,
    });

    console.log(`[score-bg] Scoring complete for ${callId}: ${result.scorecard?.overall_grade} (${result.scorecard?.overall_score?.toFixed(1)}%)`);
  } catch (err) {
    console.error(`[score-bg] Scoring failed for ${callId}:`, err);
    // Store error on the call record so the client can detect failure
    let updateQuery = sb.from("call_records").update({
      metadata: {
        ...(callRecord.metadata || {}),
        scoring_error: err.message,
        scoring_failed_at: new Date().toISOString(),
      },
    }).eq("id", callId);
    if (callRecord.tenant_id) updateQuery = updateQuery.eq("tenant_id", callRecord.tenant_id);
    await updateQuery;
  }
};
