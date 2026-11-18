// End to end for the S5 scorecards (migration 179) on PGlite. One operator
// tenant owns two exchange publishers; two buyer tenants (Eastern and Pacific)
// are routed from both. Six exchange pings with known wins, losses, arrivals,
// billable and short calls, apps, enrollments, returns and a retention hit are
// placed around midnight so the two tenants' day buckets differ. Expected rows
// come from a hand written fact table, one entry per evaluation, and are
// compared for every grouping. Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, migration } from './helpers/pingDb.js';
import { callSid } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, BUYERS, OP } from './helpers/exchangeDb.js';
import { makeClient } from './helpers/pingS4Db.js';
import { createS5Db, completeCall, MIGRATIONS_S5, S5_FEATURES } from './helpers/pingS5Db.js';
import { acceptRate, costPer } from '../src/ping/scorecard.js';

const OP2 = { source: '0e000000-0000-4000-8000-0000000000bb', hash: 'a'.repeat(64) };
const EAST = BUYERS.east; const PACIFIC = BUYERS.pacific;
const FROM = '2026-11-16T00:00:00Z'; const TO = '2026-11-18T00:00:00Z';
const RETENTION_PHONE = '+15550105006';

let db; let campaigns;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const freeAgents = () => q(`UPDATE agent_availability SET active_call_sid=NULL,status='available',available=true`);
const claim = async (n, phone, callId, transfer) => (await q(
  `SELECT * FROM ping_claim_arrival($1,$2,$3,$4,'{}',NULL,clock_timestamp())`, [callSid(n), phone, callId, transfer]))[0];

// Pings: key, state, sub_id, phone, when (UTC), and what happens after.
const PINGS = [
  { id: 'p1', key: OP.hash, state: 'TX', sub: 's1', at: '2026-11-17T06:30:00Z', winner: 'east',
    call: { n: 501, agent: 'agent_east', seconds: 120, app: true, outcome: 'enrolled' } },
  { id: 'p2', key: OP.hash, state: 'FL', sub: 's2', at: '2026-11-17T04:30:00Z', winner: 'east',
    call: { n: 502, agent: 'agent_east', seconds: 30, flag: true } },
  { id: 'p3', key: OP.hash, state: 'TX', sub: 's1', at: '2026-11-17T09:00:00Z', winner: 'pacific', eastBusy: true,
    call: { n: 503, agent: 'agent_pacific', seconds: 200, app: true, outcome: 'not_interested', credited: true } },
  { id: 'p4', key: OP2.hash, state: 'TX', sub: null, at: '2026-11-17T07:30:00Z', winner: 'east',
    call: { n: 504, agent: null, seconds: 95 } },
  { id: 'p5', key: OP.hash, state: 'NY', sub: 's1', at: '2026-11-17T12:00:00Z', winner: null },
  { id: 'p6', key: OP.hash, state: 'TX', sub: 's2', at: '2026-11-17T15:00:00Z', winner: 'east', phone: RETENTION_PHONE },
];

