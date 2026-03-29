/**
 * ScorecardGenerator — Orchestrates the full scoring pipeline:
 * transcript → classification → scoring → scorecard + corrective actions.
 * Persists results to Supabase.
 */

import { classifyCall } from './IntentClassifier.js';
import { scoreCall, calculateAverageConfidence } from './ScoringEngine.js';
import { redactPHI } from './PHIRedactor.js';

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

  return {
    scorecard,
    scorecardItems: scoreResult.scorecard_items,
    detections: detectionsWithIds,
    correctiveActions,
    avgConfidence,
  };
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
    .filter(([_, s]) => s.pct < 70)
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
