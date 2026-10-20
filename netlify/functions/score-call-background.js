import { complete } from "../../src/lib/llm/client.ts";
import { resolveEngine } from "../../src/lib/llm/config.js";
import { llmRuntime } from "./_llmTelemetry.js";
import {providerErrorCode,recordProviderStatus,sendProviderFailureAlert} from '../lib/postCallProvider.js';
/**
 * Background function for scoring a call via the compliance engine.
 * Uses the -background suffix so Netlify returns 202 immediately
 * and runs the function asynchronously (up to 15 min).
 *
 * POST /.netlify/functions/score-call-background
 * Body: { callId: "uuid" }
 */

import { getEvidenceServiceClient } from "./_evidenceAccess.js";
import { generateScorecard } from "../../src/compliance/engine/ScorecardGenerator.js";
import { isComplianceSale } from "../../src/lib/saleCompliance.js";
import {
  checkSeatLimit,
  logUsageRecord,
  requireActiveSubscription,
} from "./_subscriptionGate.js";

function hasInternalJobAuthorization(request) {
  const secret = process.env.SCORE_CALL_JOB_SECRET;
  return Boolean(secret) && request.headers.get("x-enrollgen-job-secret") === secret;
}

export function createScoreCallHandler({ getDb = getEvidenceServiceClient, classify, recordStatus=recordProviderStatus } = {}) {
return async (request, context) => {
  if (request.method !== "POST") return;
  if (!hasInternalJobAuthorization(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return; }

  const { callId, tenantId } = body;
  if (!callId) {
    console.error("score-call-background: missing callId");
    return;
  }

  console.log(`[score-bg] Starting scoring for call ${callId}`);
  const sb = getDb();
  const startedAt=new Date().toISOString();

  const { data: callRecord, error } = await sb
    .from("call_records")
    .select("*")
    .eq("id", callId)
    .eq("tenant_id", tenantId || "")
    .single();

  if (error || !callRecord) {
    console.error(`[score-bg] Call not found: ${callId}`, error);
    return;
  }

  // Check the saved disposition, never a client/job-supplied outcome. The
  // database repeats this check under lock before claiming and saving a job.
  if (!isComplianceSale(callRecord.call_outcome)) {
    return Response.json({ skipped: true, reason: 'non_sale_disposition' });
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
      callLLM: classify || (async (system, user, options = {}) => {
        const response = await complete({
          engine: resolveEngine(callRecord.product_type || 'MA'), path: 'summary',
          system, messages: [{ role: 'user', content: user }], max_completion_tokens: 16384,
          response_format: options.response_format,
        }, llmRuntime(sb, callRecord.tenant_id, context, { endpoint: 'score-call-background', call_record_id: callId }));
        return response.content.filter(block => block.type === 'text').map(block => block.text).join('');
      }),
    });
    // The scoring transaction owns completion and linkage; busy/replayed jobs don't rerun side effects.
    if (result.skipped) return Response.json({ skipped: true, reason: result.reason });
    if (result.pending) return new Response(null, { status: 202 });
    await recordStatus(sb,callRecord.session_id,'scoring',null,startedAt);
    if (result.reused) return Response.json({scorecard_id:result.scorecard?.id,reused:true});

    await logUsageRecord(sb, callRecord.tenant_id, "compliance_score", 1, {
      call_record_id: callId,
      scorecard_id: result.scorecard?.id || null,
      overall_score: result.scorecard?.overall_score ?? null,
      overall_grade: result.scorecard?.overall_grade || null,
    });

    console.log(`[score-bg] Scoring complete for ${callId}: ${result.scorecard?.overall_grade} (${result.scorecard?.overall_score?.toFixed(1)}%)`);
    return Response.json({scorecard_id:result.scorecard?.id});
  } catch (err) {
    const code=providerErrorCode(err,'scoring_failed');
    console.error(JSON.stringify({event:'scoring_failed',call_record_id:callId,session_id:callRecord.session_id,code,status:err.status || null}));
    try {
      await recordStatus(sb,callRecord.session_id,'scoring',code,startedAt);
    } catch {
      console.error(JSON.stringify({event:'provider_failure_status_write_failed',call_record_id:callId,code}));
    }
    if (code === 'scoring_attempts_exhausted' || code === 'call_token_budget_exceeded') {
      try { await sendProviderFailureAlert(sb,callRecord.session_id,'scoring',code); }
      catch (alertError) { console.error(JSON.stringify({event:'scoring_safety_alert_failed',call_record_id:callId,code:providerErrorCode(alertError,'alert_send_failed')})); }
      const { data: dispatch, error: dispatchReadError } = await sb.from('transcript_score_dispatch')
        .select('revision').eq('call_id',callId).maybeSingle();
      if (!dispatchReadError && dispatch) {
        const { error: dispatchError } = await sb.from('transcript_score_dispatch').update({
          delivered_revision: dispatch.revision, available_at: 'infinity', last_error: code,
        }).eq('call_id',callId).eq('revision',dispatch.revision);
        if (dispatchError) console.error(JSON.stringify({event:'scoring_dispatch_stop_failed',call_record_id:callId}));
      } else if (dispatchReadError) console.error(JSON.stringify({event:'scoring_dispatch_stop_failed',call_record_id:callId}));
    }
    // generateScorecard records a checked failed status using the claimed worker token.
    // If even that write fails, return a retryable error instead of claiming completion.
    return Response.json({error:'Scoring failed. Your transcript is retained.',code},{status:503});
  }
};
}

export default createScoreCallHandler();
