import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardAgents, selectDashboardScope } from '../src/lib/dashboardScope.js';
import { buildDashboard } from '../src/lib/dashboardMetrics.js';

const roster = ['Mike', 'Mark', 'Dylan'].map(name => ({ id: name, name, clerk_user_id: `user_${name}`, agent_slug: name.toLowerCase() }));
const enrolled = roster.map(agent => ({ id: `call_${agent.id}`, name: agent.name, clerk_user_id: agent.clerk_user_id }));
const options = dashboardAgents(roster, enrolled);
const now = new Date(2026, 8, 9, 14);
const calls = enrolled.map((agent, index) => ({
  agent_id: agent.id, call_start: new Date(2026, 8, 9, 10).toISOString(),
  call_outcome: index === 0 ? 'enrolled' : 'no_answer', call_duration_seconds: (index + 1) * 60,
  compliance_scorecards: [{ id: agent.id, overall_score: 70 + index * 10, created_at: now.toISOString() }],
}));
const contacts = { mike: 2, mark: 3, dylan: 4, '': 1 };

test('each signed-in agent can select self, either teammate, and the agency', () => {
  for (const viewer of roster) {
    const own = selectDashboardScope(calls, contacts, options, 'self', viewer.clerk_user_id);
    assert.deepEqual(own.calls.map(call => call.agent_id), [`call_${viewer.id}`]);
    for (const target of options) {
      const selected = selectDashboardScope(calls, contacts, options, target.key, viewer.clerk_user_id);
      assert.deepEqual(selected.calls.map(call => call.agent_id), target.agentIds);
      assert.equal(selected.contacts, contacts[target.contactSlugs[0]]);
    }
    const agency = selectDashboardScope(calls, contacts, options, 'agency', viewer.clerk_user_id);
    assert.equal(agency.calls.length, 3);
    assert.equal(agency.contacts, 10);
    const summary = buildDashboard(agency.calls, 'today', now);
    assert.equal(summary.today.calls, 3);
    assert.equal(summary.today.sales, 1);
    assert.equal(summary.today.duration, 120);
    assert.equal(summary.today.compliance, 80);
    assert.deepEqual(summary.dispositions, [['no_answer', 2], ['enrolled', 1]]);
  }
});
test('unknown individual scope and unknown identity never fall back to agency data', () => {
  assert.deepEqual(selectDashboardScope(calls, contacts, options, 'missing', 'user_Mike'), { calls: [], contacts: 0 });
  assert.deepEqual(selectDashboardScope(calls, contacts, options, 'self', 'missing'), { calls: [], contacts: 0 });
});
test('selector contains only named roster agents, including agents without calls', () => {
  const rows = dashboardAgents(roster, [{ id: 'legacy', name: 'Mike' }, { id: 'old', name: 'Former Agent', clerk_user_id: 'former' }]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find(agent => agent.label === 'Mike').agentIds, ['legacy']);
  assert.deepEqual(rows.find(agent => agent.label === 'Dylan').agentIds, []);
  assert.equal(rows.find(agent => agent.label === 'Former Agent'), undefined);
});
test('Clerk identity takes precedence over a conflicting name', () => {
  const rows = dashboardAgents(roster, [{ id: 'record', name: 'Mark', clerk_user_id: 'user_Mike' }]);
  assert.deepEqual(rows.find(agent => agent.label === 'Mike').agentIds, ['record']);
  assert.deepEqual(rows.find(agent => agent.label === 'Mark').agentIds, []);
});
