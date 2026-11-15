// Lifecycle checks use UTC calendar dates, inclusive through review-by day.
// Tests inject a clock directly; no environment switch can bypass expiry in CI.
export const activeStatus = 'active, rotation pending';
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
export function exceptionIssue(entry, now = new Date()) {
  if (!entry.reason?.trim()) return 'missing reason';
  if (!entry.status) return null; // Existing explicitly reviewed synthetic fixtures.
  if (!['rotated', activeStatus].includes(entry.status)) return 'invalid status';
  if (!Number.isInteger(entry.line) || entry.line < 1 || !Number.isInteger(entry.column) || entry.column < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) return 'missing exact occurrence scope';
  if (entry.status === 'rotated') return null;
  if (!isoDate(entry.reviewBy) || !isoDate(entry.initialReviewBy)) return 'invalid review date';
  if (entry.reviewBy !== entry.initialReviewBy && !entry.reviewExtensionReason?.trim()) return 'review extension requires a new reason';
  if (!Number.isFinite(now.getTime())) return 'invalid review clock';
  return now.toISOString().slice(0,10) > entry.reviewBy ? 'review overdue' : null;
}
export function matchesException(entry, finding, now = new Date(), {history = false} = {}) {
  // History remains an inventory of exposures, including active or rotated keys.
  if (history && entry.status) return false;
  return entry.path === finding.path && entry.type === finding.type && entry.sha256 === finding.sha256 &&
    (entry.line === undefined || entry.line === finding.line) && (entry.column === undefined || entry.column === finding.column) && !exceptionIssue(entry, now);
}
export function reviewExceptions(allowlist, now = new Date()) {
  const warnings = [], failures = [];
  for (const entry of allowlist.filter(entry => entry.status !== undefined)) {
    const issue = exceptionIssue(entry, now), location = `${entry.path}:${entry.line}`;
    if (issue) failures.push(`FAIL secret exception: ${location}: ${entry.type}: ${issue}`);
    else if (entry.status === activeStatus) warnings.push(`WARNING ACTIVE SECRET EXCEPTION: ${location}; review-by ${entry.reviewBy}; status: ${activeStatus}`);
  }
  return {warnings, failures};
}
