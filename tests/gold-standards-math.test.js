// Gold Standards metric math (migration 189) and its pure JS mirror
// (telephony/src/ping/goldStandards.js): the retention definition at its
// edges, right censoring, member-months, the CTM rate, Wilson intervals, the
// network de-duplication of a member who moves between agencies, and a
// property test proving SQL and JS return the same JSON on generated facts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase } from './helpers/freshInstall.js';
import { computeGoldStandards, wilson, addMonths, pgFloatRound, GOLD_GROUPS } from '../telephony/src/ping/goldStandards.js';

let pg;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg?.close(); });

const sql = async (facts, from, to, groups = [], network = false) => (await pg.query(
  'SELECT gold_standard_compute($1::jsonb,$2::date,$3::date,$4::text[],$5) AS r', [JSON.stringify(facts), from, to, groups, network])).rows[0].r;
/** Both implementations, asserted equal; returns the result. */
async function both(facts, from, to, groups = [], network = false) {
  const js = computeGoldStandards(facts, from, to, groups, { network });
  const db = await sql(facts, from, to, groups, network);
  assert.deepEqual(JSON.parse(JSON.stringify(db)), JSON.parse(JSON.stringify(js)));
  return js;
}
let n = 0;
const member = (overrides = {}) => ({ id: `e${String(++n).padStart(4, '0')}`, tenant: 't1', member: `m${n}`, coverage: 'MAPD', carrier: 'C1',
  agent: 'a1', cohort_month: '2025-10', source: 's1', sub_id: null, snp_type: 'non_snp', submitted: '2025-12-01', effective: '2026-01-01',
  as_of: '2026-11-01', events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }], ctms: [], activation_completed: false, ...overrides });
const facts = (enrollments, calls = [], agents = []) => ({ enrollments, calls, agents });
const FROM = '2025-01-01'; const TO = '2026-11-01';

test('period end is effective date plus three calendar months, clamped at month end', () => {
  assert.equal(addMonths('2026-01-01', 3), '2026-04-01');
  assert.equal(addMonths('2025-11-30', 3), '2026-02-28');
  assert.equal(addMonths('2027-11-30', 3), '2028-02-29');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('retention: a disenrollment one day before the period end loses the member; on the period end keeps them', async () => {
  const before = await both(facts([member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }, { type: 'disenrolled', date: '2026-03-31', seq: 2 }] })]), FROM, TO);
  assert.deepEqual([before.totals.matured, before.totals.retained], [1, 0]);
  const on = await both(facts([member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }, { type: 'disenrolled', date: '2026-04-01', seq: 2 }] })]), FROM, TO);
  assert.deepEqual([on.totals.matured, on.totals.retained], [1, 1]);
  const carrier = await both(facts([member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }, { type: 'terminated_by_carrier', date: '2026-02-01', seq: 2 }] })]), FROM, TO);
  assert.equal(carrier.totals.retained, 0, 'a carrier termination is a loss');
});

test('retention: only a later reinstatement that restores continuous coverage cures a loss', async () => {
  const loss = { type: 'disenrolled', date: '2026-02-15', seq: 2 };
  const cases = [
    [[{ type: 'reinstated', date: '2026-02-15', seq: 3 }], 1, 'same day, later record'],
    [[{ type: 'reinstated', date: '2026-02-01', seq: 3 }], 1, 'retroactive, later record'],
    [[{ type: 'reinstated', date: '2026-02-20', seq: 3 }], 0, 'a gap in coverage'],
    [[{ type: 'reinstated', date: '2026-02-15', seq: 1 }], 0, 'an earlier record cures nothing'],
    [[{ type: 'reinstated', date: '2026-02-15', seq: 3 }, { type: 'disenrolled', date: '2026-03-01', seq: 4 }], 0, 'a second loss after reinstatement'],
  ];
  for (const [extra, retained, label] of cases) {
    const result = await both(facts([member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 0 }, loss, ...extra] })]), FROM, TO);
    assert.equal(result.totals.retained, retained, label);
  }
});

test('right censoring by p_to and by the latest file date: pending, out of both numerator and denominator', async () => {
  const byTo = await both(facts([member()]), FROM, '2026-03-15');
  assert.deepEqual([byTo.matured, byTo.pending, byTo.totals.r_rdp.rate, byTo.totals.r_rdp.lo], [0, 1, null, null]);
  const byFile = await both(facts([member({ as_of: '2026-03-31' }), member()]), FROM, TO);
  assert.deepEqual([byFile.matured, byFile.pending], [1, 1]);
  const noFile = await both(facts([member({ as_of: null })]), FROM, TO);
  assert.deepEqual([noFile.matured, noFile.pending], [0, 1], 'no imported file for the carrier is pending, never retained');
  const notEffectuated = await both(facts([member({ events: [] })]), FROM, TO);
  assert.deepEqual([notEffectuated.totals.effectuated, notEffectuated.pending, notEffectuated.totals.member_months], [0, 0, 0]);
});

