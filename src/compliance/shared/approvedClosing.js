import { AGENCY_CLOSING } from '../../data/agencyClosing.js';

const CLOSING_RELATED_INTENTS = new Set([
  'CONDUCT_001_NO_CROSS_SELLING', 'CONDUCT_005_NO_SCOPE_CREEP',
  'SOA_005_SOA_SCOPE_MATCH', 'SOA_006_SOA_SCOPE_VIOLATION',
]);

function normalize(text) {
  return String(text || '')
    .replace(/\[(?:agent|unknown)\]:/gi, ' ')
    .replace(/\[PHONE_REDACTED\]|\(?609\)?[\s.-]*806[\s.-]*5996/gi, '6098065996')
    .replace(/[’‘]/g, "'")
    .toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
}

const approved = normalize(AGENCY_CLOSING);

// Evidence must consist exclusively of approved wording. Full-call context can
// verify a quoted fragment, but can never excuse a separate product pitch.
export function normalizeApprovedClosingDetection(detection, transcript = '') {
  if (!detection || !CLOSING_RELATED_INTENTS.has(detection.intent_code)) return detection;
  const evidence = normalize(detection.transcript_segment);
  const fullClosing = evidence === approved;
  const supportedFragment = evidence.split(' ').length >= 8
    && approved.includes(evidence) && normalize(transcript).includes(approved);
  if (!fullClosing && !supportedFragment) return detection;
  return { ...detection, detected: true, confidence: 1,
    anti_pattern_match: false, anti_pattern_detail: null, hard_cms_violation: false,
    sequence_violation: false, sequence_violation_detail: null,
    detection_method: 'approved_agency_closing',
    llm_reasoning: 'Approved agency closing offers a separate review without pitching a product; compliant.' };
}
