/**
 * IntentClassifier — LLM-based intent detection engine.
 * Sends transcript segments to Claude Sonnet via Netlify function,
 * classifies against 152 MA compliance intents, returns structured detections.
 */

import { ALL_INTENTS } from '../intents/index.js';
import { INTENT_CLASSIFICATION_SYSTEM, buildClassificationPrompt } from '../prompts/intent-classification.js';
import { redactTranscriptSegments } from './PHIRedactor.js';

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.90,
  MEDIUM: 0.70,
  LOW: 0.50,
};

const SEGMENT_WINDOW_MS = 45000; // 45-second windows
const SEGMENT_OVERLAP_MS = 15000; // 15-second overlap

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
export async function classifyCall({ diarized, callContext, callLLM, onProgress }) {
  const segments = segmentTranscript(diarized);
  const redactedSegments = redactTranscriptSegments(segments);

  const allDetections = [];
  const allRiskIndicators = [];
  let aggregatedSentiment = { agent: 'unknown', beneficiary: 'unknown' };
  const detectedIntentCodes = new Set();

  const totalWork = redactedSegments.length;
  let completed = 0;

  // Process all intents per segment (batched) instead of per-category
  for (const segment of redactedSegments) {
    try {
      const prompt = buildClassificationPrompt({
        intents: ALL_INTENTS,
        segment,
        context: {
          ...callContext,
          detected_intents: [...detectedIntentCodes],
          sequence_position: allDetections.filter(d => d.detected).length,
        },
      });

      const raw = await callLLM(INTENT_CLASSIFICATION_SYSTEM, prompt);
      const parsed = parseClassificationResponse(raw);

      if (parsed?.detections) {
        for (const det of parsed.detections) {
          const intent = ALL_INTENTS.find(i => i.intent_code === det.intent_code);
          if (!intent) continue;

          // Keep the highest-confidence detection per intent
          const existing = allDetections.find(d => d.intent_code === det.intent_code);
          if (existing) {
            if (det.detected && det.confidence > (existing.confidence || 0)) {
              Object.assign(existing, {
                detected: det.detected,
                confidence: det.confidence,
                speaker: det.speaker,
                transcript_segment: det.evidence_text || segment.text.slice(0, 500),
                segment_start_ms: segment.start_ms,
                segment_end_ms: segment.end_ms,
                sequence_position_actual: det.sequence_position,
                anti_pattern_match: det.anti_pattern || false,
                anti_pattern_detail: det.anti_pattern_detail || null,
                llm_reasoning: det.reasoning,
                detection_method: 'intent_classifier',
              });
            }
          } else {
            allDetections.push({
              intent_id: null,
              intent_code: det.intent_code,
              detected: det.detected,
              confidence: det.confidence || 0,
              detection_method: 'intent_classifier',
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
            });

            if (det.detected) {
              detectedIntentCodes.add(det.intent_code);
            }
          }
        }
      }

      if (parsed?.risk_indicators?.length) {
        allRiskIndicators.push(...parsed.risk_indicators);
      }
      if (parsed?.sentiment) {
        aggregatedSentiment = parsed.sentiment;
      }
    } catch (err) {
      console.error(`Classification error for segment ${segment.start_ms}:`, err);
    }

    completed++;
    if (onProgress) {
      onProgress(Math.round((completed / totalWork) * 100), `Classifying segment ${completed}/${totalWork}...`);
    }
  }

  // Add "not detected" entries for intents that were never found
  for (const intent of ALL_INTENTS) {
    if (!allDetections.find(d => d.intent_code === intent.intent_code)) {
      allDetections.push({
        intent_id: null,
        intent_code: intent.intent_code,
        detected: false,
        confidence: 0,
        detection_method: 'intent_classifier',
        speaker: null,
        transcript_segment: null,
        segment_start_ms: null,
        segment_end_ms: null,
        sequence_position_actual: null,
        sequence_violation: false,
        sequence_violation_detail: null,
        anti_pattern_match: false,
        anti_pattern_detail: null,
        llm_reasoning: 'Intent not detected in any segment',
      });
    }
  }

  // Validate sequence ordering
  validateSequences(allDetections);

  return {
    detections: allDetections,
    riskIndicators: allRiskIndicators,
    sentiment: aggregatedSentiment,
  };
}

function parseClassificationResponse(raw) {
  try {
    if (typeof raw === 'object') return raw;
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse classification response:', e, raw?.slice?.(0, 200));
    return { detections: [], risk_indicators: [], sentiment: {} };
  }
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
      if (!prereq) {
        det.sequence_violation = true;
        det.sequence_violation_detail = `${intent.intent_code} detected but prerequisite ${prereqCode} was not found`;
      } else if (prereq.segment_start_ms != null && det.segment_start_ms != null && prereq.segment_start_ms > det.segment_start_ms) {
        det.sequence_violation = true;
        det.sequence_violation_detail = `${intent.intent_code} occurred at ${det.segment_start_ms}ms but ${prereqCode} occurred later at ${prereq.segment_start_ms}ms`;
      }
    }

    // Check TPMO timing constraint
    if (intent.intent_code === 'CALL_OPEN_009_TPMO_WITHIN_60SEC') {
      const tpmo = detectedByCode['CALL_OPEN_008_TPMO_DISCLAIMER'];
      if (tpmo && tpmo.segment_start_ms != null && tpmo.segment_start_ms > 60000) {
        det.detected = false;
        det.confidence = 0;
        det.llm_reasoning = `TPMO disclaimer delivered at ${tpmo.segment_start_ms}ms, exceeds 60-second requirement`;
      }
    }
  }
}