test('member-months run from the effective date to the earlier of coverage end or p_to, over 30.4375', async () => {
  const open = await both(facts([member()]), FROM, '2026-07-01');
  assert.equal(open.totals.member_months, 5.9466, '181 days');
  const ended = await both(facts([member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }, { type: 'disenrolled', date: '2026-03-01', seq: 2 }] })]), FROM, '2026-07-01');
  assert.equal(ended.totals.member_months, 1.9384, '59 days');
  const ctm = await both(facts([member({ ctms: ['2026-02-01', '2026-08-01'] })]), FROM, '2026-07-01');
  assert.equal(ctm.totals.ctms, 1, 'a CTM received after p_to is outside the window');
  assert.equal(ctm.totals.ctm_rate_per_1000_mm.rate, 168.162983, '1000 x 1 / (181 / 30.4375)');
  assert.ok(ctm.totals.ctm_rate_per_1000_mm.lo < 168.162983 && ctm.totals.ctm_rate_per_1000_mm.hi > 168.162983);
  const none = await both(facts([member({ events: [] })]), FROM, TO);
  assert.deepEqual(none.totals.ctm_rate_per_1000_mm, { rate: null, lo: null, hi: null }, 'no exposure is null, never zero');
});

test('Wilson intervals: n = 0 is null; rates of 0 and 1 stay inside [0, 1]; values match a direct computation', () => {
  assert.deepEqual(wilson(0, 0), { rate: null, lo: null, hi: null });
  assert.deepEqual(wilson(0, null), { rate: null, lo: null, hi: null });
  const zero = wilson(0, 10); assert.equal(zero.rate, 0); assert.equal(zero.lo, 0); assert.equal(zero.hi, 0.27754);
  const one = wilson(10, 10); assert.equal(one.rate, 1); assert.equal(one.hi, 1); assert.equal(one.lo, 0.72246);
  const half = wilson(5, 10); assert.deepEqual(half, { rate: 0.5, lo: 0.23659, hi: 0.76341 });
  assert.equal(pgFloatRound(0.1 + 0.2, 6), 0.3);
  assert.equal(pgFloatRound(1e-7, 6), 0);
});

test('Wilson at the edges is identical in SQL and JS', async () => {
  for (const [x, num, den, scale] of [[0, 10, 1, 1], [10, 10, 1, 1], [5, 10, 1, 1], [1, 3, 1, 1000], [3, 181, '30.4375', 1000], [7, 2, 1, 1], [0, 0, 1, 1]]) {
    const { rows: [row] } = await pg.query('SELECT gold_wilson($1,$2,$3,$4) AS w', [x, num, den, scale]);
    assert.deepEqual(JSON.parse(JSON.stringify(row.w)), wilson(x, num, den, scale), `${x}/${num}/${den}x${scale}`);
  }
});

test('a member who moves between two agencies is counted once in the network, under the latest enrollment', async () => {
  const moved = [member({ tenant: 't1', member: 'shared', submitted: '2025-12-01' }), member({ tenant: 't2', member: 'shared', submitted: '2026-02-10', effective: '2026-03-01',
    events: [{ type: 'effectuated', date: '2026-03-01', seq: 9 }] }), member({ tenant: 't2' })];
  const network = await both(facts(moved), FROM, TO, ['agency'], true);
  assert.equal(network.cross_agency_moves, 1);
  assert.equal(network.totals.applications, 2);
  assert.deepEqual(network.groups.map(g => [g.key.agency, g.applications]), [['t2', 2]]);
  assert.equal(network.groups.reduce((sum, g) => sum + g.applications, 0), network.totals.applications);
  const separate = await both(facts([member({ tenant: 't1', member: 'intake:x' }), member({ tenant: 't2', member: 'intake:y' })]), FROM, TO, [], true);
  assert.equal(separate.cross_agency_moves, 0, 'members without an MBI key are never merged');
});

test('calls attach only to call groupings; unattributed share and the 70 percent threshold are reported', async () => {
  const data = facts([member({ source: null }), member(), member({ events: [{ type: 'effectuated', date: '2026-01-01', seq: 1 }, { type: 'disenrolled', date: '2026-02-01', seq: 2 }] })],
    [{ tenant: 't1', source: 's1', sub_id: null, agent: 'a1', cohort_month: '2025-10', date: '2025-06-01', cost: 40 },
      { tenant: 't1', source: 's1', sub_id: null, agent: null, cohort_month: null, date: '2025-12-01', cost: 0 },
      { tenant: 't1', source: null, sub_id: null, agent: null, cohort_month: null, date: '2025-12-02', cost: null }]);
  const bySource = await both(data, FROM, TO, ['source']);
  assert.equal(bySource.unattributed, 1); assert.equal(bySource.unattributed_share, 0.333333);
  const s1 = bySource.groups.find(g => g.key.source === 's1');
  assert.deepEqual([s1.calls, s1.calls_matured, s1.applications, s1.retained, s1.cost, s1.cost_per_retained], [2, 2, 2, 1, 40, 40]);
  assert.equal(s1.below_threshold, true);
  const byCarrier = await both(data, FROM, TO, ['carrier']);
  assert.ok(byCarrier.groups.every(g => g.calls === null && g.effectuation_per_call.rate === null), 'carriers carry no calls: null, never zero');
});

