// PGlite single connection baseline for decision latency (S8a). Drives mixed
// direct and exchange pings through the load runner used by
// scripts/ping_load.js and checks decision cost, errors and double
// reservations. One connection cannot show concurrency, so this is a baseline,
// not the spec target (p95 under one second at 50 pings a second), which needs
// the staging run in docs/ping-load-test.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPingLoad, percentile } from './helpers/pingLoadRunner.js';
import { pgliteLoadTarget } from './helpers/pingLoadPglite.js';

test('percentile picks the nearest rank', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(percentile([], 0.5), null);
});

test('PGlite baseline: mixed pings decide well under a second, with no errors and no double reservation', async t => {
  const target = await pgliteLoadTarget();
  try {
    const result = await runPingLoad(target.query, { ...target, rate: 40, durationSeconds: 3, runId: 'baseline' });
    t.diagnostic(`baseline ${JSON.stringify({ achieved_rate: result.achieved_rate, latency: result.latency.all,
      exchange_p95_ms: result.latency.exchange.p95_ms, direct_p95_ms: result.latency.direct.p95_ms, reasons: result.reasons })}`);
    assert.ok(result.sent >= 60, `sent ${result.sent}`);
    assert.equal(result.errors, 0, JSON.stringify(result.reasons));
    assert.equal(result.double_reservations, 0);
    assert.ok(result.accepted > 0);
    assert.ok(result.latency.exchange.count > 0 && result.latency.direct.count > 0);
    // Generous ceiling for shared CI machines; the measured p95 is far lower.
    assert.ok(result.latency.all.p95_ms < 1000, `p95 ${result.latency.all.p95_ms} ms`);
  } finally { await target.close(); }
});

test('the double reservation check catches an overlapping pair', async () => {
  const target = await pgliteLoadTarget({ extraAgents: 1 });
  try {
    const [{ t: since }] = await target.query('SELECT clock_timestamp() AS t', []);
    const [{ id: campaign }] = await target.query('SELECT id FROM ping_campaigns LIMIT 1', []);
    for (const key of ['id:overlap-1', 'id:overlap-2']) {
      await target.query(`INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
        SELECT tenant_id,id,$2,'TX','agent_east',clock_timestamp()+interval '30 seconds' FROM ping_campaigns WHERE id=$1`,
      [campaign, key]);
    }
    const { DOUBLE_RESERVATION_SQL } = await import('./helpers/pingLoadRunner.js');
    assert.equal((await target.query(DOUBLE_RESERVATION_SQL, [since]))[0].n, 1);
  } finally { await target.close(); }
});

test('the runner refuses rates and durations outside the hard ceilings', async () => {
  await assert.rejects(runPingLoad(async () => [], { rate: 500, durationSeconds: 1 }), /rate/);
  await assert.rejects(runPingLoad(async () => [], { rate: 10, durationSeconds: 7200 }), /duration/);
});
