import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePing, agentTier, hoursOpen, mapLegacyReason, REASONS, FILTER_RULES } from '../src/ping/decide.js';

const campaign = Object.freeze({
  id: 'c1', active: true, engine_mode: 'generic', plan_year: 2027, allowed_states: ['AR', 'KS'],
  required_carriers: ['aetna', 'humana', 'uhc'], critical_carriers: ['uhc', 'humana'],
});
const free = (agent_id, tier, extra = {}) => ({ agent_id, tier, available: true, status: 'available', ...extra });
const base = { campaign, staffed: true, paused: false, state: 'KS', callIdentity: 'id:call-1' };
const decide = input => decidePing({ ...base, ...input });

test('every S1 reachable reason code is produced in evaluation order', () => {
  const cases = [
    [{ routingEnabled: false }, 'routing_disabled'],
    [{ campaign: { ...campaign, engine_mode: 'legacy' } }, 'routing_disabled'],
    [{ validPayload: false }, 'invalid_payload'],
    [{ paused: true }, 'source_paused'],
    [{ staffed: false }, 'outside_staffed_hours'],
    [{ campaign: null }, 'campaign_inactive'],
    [{ campaign: { ...campaign, active: false } }, 'campaign_inactive'],
    [{ state: 'NC' }, 'state_not_allowed'],
    [{ state: '' }, 'state_not_allowed'],
    [{ callIdentity: null }, 'missing_call_identity'],
    [{ agents: [] }, 'no_eligible_agent'],
    [{ agents: [free('a', 'ineligible')] }, 'no_eligible_agent'],
    [{ agents: [free('a', 'full', { available: false })] }, 'all_eligible_busy'],
    [{ agents: [free('a', 'full')] }, 'accepted_full'],
    [{ agents: [free('a', 'partial')] }, 'accepted_partial'],
    [{ agents: null }, 'error_rejected'],
  ];
  for (const [input, reason] of cases) {
    const result = decide(input);
    assert.equal(result.reason, reason, JSON.stringify(input));
    assert.ok(REASONS.includes(result.reason));
    assert.equal(result.available, reason.startsWith('accepted_'));
  }
});

test('earlier rules win when several fail at once, keeping the paragon order for hours', () => {
  assert.equal(decide({ routingEnabled: false, paused: true, staffed: false }).reason, 'routing_disabled');
  assert.equal(decide({ validPayload: false, paused: true }).reason, 'invalid_payload');
  assert.equal(decide({ paused: true, staffed: false, state: 'NC' }).reason, 'source_paused');
  assert.equal(decide({ staffed: false, campaign: { ...campaign, active: false } }).reason, 'outside_staffed_hours');
  assert.equal(decide({ campaign: { ...campaign, active: false }, state: 'NC' }).reason, 'campaign_inactive');
  assert.equal(decide({ state: 'NC', callIdentity: null }).reason, 'state_not_allowed');
});

test('full tier is preferred, then oldest assignment, then agent id', () => {
  const partialOld = free('p', 'partial', { last_assigned_at: '2026-01-01T00:00:00Z' });
  const fullNew = free('f', 'full', { last_assigned_at: '2026-11-01T00:00:00Z' });
  assert.equal(decide({ agents: [partialOld, fullNew] }).agent_id, 'f');
  const older = free('z', 'full', { last_assigned_at: '2026-01-01T00:00:00Z' });
  assert.equal(decide({ agents: [fullNew, older] }).agent_id, 'z');
  assert.equal(decide({ agents: [free('b', 'full'), older] }).agent_id, 'b', 'never assigned sorts first');
  assert.equal(decide({ agents: [free('b', 'full'), free('a', 'full')] }).agent_id, 'a');
});

test('busy, reserved, offline and on-call agents fall through to partial, then all busy', () => {
  const busyFull = [free('r', 'full', { reserved: true }), free('o', 'full', { status: 'offline' }),
    free('c', 'full', { active_call_sid: 'CA1' })];
  const partial = decide({ agents: [...busyFull, free('p', 'partial')] });
  assert.deepEqual([partial.reason, partial.agent_id], ['accepted_partial', 'p']);
  assert.equal(decide({ agents: busyFull }).reason, 'all_eligible_busy');
});

