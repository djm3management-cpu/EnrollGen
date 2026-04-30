/**
 * ScorecardGenerator — Orchestrates the full scoring pipeline:
 * transcript → classification → scoring → scorecard + corrective actions.
 * Persists results to Supabase.
 */

import { classifyCall } from './IntentClassifier.js';
import { scoreCall, calculateAverageConfidence } from './ScoringEngine.js';

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
export async function generateScorecard({ supabase, callRecord, callLLM, onProgress }) {
  const progress = (pct, msg) => onProgress && onProgress(pct, msg);

  // 1. Get the active scoring template
  progress(5, 'Loading scoring template...');
  const { data: template } = await supabase
    .from('scoring_templates')
    .select('*')
    .eq('product_type', callRecord.product_type || 'MA')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (!template) throw new Error('No active scoring template found');

  // 2. Get template items with linked intent data
  const { data: templateItems } = await supabase
    .from('scoring_template_items')
    .select('*, compliance_intents(intent_code)')
    .eq('template_id', template.id)
    .order('display_order');

  // Flatten intent_code onto each template item
  const enrichedItems = (templateItems || []).map(item => ({
    ...item,
    intent_code: item.compliance_intents?.intent_code || null,
  }));

  // 3. Parse transcript
  progress(10, 'Preparing transcript...');
  const diarized = callRecord.transcript_diarized || [];
  if (diarized.length === 0 && callRecord.transcript_raw) {
    // Fallback: treat raw transcript as single agent segment
    diarized.push({
      speaker: 'agent',
      text: callRecord.transcript_raw,
      start_ms: 0,
      end_ms: (callRecord.call_duration_seconds || 600) * 1000,
    });
  }

  // 3a. Short-call filter — calls under 2 min are flagged as insufficient
  const callDurationS = callRecord.call_duration_seconds
    || (diarized.length > 0 ? Math.max(...diarized.map(u => (u.end_ms || 0))) / 1000 : 0);

  if (callDurationS > 0 && callDurationS < 120) {
    progress(90, 'Short call — insufficient for scoring');
    const { data: scorecard } = await supabase
      .from('compliance_scorecards')
      .insert({
        call_id: callRecord.id,
        template_id: template.id,
        thread_id: callRecord.thread_id,
        is_thread_composite: false,
        overall_score: 0,
        overall_grade: 'N/A',
        total_points_earned: 0,
        total_points_possible: 0,
        pass_fail: 'N/A',
        auto_fail_triggered: false,
        auto_fail_reasons: [],
        category_scores: {},
        risk_level: 'low',
        risk_flags: [`Call duration ${Math.round(callDurationS)}s — insufficient for compliance scoring (minimum 120s)`],
        sequence_violations: 0,
        sentiment_summary: {},
        coaching_notes: [`Short call (${Math.round(callDurationS)}s) flagged as insufficient rather than scored at 0%`],
        corrective_actions_needed: false,
      })
      .select()
      .single();

    progress(100, 'Scorecard complete (insufficient call)');
    await updatePostScorecardState(supabase, callRecord, scorecard);
    return { scorecard, scorecardItems: [], detections: [], correctiveActions: [], avgConfidence: 0, isShortCall: true };
  }

  // 4. Classify intents
  progress(15, 'Classifying intents...');
  const classificationResult = await classifyCall({
    diarized,
    callContext: {
      call_type: callRecord.call_type,
      product_type: callRecord.product_type,
      call_direction: callRecord.call_direction,
    },
    callLLM,
    onProgress: (innerPct, msg) => progress(15 + Math.round(innerPct * 0.6), msg),
  });

  // 5. Store intent detections
  progress(80, 'Storing detections...');
  const detectionRows = classificationResult.detections.map(d => ({
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

  const { data: savedDetections } = await supabase
    .from('intent_detections')
    .insert(detectionRows)
    .select();

  // Map detection IDs back for scoring
  const detectionsWithIds = classificationResult.detections.map((d, i) => ({
    ...d,
    id: savedDetections?.[i]?.id || null,
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
  const avgConfidence = calculateAverageConfidence(scoreResult.scorecard_items);
  const { data: scorecard } = await supabase
    .from('compliance_scorecards')
    .insert({
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
    })
    .select()
    .single();

  // Update call record with detected direction if classifier overrode it
  if (classificationResult.detectedDirection) {
    await supabase.from('call_records').update({
      call_direction: classificationResult.detectedDirection,
      metadata: {
        ...(callRecord.metadata || {}),
        direction_detected_from: 'transcript_analysis',
      },
    }).eq('id', callRecord.id);
  }

  // 8. Insert scorecard line items
  const itemRows = scoreResult.scorecard_items.map(item => ({
    scorecard_id: scorecard.id,
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
  }));

  await supabase.from('scorecard_items').insert(itemRows);

  // 9. Create corrective actions if needed
  let correctiveActions = [];
  if (scoreResult.corrective_actions_needed && scoreResult.corrective_bucket) {
    const action = {
      scorecard_id: scorecard.id,
      call_id: callRecord.id,
      agent_id: callRecord.agent_id,
      agent_name: callRecord.agent_name,
      severity: scoreResult.risk_level,
      category: scoreResult.corrective_bucket,
      bucket: scoreResult.corrective_bucket,
      title: `${scoreResult.corrective_bucket}: ${callRecord.agent_name} — Score ${scoreResult.overall_score.toFixed(1)}%`,
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

    const { data: savedAction } = await supabase
      .from('corrective_actions')
      .insert(action)
      .select()
      .single();

    correctiveActions = savedAction ? [savedAction] : [];
  }

  // 10. Store PHI redactions
  const allRedactions = classificationResult.detections
    .flatMap(d => d.phi_redactions || [])
    .map(r => ({ call_id: callRecord.id, ...r }));

  if (allRedactions.length > 0) {
    await supabase.from('phi_redactions').insert(allRedactions);
  }

  progress(100, 'Scorecard complete');

  await updatePostScorecardState(supabase, callRecord, scorecard);

  return {
    scorecard,
    scorecardItems: scoreResult.scorecard_items,
    detections: detectionsWithIds,
    correctiveActions,
    avgConfidence,
  };
}

async function updatePostScorecardState(supabase, callRecord, scorecard) {
  if (!supabase || !callRecord?.id || !scorecard?.id) return;

  try {
    await supabase
      .from('call_records')
      .update({
        compliance_scorecard_id: scorecard.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', callRecord.id);
  } catch (error) {
    console.warn('[ScorecardGenerator] Could not link scorecard to call record:', error?.message || error);
  }

  try {
    const { data: profile } = await supabase
      .from('agent_compliance_profiles')
      .select('*')
      .eq('agent_id', callRecord.agent_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
      await supabase
        .from('agent_compliance_profiles')
        .update(profilePayload)
        .eq('id', profile.id);
      return;
    }

    await supabase
      .from('agent_compliance_profiles')
      .insert({
        ...profilePayload,
        rolling_30d_score: Number(scorecard.overall_score || 0),
        rolling_90d_score: Number(scorecard.overall_score || 0),
        risk_tier: scorecard.risk_level === 'critical' || scorecard.risk_level === 'high'
          ? 'elevated'
          : 'standard',
      });
  } catch (error) {
    console.warn('[ScorecardGenerator] Could not update agent compliance profile:', error?.message || error);
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