// Property test: random facts, windows and groupings; SQL and JS must agree exactly.
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (r, list) => list[Math.floor(r() * list.length)];
const day = (r, from = Date.UTC(2025, 0, 1), span = 700) => new Date(from + Math.floor(r() * span) * 86400000).toISOString().slice(0, 10);
function generate(seed) {
  const r = rng(seed); const enrollments = []; const calls = []; let seq = 0;
  const tenants = ['t1', 't2', 't3']; const agents = ['a1', 'a2', 'a3', 'a4', null];
  const cohort = a => (a === null ? null : { a1: '2025-02', a2: '2025-07', a3: 'unknown', a4: '2025-02' }[a]);
  for (let i = 0; i < 4 + Math.floor(r() * 40); i += 1) {
    const agent = pick(r, agents); const effective = r() < 0.15 ? null : day(r);
    const events = [];
    if (r() < 0.85) {
      events.push({ type: 'effectuated', date: effective ?? day(r), seq: ++seq });
      for (let k = Math.floor(r() * 3); k > 0; k -= 1) events.push({ type: pick(r, ['disenrolled', 'terminated_by_carrier', 'reinstated', 'reinstated', 'effectuated']), date: day(r), seq: ++seq });
    }
    enrollments.push({ id: `e${String(i).padStart(3, '0')}`, tenant: pick(r, tenants), member: r() < 0.3 ? `mk${Math.floor(r() * 5)}` : `intake:${i}`,
      coverage: pick(r, ['MA', 'MAPD', 'PDP', 'MS', null]), carrier: pick(r, ['C1', 'C2', null]), agent, cohort_month: cohort(agent),
      source: pick(r, ['s1', 's2', null]), sub_id: pick(r, ['x', 'y', null]), snp_type: pick(r, ['D-SNP', 'C-SNP', 'non_snp', null]),
      submitted: day(r), effective, as_of: r() < 0.2 ? null : day(r, Date.UTC(2025, 6, 1), 600), events,
      ctms: Array.from({ length: Math.floor(r() * 3) }, () => day(r)), activation_completed: r() < 0.5 ? true : r() < 0.5 ? false : null });
  }
  for (let i = 0; i < Math.floor(r() * 60); i += 1) {
    const agent = pick(r, agents);
    calls.push({ tenant: pick(r, tenants), source: pick(r, ['s1', 's2', null]), sub_id: pick(r, ['x', 'y', null]), agent, cohort_month: cohort(agent),
      date: day(r), cost: pick(r, [null, 0, 22, 35.5, 70.25]) });
  }
  const agentFacts = ['a1', 'a2', 'a3', 'a4'].map(a => ({ agent: a, tenant: 't1', rts_date: { a1: '2025-02-10', a2: '2025-07-01', a3: null, a4: '2025-02-28' }[a] }));
  let from = day(r, Date.UTC(2024, 11, 1), 400); let to = day(r, Date.UTC(2025, 6, 1), 600);
  if (to <= from) [from, to] = [to, from === to ? '2027-01-01' : from];
  const groups = GOLD_GROUPS.filter(() => r() < 0.25).slice(0, 3);
  return { facts: { enrollments, calls, agents: agentFacts }, from, to, groups, network: r() < 0.5 };
}

test('property: SQL gold_standard_compute and the JS mirror return identical JSON on 300 generated cases', async () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const { facts: f, from, to, groups, network } = generate(seed);
    const js = computeGoldStandards(f, from, to, groups, { network });
    const db = await sql(f, from, to, groups, network);
    assert.deepEqual(JSON.parse(JSON.stringify(db)), JSON.parse(JSON.stringify(js)), `seed ${seed} [${groups}] ${from}..${to}`);
    // Invariants every row keeps.
    for (const row of [...js.groups, js.totals].filter(row => row.matured !== undefined)) {
      assert.ok(row.retained <= row.matured && row.matured + row.pending === row.effectuated && row.effectuated <= row.applications, `seed ${seed}`);
      for (const metric of [row.r_rdp, row.effectuation_per_call, row.dsnp_share]) {
        if (metric.lo !== null) assert.ok(metric.lo <= metric.rate + 1e-6 && metric.rate <= metric.hi + 1e-6 && metric.lo >= 0 && metric.hi <= 1, `seed ${seed}`);
      }
    }
  }
});
