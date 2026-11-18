// Unit tests for the S6 JS mirror (migrations 181 and 182): county aware
// tiering, carriers absent from a county, critical carriers absent from a
// county, county_not_served ordering and the rts origin guard. Pure, no I/O.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePing, agentTier, applyCountyRules, normalizeCarrierKey, primaryCounty, countyCarriers, REASONS,
  CARRIER_ALIASES } from '../src/ping/decide.js';
import { normalizeCarrier } from '../src/paragonEligibility.js';

const campaign = Object.freeze({ engine_mode: 'generic', active: true, allowed_states: ['KS'], plan_year: 2027,
  required_carriers: ['aetna', 'humana', 'uhc'], critical_carriers: ['uhc'], county_aware: true, county_filter: false });
const rows = (agentId, carriers, extra = {}) => carriers.map(carrier =>
  ({ agent_id: agentId, state: 'KS', carrier, enabled: true, plan_year: 2027, ...extra }));
const MATRIX = [...rows('x', ['aetna', 'humana']), ...rows('y', ['humana', 'uhc'])];
const agents = [{ agent_id: 'x', available: true, status: 'available' }, { agent_id: 'y', available: true, status: 'available' }];
const base = { campaign, staffed: true, state: 'KS', callIdentity: 'phone', agents, rows: MATRIX };

test('without county carriers the tier is exactly the 172 tier', () => {
  assert.equal(agentTier({ agentId: 'x', state: 'KS', rows: MATRIX, campaign }), 'ineligible');
  assert.equal(agentTier({ agentId: 'y', state: 'KS', rows: MATRIX, campaign }), 'partial');
  assert.equal(agentTier({ agentId: 'y', state: 'KS', rows: MATRIX, campaign, countyCarriers: null }), 'partial');
});

test('a required carrier absent from the county is not missing', () => {
  assert.equal(agentTier({ agentId: 'y', state: 'KS', rows: MATRIX, campaign, countyCarriers: ['humana', 'uhc'] }), 'full');
  assert.equal(agentTier({ agentId: 'y', state: 'KS', rows: MATRIX, campaign, countyCarriers: ['aetna', 'humana', 'uhc'] }), 'partial');
  // Every required carrier absent: any licensed agent is full.
  assert.equal(agentTier({ agentId: 'y', state: 'KS', rows: MATRIX, campaign, countyCarriers: [] }), 'full');
  // Still no license row, still ineligible.
  assert.equal(agentTier({ agentId: 'z', state: 'KS', rows: MATRIX, campaign, countyCarriers: [] }), 'ineligible');
});

test('a critical carrier absent from the county no longer makes the agent ineligible', () => {
  assert.equal(agentTier({ agentId: 'x', state: 'KS', rows: MATRIX, campaign, countyCarriers: ['aetna', 'humana'] }), 'full');
  assert.equal(agentTier({ agentId: 'x', state: 'KS', rows: MATRIX, campaign, countyCarriers: ['humana', 'uhc'] }), 'ineligible');
});

test('rts rows count only when the campaign eligibility source is rts', () => {
  const generated = rows('r', ['aetna', 'humana', 'uhc'], { origin: 'rts' });
  assert.equal(agentTier({ agentId: 'r', state: 'KS', rows: generated, campaign }), 'ineligible');
  assert.equal(agentTier({ agentId: 'r', state: 'KS', rows: generated, campaign: { ...campaign, eligibility_source: 'rts' } }), 'full');
  // A manual disable alongside generated rows still counts for an rts campaign.
  const mixed = [...rows('r', ['aetna', 'humana'], { origin: 'rts' }), ...rows('r', ['uhc'], { origin: 'manual', enabled: false })];
  assert.equal(agentTier({ agentId: 'r', state: 'KS', rows: mixed, campaign: { ...campaign, eligibility_source: 'rts' } }), 'ineligible');
});

