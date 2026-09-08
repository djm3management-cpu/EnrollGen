import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, callScore, formatMetric, rangeStart } from '../src/lib/dashboardMetrics.js';

const now = new Date(2026, 8, 7, 14);
const call = (day, outcome, seconds, score) => ({
  call_start: new Date(2026, 8, day, 10).toISOString(), call_outcome: outcome,
  call_duration_seconds: seconds,
  compliance_scorecards: score == null ? [] : [{ id: 'score', overall_score: score, created_at: now.toISOString() }],
});
test('completed outcomes, weighted averages, and missing scores', () => {
  const calls = [call(7, 'enrolled', 120, 90), call(7, 'enrolled_pending_verification', 60, 80), call(7, 'partial_enrollment', null, null), call(6, 'enrolled', 90, 85)];
  const result = buildDashboard(calls, 'week', now);
  assert.ok(Math.abs(result.today.conversion - 200 / 3) < 1e-10);
  assert.deepEqual({ ...result.today, conversion: 0 }, { calls: 3, sales: 2, conversion: 0, duration: 90, compliance: 85 });
  assert.equal(result.baseline.calls, 1 / 30);
  assert.equal(result.baseline.sales, 1 / 30);
  assert.equal(result.baseline.conversion, 100);
  assert.equal(result.buckets.length, 1);
  assert.equal(result.dispositions.length, 3);
});
test('zero state and calendar windows', () => {
  const result = buildDashboard([], 'today', now);
  assert.equal(result.buckets.length, 24);
  assert.equal(result.daily.length, 1);
  assert.equal(result.today.calls, 0);
  assert.equal(result.today.compliance, null);
  assert.equal(result.today.conversion, 0);
  assert.deepEqual(result.dispositions, []);
  assert.equal(buildDashboard([], '30days', now).buckets.length, 30);
  assert.equal(buildDashboard([], 'month', now).buckets.length, 7);
  assert.equal(rangeStart('week', now).getDate(), 7);
  assert.equal(formatMetric('duration', 119.8), '2:00');
});
test('local midnight boundaries and flat disposition counts', () => {
  const calls = [call(6, 'no_answer', 10), call(7, 'enrolled', 30), call(7, 'no_answer', 10), call(7, 'no_answer', 10), call(7, null, 0)];
  const result = buildDashboard(calls, 'today', now);
  assert.equal(result.today.calls, 4);
  assert.deepEqual(result.dispositions, [['no_answer', 2], ['enrolled', 1], ['undispositioned', 1]]);
  assert.equal(result.buckets.reduce((sum, item) => sum + item.calls, 0), 4);
});
test('one score per call, preferring linked card and excluding composites', () => {
  const cards = [{ id: 'old', overall_score: 70, created_at: '2026-09-01' }, { id: 'new', overall_score: 95, created_at: '2026-09-07' }, { id: 'thread', overall_score: 40, is_thread_composite: true, created_at: '2026-09-08' }];
  assert.equal(callScore({ compliance_scorecards: cards }), 95);
  assert.equal(callScore({ compliance_scorecards: cards, compliance_scorecard_id: 'old' }), 70);
});

test('all range selections filter calls, sales, compliance, and dispositions together', () => {
  const reference = new Date(2026, 8, 9, 14);
  const calls = [
    call(9, 'enrolled', 120, 90),
    call(8, 'no_answer', 10, 80),
    call(6, 'callback_scheduled', 30, 70),
    call(1, 'enrolled_pending_verification', 60, 60),
    call(-11, 'not_interested', 20, 50),
    call(-21, 'wrong_number', 0, 40),
  ];
  const cases = [
    ['today', 1, 1, [90], ['enrolled']],
    ['week', 2, 1, [80, 90], ['enrolled', 'no_answer']],
    ['month', 4, 2, [60, 70, 80, 90], ['callback_scheduled', 'enrolled', 'enrolled_pending_verification', 'no_answer']],
    ['30days', 5, 2, [50, 60, 70, 80, 90], ['callback_scheduled', 'enrolled', 'enrolled_pending_verification', 'no_answer', 'not_interested']],
  ];
  for (const [range, count, sales, scores, outcomes] of cases) {
    const result = buildDashboard(calls, range, reference);
    assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.calls, 0), count, range);
    assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.sales, 0), sales, range);
    assert.deepEqual(result.daily.map(bucket => bucket.compliance).filter(score => score != null), scores, range);
    assert.deepEqual(result.dispositions, outcomes.map(outcome => [outcome, 1]), range);
    assert.equal(result.dispositions.reduce((sum, [, value]) => sum + value, 0), count, range);
    assert.equal(result.today.calls, 1, 'Today summary remains anchored to today');
  }
});