// One fact per evaluation, written by hand from PINGS. Days are local dates:
// Eastern is UTC-5 and Pacific UTC-8 on these dates.
const A = (fields = {}) => ({ connect: false, billable: false, rate: 0, app: false, enrolled: false, open: 0, credited: 0, ...fields });
const FACTS = [
  { ping: 'p1', buyer: 'east', source: OP.source, sub: 's1', state: 'TX', day: '2026-11-17', reason: 'accepted_full', win: true,
    arrival: A({ connect: true, billable: true, rate: 30, app: true, enrolled: true }) },
  { ping: 'p1', buyer: 'pacific', source: OP.source, sub: 's1', state: 'TX', day: '2026-11-16', reason: 'accepted_full' },
  { ping: 'p2', buyer: 'east', source: OP.source, sub: 's2', state: 'FL', day: '2026-11-16', reason: 'accepted_full', win: true,
    arrival: A({ connect: true, open: 1 }) },
  { ping: 'p2', buyer: 'pacific', source: OP.source, sub: 's2', state: 'FL', day: '2026-11-16', reason: 'accepted_full' },
  { ping: 'p3', buyer: 'east', source: OP.source, sub: 's1', state: 'TX', day: '2026-11-17', reason: 'all_eligible_busy' },
  { ping: 'p3', buyer: 'pacific', source: OP.source, sub: 's1', state: 'TX', day: '2026-11-17', reason: 'accepted_full', win: true,
    arrival: A({ connect: true, billable: true, rate: 50, app: true, credited: 1 }) },
  { ping: 'p4', buyer: 'east', source: OP2.source, sub: null, state: 'TX', day: '2026-11-17', reason: 'accepted_full', win: true,
    arrival: A({ billable: true, rate: 30 }) },
  { ping: 'p4', buyer: 'pacific', source: OP2.source, sub: null, state: 'TX', day: '2026-11-16', reason: 'accepted_full' },
  { ping: 'p5', buyer: 'east', source: OP.source, sub: 's1', state: 'NY', day: '2026-11-17', reason: 'state_not_allowed' },
  { ping: 'p5', buyer: 'pacific', source: OP.source, sub: 's1', state: 'NY', day: '2026-11-17', reason: 'state_not_allowed' },
  { ping: 'p6', buyer: 'east', source: OP.source, sub: 's2', state: 'TX', day: '2026-11-17', reason: 'accepted_retention_owner',
    win: true, retention: true },
  { ping: 'p6', buyer: 'pacific', source: OP.source, sub: 's2', state: 'TX', day: '2026-11-17', reason: 'accepted_full' },
];
const ACCEPTED = ['accepted_full', 'accepted_partial', 'accepted_retention_owner'];
const KEY = { source: 'source', sub_id: 'sub', campaign: 'campaign', state: 'state', day: 'day', buyer_tenant: 'tenant' };

