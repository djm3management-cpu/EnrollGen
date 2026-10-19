import { preferDetection } from '../shared/scoringPolicy.js';

// Pure replay of saved model output. No transcript classification or external API.
// Preserve the old rule interpretation, including alleged violations, for audit.
export function aggregateSavedDetections({ detections, segments = [] }) {
  const merged = new Map();
  for (const segment of [...segments].sort((a,b) => a.segment_index - b.segment_index)) {
    for (const raw of segment.result?.detections || []) {
      const prior = merged.get(raw.intent_code);
      const next = { intent_code: raw.intent_code, detected: Boolean(raw.detected),
        confidence: Number(raw.confidence || 0), speaker: raw.speaker || 'unknown',
        transcript_segment: raw.evidence_text || null,
        anti_pattern_match: Boolean(raw.anti_pattern), anti_pattern_detail: raw.anti_pattern_detail || null,
        hard_cms_violation: raw.hard_cms_violation === true,
        llm_reasoning: raw.reasoning || null, sequence_position_actual: raw.sequence_position ?? null,
        // Original windows advanced 570 seconds with 30 seconds of overlap.
        segment_start_ms: segment.segment_index * 570000,
        segment_end_ms: segment.segment_index * 570000 + 600000,
      };
      merged.set(raw.intent_code, preferDetection(prior, next));
    }
  }
  const result = new Map();
  for (const saved of detections) {
    // Deterministic measurements, direction exclusions and human decisions retain
    // their original interpretation. Only the faulty model merge is replayed.
    const replay = merged.get(saved.intent_code);
    const fixed = replay && !saved.manually_overridden && saved.detection_method === 'intent_classifier'
      ? { ...saved, ...replay, detection_method: 'saved_segment_merge',
        sequence_violation: saved.sequence_violation && replay.detected && saved.detected,
        sequence_violation_detail: saved.sequence_violation_detail } : saved;
    result.set(saved.intent_code, preferDetection(result.get(saved.intent_code), fixed));
  }
  // Include a saved observation even if the earlier pipeline never emitted a row.
  for (const [code, replay] of merged) if (!result.has(code)) result.set(code, { ...replay,
    detection_method: 'saved_segment_merge', sequence_violation: false, sequence_violation_detail: null });
  return [...result.values()];
}

export function detectionsFromSavedItems(items, templateItems) {
  const byId = new Map(templateItems.map(i => [i.id, i]));
  return items.flatMap(item => {
    const templateItem = byId.get(item.template_item_id);
    const code = templateItem?.compliance_intents?.intent_code || templateItem?.intent_code;
    if (!code) return [];
    const excluded = ['na', 'not_applicable'].includes(item.result);
    const violation = item.result === 'fail' && Number(item.confidence) >= 0.7 && Boolean(item.evidence_text);
    return [{ id: item.detection_id, intent_id: item.intent_id, intent_code: code,
      detected: ['pass','partial'].includes(item.result), confidence: Number(item.confidence || 0),
      detection_method: excluded ? 'direction_filter' : 'saved_scorecard_item', direction_excluded: excluded,
      anti_pattern_match: violation, anti_pattern_detail: violation ? item.notes : null,
      transcript_segment: item.evidence_text, segment_start_ms: item.evidence_timestamp_ms,
      llm_reasoning: item.notes, sequence_violation: item.result === 'partial' && /sequence/i.test(item.notes || ''),
      sequence_violation_detail: item.result === 'partial' ? item.notes : null }];
  });
}
