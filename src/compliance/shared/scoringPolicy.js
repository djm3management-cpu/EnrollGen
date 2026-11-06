import { getIntentByCode } from '../intents/index.js';

export const SCORING_POLICY_VERSION = 'context-2026-10-19';
export const MA_2027_POLICY_VERSION = 'ma-cy2027-2026-10-01';

// Legacy scoring requires affirmative, high-confidence hard misconduct.
// The versioned MA policy additionally preserves deterministic TPMO timing
// auto-fail and conditional, confirmed unauthorized TPMO data sharing.
const HARD_VIOLATIONS = new Set([
  'CONDUCT_001_NO_CROSS_SELLING', 'CONDUCT_002_NO_STEERING',
  'CONDUCT_003_NO_CHERRY_PICKING', 'CONDUCT_004_NO_MISLEADING_LANGUAGE',
  'ENROLL_011_NO_PRESSURE_TACTICS', 'ENROLL_012_NO_INCENTIVES_OFFERED',
]);

export function isHardViolation(code, detection, policyVersion) {
  const current = policyVersion === MA_2027_POLICY_VERSION;
  if (['CALL_OPEN_001_RECORDING_ANNOUNCE','CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','ENROLL_002_VERBAL_CONSENT'].includes(code) && detection?.detection_method==='deterministic_hard_rule') return Boolean(detection.transcript_segment?.trim()) && detection.segment_start_ms!=null;
  if (current && code === 'CALL_OPEN_009_TPMO_TIMING_2027') {
    return detection?.detection_method === 'tpmo_2027_policy'
      && detection.detected === false && Number(detection.confidence) >= 0.9
      && Boolean(detection.transcript_segment?.trim()) && detection.segment_start_ms != null;
  }
  return false; // Judgment evidence can only produce REVIEW, never AUTO-FAIL.
}

export function isUnscoredDetection(detection) {
  return !detection || detection.detection_method === 'unscored'
    || detection.direction_excluded || detection.detection_method === 'direction_filter'
    || (!detection.detected && !detection.anti_pattern_match
      && !['tpmo_2027_policy','deterministic_rule','deterministic_hard_rule'].includes(detection.detection_method))
    || /^(?:no (?:statement|evidence|indication)|not (?:found|detected|present)|none\b)/i.test(detection.transcript_segment || '')
    || Number(detection.confidence || 0) < (detection.anti_pattern_match ? 0.7 : 0.5);
}

export function calibratedTemplateItem(item, policyVersion) {
  const code = item.intent_code || item.compliance_intents?.intent_code;
  const intent = getIntentByCode(code);
  const current = policyVersion === MA_2027_POLICY_VERSION;
  const autoFail = current && ['CALL_OPEN_001_RECORDING_ANNOUNCE','CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','ENROLL_002_VERBAL_CONSENT'].includes(code);
  return { ...item, intent_code: code,
    question_text: current ? intent?.description || item.question_text : item.question_text || intent?.description,
    is_auto_fail: autoFail, is_critical: current ? intent?.failure_severity === 'critical' : HARD_VIOLATIONS.has(code) };
}

// Positive evidence anywhere in the call supersedes an earlier absence regardless
// of confidence. A supported violation takes precedence over positive evidence.
export function preferDetection(current, next) {
  if (!current) return next;
  const rank = d => d.anti_pattern_match && Number(d.confidence) >= 0.7 && d.transcript_segment
    && !/^(?:no (?:statement|evidence|indication)|not (?:found|detected|present)|none\b)/i.test(d.transcript_segment)
    ? 3 : d.detected ? 2 : 1;
  return rank(next) > rank(current) || (rank(next) === rank(current)
    && Number(next.confidence || 0) > Number(current.confidence || 0)) ? next : current;
}
