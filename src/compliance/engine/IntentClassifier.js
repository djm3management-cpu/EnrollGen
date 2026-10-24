import { debugLog } from "../../lib/debugLog.js";
import { evaluateTpmo2027, hasMedicareResource, hasTpmoOrgCount, hasTpmoPlanCount } from '../shared/tpmo2027.js';
import { classificationFormat } from "../../lib/llm/schemas/compliance.js";
/**
 * IntentClassifier, LLM-based intent detection engine.
 * Sends transcript segments through the server-side LLM abstraction,
 * classifies against the full compliance intent catalog, returns structured detections.
 */

import { ALL_INTENTS } from '../intents/index.js';
import { INTENT_CLASSIFICATION_SYSTEM, buildClassificationPrompt } from '../prompts/intent-classification.js';
import { redactTranscriptSegments, redactPHI } from './PHIRedactor.js';
import { preferDetection } from '../shared/scoringPolicy.js';
import { normalizeApprovedClosingDetection } from '../shared/approvedClosing.js';

const SEGMENT_WINDOW_MS = 600000; // 10-minute windows reduce repeated catalog tokens on long calls
const SEGMENT_OVERLAP_MS = 30000; // 30-second overlap preserves boundary evidence
const SHORT_CALL_THRESHOLD_S = 120; // calls under 2 min are "insufficient"

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
function intentAppliesToDirection(intent, direction) {
  const sub = (intent.subcategory || '').toUpperCase();
  if (sub === 'OUTBOUND' && direction !== 'outbound') return false;
  if (sub === 'INBOUND' && direction !== 'inbound') return false;
  return true;
}

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
export async function classifyCall({ diarized, callContext, callLLM, onProgress, loadSegmentResult, saveSegmentResult, reserveInputTokens }) {
  const segments = segmentTranscript(diarized);
  const redactedSegments = redactTranscriptSegments(segments);

  // Detect call direction from transcript (defaults to inbound)
  const detectedDirection = ['inbound', 'outbound'].includes(callContext?.call_direction)
    ? callContext.call_direction : detectCallDirection(diarized);
  const wholeText = diarized.map(u => `[${u.speaker || 'unknown'}]: ${u.text || ''}`).join('\n');
  // Opening/closing context and lookup-purpose passages prevent a window from
  // treating eligibility collection or a post-enrollment sign-off as misconduct.
  const purposePassages = diarized.flatMap((u, i) => /look\s*up|eligibil|current coverage|medicare card|submitted|confirmation number/i.test(u.text || '')
    ? [diarized.slice(Math.max(0, i - 2), i + 4).map(v => v.text || '').join(' ')] : []).join('\n').slice(0, 6000);
  const wholeCallContext = redactPHI(`${wholeText.slice(0, 6000)}\n...\n${purposePassages}\n...\n${wholeText.slice(-6000)}`).redacted;

  // Check for short calls
  const callDurationS = diarized.length > 0
    ? Math.max(...diarized.map(u => (u.end_ms || 0))) / 1000
    : 0;
  const isShortCall = callDurationS > 0 && callDurationS < SHORT_CALL_THRESHOLD_S;

  // Split intents by direction applicability
  const applies = i => intentAppliesToDirection(i, detectedDirection);
  const applicableIntents = ALL_INTENTS.filter(applies);
  const excludedIntents = ALL_INTENTS.filter(i => !applies(i));

  const allDetections = [];
  const allRiskIndicators = [];
  let aggregatedSentiment = { agent: 'unknown', beneficiary: 'unknown' };
  const detectedIntentCodes = new Set();

  // Pre-add excluded intents as direction N/A (they won't be sent to the LLM)
  for (const intent of excludedIntents) {
    allDetections.push({
      intent_id: null,
      intent_code: intent.intent_code,
      detected: false,
      confidence: 0,
      detection_method: 'direction_filter',
      direction_excluded: true,
      speaker: null,
      transcript_segment: null,
      segment_start_ms: null,
      segment_end_ms: null,
      sequence_position_actual: null,
      sequence_violation: false,
      sequence_violation_detail: null,
      anti_pattern_match: false,
      anti_pattern_detail: null,
      llm_reasoning: `Not applicable, ${intent.subcategory} intent on ${detectedDirection} call`,
    });
  }

  const totalWork = redactedSegments.length;
  let completed = 0;

  // Process six windows concurrently. Prompts share the prior batch context, while
  // results are merged in transcript order and sequence checks run after all batches.
  for (let offset = 0; offset < redactedSegments.length; offset += 6) {
    const batch = redactedSegments.slice(offset, offset + 6);
    const batchContext = { ...callContext, call_direction: detectedDirection,
      whole_call_context: wholeCallContext,
      detected_intents: [...detectedIntentCodes],
      sequence_position: allDetections.filter(d => d.detected).length };
    const parsedBatch = await Promise.all(batch.map(async (segment, batchIndex) => {
      const segmentIndex = offset + batchIndex;
      let parsed = await loadSegmentResult?.(segmentIndex);
      if (parsed) return parsed;
      const prompt = buildClassificationPrompt({ intents: applicableIntents, segment, context: batchContext });
      await reserveInputTokens?.(Math.ceil((INTENT_CLASSIFICATION_SYSTEM.length + prompt.length) / 3.5));
      const raw = await callLLM(INTENT_CLASSIFICATION_SYSTEM, prompt, { response_format: classificationFormat });
      parsed = parseClassificationResponse(raw);
      await saveSegmentResult?.(segmentIndex, parsed);
      return parsed;
    }));
    for (const [batchIndex, segment] of batch.entries()) {
    const parsed = parsedBatch[batchIndex];
    try {
      if (parsed?.detections) {
        for (const det of parsed.detections) {
          const intent = applicableIntents.find(i => i.intent_code === det.intent_code);
          if (!intent) continue;
          // The sharing rule requires affirmative applicability, not a generic
          // consent omission or a warm-transfer mention. Older cached results
          // without applicability evidence remain unscored for this rule.
          if (det.intent_code === 'RECORD_005_DATA_SHARING_CONSENT' && det.applicable !== true) continue;

          // Normalize approved closing evidence before merging, so an actual
          // pitch elsewhere retains precedence over a false closing flag.
          const existing = allDetections.find(d => d.intent_code === det.intent_code);
          const next = normalizeApprovedClosingDetection({
              intent_id: null,
              intent_code: det.intent_code,
              detected: det.detected,
              confidence: det.confidence || 0,
              detection_method: det.hard_cms_violation ? 'cms_hard_violation' : 'intent_classifier',
              speaker: det.speaker || 'unknown',
              transcript_segment: det.evidence_text || segment.text.slice(0, 500),
              segment_start_ms: segment.start_ms,
              segment_end_ms: segment.end_ms,
              sequence_position_actual: det.sequence_position,
              sequence_violation: false,
              sequence_violation_detail: null,
              anti_pattern_match: det.anti_pattern || false,
              anti_pattern_detail: det.anti_pattern_detail || null,
              llm_reasoning: det.reasoning,
            }, wholeText);
          if (!existing) allDetections.push(next);
          else if (preferDetection(existing, next) === next) Object.assign(existing, next);
          if (next.detected) detectedIntentCodes.add(det.intent_code);
        }
      }

      if (parsed?.risk_indicators?.length) {
        allRiskIndicators.push(...parsed.risk_indicators);
      }
      if (parsed?.sentiment) {
        aggregatedSentiment = parsed.sentiment;
      }
    } catch (err) {
      debugLog("compliance/engine/IntentClassifier.js error");
      // A failed classification is unavailable evidence, never a set of missing intents.
      // Let the background scorer mark the call failed instead of persisting a false score.
      throw err;
    }

    completed++;
    if (onProgress) {
      onProgress(Math.round((completed / totalWork) * 100), `Classifying segment ${completed}/${totalWork}...`);
    }
    }
  }

  // Add "not detected" entries for applicable intents that were never found
  for (const intent of applicableIntents) {
    if (!allDetections.find(d => d.intent_code === intent.intent_code)) {
      allDetections.push({
        intent_id: null,
        intent_code: intent.intent_code,
        detected: false,
        confidence: 0,
        detection_method: 'unscored',
        speaker: null,
        transcript_segment: null,
        segment_start_ms: null,
        segment_end_ms: null,
        sequence_position_actual: null,
        sequence_violation: false,
        sequence_violation_detail: null,
        anti_pattern_match: false,
        anti_pattern_detail: null,
        llm_reasoning: 'Unscored: rule not evaluated with reliable evidence in any segment',
      });
    }
  }

  const sharing = allDetections.find(d => d.intent_code === 'RECORD_005_DATA_SHARING_CONSENT');
  if (sharing?.detection_method === 'unscored') {
    sharing.direction_excluded = true;
    sharing.llm_reasoning = 'Unscored: sharing beneficiary data with another TPMO for later contact was not established';
  }

  // Use actual utterance order/completion rather than overlapping LLM windows.
  const tpmo = evaluateTpmo2027(diarized);
  for (const [code, found] of [
    ['CALL_OPEN_008_TPMO_DISCLAIMER_2027', !!tpmo.disclaimer],
    ['CALL_OPEN_009_TPMO_TIMING_2027', tpmo.timingOk],
    ['CALL_OPEN_010_TPMO_ORG_COUNT', !!tpmo.disclaimer && hasTpmoOrgCount(tpmo.disclaimer.text)],
    ['CALL_OPEN_011_TPMO_PLAN_COUNT', !!tpmo.disclaimer && hasTpmoPlanCount(tpmo.disclaimer.text)],
    ['CALL_OPEN_013_TPMO_RESOURCE_2027', !!tpmo.disclaimer && hasMedicareResource(tpmo.disclaimer.text)],
  ]) {
    const det = allDetections.find(d => d.intent_code === code);
    Object.assign(det, {
      detected: found, confidence: wholeText.trim() ? 1 : 0, detection_method: 'tpmo_2027_policy',
      speaker: tpmo.disclaimer?.speaker || null, transcript_segment: tpmo.disclaimer?.text || null,
      segment_start_ms: tpmo.disclaimer?.start_ms ?? null, segment_end_ms: tpmo.disclaimer?.completion_ms ?? null,
      anti_pattern_match: false, anti_pattern_detail: null,
      sequence_violation: !!tpmo.disclaimer && !tpmo.beforeBenefits,
      sequence_violation_detail: tpmo.disclaimer && !tpmo.beforeBenefits ? 'TPMO disclaimer completed after benefits discussion began' : null,
      llm_reasoning: found ? 'Approved 2027 TPMO policy satisfied' : !tpmo.disclaimer ? 'Complete TPMO disclaimer missing' : 'TPMO timing failed: disclaimer must precede benefits',
    });
  }

  // Validate sequence ordering (only for applicable intents)
  validateSequences(allDetections);

  return {
    detections: allDetections,
    riskIndicators: allRiskIndicators,
    sentiment: aggregatedSentiment,
    detectedDirection,
    isShortCall,
    callDurationSeconds: Math.round(callDurationS),
  };
}

function parseClassificationResponse(raw) {
  return typeof raw === 'object' ? raw : JSON.parse(raw);
}

function validateSequences(detections) {
  const detectedByCode = {};
  for (const d of detections) {
    if (d.detected) detectedByCode[d.intent_code] = d;
  }

  for (const intent of ALL_INTENTS) {
    if (!intent.is_sequence_sensitive) continue;
    const det = detectedByCode[intent.intent_code];
    if (!det || !det.detected) continue;

    // Check must_follow: these intents must have been detected BEFORE this one
    for (const prereqCode of (intent.must_follow || [])) {
      const prereq = detectedByCode[prereqCode];
      if (prereq && !prereq.direction_excluded && prereq.segment_start_ms != null && det.segment_start_ms != null && prereq.segment_start_ms > det.segment_start_ms) {
        det.sequence_violation = true;
        det.sequence_violation_detail = `${intent.intent_code} occurred at ${det.segment_start_ms}ms but ${prereqCode} occurred later at ${prereq.segment_start_ms}ms`;
      }
    }
  }
}
