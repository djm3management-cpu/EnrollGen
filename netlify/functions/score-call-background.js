import { complete } from "../../src/lib/llm/client.ts";
import { resolveEngine } from "../../src/lib/llm/config.js";
import { llmRuntime } from "./_llmTelemetry.js";
import { redactSensitiveText } from "./_redaction.js";
import {providerErrorCode,recordProviderStatus,sendProviderFailureAlert} from '../lib/postCallProvider.js';
/**
 * Background function for scoring a call via the compliance engine.
 * Uses the -background suffix so Netlify returns 202 immediately
 * and runs the function asynchronously (up to 15 min).
 *
 * POST /.netlify/functions/score-call-background
 * Body: { callId: "uuid", tenantId: "uuid" }
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

function errorDetails(error) {
  // Keep provider/SQL diagnostics, never dump requests, headers or transcript payloads.
  const message = String(error?.message || error || 'Unknown error')
    .replace(/sk-[\w-]+|Bearer\s+\S+/gi, '[SECRET_REDACTED]')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '[QUOTED_VALUE_REDACTED]');
  return { name: error?.name, message: redactSensitiveText(message).slice(0, 2000),
    stack: String(error?.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 8),
    ...(error?.errors ? { causes: error.errors.map(errorDetails) } : {}) };
}

export function createScoreCallHandler({ getDb = getEvidenceServiceClient, classify, recordStatus=recordProviderStatus } = {}) {
return async (request, context) => {
  if (request.method !== "POST") return new Response('Method not allowed', { status: 405 });
  if (!hasInternalJobAuthorization(request)) {
    console.warn('[score-bg] Rejected unauthorized scoring request');
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    console.error('[score-bg] Invalid JSON request');
    return new Response('Invalid JSON', { status: 400 });
  }

  const { callId, tenantId } = body || {};
  if (!callId || !tenantId) {
    console.error('[score-bg] Missing callId or tenantId');
    return new Response('Missing callId or tenantId', { status: 400 });
  }

  console.log(`[score-bg] Starting scoring for call ${callId}`);
  const startedAt=new Date().toISOString();
  let sb, callRecord;
  let stage = 'load_call';

  try {
    sb = getDb();
    const { data, error } = await sb
      .from("call_records")
      .select("*")
      .eq("id", callId)
      .eq("tenant_id", tenantId)
      .single();

    if (error) throw error;
    callRecord = data;
    if (!callRecord) throw Object.assign(new Error('Call not found'), { code: 'scoring_call_not_found' });

    // Check the saved disposition, never a client/job-supplied outcome. The
    // database repeats this check under lock before claiming and saving a job.
    if (!isComplianceSale(callRecord.call_outcome)) {
      console.log(JSON.stringify({ event: 'scoring_skipped', call_record_id: callId, reason: 'non_sale_disposition' }));
      return Response.json({ skipped: true, reason: 'non_sale_disposition' });
    }

    stage = 'subscription_gate';
    const subscription = await requireActiveSubscription(sb, callRecord.tenant_id);
    if (subscription.response) {
      throw Object.assign(new Error('Subscription gate blocked scoring'), { code: 'scoring_subscription_blocked', status: subscription.response.status });
    }

    stage = 'seat_limit';
    const seatLimit = await checkSeatLimit(sb, callRecord.tenant_id, subscription);
    if (seatLimit.response) {
      throw Object.assign(new Error('Seat limit blocked scoring'), { code: 'scoring_seat_limit_blocked', status: seatLimit.response.status });
    }

    stage = 'generate_scorecard';
    const result = await generateScorecard({
      supabase: sb,
      callRecord,
      callLLM: classify || (async (system, user, options = {}) => {
        console.log(JSON.stringify({ event: 'scoring_llm_request', call_record_id: callId, provider: 'openai' }));
        const response = await complete({
          engine: resolveEngine(callRecord.product_type || 'MA'), path: 'scoring',
          system, messages: [{ role: 'user', content: user }], max_completion_tokens: 16384,
          response_format: options.response_format,
        }, llmRuntime(sb, callRecord.tenant_id, context, { endpoint: 'score-call-background', call_record_id: callId }));
        return response.content.filter(block => block.type === 'text').map(block => block.text).join('');
      }),
      onProgress: (percent, message) => {
        stage = message;
        console.log(JSON.stringify({ event: 'scoring_progress', call_record_id: callId, percent, stage }));
      },
    });
    // The scoring transaction owns completion and linkage; busy/replayed jobs don't rerun side effects.
    if (result.skipped || result.pending) {
      console.log(JSON.stringify({ event: result.pending ? 'scoring_pending' : 'scoring_skipped', call_record_id: callId, reason: result.reason }));
      return Response.json(result.pending ? { pending: true, reason: result.reason } : { skipped: true, reason: result.reason }, { status: result.pending ? 202 : 200 });
    }
    stage = 'record_completion';
    await recordStatus(sb,callRecord.session_id,'scoring',null,startedAt);
    if (result.reused) {
      console.log(JSON.stringify({ event: 'scoring_reused', call_record_id: callId, scorecard_id: result.scorecard?.id }));
      return Response.json({scorecard_id:result.scorecard?.id,reused:true});
    }

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
    console.error(JSON.stringify({event:'scoring_failed',call_record_id:callId,session_id:callRecord?.session_id,stage,code,status:err?.status || null,...errorDetails(err)}));
    // Preflight failures happen before generateScorecard can record a failed job.
    if (sb && callRecord && ['subscription_gate', 'seat_limit'].includes(stage)) {
      try {
        const { error: statusError } = await sb.from('call_records').update({ metadata: {
          ...(callRecord.metadata || {}), scoring_status: 'failed', scoring_error_code: code,
          scoring_failed_at: new Date().toISOString(),
        }}).eq('id', callId).eq('tenant_id', tenantId);
        if (statusError) throw statusError;
      } catch (statusError) {
        console.error(JSON.stringify({event:'scoring_failure_status_write_failed',call_record_id:callId,...errorDetails(statusError)}));
      }
    }
    try {
      if (sb && callRecord) await recordStatus(sb,callRecord.session_id,'scoring',code,startedAt);
    } catch (statusError) {
      console.error(JSON.stringify({event:'provider_failure_status_write_failed',call_record_id:callId,code,...errorDetails(statusError)}));
    }
    if (code === 'scoring_attempts_exhausted' || code === 'call_token_budget_exceeded') {
      try { await sendProviderFailureAlert(sb,callRecord.session_id,'scoring',code); }
      catch (alertError) { console.error(JSON.stringify({event:'scoring_safety_alert_failed',call_record_id:callId,code:providerErrorCode(alertError,'alert_send_failed')})); }
      try {
        const { data: dispatch, error: dispatchReadError } = await sb.from('transcript_score_dispatch')
          .select('revision').eq('call_id',callId).maybeSingle();
        if (dispatchReadError) throw dispatchReadError;
        if (dispatch) {
          const { error: dispatchError } = await sb.from('transcript_score_dispatch').update({
            delivered_revision: dispatch.revision, available_at: 'infinity', last_error: code,
          }).eq('call_id',callId).eq('revision',dispatch.revision);
          if (dispatchError) throw dispatchError;
        }
      } catch (dispatchError) {
        console.error(JSON.stringify({event:'scoring_dispatch_stop_failed',call_record_id:callId,...errorDetails(dispatchError)}));
      }
    }
    // generateScorecard records a checked failed status using the claimed worker token.
    // If even that write fails, return a retryable error instead of claiming completion.
    return Response.json({error:'Scoring failed. Your transcript is retained.',code},{status:503});
  }
};
}

export default createScoreCallHandler();
