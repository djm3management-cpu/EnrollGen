// End to end for county aware eligibility (migrations 181 and 182) on PGlite.
// Publisher B gets a KS campaign requiring aetna, humana and uhc with uhc
// critical. agent_x holds aetna and humana (ineligible without a county),
// agent_y holds humana and uhc (partial without a county). A fixture
// crosswalk and landscape place carriers by county:
//   66210: 20091 (0.7, Humana, UnitedHealthcare, Wellcare, an Aetna PDP only)
//          and 20209 (0.3, Aetna Medicare only)
//   66001: 20001 and 20003 tied at 0.5; 20001 wins on county_fips
//   66002: 20003 (Wellcare and Peoples Health: no required carrier)
//   66004: 20005 (no plans at all), 64101: 29095 in MO
// Pings without a ZIP, or with both switches off, match the S5 database.
// Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide } from './helpers/pingDb.js';
import { seedPublisherB, B, callSid } from './helpers/pingS2Db.js';
import { createS5Db, S5_FEATURES } from './helpers/pingS5Db.js';
import { createS6Db, S6_FEATURES, addPlans, addCrosswalk } from './helpers/pingS6Db.js';
import { decidePing, primaryCounty, countyCarriers } from '../src/ping/decide.js';

const zone = new Date().getUTCHours() === 23 ? 'Asia/Tokyo' : 'Etc/UTC';
const ALWAYS_OPEN = { timezone: zone, days: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  .map(day => [day, { enabled: true, start: '00:00', end: '23:59' }])) };
const CROSSWALK = [['66210', '20091', 'KS', 0.7], ['66210', '20209', 'KS', 0.3], ['66001', '20003', 'KS', 0.5],
  ['66001', '20001', 'KS', 0.5], ['66002', '20003', 'KS', 1], ['66004', '20005', 'KS', 1], ['64101', '29095', 'MO', 1]];
const PLANS = [
  { county: '20091', carriers: ['Humana', 'UnitedHealthcare', 'Wellcare'] },
  { county: '20091', carriers: ['Aetna Medicare'], category: 'PDP' },
  { county: '20209', carriers: ['Aetna Medicare'] },
  { county: '20001', carriers: ['Aetna Medicare', 'Humana', 'Peoples Health'] },
  { county: '20003', carriers: ['Wellcare', 'Peoples Health'], category: 'SNP' },
  { county: '29095', carriers: ['Humana'] },
];
const MATRIX = { agent_x: ['aetna', 'humana'], agent_y: ['humana', 'uhc'] };

let db; let campaign; let phoneSeq = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const nextPhone = () => `+1555010${String(7000 + (phoneSeq += 1))}`;
const setSwitches = (aware, filter) => q('UPDATE ping_campaigns SET county_aware=$2,county_filter=$3 WHERE id=$1', [campaign, aware, filter]);
const ping = async (target, zip, phone = nextPhone()) => {
  const out = await pingDecide(target, { state: 'KS', phone, campaign: target === db ? campaign : target.campaign,
    key: B.hash, extra: zip ? { zip } : {} });
  await target.query('DELETE FROM ping_reservations');
  return out;
};
const traceOf = async id => (await q('SELECT rule_trace FROM ping_decisions WHERE id=$1', [id]))[0].rule_trace;
const tier4 = async (slug, county) => (await q(`SELECT ping_agent_tier($1,'KS',$2,ping_county_carriers($3,2027)) AS t`,
  [slug, campaign, county]))[0].t;

