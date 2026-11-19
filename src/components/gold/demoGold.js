// Local demo data for the Gold Standards and Activation views. Every agency,
// agent, carrier, source and member here is fictional, and every figure is
// computed by the same mirror of migration 189 the server is tested against,
// so the views are internally consistent by construction. Loaded only by
// goldApi.js under import.meta.env.DEV with VITE_PING_DEMO=1, never in a
// production build.
import { computeGoldStandards } from '../../../telephony/src/ping/goldStandards.js';
import { DEMO_TENANT, TENANTS } from '../exchange/demoData.js';
import { goldCsv } from '../../lib/goldStandards.js';

export const GOLD_DEMO_MARKER = 'gold-demo-data';
const HARBOR = TENANTS[0].id; const CEDAR = TENANTS[1].id; const BLUE = TENANTS[2].id;
const NORTHWIND = 'd1000000-0000-4000-8000-000000000011'; const SUMMIT = 'd1000000-0000-4000-8000-000000000012';
const CARRIERS = ['Evergreen Health Plans', 'Northstar Medicare', 'Coastal Senior Plans'];
const agentId = n => `d2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const DEMO_AGENTS = [
  { agent: agentId(1), tenant: HARBOR, name: 'Jordan Avery', rtsMonthsAgo: 13 },
  { agent: agentId(2), tenant: HARBOR, name: 'Sam Patel', rtsMonthsAgo: 11 },
  { agent: agentId(3), tenant: HARBOR, name: 'Riley Chen', rtsMonthsAgo: null },
  { agent: agentId(4), tenant: CEDAR, name: 'Morgan Lee', rtsMonthsAgo: 13 },
  { agent: agentId(5), tenant: CEDAR, name: 'Casey Brooks', rtsMonthsAgo: 9 },
  { agent: agentId(6), tenant: BLUE, name: 'Taylor Quinn', rtsMonthsAgo: 12 },
  { agent: agentId(7), tenant: BLUE, name: 'Drew Ellis', rtsMonthsAgo: 7 },
];

const day = date => date.toISOString().slice(0, 10);
const monthsBefore = (base, months, dayOfMonth = 1) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - months, dayOfMonth));
const addDays = (iso, n) => day(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000));

/** A small deterministic generator, so every check sees the same network. */
function generator(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** The demo facts for `now`: the gold_facts shape for the whole network. */
export function demoFacts(now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const asOf = addDays(day(base), -5);
  const random = generator(20261118);
  const agents = DEMO_AGENTS.map(a => ({ agent: a.agent, tenant: a.tenant, rts_date: a.rtsMonthsAgo === null ? null : day(monthsBefore(base, a.rtsMonthsAgo, 8)) }));
  const cohort = agent => { const a = agents.find(x => x.agent === agent); return a.rts_date ? a.rts_date.slice(0, 7) : 'unknown'; };
  const enrollments = []; const calls = [];
  // Bluewater loses members early (below 70 percent); Summit is the costly source.
  const lossRate = { [HARBOR]: 0.12, [CEDAR]: 0.15, [BLUE]: 0.42 };
  let n = 0; let seq = 0;
  for (let monthsAgo = 13; monthsAgo >= 1; monthsAgo -= 1) {
    for (const tenant of [HARBOR, CEDAR, BLUE]) {
      const team = DEMO_AGENTS.filter(a => a.tenant === tenant);
      for (let k = 0; k < 5; k += 1) {
        n += 1;
        const agent = team[(k + monthsAgo) % team.length].agent;
        const source = k % 5 === 4 ? null : (k + monthsAgo) % 3 === 0 ? SUMMIT : NORTHWIND;
        const subId = source ? `sub-${(k % 3) + 1}` : null;
        const submitted = day(monthsBefore(base, monthsAgo, 3 + ((k * 5) % 20)));
        const effective = day(monthsBefore(base, monthsAgo - 1, 1));
        const coverage = ['MAPD', 'MAPD', 'MA', 'PDP', 'MS'][(k + monthsAgo) % 5];
        const snp = coverage === 'MAPD' ? ((k + monthsAgo) % 4 === 0 ? 'D-SNP' : (k + monthsAgo) % 7 === 0 ? 'C-SNP' : 'non_snp') : coverage === 'MS' ? null : 'non_snp';
        const carrier = CARRIERS[(k + n) % CARRIERS.length];
        const events = [];
        const effectuates = random() > 0.05 && effective <= asOf;
        if (effectuates) {
          events.push({ type: 'effectuated', date: effective, seq: ++seq });
          if (random() < (source === SUMMIT ? lossRate[tenant] + 0.12 : lossRate[tenant])) {
            const lossDate = addDays(effective, 20 + Math.floor(random() * 60));
            if (lossDate <= asOf) {
              events.push({ type: random() < 0.85 ? 'disenrolled' : 'terminated_by_carrier', date: lossDate, seq: ++seq });
              if (random() < 0.1) events.push({ type: 'reinstated', date: lossDate, seq: ++seq });
            }
          }
        }
        const ctms = effectuates && n % 23 === 0 ? [addDays(effective, 25)] : [];
        enrollments.push({ id: `d3000000-0000-4000-8000-${String(n).padStart(12, '0')}`, tenant,
          member: n === 2 ? 'demo-member-moved' : `demo-member-${n}`, coverage, carrier, agent, cohort_month: cohort(agent),
          source, sub_id: subId, snp_type: snp, submitted, effective, as_of: asOf, events, ctms,
          activation_completed: effectuates && random() < 0.7 });
        // The originating call, then calls that did not enroll (some missed, with no agent).
        const cost = source === SUMMIT ? 70 : source === NORTHWIND ? 22 : null;
        for (let c = 0; c < 4; c += 1) {
          const missed = c === 3;
          calls.push({ tenant, source, sub_id: subId, agent: missed ? null : agent, cohort_month: missed ? null : cohort(agent),
            date: addDays(submitted, -c), cost: missed && cost !== null ? 0 : cost });
        }
      }
    }
  }
  // One member moves from Harborline to Cedar Ridge: same key, later enrollment.
  const moved = enrollments.find(e => e.member === 'demo-member-moved');
  const later = { ...moved, id: 'd3000000-0000-4000-8000-000000009999', tenant: CEDAR, agent: agentId(4), cohort_month: cohort(agentId(4)),
    submitted: addDays(moved.submitted, 40), effective: day(monthsBefore(new Date(`${moved.effective}T00:00:00Z`), -2, 1)) };
  later.events = later.effective <= asOf ? [{ type: 'effectuated', date: later.effective, seq: ++seq }] : [];
  later.activation_completed = false;
  enrollments.push(later);
  return { enrollments, calls, agents };
}

const tenantFacts = (facts, tenant) => ({ enrollments: facts.enrollments.filter(e => e.tenant === tenant),
  calls: facts.calls.filter(c => c.tenant === tenant), agents: facts.agents.filter(a => a.tenant === tenant) });
const names = tenant => Object.fromEntries(DEMO_AGENTS.filter(a => !tenant || a.tenant === tenant).map(a => [a.agent, a.name]));

/** The scorecard the server would return for the demo agency or the demo network. */
export function demoGoldScorecard(params, network, now = new Date()) {
  const facts = demoFacts(now);
  const groups = params.group ? String(params.group).split(',').filter(Boolean) : [];
  const result = computeGoldStandards(network ? facts : tenantFacts(facts, DEMO_TENANT), params.from, params.to, groups, { network });
  return network ? { ...result, scope: 'network', agency_names: Object.fromEntries(TENANTS.map(t => [t.id, t.name])) }
    : { ...result, scope: 'agency', agent_names: names(DEMO_TENANT) };
}

const ITEM_KINDS = coverage => ['member_card', ...(coverage === 'MAPD' || coverage === 'MA' ? ['pcp'] : []),
  ...(coverage === 'MAPD' || coverage === 'PDP' ? ['pharmacy'] : []), 'member_reachable'];
let tasks = null;
/** Activation tasks for the demo agency: one per effectuated enrollment, completed where the facts say so. */
export function demoTasks(now = new Date()) {
  if (tasks) return tasks;
  const facts = tenantFacts(demoFacts(now), DEMO_TENANT);
  const today = day(now);
  tasks = facts.enrollments.filter(e => e.events.some(v => v.type === 'effectuated')).map((e, i) => {
    const kinds = ITEM_KINDS(e.coverage);
    const completed = e.activation_completed;
    return { id: `d4000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, contact_id: `d5000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      enrollment_intake_id: e.id, product_line: e.coverage, carrier: e.carrier, assigned_agent_id: e.agent, assigned_role: 'agent',
      assignee: names()[e.agent], due_date: addDays(e.effective, 30), status: completed ? 'completed' : i % 6 === 5 ? 'unreachable' : 'open',
      completed_at: completed ? `${addDays(e.effective, 12)}T15:00:00.000Z` : null, created_at: `${e.effective}T13:00:00.000Z`,
      items: kinds.map((kind, j) => ({ id: `d6000000-0000-4000-8000-${String(i * 10 + j + 1).padStart(12, '0')}`, kind, benefit: null,
        outcome: completed ? (kind === 'pcp' && j % 2 ? 'not_applicable' : 'done') : null, note: null, recorded_at: completed ? `${addDays(e.effective, 12)}T15:00:00.000Z` : null })),
      get overdue() { return this.status === 'open' && this.due_date < today; } };
  });
  return tasks;
}

function activationRead(params) {
  const all = demoTasks();
  const rows = all.filter(t => (!params.status || t.status === params.status) && (!params.assignee || t.assigned_agent_id === params.assignee)
    && (!params.carrier || t.carrier === params.carrier) && (!params.overdue || t.overdue === (params.overdue === 'true')));
  const summary = Object.values(all.reduce((acc, t) => {
    const s = acc[t.assigned_agent_id] ||= { assigned_agent_id: t.assigned_agent_id, tasks: 0, completed: 0, closed: 0, overdue: 0 };
    s.tasks += 1; if (t.status === 'completed') s.completed += 1; if (t.status !== 'open') s.closed += 1; if (t.overdue) s.overdue += 1;
    return acc;
  }, {})).map(s => ({ ...s, completion_rate: s.closed ? Math.round((s.completed / s.closed) * 10000) / 10000 : null }));
  return { total: rows.length, rows: rows.slice(0, 100).map(t => ({ ...t, overdue: t.overdue })), summary };
}

function activationWrite(body) {
  const all = demoTasks();
  const fail = message => { throw new Error(message); };
  if (body.action === 'record') {
    const task = all.find(t => t.items.some(i => i.id === body.item)) || fail('Task unavailable');
    if (task.status !== 'open') fail('Task closed');
    Object.assign(task.items.find(i => i.id === body.item), { outcome: body.outcome, note: body.note || null, recorded_at: new Date().toISOString() });
    return { item_id: body.item, outcome: body.outcome };
  }
  const task = all.find(t => t.id === body.task) || fail('Task unavailable');
  if (task.status !== 'open') fail('Task closed');
  if (body.action === 'add_benefit') {
    const item = { id: crypto.randomUUID(), kind: 'supplemental_benefit', benefit: body.label, outcome: null, note: null, recorded_at: null };
    task.items.push(item);
    return { item_id: item.id };
  }
  if (body.action === 'close') {
    if (body.status === 'completed' && task.items.some(i => !i.outcome)) fail('Record every item first');
    Object.assign(task, { status: body.status, completed_at: new Date().toISOString() });
    return { id: task.id, status: body.status };
  }
  return fail('Invalid request');
}

/** The demo stand in for gold-standards and activation-tasks. */
export async function demoGoldRequest(api, params = {}, body = null, csv = false) {
  await new Promise(resolve => setTimeout(resolve, 120));
  if (api === 'activation') return body ? activationWrite(body) : activationRead(params);
  switch (params.action) {
    case 'context': return { operator: true, features: { metrics: true, member_import: true, ctm_import: true, activation: true, attestations: true } };
    case 'scorecard': return demoGoldScorecard(params, false);
    case 'network': return demoGoldScorecard(params, true);
    case 'export': {
      const result = demoGoldScorecard(params, params.scope === 'network');
      return csv ? goldCsv(result, { agencyNames: result.agency_names || {}, agentNames: result.agent_names || {} }) : result;
    }
    default: throw new Error('Unknown action.');
  }
}
