// Usage summary and invoice preview (migration 179) on PGlite, from
// platform_usage_events snapshots written by platform_record_usage (175): the
// allowance boundary, routed call amounts, line level cent rounding, lines that
// sum to the total and months that do not bleed. Synthetic identities only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures } from './helpers/pingDb.js';
import { callSid } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, BUYERS, OP } from './helpers/exchangeDb.js';
import { createS5Db, S5_FEATURES } from './helpers/pingS5Db.js';
import { invoice, sumDecimal } from '../src/ping/scorecard.js';

let db; let month;
const T = '0e000000-0000-4000-8000-0000000000c9'; // A buyer tenant used only here.
before(async () => {
  db = await createS5Db();
  await seedExchange(db);
  await setFeatures(db, S5_FEATURES);
  await db.query('INSERT INTO tenants VALUES($1)', [T]);
  await db.query(`INSERT INTO platform_price_plans(tenant_id,included_pings,overage_per_ping,per_routed_call,per_screener_minute,effective_at)
    VALUES($1,3,0.0125,1.5,0.125,now()-interval '1 day')`, [T]);
  month = (await q(`SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC'))::date::text m`))[0].m;
});
after(async () => db?.close());
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const inTx = async work => { await db.exec('BEGIN'); try { return await work(); } finally { await db.exec('ROLLBACK'); } };
const record = (kind, ref = null, tenant = T) => q('SELECT platform_record_usage($1,$2,NULL,NULL,$3) id', [tenant, kind, ref]);
const summary = async (tenant = T, at = month) => (await q('SELECT platform_usage_summary($1,$2) s', [tenant, at]))[0].s;
const lines = (tenant = T, at = month) => q('SELECT * FROM platform_invoice_lines($1,$2)', [tenant, at]);
const num = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
const events = (tenant = T) => q(`SELECT kind,quantity::text,unit_price::text FROM platform_usage_events WHERE tenant_id=$1
  AND occurred_at>=$2::date::timestamp AT TIME ZONE 'UTC' AND occurred_at<($2::date+interval '1 month')::timestamp AT TIME ZONE 'UTC'`, [tenant, month]);

test('included_pings exactly reached is free; the next ping is overage', () => inTx(async () => {
  for (let i = 0; i < 3; i += 1) await record('ping');
  let s = await summary();
  assert.deepEqual([s.pings, s.pings_inside_allowance, s.overage_pings, s.overage_amount, s.total], [3, 3, 0, 0, 0]);
  await record('ping');
  s = await summary();
  assert.deepEqual([s.pings, s.pings_inside_allowance, s.overage_pings, s.overage_amount], [4, 3, 1, 0.01]);
  assert.deepEqual((await q(`SELECT unit_price::text u FROM platform_usage_events WHERE tenant_id=$1 AND kind='ping' ORDER BY occurred_at`, [T]))
    .map(row => row.u), ['0.0000', '0.0000', '0.0000', '0.0125']);
  await record('ping');
  s = await summary();
  assert.deepEqual([s.overage_pings, s.overage_amount], [2, 0.03], '0.025 rounds once at the line, not 0.01 plus 0.01');
}));

test('routed calls are priced at the plan snapshot and later plan edits never reprice them', () => inTx(async () => {
  await record('routed_call', callSid(701));
  await record('routed_call', callSid(702));
  await record('routed_call', callSid(702)); // A retried claim writes nothing.
  await q('UPDATE platform_price_plans SET per_routed_call=9 WHERE tenant_id=$1', [T]);
  const s = await summary();
  assert.deepEqual([s.routed_calls, s.routed_calls_amount, s.total], [2, 3, 3]);
  assert.deepEqual(s.by_kind, { routed_call: { quantity: 2, amount: 3 } });
}));

test('invoice lines cover every kind in order, round per line and sum to the summary total', () => inTx(async () => {
  for (let i = 0; i < 6; i += 1) await record('ping');
  await record('routed_call', callSid(711));
  await q(`INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price) VALUES
    ($1,'screener_minute',2.5,0.125),($1,'screener_minute',1.25,0.125),($1,'screened_qualified',1,0.75)`, [T]);
  const rows = num(await lines());
  assert.deepEqual(rows, [
    { line_no: 1, kind: 'ping', description: 'Pings evaluated', quantity: 6, included_quantity: 3, charged_quantity: 3, amount: 0.04 },
    { line_no: 2, kind: 'routed_call', description: 'Routed calls', quantity: 1, included_quantity: 0, charged_quantity: 1, amount: 1.5 },
    { line_no: 3, kind: 'screener_minute', description: 'Screener minutes', quantity: 3.75, included_quantity: 0, charged_quantity: 3.75, amount: 0.47 },
    { line_no: 4, kind: 'screened_qualified', description: 'Screened qualified results', quantity: 1, included_quantity: 0, charged_quantity: 1, amount: 0.75 },
  ]);
  const s = await summary();
  assert.equal(s.total, sumDecimal(rows.map(row => row.amount)));
  assert.equal(s.total, 2.76);
  assert.deepEqual([s.screener_minutes, s.screener_minutes_amount, s.screened_qualified, s.screened_qualified_amount, s.screener_amount],
    [3.75, 0.47, 1, 0.75, 1.22]);
  // The JS mirror agrees with the SQL lines on the same snapshots.
  const mirror = invoice(await events());
  assert.deepEqual(mirror.lines.map(line => [line.kind, line.quantity, line.included_quantity, line.charged_quantity, line.amount]),
    rows.map(row => [row.kind, row.quantity, row.included_quantity, row.charged_quantity, row.amount]));
  assert.equal(mirror.total, s.total);
}));

