// Pure mirror of the Gold Standards metric math in migration 189
// (gold_metric_rows and gold_standard_compute). No I/O. Inputs are the facts
// gold_facts returns; the output is the same JSON. Exact rates use BigInt
// decimals (ratio in scorecard.js), Wilson intervals use IEEE doubles in the
// same operation order as the SQL and are rounded as PostgreSQL rounds a
// float8 cast to numeric: 15 significant digits, then half away from zero.
import { ratio, sumDecimal } from './scorecard.js';

export const GOLD_GROUPS = Object.freeze(['source', 'sub_id', 'agent', 'carrier', 'agency', 'product_line', 'snp_type',
  'agent_cohort_month', 'effective_month']);
/** Groupings inbound calls carry; any other grouping leaves calls null. */
export const CALL_GROUPS = Object.freeze(['source', 'sub_id', 'agency', 'agent', 'agent_cohort_month']);
export const RETENTION_THRESHOLD = 0.7;
export const MEMBER_MONTH_DAYS = '30.4375';
const Z = 1.96;

const DAY_MS = 86400000;
const dayNumber = day => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

/** day + months calendar months; a day past the target month's end clamps to it, as date + interval in PostgreSQL. */
export function addMonths(day, months) {
  const y = Number(day.slice(0, 4)); const m = Number(day.slice(5, 7)) - 1; const d = Number(day.slice(8, 10));
  const last = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return isoDay(Date.UTC(y, m + months, Math.min(d, last)));
}
export const daysBetween = (later, earlier) => dayNumber(later) - dayNumber(earlier);

/** Rounds a decimal string half away from zero to `places`, exactly. */
function roundDecimalString(text, places) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(text);
  if (!match) throw new Error(`Not a decimal: ${text}`);
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const shift = Number(exponent) - fraction.length + places;
  let scaled;
  if (shift >= 0) scaled = digits * 10n ** BigInt(shift);
  else { const divisor = 10n ** BigInt(-shift); scaled = (2n * digits + divisor) / (2n * divisor); }
  const body = scaled.toString().padStart(places + 1, '0');
  const value = Number(places ? `${body.slice(0, -places)}.${body.slice(-places)}` : body);
  return sign && value !== 0 ? -value : value;
}

/** round(value::numeric, places) for a float8 value. */
export const pgFloatRound = (value, places) => roundDecimalString(value.toPrecision(15), places);

/**
 * Point estimate and Wilson score interval at z = 1.96 for x of n, with
 * n = num / den, scaled by `scale`. Mirrors gold_wilson.
 */
export function wilson(x, num, den = 1, scale = 1) {
  if (num === null || num === undefined || x === null || x === undefined || Number(num) <= 0) return { rate: null, lo: null, hi: null };
  const rate = ratio(Number(scale) * Number(x) * Number(den), num, 6);
  if (Number(x) * Number(den) > Number(num)) return { rate, lo: null, hi: null };
  const n = Number(num) / Number(den); const p = Number(x) / n; const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
  const lo = Math.max(0, center - half); const hi = Math.min(1, center + half);
  return { rate, lo: pgFloatRound(Number(scale) * lo, 6), hi: pgFloatRound(Number(scale) * hi, 6) };
}

const compareC = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const nullsLast = (a, b) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : compareC(a, b));

function inWindow(facts, from, to) {
  return (facts.enrollments || []).filter(e => e.submitted >= from && e.submitted < to);
}

/** One enrollment per member and coverage: the latest submitted, then the highest id. */
function dedupe(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = `${row.member}\u0000${row.coverage ?? ''}`;
    const held = best.get(key);
    if (!held || row.submitted > held.submitted || (row.submitted === held.submitted && row.id > held.id)) best.set(key, row);
  }
  return [...best.values()];
}

/** Effectuation, censoring, retention and exposure for one enrollment. */
export function memberFacts(row, to) {
  const events = row.events || [];
  const effectuated = events.some(event => event.type === 'effectuated');
  const firstEff = events.filter(event => event.type === 'effectuated').map(event => event.date).sort()[0] ?? null;
  const eff = row.effective ?? firstEff;
  const losses = events.filter(event => (event.type === 'disenrolled' || event.type === 'terminated_by_carrier')
    && !events.some(cure => cure.type === 'reinstated' && Number(cure.seq) > Number(event.seq) && cure.date <= event.date));
  const firstLoss = losses.map(event => event.date).sort()[0] ?? null;
  const periodEnd = eff ? addMonths(eff, 3) : null;
  const matured = Boolean(effectuated && eff && periodEnd <= to && row.as_of && periodEnd <= row.as_of);
  const kept = firstLoss === null || (periodEnd !== null && firstLoss >= periodEnd);
  const end = firstLoss !== null && firstLoss < to ? firstLoss : to;
  const days = effectuated && eff ? Math.max(0, daysBetween(end, eff)) : 0;
  const ctms = (row.ctms || []).filter(day => day < to).length;
  return { effectuated, eff, firstLoss, periodEnd, matured, kept, days, ctms };
}

