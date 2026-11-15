// Server-only schedule. Calendar years are measured in UTC, never as 365-day years.
export const RETENTION_DEFAULTS = Object.freeze({
  enrollmentRecordingYears: 10, enrollmentTranscriptYears: 10,
  marketingRecordingYears: 10, marketingTranscriptYears: 10,
  scopeOfAppointmentYears: 10, enrollmentYears: 10, evidenceAuditYears: 10,
  serviceCallYears: 2, textConsentYears: 5, operationalDays: 90, contactReviewYears: 10,
});
export function validateRetention(input = {}) {
  const fail = () => { throw Error('Invalid deployment profile: retention'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  if (Object.keys(input).some(k => ![...Object.keys(RETENTION_DEFAULTS), 'reducedMarketingRule', 'overrides'].includes(k))) fail();
  const p = {...RETENTION_DEFAULTS, reducedMarketingRule:false, ...input};
  if (p.reducedMarketingRule !== undefined && typeof p.reducedMarketingRule !== 'boolean') fail();
  if (p.reducedMarketingRule) {
    if (input.marketingRecordingYears === undefined) p.marketingRecordingYears = 3;
    if (input.marketingTranscriptYears === undefined) p.marketingTranscriptYears = 6;
  }
  const minimum = {...RETENTION_DEFAULTS, marketingRecordingYears: p.reducedMarketingRule ? 3 : 10,
    marketingTranscriptYears: p.reducedMarketingRule ? 6 : 10};
  const overrides = input.overrides === undefined ? {} : input.overrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail();
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in minimum) || value?.approved !== true || typeof value.reason !== 'string' ||
        value.reason.trim().length < 10 || value.reason.length > 1000 || Array.from(value.reason).some(c=>c.charCodeAt(0)<32)) fail();
  }
  for (const [key, min] of Object.entries(minimum)) {
    if (!Number.isInteger(p[key]) || p[key] < 1 || p[key] > (key === 'operationalDays' ? 36500 : 100)) fail();
    if (p[key] < min && !overrides[key]) fail();
  }
  p.overrides = overrides;
  return p;
}
export function afterPeriod(value, amount, unit = 'years') {
  if (value === null || value === undefined || value === '') return Infinity;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return Infinity;
  if (unit === 'days') return date.getTime() + amount * 86400000;
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + amount);
  if (date.getUTCMonth() !== month) date.setUTCDate(0); // Feb 29 -> Feb 28
  return date.getTime();
}
