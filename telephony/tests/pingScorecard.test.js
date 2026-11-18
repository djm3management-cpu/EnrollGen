// Unit tests for the pure S5 reporting math (src/ping/scorecard.js), the
// mirror of migrations 179 and 180: rates, null on zero denominators, half
// away from zero rounding and cent rounding at the invoice line level only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptRate, costPer, ratio, roundCents, roundDecimal, sumDecimal, invoiceLine, invoice,
  validateGroups, agentConversions, SCORECARD_GROUPS, OPERATOR_GROUPS, USAGE_KINDS,
} from '../src/ping/scorecard.js';

test('accept rate is accepts over pings to 4 places', () => {
  assert.equal(acceptRate(1, 3), 0.3333);
  assert.equal(acceptRate(2, 3), 0.6667);
  assert.equal(acceptRate(3, 3), 1);
  assert.equal(acceptRate(0, 7), 0);
  assert.equal(acceptRate(5, 8), 0.625);
});

test('every ratio is null on a zero or missing denominator', () => {
  assert.equal(acceptRate(0, 0), null);
  assert.equal(costPer(75, 0), null, 'cost per app with no apps');
  assert.equal(costPer(0, 0), null, 'cost per enrollment with no enrollments');
  assert.equal(costPer('120.00', null), null);
  assert.equal(ratio(1, '0.0000', 6), null);
});

test('cost per app and per enrollment round to cents half away from zero', () => {
  assert.equal(costPer('100.00', 3), 33.33);
  assert.equal(costPer('200.00', 3), 66.67);
  assert.equal(costPer('0.05', 2), 0.03, '0.025 rounds up, as PostgreSQL round(numeric,2)');
  assert.equal(costPer('70.00', 2), 35);
  assert.equal(costPer('-0.05', 2), -0.03, 'away from zero for a negative');
});

test('rounding is exact decimal, not binary floating point', () => {
  assert.equal(roundCents(1.005), 1.01, 'Math.round(1.005*100)/100 would give 1.00');
  assert.equal(roundCents('2.675'), 2.68);
  assert.equal(roundCents('0.004'), 0);
  assert.equal(roundCents('0.005'), 0.01);
  assert.equal(roundDecimal('0.12345', 4), 0.1235);
  assert.equal(sumDecimal([0.1, 0.2]), 0.3);
  assert.throws(() => roundCents('abc'), /Not a decimal/);
});

test('an invoice line rounds once per line, never per event', () => {
  // Three overage pings at 0.004: per event each would round to 0.00.
  const events = Array.from({ length: 3 }, () => ({ kind: 'ping', quantity: 1, unit_price: '0.0040' }));
  const perEvent = sumDecimal(events.map(event => roundCents(Number(event.unit_price) * event.quantity)));
  assert.equal(perEvent, 0, 'what per event rounding would bill');
  const line = invoiceLine('ping', events);
  assert.deepEqual(line, { kind: 'ping', quantity: 3, included_quantity: 0, charged_quantity: 3, amount: 0.01 });
});

test('pings at unit price 0 are inside the allowance and the rest are charged', () => {
  const events = [...Array.from({ length: 2 }, () => ({ quantity: 1, unit_price: 0 })),
    ...Array.from({ length: 5 }, () => ({ quantity: 1, unit_price: '0.0500' }))];
  assert.deepEqual(invoiceLine('ping', events),
    { kind: 'ping', quantity: 7, included_quantity: 2, charged_quantity: 5, amount: 0.25 });
});

test('invoice lines follow kind order, skip kinds without events, and sum to the total', () => {
  const events = [
    { kind: 'routed_call', quantity: 1, unit_price: '1.5000' },
    { kind: 'ping', quantity: 1, unit_price: 0 },
    { kind: 'ping', quantity: 1, unit_price: '0.0333' },
    { kind: 'routed_call', quantity: 1, unit_price: '1.5000' },
    { kind: 'screener_minute', quantity: '2.5000', unit_price: '0.1250' },
    { kind: 'ping', quantity: 1, unit_price: '0.0333' },
  ];
  const { lines, total } = invoice(events);
  assert.deepEqual(lines.map(line => [line.line_no, line.kind, line.amount]),
    [[1, 'ping', 0.07], [2, 'routed_call', 3], [3, 'screener_minute', 0.31]]);
  assert.equal(total, 3.38);
  assert.equal(total, sumDecimal(lines.map(line => line.amount)));
  assert.deepEqual(invoice([]), { lines: [], total: 0 });
});

test('group validation accepts any subset and rejects unknown values', () => {
  assert.deepEqual(SCORECARD_GROUPS, ['source', 'sub_id', 'campaign', 'state', 'day']);
  assert.deepEqual(OPERATOR_GROUPS, [...SCORECARD_GROUPS, 'buyer_tenant']);
  assert.deepEqual(USAGE_KINDS, ['ping', 'routed_call', 'screener_minute', 'screened_qualified']);
  assert.deepEqual(validateGroups([]), []);
  assert.deepEqual(validateGroups(['day', 'state']), ['day', 'state']);
  assert.throws(() => validateGroups(['buyer_tenant']), /Unknown scorecard group/, 'operator only');
  assert.deepEqual(validateGroups(['buyer_tenant'], { operator: true }), ['buyer_tenant']);
  assert.throws(() => validateGroups(['phone'], { operator: true }), /Unknown scorecard group/);
});

test('agent conversion: at or above min calls uses its own rate, below gets the campaign average', () => {
  const { average, conversions } = agentConversions({
    veteran: { connected: 20, enrolled: 8 },
    steady: { connected: 25, enrolled: 5 },
    rookie: { connected: 3, enrolled: 3 },
    brand_new: { connected: 0, enrolled: 0 },
  }, { minCalls: 20 });
  assert.equal(average, 0.333333, '16 of 48');
  assert.deepEqual(conversions, { veteran: 0.4, steady: 0.2, rookie: 0.333333, brand_new: 0.333333 });
  assert.deepEqual(agentConversions({ a: { connected: 0, enrolled: 0 } }), { average: 0, conversions: { a: 0 } });
  assert.equal(agentConversions({ a: { connected: 2, enrolled: 1 } }, { minCalls: 0 }).conversions.a, 0.5);
});