function enrollmentKey(row, facts, groups) {
  const value = {
    source: row.source ?? null, sub_id: row.sub_id ?? null, agent: row.agent ?? null, carrier: row.carrier ?? null,
    agency: row.tenant ?? null, product_line: row.coverage ?? null, snp_type: row.snp_type ?? null,
    agent_cohort_month: row.cohort_month ?? null, effective_month: facts.eff ? facts.eff.slice(0, 7) : null,
  };
  return GOLD_GROUPS.map(dim => (groups.includes(dim) ? value[dim] : null));
}

function callKey(call, groups) {
  const value = { source: call.source ?? null, sub_id: call.sub_id ?? null, agency: call.tenant ?? null, agent: call.agent ?? null,
    agent_cohort_month: call.cohort_month ?? null };
  return GOLD_GROUPS.map(dim => (groups.includes(dim) && Object.hasOwn(value, dim) ? value[dim] : null));
}

const emptyCounts = () => ({ apps: 0, eff: 0, matured: 0, pending: 0, retained: 0, days: 0, ctms: 0, dsnp: 0,
  actM: 0, actR: 0, noactM: 0, noactR: 0, calls: 0, callsM: 0, cost: [], costM: [] });

/** Mirror of gold_metric_rows: one row per group in key order. */
export function metricRows(facts, from, to, groups) {
  const callsApply = groups.every(dim => CALL_GROUPS.includes(dim));
  const buckets = new Map();
  const bucket = key => {
    const id = JSON.stringify(key);
    if (!buckets.has(id)) buckets.set(id, { key, counts: emptyCounts(), hasEnrollments: false, hasCalls: false });
    return buckets.get(id);
  };
  for (const row of dedupe(inWindow(facts, from, to))) {
    const m = memberFacts(row, to);
    const b = bucket(enrollmentKey(row, m, groups)); const c = b.counts; b.hasEnrollments = true;
    c.apps += 1;
    if (m.effectuated) c.eff += 1;
    if (m.matured) c.matured += 1;
    if (m.effectuated && !m.matured) c.pending += 1;
    if (m.matured && m.kept) c.retained += 1;
    c.days += m.days; c.ctms += m.ctms;
    if (m.effectuated && row.snp_type === 'D-SNP') c.dsnp += 1;
    if (m.matured && row.activation_completed === true) { c.actM += 1; if (m.kept) c.actR += 1; }
    if (m.matured && row.activation_completed !== true) { c.noactM += 1; if (m.kept) c.noactR += 1; }
  }
  if (callsApply) {
    for (const call of facts.calls || []) {
      if (!(call.date >= from && call.date < to)) continue;
      const b = bucket(callKey(call, groups)); const c = b.counts; b.hasCalls = true;
      const matured = addMonths(call.date, 6) <= to;
      c.calls += 1; if (matured) c.callsM += 1;
      if (call.cost !== null && call.cost !== undefined) { c.cost.push(call.cost); if (matured) c.costM.push(call.cost); }
    }
  }
  const rows = [...buckets.values()].sort((a, b) => {
    for (let i = 0; i < GOLD_GROUPS.length; i += 1) { const order = nullsLast(a.key[i], b.key[i]); if (order) return order; }
    return 0;
  });
  return rows.map(({ key, counts: c }) => {
    const calls = callsApply ? c.calls : null; const callsM = callsApply ? c.callsM : null;
    const costAll = c.cost.length ? sumDecimal(c.cost) : null; const costM = c.costM.length ? sumDecimal(c.costM) : null;
    return {
      key: Object.fromEntries(groups.map(dim => [dim, key[GOLD_GROUPS.indexOf(dim)]])),
      calls, calls_matured: callsM, applications: c.apps, effectuated: c.eff,
      effectuation_per_call: wilson(c.eff, calls),
      matured: c.matured, pending: c.pending, retained: c.retained,
      r_rdp: wilson(c.retained, c.matured),
      below_threshold: c.matured > 0 ? c.retained * 10 < c.matured * 7 : null,
      retained_per_1000_calls: wilson(c.retained, callsM, 1, 1000),
      member_months: ratio(c.days, MEMBER_MONTH_DAYS, 4), ctms: c.ctms,
      ctm_rate_per_1000_mm: wilson(c.ctms, c.days, MEMBER_MONTH_DAYS, 1000),
      cost: costAll, cost_per_retained: costM !== null && c.retained > 0 ? ratio(costM, c.retained, 2) : null,
      dsnp_share: wilson(c.dsnp, c.eff),
      activation: {
        completed: { matured: c.actM, retained: c.actR, ...wilson(c.actR, c.actM) },
        not_completed: { matured: c.noactM, retained: c.noactR, ...wilson(c.noactR, c.noactM) },
      },
    };
  });
}