test('county aware decisions upgrade tiers and trace the county', () => {
  const plain = decidePing(base);
  assert.deepEqual([plain.reason, plain.agent_id], ['accepted_partial', 'y']);
  assert.ok(!plain.rule_trace.some(step => step.rule === 'county'));
  const county = decidePing({ ...base, county: { county_fips: '20091', carriers: ['humana', 'uhc', 'wellcare'] } });
  assert.deepEqual([county.reason, county.agent_id], ['accepted_full', 'y']);
  assert.deepEqual(county.rule_trace.find(step => step.rule === 'county'),
    { rule: 'county', result: 'resolved', county_fips: '20091', county_aware: true });
  const critical = decidePing({ ...base, county: { county_fips: '20001', carriers: ['aetna', 'humana'] } });
  assert.deepEqual([critical.reason, critical.agent_id], ['accepted_full', 'x']);
});

test('with both county switches off a county changes nothing', () => {
  const off = { ...campaign, county_aware: false, county_filter: false };
  const withCounty = decidePing({ ...base, campaign: off, county: { county_fips: '20003', carriers: [] } });
  assert.deepEqual(withCounty, decidePing({ ...base, campaign: off }));
});

test('county_not_served is evaluated right after state_not_allowed and before missing_call_identity', () => {
  assert.deepEqual(REASONS.slice(REASONS.indexOf('state_not_allowed'), REASONS.indexOf('state_not_allowed') + 3),
    ['state_not_allowed', 'county_not_served', 'missing_call_identity']);
  const filter = { ...campaign, county_aware: false, county_filter: true };
  const rejected = decidePing({ ...base, campaign: filter, callIdentity: null, county: { county_fips: '20003', carriers: ['wellcare'] } });
  assert.equal(rejected.reason, 'county_not_served', 'reported before the missing identity');
  assert.deepEqual(rejected.rule_trace.map(step => step.rule).slice(-3), ['state_not_allowed', 'county', 'county_not_served']);
  // State is still checked first.
  assert.equal(decidePing({ ...base, campaign: filter, state: 'MO', county: { county_fips: '20003', carriers: [] } }).reason,
    'state_not_allowed');
  // A served county passes and the filter leaves tiers alone.
  const served = decidePing({ ...base, campaign: filter, county: { county_fips: '20091', carriers: ['humana'] } });
  assert.equal(served.reason, 'accepted_partial');
  assert.ok(served.rule_trace.some(step => step.rule === 'county_not_served' && step.result === 'pass'));
  // No county, or no required carriers, never rejects.
  assert.equal(decidePing({ ...base, campaign: filter }).reason, 'accepted_partial');
  assert.equal(applyCountyRules({ campaign: { ...filter, required_carriers: [] }, county: { county_fips: '1', carriers: [] } }).reject, null);
});

test('carrier keys, primary county and county carriers mirror the SQL helpers', () => {
  assert.equal(normalizeCarrierKey('Aetna Medicare'), 'aetna');
  assert.equal(normalizeCarrierKey('HealthSpring HCSC (Cigna)'), 'healthspring');
  assert.equal(normalizeCarrierKey('United Healthcare'), 'uhc');
  assert.equal(normalizeCarrierKey('Peoples Health'), 'peopleshealth');
  assert.equal(normalizeCarrierKey('  '), null);
  // Every matrix alias of paragonEligibility.js maps the same way.
  for (const alias of ['centene', 'wellcare', 'cigna', 'healthspring', 'unitedhealthcare', 'unitedhealthcaregroup', 'uhc',
    'humana', 'aetna', 'devoted']) assert.equal(CARRIER_ALIASES[alias], normalizeCarrier(alias), alias);
  const crosswalk = [{ zip: '66001', county_fips: '20003', res_ratio: 0.5 }, { zip: '66001', county_fips: '20001', res_ratio: 0.5 },
    { zip: '66210', county_fips: '20209', res_ratio: 0.3 }, { zip: '66210', county_fips: '20091', res_ratio: 0.7 }];
  assert.equal(primaryCounty(crosswalk, '66001'), '20001');
  assert.equal(primaryCounty(crosswalk, '66210'), '20091');
  assert.equal(primaryCounty(crosswalk, '00000'), null);
  const plans = [{ county_fips: '20091', plan_year: 2027, category: 'MA-PD', carrier: 'Humana' },
    { county_fips: '20091', plan_year: 2027, category: 'PDP', carrier: 'Aetna Medicare' },
    { county_fips: '20091', plan_year: 2027, category: 'SNP', carrier: 'Peoples Health' }];
  assert.deepEqual(countyCarriers(plans, '20091', 2027), ['humana']);
  assert.equal(countyCarriers(plans, '20091', 2028), null);
});
