export function isUnscoredCompliance(scorecard) {
  return scorecard?.overall_grade === 'N/A' || ['N/A', 'INSUFFICIENT'].includes(scorecard?.pass_fail);
}
