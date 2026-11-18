// Unit tests for the S4 filter rules in the pure JS mirror (src/ping/decide.js):
// every new reason code, the closed evaluation order, existing clients
// bypassing cooldowns and the repeat shopper rule, and rules off when their
// campaign fields are null, zero or false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePing, applyFilterRules, retentionAlerts, FILTER_RULES, REASONS, ACCEPTED } from '../src/ping/decide.js';

const CAMPAIGN = Object.freeze({
  engine_mode: 'generic', active: true, allowed_states: ['KS'], plan_year: 2027,
  required_carriers: ['aetna'], critical_carriers: [],
});
const AGENTS = [
  { agent_id: 'pool', tier: 'full', available: true, last_assigned_at: '2026-01-01T00:00:00Z' },
  { agent_id: 'owner', tier: 'partial', available: true, last_assigned_at: '2026-06-01T00:00:00Z' },
];
const ALL_ON = Object.freeze({
  retention_enabled: true, retention_mode: 'route_owner', cooldown_same_source_days: 30, cooldown_any_source_days: 7,
  repeat_shopper_threshold: 3, repeat_shopper_window_days: 30, daily_budget_calls: 10,
});
const CLIENT = Object.freeze({ contact_id: 'c1', owner_agent_id: 'owner' });
const decide = ({ campaign = {}, filters = {}, ...rest } = {}) => decidePing({
  campaign: { ...CAMPAIGN, ...campaign }, staffed: true, state: 'KS', callIdentity: 'id:1', agents: AGENTS,
  filters: { pooledOn: true, ...filters }, ...rest,
});
// Rule steps only; the final {rule: reason, result: 'reject'} step is the decision.
const filterSteps = result => result.rule_trace.filter(step => step.result !== 'reject' &&
  (FILTER_RULES.includes(step.rule) || step.rule === 'retention_owner'));
const results = result => Object.fromEntries(filterSteps(result).map(step => [step.rule, step.result]));

test('the filter rules are rules 8 to 12 of the closed reason list, in order', () => {
  const start = REASONS.indexOf('missing_call_identity') + 1;
  assert.deepEqual(REASONS.slice(start, start + 5), FILTER_RULES);
  assert.deepEqual(ACCEPTED, ['accepted_full', 'accepted_partial', 'accepted_retention_owner']);
  for (const reason of ['existing_client_retention', 'cooldown_same_source', 'cooldown_any_source', 'repeat_shopper',
    'daily_budget_reached', 'accepted_retention_owner']) assert.ok(REASONS.includes(reason), reason);
});

