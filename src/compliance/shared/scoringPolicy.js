import { getIntentByCode } from '../intents/index.js';

export const SCORING_POLICY_VERSION = 'context-2026-10-19';

// Only affirmative, high-confidence evidence of these hard violations can fail
// a call automatically. A template flag, omission or script preference cannot.
const HARD_VIOLATIONS = new Set([
  'CONDUCT_001_NO_CROSS_SELLING', 'CONDUCT_002_NO_STEERING',
  'CONDUCT_003_NO_CHERRY_PICKING', 'CONDUCT_004_NO_MISLEADING_LANGUAGE',
  'ENROLL_011_NO_PRESSURE_TACTICS', 'ENROLL_012_NO_INCENTIVES_OFFERED',
]);

export function isHardViolation(code, detection) {
  return HARD_VIOLATIONS.has(code) && detection?.anti_pattern_match === true
    && (detection.hard_cms_violation === true || detection.detection_method === 'cms_hard_violation')
    && Number(detection.confidence) >= 0.9 && Boolean(detection.transcript_segment?.trim());
}

export function isUnscoredDetection(detection) {
  return !detection || detection.detection_method === 'unscored'
    || detection.direction_excluded || detection.detection_method === 'direction_filter'
    || (!detection.detected && !detection.anti_pattern_match
      && detection.detection_method !== 'tpmo_2027_policy')
    || /^(?:no (?:statement|evidence|indication)|not (?:found|detected|present)|none\b)/i.test(detection.transcript_segment || '')
    || Number(detection.confidence || 0) < (detection.anti_pattern_match ? 0.7 : 0.5);
}

export function calibratedTemplateItem(item) {
  const code = item.intent_code || item.compliance_intents?.intent_code;
  const intent = getIntentByCode(code);
  return { ...item, intent_code: code, question_text: intent?.description || item.question_text,
    is_auto_fail: HARD_VIOLATIONS.has(code), is_critical: HARD_VIOLATIONS.has(code) };
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
