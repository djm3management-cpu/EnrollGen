// Unit tests for the pure exchange selection mirror (src/ping/exchange.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectWinner, capCheck, pingUnitPrice, STRATEGIES } from '../src/ping/exchange.js';

const c = (campaign_id, extra = {}) => ({ campaign_id, priority: 1, weight: 1, price: 10, last_won: null, ...extra });

test('priority_waterfall picks the lowest priority number', () => {
  const result = selectWinner({ strategy: 'priority_waterfall',
    candidates: [c('b', { priority: 2 }), c('c', { priority: 3 }), c('a', { priority: 1 })] });
  assert.equal(result.winner, 'a');
  assert.deepEqual(result.ranking, ['a', 'b', 'c']);
});

test('highest_price picks the highest price and ranks a missing price last', () => {
  const result = selectWinner({ strategy: 'highest_price',
    candidates: [c('a', { price: 30 }), c('b', { price: null }), c('c', { price: '50.00' }), c('d', { price: 40 })] });
  assert.equal(result.winner, 'c');
  assert.deepEqual(result.ranking, ['c', 'd', 'a', 'b']);
});

test('ties break on least recently won, never-won first, then campaign id', () => {
  const older = '2026-11-01T00:00:00Z'; const newer = '2026-11-10T00:00:00Z';
  for (const strategy of STRATEGIES) {
    const result = selectWinner({ strategy, candidates: [
      c('a', { last_won: newer }), c('b', { last_won: older }), c('d'), c('c'),
    ] });
    assert.deepEqual(result.ranking, ['c', 'd', 'b', 'a'], strategy);
  }
});

test('the committed campaign ranks first and leaves the rotation untouched', () => {
  const state = { a: 1, b: -1 };
  const result = selectWinner({ strategy: 'weighted_rotation', committed: 'b', rotationState: state,
    candidates: [c('a'), c('b')] });
  assert.equal(result.winner, 'b');
  assert.deepEqual(result.rotationState, state);
  assert.equal(selectWinner({ strategy: 'priority_waterfall', committed: 'z',
    candidates: [c('y', { priority: 9 }), c('z', { priority: 1 })] }).ranking[0], 'z');
});

test('fallback: a lost race moves to the next best once, then gives up', () => {
  const candidates = [c('a', { priority: 1 }), c('b', { priority: 2 }), c('c', { priority: 3 })];
  assert.equal(selectWinner({ strategy: 'priority_waterfall', candidates, failed: ['a'] }).winner, 'b');
  assert.equal(selectWinner({ strategy: 'priority_waterfall', candidates, failed: ['a', 'b'] }).winner, null);
  assert.equal(selectWinner({ strategy: 'highest_price', candidates: [] }).winner, null);
});

test('weighted_rotation charges the actual winner after a fallback', () => {
  const result = selectWinner({ strategy: 'weighted_rotation', failed: ['a'],
    candidates: [c('a', { weight: 3 }), c('b', { weight: 1 })] });
  assert.equal(result.winner, 'b');
  assert.deepEqual(result.rotationState, { a: 3, b: -3 });
});

test('weighted_rotation over 1000 picks lands within 2 percent of the weights', () => {
  const weights = { a: 5, b: 3, c: 2 };
  const candidates = Object.entries(weights).map(([id, weight]) => c(id, { weight }));
  let state = {}; const wins = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 1000; i += 1) {
    const result = selectWinner({ strategy: 'weighted_rotation', candidates, rotationState: state });
    wins[result.winner] += 1; state = result.rotationState;
  }
  for (const [id, weight] of Object.entries(weights)) {
    assert.ok(Math.abs(wins[id] / 1000 - weight / 10) <= 0.02, `${id}: ${wins[id]}`);
  }
  // Smooth round robin interleaves instead of bursting: never 3 a's in a row for 5:3:2.
  state = {}; const order = [];
  for (let i = 0; i < 10; i += 1) {
    const result = selectWinner({ strategy: 'weighted_rotation', candidates, rotationState: state });
    order.push(result.winner); state = result.rotationState;
  }
  assert.doesNotMatch(order.join(''), /aaa/);
  assert.deepEqual(Object.values(state), [0, 0, 0], 'a full cycle returns to zero');
});

test('weighted_rotation is deterministic for the same state', () => {
  const candidates = [c('a', { weight: 2 }), c('b', { weight: 1 })];
  const one = selectWinner({ strategy: 'weighted_rotation', candidates, rotationState: { a: -1, b: 1 } });
  const two = selectWinner({ strategy: 'weighted_rotation', candidates, rotationState: { a: -1, b: 1 } });
  assert.deepEqual(one, two);
});

test('an unknown strategy throws', () => {
  assert.throws(() => selectWinner({ strategy: 'auction' }), /Unknown exchange strategy/);
});

test('capCheck reports the daily cap first, then the hourly cap', () => {
  assert.equal(capCheck({}), null);
  assert.equal(capCheck({ dailyCap: 5, hourlyCap: 2, dailyCount: 4, hourlyCount: 1 }), null);
  assert.deepEqual(capCheck({ dailyCap: 5, hourlyCap: 2, dailyCount: 5, hourlyCount: 2 }), { reason: 'buyer_cap_reached', scope: 'daily' });
  assert.deepEqual(capCheck({ dailyCap: 5, hourlyCap: 2, dailyCount: 3, hourlyCount: 2 }), { reason: 'buyer_cap_reached', scope: 'hourly' });
  assert.deepEqual(capCheck({ hourlyCap: 0 }), { reason: 'buyer_cap_reached', scope: 'hourly' });
});

test('pingUnitPrice is free inside the allowance and overage beyond it', () => {
  const plan = { included_pings: 2, overage_per_ping: '0.05' };
  assert.deepEqual([0, 1, 2, 3].map(used => pingUnitPrice({ plan, usedThisMonth: used })), [0, 0, 0.05, 0.05]);
  assert.equal(pingUnitPrice({ plan: null, usedThisMonth: 99 }), 0);
});
