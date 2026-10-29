import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import { buildDashboard, dayStart, shiftDays } from '../src/lib/dashboardMetrics.js';
import { dashboardAgents, selectDashboardScope } from '../src/lib/dashboardScope.js';

// Unlike the SQL fixture adapter, match Supabase's operation-before-filter API.
function strictSupabase(tables) {
  const queries = [];
  const filterNames = new Set(['is', 'eq', 'neq', 'in', 'not', 'gte', 'gt', 'lte', 'lt',
    'like', 'ilike', 'or', 'filter', 'match', 'contains', 'containedBy', 'overlaps']);
  return {
    queries,
    from(table) {
      const steps = [];
      let selected = false;
      const builder = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') return (resolve, reject) => {
            let rows = tables[table];
            assert.ok(rows, `Unexpected table: ${table}`);
            for (const [operation, column, value] of steps) {
              if (operation === 'is' || operation === 'eq') rows = rows.filter(row => row[column] === value);
              else if (operation === 'gte') rows = rows.filter(row => row[column] >= value);
              else if (operation === 'lt') rows = rows.filter(row => row[column] < value);
              else if (operation === 'range') rows = rows.slice(column, value + 1);
            }
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          };
          if (method === 'select' || filterNames.has(method) || ['order', 'range'].includes(method)) {
            return (...args) => {
              if (method === 'select') selected = true;
              else if (!selected) throw new Error(`${table}.${method} called before select`);
              steps.push([method, ...args]);
              return builder;
            };
          }
          throw new Error(`Unexpected query method: ${String(method)}`);
        },
      });
      queries.push({ table, steps });
      return builder;
    },
  };
}

test('dashboard executes select before filters and metrics exclude combined children and other tenants', async () => {
  const now = new Date('2026-10-28T16:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  const tenantId = 'tenant-a', userId = 'user-a';
  const roster = [{ id: 'roster-a', name: 'Agent A', agent_slug: 'agent_a', clerk_user_id: userId }];
  const primary = { id: 'primary', parent_call_id: null, tenant_id: tenantId, agent_id: 'agent-a',
    call_start: '2026-10-28T15:00:00Z', call_outcome: 'enrolled', call_duration_seconds: 999 };
  const client = strictSupabase({
    enrolled_agents: [{ id: 'agent-a', tenant_id: tenantId, name: 'Agent A', clerk_user_id: userId }],
    call_records: [primary,
      { ...primary, id: 'child', parent_call_id: 'primary' },
      { ...primary, id: 'foreign', tenant_id: 'tenant-b' },
      { ...primary, id: 'old', call_start: '2026-08-01T15:00:00Z' }],
    contacts: [{ id: 'contact-a', tenant_id: tenantId, assigned_agent_id: 'agent_a' },
      { id: 'contact-b', tenant_id: 'tenant-b', assigned_agent_id: 'agent_a' }],
  });
  // Prove the mock rejects the broken API shape for any filter, not only .is.
  for (const method of ['is', 'eq', 'in', 'neq']) {
    assert.throws(() => client.from('call_records')[method]('parent_call_id', null), /before select/);
  }
  client.queries.length = 0;
  const h = hookHarness(), getToken = async () => 'token';
  const tenant = { supabaseClient: client, tenant: { id: tenantId }, agents: roster, loading: false };
  const source = readFileSync(new URL('../src/hooks/useDashboardData.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: 'js', format: 'cjs' }).code, {
    module, exports: module.exports, Date: FixedDate,
    window: { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return h.hooks;
      if (name.endsWith('/useTenantConfig')) return { useTenantConfig: () => tenant };
      if (name.endsWith('/AuthContext')) return { useAppAuth: () => ({ getToken }) };
      if (name.endsWith('/AvailabilityContext')) return { useAvailability: () => ({ agentId: 'agent_a' }) };
      if (name.endsWith('/evidenceSupabase')) return { getEvidenceSupabase: () => client };
      if (name.endsWith('/dashboardMetrics')) return { dayStart, shiftDays };
      if (name.endsWith('/dashboardScope')) return { dashboardAgents, selectDashboardScope };
      if (name.endsWith('/callLogApi')) return { loadCallLogPages: async () => [
        { call_record_id: 'primary', duration_seconds: 355 },
      ] };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  h.mount(() => module.exports.useDashboardData(userId));
  try {
    await h.flush();
    assert.equal(h.value.error, null);
    assert.equal(h.value.loading, false);
    assert.deepEqual(Array.from(h.value.calls, call => call.id), ['primary']);
    assert.equal(h.value.contacts, 1);
    const metrics = buildDashboard(h.value.calls, 'today', now);
    assert.equal(metrics.today.calls, 1);
    assert.equal(metrics.today.sales, 1);
    assert.equal(metrics.today.duration, 355, 'Use the primary’s combined measured talk time');
    assert.equal(client.queries.length, 3, 'Execute enrolled-agent, call-record and contact queries');
    for (const query of client.queries) assert.equal(query.steps[0][0], 'select', query.table);
    assert.ok(client.queries.find(query => query.table === 'call_records').steps
      .some(([method, column, value]) => method === 'is' && column === 'parent_call_id' && value === null));
  } finally { h.unmount(); }
});
