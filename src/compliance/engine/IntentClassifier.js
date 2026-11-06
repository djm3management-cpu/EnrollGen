import {classifyJudgmentOnce} from './JudgmentPass.js';
import { evaluateTpmo2027, hasMedicareResource, hasTpmoOrgCount, hasTpmoPlanCount } from '../shared/tpmo2027.js';
/**
 * Compatibility entry for the gated single judgment pass. The exported window
 * and direction helpers remain for offline historical-evidence inspection.
 * They do not dispatch provider requests.
 */


const SEGMENT_WINDOW_MS = 600000; // Legacy saved-result window size, offline helpers only
const SEGMENT_OVERLAP_MS = 30000; // Legacy saved-result overlap, offline helpers only

/**
 * Infer call direction from opening context (an audio sampling window, not a compliance deadline).
 * Defaults to 'inbound' when context is ambiguous per business rule,
 * outbound-only intents must never penalise an inbound/warm-transfer call.
 */
export function detectCallDirection(diarized) {
  if (!diarized || diarized.length === 0) return 'inbound';

  const firstMinute = diarized.filter(u => (u.start_ms || 0) < 60000);
  const text = firstMinute.map(u => (u.text || '')).join(' ').toLowerCase();

  const outboundPatterns = [
    /permission to contact/,
    /ptc.{0,20}(on file|valid|recorded)/,
    /i('m| am) (calling|reaching out) (you|to follow)/,
    /following up on (your|the) request/,
    /you (filled out|submitted|completed).{0,30}(form|request|card|inquiry)/,
    /gave us.{0,15}permission/,
    /you (called|requested|asked).{0,20}(information|callback)/,
  ];

  const inboundPatterns = [
    /thank you for calling/,
    /thanks for calling/,
    /how (can|may) i help/,
    /transfer(red)?/,
    /warm transfer/,
    /i was (told|informed)/,
    /calling (about|regarding) my/,
    /i('m| am) interested in/,
    /i (need|want) (help|information|to (find|learn|know))/,
    /you('ve| have) reached/,
  ];

  let outScore = 0;
  let inScore = 0;

  for (const p of outboundPatterns) { if (p.test(text)) outScore++; }
  for (const p of inboundPatterns) { if (p.test(text)) inScore++; }

  // Require strong outbound signal (>=2 matches AND more than inbound)
  if (outScore >= 2 && outScore > inScore) return 'outbound';
  return 'inbound';
}

/**
 * Check if an intent applies to the detected call direction.
 * Intents with subcategory OUTBOUND only apply to outbound calls.
 * Intents with subcategory INBOUND only apply to inbound calls.
 */
/**
 * Split a diarized transcript into overlapping segments for classification.
 * @param {Array} diarized - [{speaker, text, start_ms, end_ms}, ...]
 * @returns {Array} segments with combined text per window
 */
export function segmentTranscript(diarized) {
  if (!diarized || diarized.length === 0) return [];

  const maxEnd = Math.max(...diarized.map(d => d.end_ms || 0));
  const segments = [];
  let windowStart = 0;

  while (windowStart < maxEnd) {
    const windowEnd = windowStart + SEGMENT_WINDOW_MS;
    const utterances = diarized.filter(
      d => d.start_ms < windowEnd && (d.end_ms || d.start_ms) > windowStart
    );

    if (utterances.length > 0) {
      const text = utterances.map(u => `[${u.speaker || 'unknown'}]: ${u.text}`).join('\n');
      const primarySpeaker = getMajoritySpeaker(utterances);
      segments.push({
        text,
        speaker: primarySpeaker,
        start_ms: windowStart,
        end_ms: windowEnd,
        utterances,
      });
    }

    windowStart += SEGMENT_WINDOW_MS - SEGMENT_OVERLAP_MS;
  }

  return segments;
}

function getMajoritySpeaker(utterances) {
  const counts = {};
  for (const u of utterances) {
    const s = u.speaker || 'unknown';
    counts[s] = (counts[s] || 0) + (u.text || '').length;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

/**
 * Classify all intents for a complete call.
 * Processes segments against intent categories in batches.
 *
 * @param {Object} params
 * @param {Array} params.diarized - Diarized transcript
 * @param {Object} params.callContext - { call_type, product_type, call_direction }
 * @param {Function} params.callLLM - async (system, user) => string (JSON response)
 * @param {Function} [params.onProgress] - (pct, message) => void
 * @returns {Object} { detections, riskIndicators, sentiment }
 */
// Compatibility entry point: never revive the old per-window paid classifier.
export async function classifyCall({diarized,callContext,callLLM,passId}) {
 return classifyJudgmentOnce({diarized,callContext,callLLM,passId});
}

// Also used to preview deterministic repairs without repeating model requests.
export function applyTpmo2027Policy(allDetections, diarized) {
  const tpmo = evaluateTpmo2027(diarized);
  const hasTranscript = diarized.some(u => String(u.text || '').trim());
  for (const [code, found] of [
    ['CALL_OPEN_008_TPMO_DISCLAIMER_2027', !!tpmo.disclaimer],
    ['CALL_OPEN_009_TPMO_TIMING_2027', tpmo.timingOk],
    ['CALL_OPEN_010_TPMO_ORG_COUNT', !!tpmo.disclaimer && hasTpmoOrgCount(tpmo.disclaimer.text)],
    ['CALL_OPEN_011_TPMO_PLAN_COUNT', !!tpmo.disclaimer && hasTpmoPlanCount(tpmo.disclaimer.text)],
    ['CALL_OPEN_013_TPMO_RESOURCE_2027', !!tpmo.disclaimer && hasMedicareResource(tpmo.disclaimer.text)],
  ]) {
    const det = allDetections.find(d => d.intent_code === code);
    if (!det || det.manually_overridden) continue;
    if (code === 'CALL_OPEN_009_TPMO_TIMING_2027' && tpmo.timingUncertain) {
      Object.assign(det, {
        detected: false, confidence: 0, detection_method: 'unscored',
        speaker: tpmo.earlyDisclosure.speaker, transcript_segment: tpmo.earlyDisclosure.text,
        segment_start_ms: tpmo.earlyDisclosure.start_ms, segment_end_ms: tpmo.earlyDisclosure.completion_ms,
        anti_pattern_match: false, anti_pattern_detail: null, sequence_violation: false, sequence_violation_detail: null,
        llm_reasoning: 'Manual review required: an earlier TPMO disclosure passage precedes benefits, but its exact wording is uncertain. A later repeat does not establish a timing violation.',
      });
      continue;
    }
    Object.assign(det, {
      detected: found, confidence: hasTranscript ? 1 : 0, detection_method: 'tpmo_2027_policy',
      speaker: tpmo.disclaimer?.speaker || null, transcript_segment: tpmo.disclaimer?.text || null,
      segment_start_ms: tpmo.disclaimer?.start_ms ?? null, segment_end_ms: tpmo.disclaimer?.completion_ms ?? null,
      anti_pattern_match: false, anti_pattern_detail: null,
      sequence_violation: !!tpmo.disclaimer && !tpmo.beforeBenefits && !tpmo.timingUncertain,
      sequence_violation_detail: tpmo.disclaimer && !tpmo.beforeBenefits && !tpmo.timingUncertain ? 'TPMO disclaimer completed after benefits discussion began' : null,
      llm_reasoning: found ? 'Approved 2027 TPMO policy satisfied' : !tpmo.disclaimer ? 'Complete TPMO disclaimer missing' : 'TPMO timing failed: disclaimer must precede benefits',
    });
  }

  return tpmo;
}