export function validateGoldGroups(groups = []) {
  if (!Array.isArray(groups) || groups.some(dim => !GOLD_GROUPS.includes(dim)) || new Set(groups).size !== groups.length) {
    throw new Error('Unknown Gold Standards group');
  }
  return groups;
}

/** Mirror of gold_standard_compute. */
export function computeGoldStandards(facts, from, to, groups = [], { network = false } = {}) {
  if (!from || !to || to <= from) throw new Error('Invalid window');
  validateGoldGroups(groups);
  const groupRows = metricRows(facts, from, to, groups);
  const [totals] = metricRows(facts, from, to, []);
  const windowRows = inWindow(facts, from, to);
  const rows = dedupe(windowRows).map(row => ({ row, m: memberFacts(row, to) }));
  const checkDims = groups.length ? groups : ['source'];
  const unattributed = rows.filter(({ row, m }) => enrollmentKey(row, m, checkDims).some((value, i) => checkDims.includes(GOLD_GROUPS[i]) && value === null)).length;
  const tenantsByMember = new Map();
  for (const row of windowRows) {
    if (row.member.startsWith('intake:')) continue;
    const key = `${row.member}\u0000${row.coverage ?? ''}`;
    if (!tenantsByMember.has(key)) tenantsByMember.set(key, new Set());
    tenantsByMember.get(key).add(row.tenant);
  }
  const moves = [...tenantsByMember.values()].filter(set => set.size > 1).length;
  const tally = pick => {
    const out = {};
    for (const { row, m } of rows) if (m.effectuated) { const k = pick(row) ?? 'unknown'; out[k] = (out[k] || 0) + 1; }
    return out;
  };
  const firstEff = agent => rows.filter(({ row, m }) => row.agent === agent && m.effectuated).map(({ m }) => m.eff).sort()[0] ?? null;
  const agents = facts.agents || [];
  const monthOf = agent => (agent.rts_date ? agent.rts_date.slice(0, 7) : 'unknown');
  let cohort;
  if (network) {
    const months = new Map();
    for (const agent of agents) {
      const month = monthOf(agent);
      if (!months.has(month)) months.set(month, { agents: 0, withFirst: 0, days: 0 });
      const entry = months.get(month); entry.agents += 1;
      const first = firstEff(agent.agent);
      if (agent.rts_date && first) { entry.withFirst += 1; entry.days += daysBetween(first, agent.rts_date); }
    }
    cohort = [...months.entries()].sort(([a], [b]) => compareC(a, b)).map(([month, entry]) => ({
      cohort_month: month, agents: entry.agents, agents_effectuated: entry.withFirst,
      mean_days_to_first_effectuated: entry.withFirst > 0 ? ratio(entry.days, entry.withFirst, 2) : null }));
  } else {
    cohort = agents.map(agent => {
      const first = firstEff(agent.agent);
      return { agent: agent.agent, cohort_month: monthOf(agent), rts_date: agent.rts_date ?? null, first_effectuated: first,
        days_to_first_effectuated: first && agent.rts_date ? daysBetween(first, agent.rts_date) : null };
    }).sort((a, b) => compareC(a.cohort_month, b.cohort_month) || compareC(a.agent, b.agent));
  }
  return {
    from, to, group_by: groups, groups: groupRows,
    totals: totals ?? { applications: 0 },
    matured: totals ? totals.matured : 0, pending: totals ? totals.pending : 0,
    unattributed, unattributed_share: rows.length ? ratio(unattributed, rows.length, 6) : null,
    cross_agency_moves: moves, mix: { product_line: tally(row => row.coverage), snp_type: tally(row => row.snp_type) },
    cohort, threshold: RETENTION_THRESHOLD,
  };
}