/** Expected scorecard rows from FACTS for one tenant (or all) and one group list. */
function expected(groups, buyer = null) {
  const rows = new Map();
  for (const fact of FACTS.filter(f => !buyer || f.buyer === buyer)) {
    const full = { ...fact, campaign: campaigns[fact.buyer], tenant: BUYERS[fact.buyer].tenant };
    const keys = Object.fromEntries(groups.map(group => [group, full[KEY[group]]]));
    const id = JSON.stringify(keys);
    const row = rows.get(id) ?? { ...keys, pings: 0, accepts: 0, rejects_by_reason: {}, exchange_wins: 0, arrivals: 0,
      connects: 0, billable_calls: 0, cost: 0, apps: 0, enrollments: 0, returns_open: 0, returns_credited: 0, retention_hits: 0 };
    row.pings += 1;
    if (ACCEPTED.includes(fact.reason)) row.accepts += 1;
    else row.rejects_by_reason[fact.reason] = (row.rejects_by_reason[fact.reason] ?? 0) + 1;
    if (fact.win) row.exchange_wins += 1;
    if (fact.retention) row.retention_hits += 1;
    const call = fact.arrival;
    if (call) {
      row.arrivals += 1; row.connects += +call.connect; row.billable_calls += +call.billable;
      row.cost += call.billable ? call.rate : 0; row.apps += +call.app; row.enrollments += +call.enrolled;
      row.returns_open += call.open; row.returns_credited += call.credited;
    }
    rows.set(id, row);
  }
  return [...rows.values()].map(row => ({ ...row, accept_rate: acceptRate(row.accepts, row.pings),
    cost_per_app: costPer(row.cost, row.apps), cost_per_enrollment: costPer(row.cost, row.enrollments) }));
}
const sortKey = row => JSON.stringify(Object.keys(KEY).map(group => (group in row ? row[group] : '-')));
const order = rows => [...rows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
const keyed = rows => order(rows.map(row => JSON.parse(JSON.stringify(row))));
const scorecard = async (tenant, groups) => (await q('SELECT r FROM ping_scorecard($1,$2,$3,$4) r', [tenant, FROM, TO, groups])).map(x => x.r);
const operator = async groups => (await q('SELECT r FROM ping_operator_scorecard($1,$2,$3) r', [FROM, TO, groups])).map(x => x.r);
const subsets = list => list.reduce((all, item) => [...all, ...all.map(set => [...set, item])], [[]]);

before(async () => {
  db = await createS5Db();
  campaigns = await seedExchange(db);
  await setFeatures(db, S5_FEATURES);
  // Two buyers: the Central buyer's route is off. A second operator publisher routes to both.
  await q('UPDATE exchange_routes SET active=false WHERE campaign_id=$1', [campaigns.central]);
  await q(`INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash) VALUES($1,$2,'Second Exchange Publisher','publisher',true,$3)`,
    [OP2.source, OP.tenant, OP2.hash]);
  await q(`INSERT INTO exchange_sources(source_id,strategy) VALUES($1,'priority_waterfall')`, [OP2.source]);
  await q(`INSERT INTO exchange_routes(source_id,campaign_id,priority,weight) SELECT $1,campaign_id,priority,weight
    FROM exchange_routes WHERE source_id=$2 AND active`, [OP2.source, OP.source]);
  await q('UPDATE ping_campaigns SET retention_enabled=true WHERE id=$1', [campaigns.east]);
  await makeClient(db, { tenant: EAST.tenant, phone: RETENTION_PHONE, ownerSlug: 'agent_east' });

  for (const [index, ping] of PINGS.entries()) {
    const phone = ping.phone ?? `+1555010500${index}`;
    if (ping.eastBusy) await q(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id='agent_east'`);
    const result = await exchangePing(db, { key: ping.key, state: ping.state, phone, callId: ping.id, extra: { sub_id: ping.sub } });
    assert.equal(result.available, ping.winner != null, ping.id);
    if (ping.call) {
      const buyer = BUYERS[ping.winner];
      const claimed = await claim(ping.call.n, phone, ping.id, buyer.transfer);
      assert.equal(claimed.agent_id, buyer.agent, `${ping.id} claimed`);
      await completeCall(db, { tenant: buyer.tenant, sid: callSid(ping.call.n), phone, agent: ping.call.agent,
        seconds: ping.call.seconds, app: ping.call.app, outcome: ping.call.outcome });
      if (ping.call.flag) await q('SELECT ping_flag_returns($1)', [callSid(ping.call.n)]);
      if (ping.call.credited) {
        await q(`INSERT INTO ping_returns(tenant_id,billing_parent_call_sid,campaign_id,reason,status)
          VALUES($1,$2,$3,'other','credited')`, [buyer.tenant, callSid(ping.call.n), campaigns[ping.winner]]);
      }
    }
    await freeAgents();
    await q(`UPDATE ping_reservations SET expires_at=clock_timestamp()-interval '1 second'`);
    await q('UPDATE ping_decisions SET received_at=$2 WHERE vendor_call_id=$1', [ping.id, ping.at]);
  }
  // Rates change after the calls were claimed; cost must keep the claim snapshot.
  await q('UPDATE ping_campaigns SET rate=99 WHERE id IN ($1,$2)', [campaigns.east, campaigns.pacific]);
});
after(async () => db?.close());

test('179 carries the UNAPPLIED header, a transaction, the scorecard fence, no em dashes and no paragon_* changes', async () => {
  for (const name of MIGRATIONS_S5) {
    const sql = await migration(name);
    assert.equal(sql.split('\n')[0], '-- UNAPPLIED: isolated pilot only', name);
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /\u2014/, name);
    assert.doesNotMatch(sql, /(ALTER|DROP|CREATE OR REPLACE)\s+(TABLE|FUNCTION|VIEW|TRIGGER)\s+(public\.)?paragon_/i, name);
    assert.doesNotMatch(sql, /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?paragon_/i, name);
  }
  const sql = await migration('179_ping_scorecard_usage.sql');
  assert.equal(sql.match(/deployment_feature_enabled\('PING_SCORECARD_ENABLED'\)/g).length, 3, 'scorecard rows, lines, summary');
});

test('the scenario produced the expected exchange outcomes and billing snapshots', async () => {
  const bills = await q(`SELECT b.parent_call_sid,b.rate::float,c.rate::float AS live FROM ping_call_billing b
    JOIN ping_campaigns c ON c.id=b.campaign_id ORDER BY b.parent_call_sid`);
  assert.deepEqual(bills.map(b => [b.rate, b.live]), [[30, 99], [30, 99], [50, 99], [30, 99]]);
  const [returns] = await q(`SELECT count(*) FILTER (WHERE status='open')::int open,count(*) FILTER (WHERE status='credited')::int credited FROM ping_returns`);
  assert.deepEqual(returns, { open: 1, credited: 1 });
});

test('buyer totals match the hand counts, with cost from the rate snapshot', async () => {
  const [east] = await scorecard(EAST.tenant, []);
  assert.deepEqual(east, { pings: 6, accepts: 4, accept_rate: 0.6667,
    rejects_by_reason: { all_eligible_busy: 1, state_not_allowed: 1 }, exchange_wins: 4, arrivals: 3, connects: 2,
    billable_calls: 2, cost: 60, apps: 1, enrollments: 1, cost_per_app: 60, cost_per_enrollment: 60,
    returns_open: 1, returns_credited: 0, retention_hits: 1 });
  const [pacific] = await scorecard(PACIFIC.tenant, []);
  assert.deepEqual(pacific, { pings: 6, accepts: 5, accept_rate: 0.8333, rejects_by_reason: { state_not_allowed: 1 },
    exchange_wins: 1, arrivals: 1, connects: 1, billable_calls: 1, cost: 50, apps: 1, enrollments: 0,
    cost_per_app: 50, cost_per_enrollment: null, returns_open: 0, returns_credited: 1, retention_hits: 0 });
});

test('every combination of source, campaign, state and day matches for each buyer and the operator', async () => {
  for (const groups of subsets(['source', 'campaign', 'state', 'day'])) {
    for (const buyer of ['east', 'pacific']) {
      assert.deepEqual(keyed(await scorecard(BUYERS[buyer].tenant, groups)), keyed(expected(groups, buyer)), `${buyer} ${groups}`);
    }
    assert.deepEqual(keyed(await operator(groups)), keyed(expected(groups)), `operator ${groups}`);
  }
});

test('sub_id and buyer_tenant groupings match, and group order does not matter', async () => {
  for (const groups of [['sub_id'], ['sub_id', 'source'], ['sub_id', 'state', 'day']]) {
    assert.deepEqual(keyed(await scorecard(EAST.tenant, groups)), keyed(expected(groups, 'east')), groups.join());
  }
  for (const groups of [['buyer_tenant'], ['buyer_tenant', 'day'], ['buyer_tenant', 'source', 'campaign', 'state', 'day', 'sub_id']]) {
    assert.deepEqual(keyed(await operator(groups)), keyed(expected(groups)), groups.join());
  }
  assert.deepEqual(keyed(await scorecard(EAST.tenant, ['day', 'state'])), keyed(await scorecard(EAST.tenant, ['state', 'day'])));
});

test('a buyer sees only its own rows, including its own lost evaluations, and never another tenant', async () => {
  const east = await scorecard(EAST.tenant, ['campaign', 'source', 'sub_id', 'state', 'day']);
  const text = JSON.stringify(east);
  for (const foreign of [PACIFIC.tenant, campaigns.pacific, campaigns.central, BUYERS.central.tenant]) {
    assert.ok(!text.includes(foreign), `east must not see ${foreign}`);
  }
  assert.ok(east.every(row => row.campaign === campaigns.east));
  const pacific = await scorecard(PACIFIC.tenant, ['campaign']);
  assert.deepEqual(pacific.map(row => row.campaign), [campaigns.pacific]);
  assert.equal(pacific[0].pings - pacific[0].exchange_wins - Object.values(pacific[0].rejects_by_reason).reduce((a, b) => a + b, 0), 4,
    'four accepted evaluations that lost the auction');
  assert.deepEqual(await scorecard(BUYERS.central.tenant, []), [], 'a buyer with no route sees nothing');
  assert.deepEqual(await scorecard(OP.tenant, []), [], 'the publisher tenant owns no buyer decisions');
});

test('the operator sees both buyers and the sum of their numbers', async () => {
  const rows = await operator(['buyer_tenant']);
  assert.deepEqual(rows.map(row => row.buyer_tenant).sort(), [EAST.tenant, PACIFIC.tenant].sort());
  const [total] = await operator([]);
  assert.equal(total.pings, 12);
  assert.equal(total.exchange_wins, 5);
  assert.equal(total.cost, 110);
  assert.equal(total.cost_per_app, 55);
  assert.equal(total.cost_per_enrollment, 110);
});

test('day buckets use each tenant\'s own zone around midnight', async () => {
  // p1 at 06:30Z is 01:30 on the 17th in Eastern and 22:30 on the 16th in Pacific.
  const eastDays = await scorecard(EAST.tenant, ['day']);
  const pacificDays = await scorecard(PACIFIC.tenant, ['day']);
  assert.deepEqual(eastDays.map(row => [row.day, row.pings]), [['2026-11-16', 1], ['2026-11-17', 5]]);
  assert.deepEqual(pacificDays.map(row => [row.day, row.pings]), [['2026-11-16', 3], ['2026-11-17', 3]]);
  // The same ping, by state and source: p1 is the only TX ping from the first publisher with sub s1 before 09:00Z.
  const [eastP1] = (await scorecard(EAST.tenant, ['day', 'sub_id', 'state'])).filter(r => r.sub_id === 's1' && r.state === 'TX' && r.day === '2026-11-17');
  const [pacificP1] = (await scorecard(PACIFIC.tenant, ['day', 'sub_id', 'state'])).filter(r => r.sub_id === 's1' && r.state === 'TX' && r.day === '2026-11-16');
  assert.equal(eastP1.exchange_wins, 1);
  assert.equal(pacificP1.pings, 1);
  assert.equal(pacificP1.exchange_wins, 0);
  // A tenant without a valid zone buckets in UTC.
  await q('BEGIN');
  try {
    await q(`UPDATE vendor_controls SET staffed_hours=jsonb_set(staffed_hours,'{timezone}','"EST"') WHERE tenant_id=$1`, [PACIFIC.tenant]);
    const utc = await scorecard(PACIFIC.tenant, ['day']);
    assert.deepEqual(utc.map(row => [row.day, row.pings]), [['2026-11-17', 6]]);
  } finally { await q('ROLLBACK'); }
});

test('the window is half open on received_at', async () => {
  const [inside] = (await q(`SELECT r FROM ping_scorecard($1,'2026-11-17T06:30:00Z','2026-11-17T06:30:00.000001Z','{}') r`, [EAST.tenant])).map(x => x.r);
  assert.equal(inside.pings, 1);
  assert.deepEqual(await q(`SELECT r FROM ping_scorecard($1,'2026-11-17T06:30:00.000001Z','2026-11-17T07:00:00Z','{}') r`, [EAST.tenant]), []);
});

test('no row carries a caller phone, ZIP or contact', async () => {
  const text = JSON.stringify([...await operator(['buyer_tenant', 'source', 'sub_id', 'campaign', 'state', 'day']),
    ...await scorecard(EAST.tenant, ['source', 'sub_id', 'campaign', 'state', 'day'])]);
  assert.doesNotMatch(text, /\+1555/);
  assert.doesNotMatch(text, /phone|zip|contact/i);
});

test('unknown groups raise, buyer_tenant is operator only, and the window and tenant are required', async () => {
  for (const groups of [['phone'], ['buyer_tenant'], ['day', null], ['Day']]) {
    await assert.rejects(scorecard(EAST.tenant, groups), /Unknown scorecard group/, JSON.stringify(groups));
  }
  await assert.rejects(operator(['caller_phone']), /Unknown scorecard group/);
  await assert.rejects(q(`SELECT ping_scorecard(NULL,$1,$2,'{}')`, [FROM, TO]), /Scorecard tenant required/);
  await assert.rejects(q(`SELECT ping_scorecard($1,$2,$2,'{}')`, [EAST.tenant, FROM]), /Invalid scorecard window/);
  assert.equal((await operator(null)).length, 1, 'a null group is the total');
});

test('scorecards are fenced by PING_SCORECARD_ENABLED and callable only by service_role', async () => {
  await setFeatures(db, { ...S5_FEATURES, PING_SCORECARD_ENABLED: false });
  try {
    await assert.rejects(scorecard(EAST.tenant, []), /Ping scorecard disabled/);
    await assert.rejects(operator([]), /Ping scorecard disabled/);
  } finally { await setFeatures(db, S5_FEATURES); }
  const signatures = ['ping_scorecard(uuid,timestamptz,timestamptz,text[])', 'ping_operator_scorecard(timestamptz,timestamptz,text[])'];
  for (const sig of signatures) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`, [role, `public.${sig}`]))[0].ok, false, `${role} ${sig}`);
    }
    assert.equal((await q(`SELECT has_function_privilege('service_role',$1,'EXECUTE') ok`, [`public.${sig}`]))[0].ok, true, sig);
  }
  for (const sig of ['ping_scorecard_rows(uuid,timestamptz,timestamptz,text[],boolean)', 'ping_tenant_zone(uuid)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await q(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`, [role, `public.${sig}`]))[0].ok, false, `${role} ${sig}`);
    }
  }
});
