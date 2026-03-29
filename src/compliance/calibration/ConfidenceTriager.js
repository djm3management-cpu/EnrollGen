/**
 * ConfidenceTriager — Sorts scored calls into confidence tiers
 * for the calibration workflow.
 *
 * Tiers:
 *   HIGH (>= 0.85 avg confidence): Auto-accepted, no review needed
 *   MEDIUM (0.70 - 0.84): Flagged for optional review
 *   LOW (< 0.70): Flagged for REQUIRED spot-check
 */

const THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.70,
};

/**
 * Triage a set of scoring results into confidence tiers.
 *
 * @param {Array} results - [{call_id, scorecard_id, avg_confidence, overall_score, ...}]
 * @returns {Object} { high: [], medium: [], low: [], summary }
 */
export function triageByConfidence(results) {
  const high = [];
  const medium = [];
  const low = [];

  for (const r of results) {
    const conf = r.avg_confidence || 0;
    if (conf >= THRESHOLDS.HIGH) {
      high.push({ ...r, tier: 'high' });
    } else if (conf >= THRESHOLDS.MEDIUM) {
      medium.push({ ...r, tier: 'medium' });
    } else {
      low.push({ ...r, tier: 'low' });
    }
  }

  // Sort each tier by confidence ascending (lowest first for review priority)
  low.sort((a, b) => a.avg_confidence - b.avg_confidence);
  medium.sort((a, b) => a.avg_confidence - b.avg_confidence);
  high.sort((a, b) => a.avg_confidence - b.avg_confidence);

  const total = results.length;
  return {
    high,
    medium,
    low,
    summary: {
      total,
      high_count: high.length,
      high_pct: total > 0 ? Math.round((high.length / total) * 100) : 0,
      medium_count: medium.length,
      medium_pct: total > 0 ? Math.round((medium.length / total) * 100) : 0,
      low_count: low.length,
      low_pct: total > 0 ? Math.round((low.length / total) * 100) : 0,
      spot_checks_required: low.length,
    },
  };
}

/**
 * Get the top N calls that need spot-checking, prioritized by:
 * 1. Lowest confidence first
 * 2. Auto-fail triggered (prioritize)
 * 3. Lowest overall score
 */
export function getSpotCheckPriority(triageResult, maxCount = 10) {
  const candidates = [...triageResult.low, ...triageResult.medium];

  // Sort by priority: auto-fail first, then lowest confidence, then lowest score
  candidates.sort((a, b) => {
    if (a.auto_fail_triggered && !b.auto_fail_triggered) return -1;
    if (!a.auto_fail_triggered && b.auto_fail_triggered) return 1;
    if (a.avg_confidence !== b.avg_confidence) return a.avg_confidence - b.avg_confidence;
    return (a.overall_score || 0) - (b.overall_score || 0);
  });

  return candidates.slice(0, maxCount);
}
