import {deploymentPublic} from './deploymentPublic.js';
import {calendarMidnight,localDay,shiftCalendarDay} from '../../telephony/src/lib/deploymentCalendar.js';
export const DASHBOARD_RANGES = [
  ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['30days', 'Last 30 Days'],
];
export const COMPLETED_ENROLLMENTS = new Set(['enrolled', 'enrolled_pending_verification']);
export function dayStart(date) {return new Date(calendarMidnight(localDay(date,deploymentPublic.timezone),deploymentPublic.timezone));}
export function shiftDays(date,days) {return new Date(calendarMidnight(shiftCalendarDay(localDay(date,deploymentPublic.timezone),days),deploymentPublic.timezone));}
export function rangeStart(range,now) {
 const today=dayStart(now),day=localDay(now,deploymentPublic.timezone),calendar=new Date(`${day}T12:00:00Z`);
 if(range==='week')return shiftDays(today,-((calendar.getUTCDay()+6)%7));
 if(range==='month')return new Date(calendarMidnight(day.slice(0,7)+'-01',deploymentPublic.timezone));
 return range==='30days'?shiftDays(today,-29):today;
}
export function callScore(call) {
  const related = call.compliance_scorecards;
  const cards = (Array.isArray(related) ? related : related && typeof related === 'object' ? [related] : [])
    .filter(card => card && !card.is_thread_composite);
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
    else end.setTime(shiftDays(cursor,1).getTime());
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