/** Publisher B plus the county campaign and its manual matrix. Returns the campaign id. */
async function seedCounty(target) {
  await seedPublisherB(target);
  const { rows: [row] } = await target.query(`INSERT INTO ping_campaigns(tenant_id,source_id,name,product_line,engine_mode,
    allowed_states,required_carriers,critical_carriers,plan_year,pricing_model,rate,staffed_hours_override)
    VALUES($1,$2,'ma-county','ma','generic','{KS}','{aetna,humana,uhc}','{uhc}',2027,'per_call',35,$3) RETURNING id`,
  [B.tenant, B.source, ALWAYS_OPEN]);
  for (const [slug, carriers] of Object.entries(MATRIX)) {
    await target.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
      SELECT $1,$2,2027,a.id,'KS',c,'test' FROM tenant_agents a CROSS JOIN unnest($4::text[]) c WHERE a.agent_slug=$3`,
    [B.tenant, row.id, slug, carriers]);
  }
  return row.id;
}

before(async () => {
  db = await createS6Db();
  await setFeatures(db, S6_FEATURES);
  campaign = await seedCounty(db);
  await addCrosswalk(db, CROSSWALK);
  for (const plan of PLANS) await addPlans(db, { state: 'KS', ...plan });
});
after(async () => db?.close());

test('the primary county is the highest res_ratio, ties broken by county_fips, fenced by the platform flag', async () => {
  const county = async zip => (await q('SELECT primary_county_for_zip($1) AS c', [zip]))[0].c;
  assert.equal(await county('66210'), '20091');
  assert.equal(await county('66001'), '20001');
  assert.equal(await county('99999'), null);
  await setFeatures(db, { PING_PLATFORM_ENABLED: false });
  try { assert.equal(await county('66210'), null); } finally { await setFeatures(db, S6_FEATURES); }
  // The JS mirror agrees.
  const rows = CROSSWALK.map(([zip, fips, state, ratio]) => ({ zip, county_fips: fips, state_code: state, res_ratio: ratio }));
  assert.deepEqual(['66210', '66001', '99999'].map(zip => primaryCounty(rows, zip)), ['20091', '20001', null]);
});

test('county carriers count only mapped carriers with MA, MA-PD or SNP plans', async () => {
  const carriers = async county => (await q('SELECT ping_county_carriers($1,2027) AS c', [county]))[0].c;
  assert.deepEqual(await carriers('20091'), ['humana', 'uhc', 'wellcare'], 'the Aetna PDP does not count');
  assert.deepEqual(await carriers('20001'), ['aetna', 'humana'], 'Peoples Health is unmapped');
  assert.deepEqual(await carriers('20003'), ['wellcare']);
  assert.equal(await carriers('20005'), null, 'no landscape rows');
  assert.equal(await carriers('20091') && (await q(`SELECT ping_county_carriers('20091',2028) AS c`))[0].c, null, 'other plan years');
  const plans = PLANS.flatMap(p => p.carriers.map(carrier => ({ county_fips: p.county, plan_year: 2027, category: p.category ?? 'MA-PD', carrier })));
  assert.deepEqual(countyCarriers(plans, '20091', 2027), ['humana', 'uhc', 'wellcare']);
  assert.deepEqual(countyCarriers(plans, '20001', 2027), ['aetna', 'humana']);
  assert.equal(countyCarriers(plans, '20005', 2027), null);
});

test('county aware tiering ignores carriers absent from the county for required and critical checks', async () => {
  assert.equal((await q(`SELECT ping_agent_tier('agent_y','KS',$1) AS t`, [campaign]))[0].t, 'partial');
  assert.equal((await q(`SELECT ping_agent_tier('agent_x','KS',$1) AS t`, [campaign]))[0].t, 'ineligible');
  assert.equal(await tier4('agent_y', '20091'), 'full', 'aetna has no plan in 20091');
  assert.equal(await tier4('agent_x', '20091'), 'ineligible', 'uhc is served in 20091');
  assert.equal(await tier4('agent_x', '20001'), 'full', 'critical uhc has no plan in 20001');
  assert.equal(await tier4('agent_y', '20001'), 'partial');
  assert.equal(await tier4('agent_x', '20005'), 'ineligible', 'no county data is the plain tier');
});

test('a county aware ping upgrades agent_y from partial to full and records the county', async () => {
  await setSwitches(true, false);
  const plain = await ping(db, null);
  assert.deepEqual([plain.reason, plain.agent_id], ['accepted_partial', 'agent_y']);
  const county = await ping(db, '66210');
  assert.deepEqual([county.reason, county.agent_id], ['accepted_full', 'agent_y']);
  const trace = await traceOf(county.decision_id);
  const rules = trace.map(step => step.rule);
  assert.deepEqual(rules.slice(rules.indexOf('state_not_allowed'), rules.indexOf('missing_call_identity') + 1),
    ['state_not_allowed', 'county', 'missing_call_identity']);
  assert.deepEqual(trace.find(step => step.rule === 'county'),
    { rule: 'county', result: 'resolved', county_fips: '20091', county_aware: true });
  // A critical carrier absent from the county no longer makes agent_x ineligible.
  const critical = await ping(db, '66001');
  assert.deepEqual([critical.reason, critical.agent_id], ['accepted_full', 'agent_x']);
  assert.equal((await traceOf(critical.decision_id)).find(step => step.rule === 'county').county_fips, '20001');
});

test('the arrival tiers with the decision county, so a county full agent is still claimed', async () => {
  await setSwitches(true, false);
  const phone = nextPhone();
  const out = await pingDecide(db, { state: 'KS', phone, campaign, key: B.hash, extra: { zip: '66001' } });
  assert.deepEqual([out.reason, out.agent_id], ['accepted_full', 'agent_x']);
  const [claim] = await q(`SELECT * FROM ping_claim_arrival($1,$2,NULL,$3,'{}',NULL,clock_timestamp())`,
    [callSid(6001), phone, B.number]);
  assert.deepEqual([claim.agent_id, claim.claim_path], ['agent_x', 'reserved']);
  await q(`UPDATE agent_availability SET active_call_sid=NULL,status='available',available=true`);
  await q('DELETE FROM ping_reservations');
});

test('county_filter rejects with county_not_served right after state_not_allowed', async () => {
  await setSwitches(false, true);
  const rejected = await ping(db, '66002');
  assert.deepEqual([rejected.available, rejected.reason, rejected.agent_id], [false, 'county_not_served', null]);
  const trace = await traceOf(rejected.decision_id);
  assert.deepEqual(trace.slice(-3), [
    { rule: 'state_not_allowed', result: 'pass' },
    { rule: 'county', result: 'resolved', county_fips: '20003', county_aware: false },
    { rule: 'county_not_served', result: 'reject' },
  ]);
  assert.equal((await q('SELECT count(*)::int AS n FROM ping_reservations'))[0].n, 0);
  // A served county passes the filter; county_aware is off, so tiers are unchanged.
  const served = await ping(db, '66210');
  assert.deepEqual([served.reason, served.agent_id], ['accepted_partial', 'agent_y']);
  assert.ok((await traceOf(served.decision_id)).some(step => step.rule === 'county_not_served' && step.result === 'pass'));
  // An unresolved county (no plans, wrong state, unknown ZIP) is never rejected.
  for (const zip of ['66004', '64101', '99999']) {
    const open = await ping(db, zip);
    assert.equal(open.reason, 'accepted_partial', zip);
    assert.ok(!(await traceOf(open.decision_id)).some(step => step.rule.startsWith('county')), zip);
  }
  // Both switches: the filter runs first, then the county tiers.
  await setSwitches(true, true);
  assert.equal((await ping(db, '66002')).reason, 'county_not_served');
  const both = await ping(db, '66210');
  assert.deepEqual([both.reason, both.agent_id], ['accepted_full', 'agent_y']);
  await setSwitches(false, false);
});

test('the JS mirror reaches the same decisions as SQL for each county', async () => {
  const rows = (await q(`SELECT t.agent_slug AS agent_id,e.state,e.carrier,e.enabled,e.plan_year,e.origin
    FROM agent_campaign_carriers e JOIN tenant_agents t ON t.id=e.agent_id WHERE e.campaign_id=$1`, [campaign]));
  const [camp] = await q('SELECT * FROM ping_campaigns WHERE id=$1', [campaign]);
  const agents = await q(`SELECT agent_id,available,status,last_assigned_at FROM agent_availability WHERE agent_id IN ('agent_x','agent_y')`);
  const plans = (await q('SELECT county_fips,plan_year,category,carrier FROM cms_plans_py2027'));
  const crosswalk = (await q('SELECT zip,county_fips,state_code,res_ratio FROM ping_zip_county_crosswalk'))
    .map(r => ({ ...r, res_ratio: Number(r.res_ratio) }));
  for (const [aware, filter] of [[true, false], [false, true], [true, true]]) {
    await setSwitches(aware, filter);
    for (const zip of [null, '66210', '66001', '66002', '66004']) {
      const fips = zip ? primaryCounty(crosswalk, zip) : null;
      const carriers = fips ? countyCarriers(plans, fips, 2027) : null;
      const js = decidePing({ campaign: { ...camp, county_aware: aware, county_filter: filter }, staffed: true, state: 'KS',
        callIdentity: 'phone', agents, rows, county: fips && carriers ? { county_fips: fips, carriers } : null });
      const sql = await ping(db, zip);
      assert.deepEqual([js.reason, js.agent_id], [sql.reason, sql.agent_id], `${aware} ${filter} ${zip}`);
    }
  }
  await setSwitches(false, false);
});

test('pings without a ZIP, or with both switches off, match the S5 database exactly', async () => {
  const s5 = await createS5Db();
  try {
    await setFeatures(s5, S5_FEATURES);
    s5.campaign = await seedCounty(s5);
    const scenario = async (target, cases) => {
      const out = [];
      for (const zip of cases) {
        const result = await ping(target, zip);
        const { rows: [stored] } = await target.query(`SELECT available,reason,agent_id,caller_zip,rule_trace,price
          FROM ping_decisions WHERE id=$1`, [result.decision_id]);
        delete result.decision_id;
        out.push({ result, stored });
      }
      return JSON.stringify(out);
    };
    // Fresh phones each run, so no ping replays an earlier commitment.
    const noZip = [null, null];
    const withZip = ['66210', '66002', '66001'];
    const expectedNoZip = await scenario(s5, noZip);
    const expectedWithZip = await scenario(s5, withZip);
    for (const [aware, filter] of [[true, true], [true, false], [false, true]]) {
      await setSwitches(aware, filter);
      assert.equal(await scenario(db, noZip), expectedNoZip, `no ZIP, aware ${aware} filter ${filter}`);
    }
    await setSwitches(false, false);
    assert.equal(await scenario(db, withZip), expectedWithZip, 'ZIPs with both switches off');
  } finally { await s5.close(); }
});
