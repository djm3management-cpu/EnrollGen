export function isUnscoredCompliance(scorecard) {
  return scorecard?.overall_grade === 'N/A' || ['N/A', 'INSUFFICIENT'].includes(scorecard?.pass_fail);
}

export function complianceItemStatus(item) {
  const result = String(item?.result || '').toLowerCase();
  if (['na', 'not_applicable', 'unscored'].includes(result)) {
    const review = /manual review required/i.test(item?.notes || '');
    return { label: review ? 'REVIEW' : 'N/A', className: review ? 'is-review' : 'is-neutral', scored: false };
  }
  if (result === 'partial') return { label: 'PARTIAL', className: 'is-review', scored: true };
  if (result === 'pass') return { label: 'PASS', className: 'is-pass', scored: true };
  return { label: 'FAIL', className: 'is-fail', scored: true };
}
