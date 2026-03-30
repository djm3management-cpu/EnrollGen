/**
 * ScoringEngine — Calculates compliance scores from intent detections.
 * Implements the full scoring algorithm: confidence thresholds, auto-fail,
 * sequence violations, category weights, and grading scale.
 */

import { CATEGORY_WEIGHTS } from '../intents/index.js';

export function calculateGrade(score, autoFail) {
  if (autoFail) return 'F';
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

export function calculateRiskLevel(score, autoFail, seqViolations) {
  if (autoFail || score < 60) return 'critical';
  if (score < 70 || seqViolations > 3) return 'high';
  if (score < 85 || seqViolations > 1) return 'medium';
  return 'low';
}

function determineBucket(overallScore, autoFail, severity, categoryScores) {
  if (autoFail) return 'CRITICAL_VIOLATIONS';

  const majorFails = Object.values(categoryScores).reduce((sum, cat) => {
    return sum + (cat.possible > 0 && cat.earned / cat.possible < 0.5 ? 1 : 0);
  }, 0);

  if (overallScore < 70 || majorFails >= 3) return 'MAJOR_DEFICIENCIES';
  if (overallScore < 85) return 'COACHING_OPPORTUNITIES';
  if (overallScore < 93) return 'MINOR_IMPROVEMENTS';
  return null; // no corrective action needed
}

/**
 * Score a call against a scoring template.
 *
 * @param {Object} params
 * @param {Array} params.detections - Intent detections from IntentClassifier
 * @param {Array} params.templateItems - Scoring template items (from DB)
 * @param {Object} params.template - The scoring template record
 * @returns {Object} Complete scorecard data
 */
export function scoreCall({ detections, templateItems, template }) {
  let totalEarned = 0;
  let totalPossible = 0;
  let autoFailTriggered = false;
  const autoFailReasons = [];
  const categoryScores = {};
  let sequenceViolations = 0;
  const scorecardItems = [];
  const coachingNotes = [];
  const riskFlags = [];

  for (const item of templateItems) {
    const detection = findBestDetection(detections, item.intent_id, item.intent_code);

    let result, pointsEarned;

    // Direction-excluded intents are N/A — don't count against the score
    if (detection?.direction_excluded) {
      scorecardItems.push({
        template_item_id: item.id,
        intent_id: item.intent_id,
        detection_id: detection?.id || null,
        intent_code: detection?.intent_code || item.intent_code,
        question_text: item.question_text,
        category: item.category,
        result: 'na',
        points_earned: 0,
        points_possible: 0,
        confidence: 0,
        is_auto_fail: item.is_auto_fail,
        auto_fail_triggered: false,
        notes: detection.llm_reasoning,
        evidence_text: null,
        evidence_timestamp_ms: null,
        display_order: item.display_order || 0,
      });
      continue;
    }

    if (!detection || !detection.detected) {
      if (item.is_auto_fail) {
        autoFailTriggered = true;
        autoFailReasons.push(item.question_text);
        riskFlags.push(`Auto-fail: ${item.question_text}`);
      }
      result = 'fail';
      pointsEarned = 0;
      coachingNotes.push(`Missing: ${item.question_text}`);
    } else if (detection.anti_pattern_match) {
      result = 'fail';
      pointsEarned = 0;
      if (item.is_auto_fail) {
        autoFailTriggered = true;
        autoFailReasons.push(`Anti-pattern: ${item.question_text}`);
      }
      riskFlags.push(`Anti-pattern detected: ${item.question_text}`);
      coachingNotes.push(`Anti-pattern flagged for: ${item.question_text} — ${detection.anti_pattern_detail || 'Review transcript'}`);
    } else if (detection.confidence >= 0.90) {
      if (detection.sequence_violation) {
        result = 'partial';
        pointsEarned = Math.floor(item.points_possible * 0.5);
        sequenceViolations++;
        coachingNotes.push(`Sequence violation: ${item.question_text} — ${detection.sequence_violation_detail}`);
      } else {
        result = 'pass';
        pointsEarned = item.points_possible;
      }
    } else if (detection.confidence >= 0.70) {
      result = 'pass';
      pointsEarned = item.points_possible;
    } else if (detection.confidence >= 0.50) {
      result = 'partial';
      pointsEarned = Math.floor(item.points_possible * 0.5);
      coachingNotes.push(`Low confidence (${(detection.confidence * 100).toFixed(0)}%): ${item.question_text} — needs manual review`);
    } else {
      result = 'fail';
      pointsEarned = 0;
      if (item.is_auto_fail) {
        autoFailTriggered = true;
        autoFailReasons.push(item.question_text);
      }
    }

    totalEarned += pointsEarned;
    totalPossible += item.points_possible;

    if (!categoryScores[item.category]) {
      categoryScores[item.category] = { earned: 0, possible: 0 };
    }
    categoryScores[item.category].earned += pointsEarned;
    categoryScores[item.category].possible += item.points_possible;

    scorecardItems.push({
      template_item_id: item.id,
      intent_id: item.intent_id,
      detection_id: detection?.id || null,
      intent_code: detection?.intent_code || item.intent_code,
      question_text: item.question_text,
      category: item.category,
      result,
      points_earned: pointsEarned,
      points_possible: item.points_possible,
      confidence: detection?.confidence || 0,
      is_auto_fail: item.is_auto_fail,
      auto_fail_triggered: item.is_auto_fail && result === 'fail',
      notes: detection?.llm_reasoning || null,
      evidence_text: detection?.transcript_segment || null,
      evidence_timestamp_ms: detection?.segment_start_ms || null,
      display_order: item.display_order || 0,
    });
  }

  // Calculate category percentages
  const categoryScoresWithPct = {};
  for (const [cat, scores] of Object.entries(categoryScores)) {
    categoryScoresWithPct[cat] = {
      ...scores,
      pct: scores.possible > 0 ? Math.round((scores.earned / scores.possible) * 100) : 0,
    };
  }

  const overallScore = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
  const grade = calculateGrade(overallScore, autoFailTriggered);
  const passFail = autoFailTriggered ? 'FAIL' : overallScore >= (template.passing_threshold || 85) ? 'PASS' : 'FAIL';
  const riskLevel = calculateRiskLevel(overallScore, autoFailTriggered, sequenceViolations);

  const bucket = determineBucket(overallScore, autoFailTriggered, null, categoryScoresWithPct);
  const correctiveActionsNeeded = bucket !== null;

  return {
    overall_score: Math.round(overallScore * 100) / 100,
    overall_grade: grade,
    total_points_earned: totalEarned,
    total_points_possible: totalPossible,
    pass_fail: passFail,
    auto_fail_triggered: autoFailTriggered,
    auto_fail_reasons: autoFailReasons,
    category_scores: categoryScoresWithPct,
    risk_level: riskLevel,
    risk_flags: riskFlags,
    sequence_violations: sequenceViolations,
    coaching_notes: coachingNotes,
    corrective_actions_needed: correctiveActionsNeeded,
    corrective_bucket: bucket,
    scorecard_items: scorecardItems,
  };
}

function findBestDetection(detections, intentId, intentCode) {
  // Match by intent_code since intent_id may not be resolved yet
  const matches = detections.filter(d =>
    (intentId && d.intent_id === intentId) || (intentCode && d.intent_code === intentCode)
  );
  if (matches.length === 0) return null;
  // Return the detection with highest confidence
  return matches.reduce((best, d) => (!best || d.confidence > best.confidence) ? d : best, null);
}

/**
 * Calculate the average confidence across all scored items.
 */
export function calculateAverageConfidence(scorecardItems) {
  const withConfidence = scorecardItems.filter(i => i.confidence > 0);
  if (withConfidence.length === 0) return 0;
  return withConfidence.reduce((sum, i) => sum + i.confidence, 0) / withConfidence.length;
}