test('months do not bleed: events one second either side of the month are excluded', () => inTx(async () => {
  await record('ping');
  await q(`INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price,occurred_at) VALUES
    ($1,'routed_call',1,1.5,$2::date::timestamp AT TIME ZONE 'UTC'-interval '1 second'),
    ($1,'routed_call',1,1.5,($2::date+interval '1 month')::timestamp AT TIME ZONE 'UTC'),
    ($1,'routed_call',1,1.5,$2::date::timestamp AT TIME ZONE 'UTC')`, [T, month]);
  const s = await summary();
  assert.deepEqual([s.pings, s.routed_calls, s.total], [1, 1, 1.5]);
  assert.equal(new Date(s.period_start).toISOString(), `${month}T00:00:00.000Z`, 'UTC month start');
  const previous = await summary(T, (await q(`SELECT ($1::date-interval '1 day')::date::text d`, [month]))[0].d);
  assert.deepEqual([previous.routed_calls, previous.total], [1, 1.5]);
  const next = await summary(T, (await q(`SELECT ($1::date+interval '1 month'+interval '14 days')::date::text d`, [month]))[0].d);
  assert.deepEqual([next.routed_calls, next.total], [1, 1.5]);
  assert.deepEqual(num(await lines(T, (await q(`SELECT ($1::date+interval '2 months')::date::text d`, [month]))[0].d)), []);
}));

test('another tenant\'s usage never appears, and a tenant without events totals zero', () => inTx(async () => {
  await record('ping', null, BUYERS.east.tenant);
  await record('routed_call', callSid(721), BUYERS.east.tenant);
  const s = await summary();
  assert.deepEqual([s.pings, s.routed_calls, s.total, s.by_kind], [0, 0, 0, {}]);
}));

test('an exchange ping meters every evaluated candidate and a claim meters one routed call', () => inTx(async () => {
  const result = await exchangePing(db, { phone: '+15550107001', callId: 'usage-1' });
  assert.equal(result.available, true);
  const [claimed] = await q(`SELECT * FROM ping_claim_arrival($1,'+15550107001','usage-1',$2,'{}',NULL,clock_timestamp())`,
    [callSid(731), BUYERS.east.transfer]);
  assert.equal(claimed.agent_id, BUYERS.east.agent);
  const east = await summary(BUYERS.east.tenant);
  assert.deepEqual([east.pings, east.pings_inside_allowance, east.routed_calls, east.routed_calls_amount, east.total], [1, 1, 1, 1.5, 1.5]);
  for (const key of ['central', 'pacific']) {
    const s = await summary(BUYERS[key].tenant);
    assert.deepEqual([s.pings, s.routed_calls, s.total], [1, 0, 0], key);
  }
  assert.deepEqual((await summary(OP.tenant)).by_kind, {}, 'the publisher tenant is not billed for buyer pings');
}));

test('usage reporting is fenced by PING_SCORECARD_ENABLED, validates input and is service role only', async () => {
  await setFeatures(db, { ...S5_FEATURES, PING_SCORECARD_ENABLED: false });
  try {
    await assert.rejects(summary(), /Ping scorecard disabled/);
    await assert.rejects(lines(), /Ping scorecard disabled/);
  } finally { await setFeatures(db, S5_FEATURES); }
  await assert.rejects(q('SELECT platform_usage_summary($1,NULL)', [T]), /Invalid usage period/);
  await assert.rejects(q('SELECT * FROM platform_invoice_lines(NULL,$1)', [month]), /Invalid usage period/);
  for (const sig of ['platform_usage_summary(uuid,date)', 'platform_invoice_lines(uuid,date)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`, [role, `public.${sig}`]))[0].ok, false, `${role} ${sig}`);
    }
    assert.equal((await q(`SELECT has_function_privilege('service_role',$1,'EXECUTE') ok`, [`public.${sig}`]))[0].ok, true, sig);
  }
});
