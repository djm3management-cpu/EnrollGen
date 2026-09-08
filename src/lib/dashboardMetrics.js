export const DASHBOARD_RANGES = [
  ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['30days', 'Last 30 Days'],
];
export const COMPLETED_ENROLLMENTS = new Set(['enrolled', 'enrolled_pending_verification']);
export function dayStart(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
export function shiftDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
export function rangeStart(range, now) {
  const today = dayStart(now);
  if (range === 'week') return shiftDays(today, -((today.getDay() + 6) % 7));
  if (range === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  if (range === '30days') return shiftDays(today, -29);
  return today;
}
export function callScore(call) {
  const cards = [...(call.compliance_scorecards || [])].filter(card => !card.is_thread_composite);
  const card = cards.find(item => item.id === call.compliance_scorecard_id)
    || cards.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (card?.overall_score == null) return null;
  const score = Number(card.overall_score);
  return Number.isFinite(score) ? score : null;
}
function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
export function summarize(calls, divisor = 1) {
  const sales = calls.filter(call => COMPLETED_ENROLLMENTS.has(call.call_outcome)).length;
  return {
    calls: calls.length / divisor,
    sales: sales / divisor,
    conversion: calls.length ? sales / calls.length * 100 : 0,
    duration: average(calls.filter(call => call.call_duration_seconds != null)
      .map(call => Number(call.call_duration_seconds)).filter(value => Number.isFinite(value) && value >= 0)),
    compliance: average(calls.map(callScore).filter(value => value != null)),
  };
}
export function buildDashboard(calls, range, now = new Date()) {
  const today = dayStart(now);
  const baseline = shiftDays(today, -30);
  const start = rangeStart(range, now);
  const inWindow = (call, from, to) => new Date(call.call_start) >= from && new Date(call.call_start) < to;
  const tomorrow = shiftDays(today, 1);
  const selected = calls.filter(call => inWindow(call, start, tomorrow));
  const buckets = [];
  for (let cursor = new Date(start); cursor < tomorrow;) {
    const end = new Date(cursor);
    if (range === 'today') end.setTime(end.getTime() + 3600000);
    else end.setDate(end.getDate() + 1);
    buckets.push({ date: new Date(cursor), ...summarize(selected.filter(call => inWindow(call, cursor, end))) });
    cursor = end;
  }
  const daily = [];
  for (let cursor = new Date(start); cursor < tomorrow; cursor = shiftDays(cursor, 1)) {
    daily.push({ date: new Date(cursor), ...summarize(selected.filter(call => inWindow(call, cursor, shiftDays(cursor, 1)))) });
  }
  const counts = new Map();
  for (const call of selected) {
    const code = call.call_outcome || 'undispositioned';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return {
    today: summarize(calls.filter(call => inWindow(call, today, tomorrow))),
    baseline: summarize(calls.filter(call => inWindow(call, baseline, today)), 30),
    buckets, daily,
    dispositions: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
export function formatMetric(key, value) {
  if (value == null) return 'N/A';
  if (key === 'duration') {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (key === 'conversion' || key === 'compliance') return `${value.toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
export function metricDelta(key, current, baseline) {
  if (current == null || baseline == null) return 'No scored or timed calls to compare';
  const delta = current - baseline;
  const unit = key === 'conversion' || key === 'compliance' ? ' pp' : key === 'duration' ? ' sec' : '';
  return `${delta > 0 ? '↑' : delta < 0 ? '↓' : '↔'} ${Math.abs(delta).toFixed(1)}${unit} vs your average`;
}