test('agentTier mirrors ping_agent_tier: license row, critical carriers, plan year', () => {
  const rows = carriers => carriers.map(carrier => ({ agent_id: 'a', state: 'KS', carrier, enabled: true, plan_year: 2027 }));
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['aetna', 'humana', 'uhc']), campaign }), 'full');
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['humana', 'uhc']), campaign }), 'partial');
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['aetna', 'humana']), campaign }), 'ineligible');
  assert.equal(agentTier({ agentId: 'a', state: 'AR', rows: rows(['aetna', 'humana', 'uhc']), campaign }), 'ineligible');
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['aetna', 'humana', 'uhc']), campaign: { ...campaign, plan_year: 2028 } }), 'ineligible');
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['aetna', 'humana', 'uhc']).map(r => ({ ...r, active: false })), campaign }), 'ineligible');
  const disabled = rows(['aetna', 'humana', 'uhc']).map(r => r.carrier === 'aetna' ? { ...r, enabled: false } : r);
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: disabled, campaign }), 'partial');
  assert.equal(agentTier({ agentId: 'a', state: 'KS', rows: rows(['aetna']), campaign: null }), 'ineligible');
  const tiered = decide({ rows: rows(['humana', 'uhc']), agents: [{ agent_id: 'a', available: true }] });
  assert.deepEqual([tiered.reason, tiered.tier], ['accepted_partial', 'partial']);
});

test('staffed hours come from the campaign override or the source hours, New York time only', () => {
  const at = '2026-11-17T15:00:00Z'; // Tuesday 10:00 in New York
  const hours = { timezone: 'America/New_York', days: { tue: { enabled: true, start: '09:00', end: '17:00' } } };
  assert.equal(hoursOpen(hours, at), true);
  assert.equal(hoursOpen({ ...hours, timezone: 'UTC' }, at), false);
  assert.equal(hoursOpen({ ...hours, days: { tue: { enabled: true, start: '11:00', end: '17:00' } } }, at), false);
  assert.equal(hoursOpen({ ...hours, days: { tue: { enabled: true, start: '9:00', end: '17:00' } } }, at), false);
  assert.equal(hoursOpen(null, at), false);
  const agents = [free('a', 'full')];
  assert.equal(decidePing({ ...base, staffed: undefined, hours, now: at, agents }).reason, 'accepted_full');
  const closedOverride = { ...campaign, staffed_hours_override: { timezone: 'America/New_York', days: {} } };
  assert.equal(decidePing({ ...base, staffed: undefined, hours, now: at, agents, campaign: closedOverride }).reason, 'outside_staffed_hours');
});

test('rule trace records passes, skipped S3 filter rules and the final decision', () => {
  const result = decide({ agents: [free('a', 'full')] });
  assert.deepEqual(result.rule_trace.filter(step => step.result === 'skipped').map(step => step.rule), FILTER_RULES);
  assert.deepEqual(result.rule_trace.at(-1), { rule: 'accepted_full', result: 'accept' });
  assert.deepEqual(decide({ paused: true }).rule_trace.map(step => step.rule),
    ['routing_disabled', 'invalid_payload', 'source_paused']);
});

test('legacy paragon reasons map onto the closed list', () => {
  assert.equal(mapLegacyReason('vendor_paused'), 'source_paused');
  assert.equal(mapLegacyReason('controls_missing'), 'source_paused');
  assert.equal(mapLegacyReason('routing_unconfigured'), 'campaign_inactive');
  for (const reason of ['routing_disabled', 'outside_staffed_hours', 'state_not_allowed', 'missing_call_identity',
    'no_eligible_agent', 'all_eligible_busy', 'accepted_full', 'accepted_partial']) assert.equal(mapLegacyReason(reason), reason);
});
