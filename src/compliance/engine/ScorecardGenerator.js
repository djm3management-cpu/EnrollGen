import { transcriptCoverage, sortTranscript } from '../rules/transcript.js';
import { debugLog } from "../../lib/debugLog.js";
import { randomUUID } from "node:crypto";
/**
 * ScorecardGenerator, Orchestrates the full scoring pipeline:
 * transcript → classification → scoring → scorecard + corrective actions.
 * Persists results to Supabase.
 */

import { classifyJudgmentOnce } from './JudgmentPass.js';
import { scoreCall, calculateAverageConfidence } from './ScoringEngine.js';
import { calibratedTemplateItem } from '../shared/scoringPolicy.js';

/**
 * Generate a complete compliance scorecard for a call.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} params.callRecord - The call_records row
 * @param {Function} params.callLLM - async (system, user) => string
 * @param {Function} [params.onProgress] - (pct, message) => void
 * @returns {Object} { scorecard, scorecardItems, detections, correctiveActions }
 */
async function checked(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message || error}`);
  return data;
}

export async function generateScorecard(params) {
  let job;
  try {
    return await generateScorecardWork({ ...params, setJob: value => { job = value; } });
  } catch (error) {
    try {
      if(job?.passId)await checked(params.supabase.from('compliance_llm_passes').update({status:'failed'}).eq('id',job.passId),'Record pass failure');
      if (job) {
        await checked(params.supabase.rpc('fail_scoring_job', {
          p_job_id: job.jobId, p_attempt_token: job.attemptToken, p_error: error.message,
        }), 'Record failed scoring job');
        await checked(params.supabase.rpc('mark_scoring_incomplete',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_reason:error.message}),'Record incomplete scoring version');
      } else {
        await checked(params.supabase.from('call_records').update({
          metadata: { ...(params.callRecord.metadata || {}), scoring_status: 'failed', scoring_error: error.message,
            scoring_error_code: error.code || null, scoring_failed_at: new Date().toISOString() },
        }).eq('id', params.callRecord.id).eq('tenant_id', params.callRecord.tenant_id), 'Record scoring failure');
      }
    } catch (statusError) {
      throw new globalThis.AggregateError([error, statusError], `Scoring failed; failure status could not be saved: ${statusError.message}`);
    }
    throw error;
  }
}

async function generateScorecardWork({ supabase, callRecord, callLLM, onProgress, setJob }) {
  const workStarted=Date.now();
  const progress = (pct, msg) => onProgress && onProgress(pct, msg);

  const coverage = transcriptCoverage(callRecord);
  if (!coverage.complete || coverage.durationMs<120000) {
    const reason = coverage.durationMs<120000?'Call below scoring minimum':`Transcript ${Math.round(coverage.endMs/1000)}s of ${Math.round(coverage.durationMs/1000)}s (${(coverage.ratio*100).toFixed(1)}%)`;
    await checked(supabase.from('call_records').update({metadata:{...(callRecord.metadata||{}),scoring_status:'incomplete',scoring_error:reason,transcript_coverage:coverage}}).eq('id',callRecord.id).eq('tenant_id',callRecord.tenant_id),'Record incomplete transcript');
    return {incomplete:true,reason,coverage};
  }
  // 1. Get the active scoring template
  progress(5, 'Loading scoring template...');
  const { data: template, error: templateError } = await supabase
    .from('scoring_templates')
    .select('*')
    .eq('product_type', callRecord.product_type || 'MA')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (templateError) throw new Error(`Load scoring template: ${templateError.message}`);
  if (!template) throw new Error('No active scoring template found');

  // 2. Get template items with linked intent data
  const { data: templateItems, error: itemsError } = await supabase
    .from('scoring_template_items')
    .select('*, compliance_intents(intent_code)')
    .eq('template_id', template.id)
    .order('display_order');

  if (itemsError) throw new Error(`Load scoring template items: ${itemsError.message}`);
  if (!templateItems?.length) throw new Error('Scoring template has no items');
  const job = await checked(supabase.rpc('begin_scoring_job', {
    p_call_id: callRecord.id, p_template_id: template.id,
    p_transcript: { raw: callRecord.transcript_raw ?? null, diarized: callRecord.transcript_diarized ?? null,
      duration: callRecord.call_duration_seconds ?? null },
  }), 'Begin scoring job');
  if (job?.status === 'skipped') return { skipped: true, reason: job.reason };
  if (job?.status === 'pending') return { pending: true, reason: job.reason || 'scoring_in_progress' };
  if (job?.status === 'failed') {
    const failure = new Error(job.error || 'Scoring job failed permanently');
    failure.code = job.error || 'scoring_failed';
    throw failure;
  }
  if (job?.status === 'complete') return { ...job.result, reused: true,
    avgConfidence: calculateAverageConfidence(job.result.scorecardItems) };
  if (job?.status !== 'claimed' || !job.jobId || !job.attemptToken) throw new Error('Scoring job was not claimed');
  setJob(job);
  const persist = async result => {
    const saved = await checked(supabase.rpc('persist_scoring_result', {
      p_job_id: job.jobId, p_attempt_token: job.attemptToken, p_result: {...result,scoringDurationMs:Date.now()-workStarted},
    }), 'Persist scoring result');
    if (saved?.skipped) return saved;
    if (!saved?.scorecard?.id) throw new Error('Scoring transaction returned no scorecard');
    if (!saved.reused) await updateAgentProfile(supabase, callRecord, saved.scorecard);
    progress(100, 'Scorecard complete');
    return { ...saved, avgConfidence: calculateAverageConfidence(saved.scorecardItems) };
  };

  // Flatten intent_code onto each template item
  const enrichedItems = (templateItems || []).map(item => calibratedTemplateItem(item, template.policy_version));

  // 3. Parse transcript
  progress(10, 'Preparing transcript...');
  const diarized = sortTranscript(structuredClone(callRecord.transcript_diarized || []));
  if (diarized.length === 0 && callRecord.transcript_raw) {
    // Fallback: treat raw transcript as single agent segment
    diarized.push({
      speaker: 'agent',
      text: callRecord.transcript_raw,
      start_ms: 0,
      end_ms: (callRecord.call_duration_seconds || 600) * 1000,
    });
  }

  // 4. Classify intents
  progress(15, 'Classifying intents...');
  const pass=await checked(supabase.rpc('claim_compliance_pass',{
    p_call_id:callRecord.id,p_tenant_id:callRecord.tenant_id,p_request_id:randomUUID(),p_mode:'automatic',p_requested_by:null,
  }),'Claim lifetime scoring pass');
  if(pass.status==='claimed')job.passId=pass.id;
  if(pass.status!=='claimed')throw Object.assign(new Error(pass.status),{code:'paid_pass_already_exists'});
  const classificationResult=await classifyJudgmentOnce({diarized,callContext:callRecord,callLLM,passId:pass.id});

  // 5. Prepare intent detections for the atomic save
  progress(80, 'Preparing detections...');
  const detectionRows = classificationResult.detections.map(d => ({
    id: randomUUID(),
    call_id: callRecord.id,
    intent_code: d.intent_code,
    detected: d.detected,
    confidence: d.confidence,
    detection_method: d.detection_method,
    speaker: d.speaker,
    transcript_segment: d.transcript_segment,
    segment_start_ms: d.segment_start_ms,
    segment_end_ms: d.segment_end_ms,
    sequence_position_actual: d.sequence_position_actual,
    sequence_violation: d.sequence_violation,
    sequence_violation_detail: d.sequence_violation_detail,
    anti_pattern_match: d.anti_pattern_match,
    anti_pattern_detail: d.anti_pattern_detail,
    llm_reasoning: d.llm_reasoning,
  }));

  // IDs are allocated before scoring; the transaction saves evidence and links together.
  const detectionsWithIds = classificationResult.detections.map((d, i) => ({
    ...d, id: detectionRows[i].id,
  }));

  // 6. Score the call
  progress(85, 'Calculating score...');
  const scoreResult = scoreCall({
    detections: detectionsWithIds,
    templateItems: enrichedItems,
    template,
  });

  // 7. Create the scorecard record
  progress(90, 'Generating scorecard...');
  const scorecard = {
      tenant_id: callRecord.tenant_id,
      call_id: callRecord.id,
      template_id: template.id,
      thread_id: callRecord.thread_id,
      is_thread_composite: false,
      overall_score: scoreResult.overall_score,
      overall_grade: scoreResult.overall_grade,
      total_points_earned: scoreResult.total_points_earned,
      total_points_possible: scoreResult.total_points_possible,
      pass_fail: scoreResult.pass_fail,
      auto_fail_triggered: scoreResult.auto_fail_triggered,
      auto_fail_reasons: scoreResult.auto_fail_reasons,
      category_scores: scoreResult.category_scores,
      risk_level: scoreResult.risk_level,
      risk_flags: scoreResult.risk_flags,
      sequence_violations: scoreResult.sequence_violations,
      sentiment_summary: classificationResult.sentiment,
      coaching_notes: scoreResult.coaching_notes,
      corrective_actions_needed: scoreResult.corrective_actions_needed,
    };

  // No separate assessment request; judgments share one bounded pass.
  // 8. Prepare scorecard line items
  const itemRows = scoreResult.scorecard_items.map(item => ({
    template_item_id: item.template_item_id,
    intent_id: item.intent_id,
    detection_id: item.detection_id,
    question_text: item.question_text,
    category: item.category,
    result: item.result,
    points_earned: item.points_earned,
    points_possible: item.points_possible,
    confidence: item.confidence,
    is_auto_fail: item.is_auto_fail,
    auto_fail_triggered: item.auto_fail_triggered,
    notes: item.notes,
    evidence_text: item.evidence_text,
    evidence_timestamp_ms: item.evidence_timestamp_ms,
    display_order: item.display_order,
    rule_id:item.intent_code,decided_by:item.decided_by||'Code',
  }));


  // 9. Create corrective actions if needed
  let correctiveActions = [];
  if (scoreResult.corrective_actions_needed && scoreResult.corrective_bucket) {
    const action = {
      call_id: callRecord.id,
      agent_id: callRecord.agent_id,
      agent_name: callRecord.agent_name,
      severity: scoreResult.risk_level,
      category: scoreResult.corrective_bucket,
      bucket: scoreResult.corrective_bucket,
      title: `${scoreResult.corrective_bucket}: ${callRecord.agent_name}, Score ${scoreResult.overall_score.toFixed(1)}%`,
      description: buildCorrectiveDescription(scoreResult),
      intent_codes: scoreResult.auto_fail_reasons.length > 0
        ? scoreResult.scorecard_items.filter(i => i.auto_fail_triggered).map(i => i.intent_code).filter(Boolean)
        : scoreResult.scorecard_items.filter(i => i.result === 'fail').slice(0, 5).map(i => i.intent_code).filter(Boolean),
      evidence: scoreResult.scorecard_items
        .filter(i => i.result === 'fail' && i.evidence_text)
        .slice(0, 3)
        .map(i => `${i.question_text}: "${i.evidence_text}"`)
        .join('\n'),
      status: 'open',
    };

    correctiveActions = [action];
  }

  // 10. Persist scorecard, detections, items, actions and PHI evidence together
  const allRedactions = classificationResult.detections
    .flatMap(d => d.phi_redactions || [])
    .map(r => ({ call_id: callRecord.id, ...r }));

  return persist({ scorecard, items: itemRows, detections: detectionRows,
    actions: correctiveActions, redactions: allRedactions, isShortCall: false,
    detectedDirection: classificationResult.detectedDirection || null, passId:pass.id, rulesVersion:'cy2027-overhaul-draft-1' });
}

async function updateAgentProfile(supabase, callRecord, scorecard) {
  if (!supabase || !callRecord?.id || !scorecard?.id) return;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('agent_compliance_profiles')
      .select('*')
      .eq('agent_id', callRecord.agent_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;
    const previousTotal = Number(profile?.total_calls_scored || 0);
    const nextTotal = previousTotal + 1;
    const priorAllTime = Number(profile?.all_time_score || 0);
    const nextAllTime = ((priorAllTime * previousTotal) + Number(scorecard.overall_score || 0)) / nextTotal;
    const priorPassRate = Number(profile?.pass_rate || 0);
    const nextPassRate = ((priorPassRate * previousTotal) + (scorecard.pass_fail === 'pass' ? 100 : 0)) / nextTotal;
    const priorAutoFailRate = Number(profile?.auto_fail_rate || 0);
    const nextAutoFailRate = ((priorAutoFailRate * previousTotal) + (scorecard.auto_fail_triggered ? 100 : 0)) / nextTotal;
    const profilePayload = {
      agent_id: callRecord.agent_id,
      agent_name: callRecord.agent_name,
      agent_npn: callRecord.agent_npn || profile?.agent_npn || null,
      total_calls_scored: nextTotal,
      all_time_score: Number(nextAllTime.toFixed(2)),
      pass_rate: Number(nextPassRate.toFixed(2)),
      auto_fail_rate: Number(nextAutoFailRate.toFixed(2)),
      last_scored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (profile?.id) {
      await checked(supabase.from('agent_compliance_profiles').update(profilePayload).eq('id', profile.id), 'Update agent profile');
      return;
    }

    await checked(supabase.from('agent_compliance_profiles').insert({
        ...profilePayload,
        rolling_30d_score: Number(scorecard.overall_score || 0),
        rolling_90d_score: Number(scorecard.overall_score || 0),
        risk_tier: scorecard.risk_level === 'critical' || scorecard.risk_level === 'high'
          ? 'elevated'
          : 'standard',
      }), 'Insert agent profile');
  } catch {
    debugLog("[ScorecardGenerator] Could not update agent compliance profile");
  }
}

function buildCorrectiveDescription(scoreResult) {
  const lines = [];
  lines.push(`Overall Score: ${scoreResult.overall_score.toFixed(1)}% (${scoreResult.overall_grade})`);
  lines.push(`Pass/Fail: ${scoreResult.pass_fail}`);

  if (scoreResult.auto_fail_triggered) {
    lines.push(`\nAuto-Fail Reasons:`);
    for (const reason of scoreResult.auto_fail_reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  const weakCategories = Object.entries(scoreResult.category_scores)
    .filter(([, s]) => s.pct < 70)
    .sort((a, b) => a[1].pct - b[1].pct);

  if (weakCategories.length > 0) {
    lines.push(`\nWeak Categories:`);
    for (const [cat, scores] of weakCategories) {
      lines.push(`  - ${cat}: ${scores.pct}% (${scores.earned}/${scores.possible})`);
    }
  }

  if (scoreResult.coaching_notes.length > 0) {
    lines.push(`\nCoaching Notes:`);
    for (const note of scoreResult.coaching_notes.slice(0, 10)) {
      lines.push(`  - ${note}`);
    }
  }

  return lines.join('\n');
}