test('rules are skipped when their campaign fields are null, zero or false', () => {
  for (const campaign of [{}, { retention_enabled: false, cooldown_same_source_days: 0, cooldown_any_source_days: 0,
    repeat_shopper_threshold: 0, repeat_shopper_window_days: 0, daily_budget_calls: 0 },
  { repeat_shopper_threshold: 3, repeat_shopper_window_days: null }, { repeat_shopper_threshold: null, repeat_shopper_window_days: 30 }]) {
    const result = decide({ campaign, filters: { existingClient: CLIENT, recentSameSource: true, recentAnySource: true,
      shopperCount: 99, acceptedToday: 99 } });
    assert.equal(result.reason, 'accepted_full', JSON.stringify(campaign));
    assert.deepEqual(Object.values(results(result)), ['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
  }
});

test('with every rule on and nothing matching, each rule passes in order', () => {
  const result = decide({ campaign: ALL_ON, filters: { shopperCount: 2, acceptedToday: 9 } });
  assert.equal(result.reason, 'accepted_full');
  assert.deepEqual(filterSteps(result).map(step => [step.rule, step.result]),
    FILTER_RULES.map(rule => [rule, 'pass']));
  const names = result.rule_trace.map(step => step.rule);
  assert.ok(names.indexOf('missing_call_identity') < names.indexOf('existing_client_retention'));
  assert.ok(names.indexOf('daily_budget_reached') < names.indexOf('accepted_full'));
});

test('each new reject reason, with the later rules not evaluated', () => {
  const cases = [
    [{ ...ALL_ON, retention_mode: 'reject_and_alert' }, { existingClient: CLIENT }, 'existing_client_retention'],
    [ALL_ON, { recentSameSource: true, recentAnySource: true }, 'cooldown_same_source'],
    [ALL_ON, { recentAnySource: true }, 'cooldown_any_source'],
    [ALL_ON, { shopperCount: 3 }, 'repeat_shopper'],
    [ALL_ON, { acceptedToday: 10 }, 'daily_budget_reached'],
  ];
  for (const [campaign, filters, reason] of cases) {
    const result = decide({ campaign, filters });
    assert.deepEqual([result.available, result.reason, result.agent_id], [false, reason, null], reason);
    const steps = filterSteps(result);
    assert.deepEqual(steps.at(-1), { rule: reason, result: 'hit', ...(reason === 'existing_client_retention' ? { mode: 'reject_and_alert' } : {}) });
    assert.equal(steps.length, FILTER_RULES.indexOf(reason) + 1, `${reason}: later rules not evaluated`);
    assert.deepEqual(result.rule_trace.at(-1), { rule: reason, result: 'reject' });
  }
});

test('an earlier rule wins when several would hit', () => {
  const all = { existingClient: null, recentSameSource: true, recentAnySource: true, shopperCount: 99, acceptedToday: 99 };
  assert.equal(decide({ campaign: ALL_ON, filters: all }).reason, 'cooldown_same_source');
  assert.equal(decide({ campaign: { ...ALL_ON, cooldown_same_source_days: null }, filters: all }).reason, 'cooldown_any_source');
  assert.equal(decide({ campaign: { ...ALL_ON, cooldown_same_source_days: null, cooldown_any_source_days: null }, filters: all }).reason,
    'repeat_shopper');
});

test('route_owner: the owner takes the call and the decision is accepted_retention_owner', () => {
  const result = decide({ campaign: ALL_ON, filters: { existingClient: CLIENT } });
  assert.deepEqual([result.available, result.reason, result.agent_id], [true, 'accepted_retention_owner', 'owner']);
  assert.deepEqual(filterSteps(result)[0], { rule: 'existing_client_retention', result: 'hit', mode: 'route_owner' });
  assert.equal(results(result).retention_owner, 'hit');
});

test('route_owner: a busy, reserved or ineligible owner falls to the pool, still accepted_retention_owner', () => {
  for (const owner of [{ available: false }, { reserved: true }, { active_call_sid: 'CA1' }, { tier: 'ineligible' }]) {
    const agents = [AGENTS[0], { ...AGENTS[1], ...owner }];
    const result = decide({ campaign: ALL_ON, filters: { existingClient: CLIENT }, agents });
    assert.deepEqual([result.reason, result.agent_id], ['accepted_retention_owner', 'pool'], JSON.stringify(owner));
    assert.equal(results(result).retention_owner, 'pass');
  }
  const none = decide({ campaign: ALL_ON, filters: { existingClient: { contact_id: 'c1', owner_agent_id: null } } });
  assert.deepEqual([none.reason, none.agent_id], ['accepted_retention_owner', 'pool']);
  assert.equal(results(none).retention_owner, undefined, 'no owner, no owner attempt');
  const busy = decide({ campaign: ALL_ON, filters: { existingClient: CLIENT }, agents: AGENTS.map(a => ({ ...a, available: false })) });
  assert.equal(busy.reason, 'all_eligible_busy');
});

test('existing clients bypass both cooldowns and the repeat shopper rule, but not the daily budget', () => {
  const filters = { existingClient: CLIENT, recentSameSource: true, recentAnySource: true, shopperCount: 99 };
  const result = decide({ campaign: ALL_ON, filters });
  assert.equal(result.reason, 'accepted_retention_owner');
  assert.deepEqual(results(result), { existing_client_retention: 'hit', cooldown_same_source: 'skipped',
    cooldown_any_source: 'skipped', repeat_shopper: 'skipped', daily_budget_reached: 'pass', retention_owner: 'hit' });
  assert.equal(decide({ campaign: ALL_ON, filters: { ...filters, acceptedToday: 10 } }).reason, 'daily_budget_reached');
});

test('repeat shopper is skipped unless pooling (exchange flag and operator opt-in) is on', () => {
  const on = decide({ campaign: ALL_ON, filters: { shopperCount: 3 } });
  assert.equal(on.reason, 'repeat_shopper');
  const off = decide({ campaign: ALL_ON, filters: { shopperCount: 3, pooledOn: false } });
  assert.equal(off.reason, 'accepted_full');
  assert.equal(results(off).repeat_shopper, 'skipped');
});

test('a call id without a phone skips the phone based rules but keeps the budget', () => {
  const result = decide({ campaign: ALL_ON, filters: { hasPhone: false, existingClient: CLIENT, recentSameSource: true,
    shopperCount: 99, acceptedToday: 10 } });
  assert.equal(result.reason, 'daily_budget_reached');
  assert.deepEqual(Object.values(results(result)), ['skipped', 'skipped', 'skipped', 'skipped', 'hit']);
});

test('rules 8 to 12 never run before the earlier gates', () => {
  for (const [args, reason] of [[{ routingEnabled: false }, 'routing_disabled'], [{ staffed: false }, 'outside_staffed_hours'],
    [{ state: 'TX' }, 'state_not_allowed'], [{ callIdentity: null }, 'missing_call_identity']]) {
    const result = decide({ campaign: ALL_ON, filters: { existingClient: CLIENT, acceptedToday: 99 }, ...args });
    assert.equal(result.reason, reason);
    assert.equal(filterSteps(result).length, 0, reason);
  }
});

test('exchange modes evaluate generic campaigns with the same rules', () => {
  for (const engine of ['exchange_eval', 'exchange']) {
    assert.equal(decide({ engine, campaign: ALL_ON, filters: { existingClient: CLIENT } }).reason, 'accepted_retention_owner');
  }
  assert.equal(decide({ engine: 'shadow', campaign: ALL_ON }).reason, 'routing_disabled');
});

test('retention alerts: flag gated, generic and exchange always, exchange_eval only for reject_and_alert, never shadow', () => {
  const on = { alertsEnabled: true };
  assert.equal(retentionAlerts('generic', 'accepted_retention_owner', on), true);
  assert.equal(retentionAlerts('generic', 'all_eligible_busy', on), true);
  assert.equal(retentionAlerts('exchange', 'accepted_retention_owner', on), true);
  assert.equal(retentionAlerts('exchange_eval', 'existing_client_retention', on), true);
  assert.equal(retentionAlerts('exchange_eval', 'accepted_retention_owner', on), false);
  assert.equal(retentionAlerts('shadow', 'accepted_retention_owner', on), false);
  assert.equal(retentionAlerts('generic', 'error_rejected', on), false);
  assert.equal(retentionAlerts('generic', 'accepted_retention_owner'), false, 'the flag defaults off');
  const flagged = decide({ campaign: ALL_ON, filters: { existingClient: CLIENT, alertsEnabled: true } });
  assert.equal(flagged.retention_alert, true);
  assert.equal(decide({ campaign: ALL_ON, filters: { existingClient: CLIENT } }).retention_alert, false);
  assert.equal(decide({ campaign: ALL_ON, filters: { alertsEnabled: true } }).retention_alert, false, 'no client, no alert');
});

test('applyFilterRules is usable on its own and appends to a given trace', () => {
  const trace = [{ rule: 'missing_call_identity', result: 'pass' }];
  const out = applyFilterRules({ campaign: ALL_ON, filters: { acceptedToday: 10, pooledOn: true }, trace });
  assert.equal(out.reject, 'daily_budget_reached');
  assert.equal(out.retention, false);
  assert.equal(trace.length, 6);
});
