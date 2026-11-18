// Lock narrowing (S8a, migration 184) on PGlite. PGlite is one connection, so
// true concurrency cannot run here (docs/ping-load-test.md covers the staging
// run). These tests prove what can be proven on one connection:
// 1. the locks a decision takes are per campaign plus call identity, never per
//    source, and evaluations take none;
// 2. exchange_ping holds the exchange_sources row lock only for weighted
//    rotation, never for other strategies;
// 3. interleaved pings for different campaigns and identities, direct and
//    exchange, never leave two live reservations on one agent;
// 4. weighted rotation state stays consistent (current weights sum to zero and
//    winners follow the weights) with sandbox and direct pings interleaved;
// 5. the agent re-check skips an agent that holds a live reservation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFeatures, pingDecide } from './helpers/pingDb.js';
import { seedPublisherB, B } from './helpers/pingS2Db.js';
import { seedExchange, exchangePing, OP, BUYERS } from './helpers/exchangeDb.js';
import { createS8Db, S8_FEATURES } from './helpers/pingS8Db.js';

let db; let direct; let exchange;

before(async () => {
  db = await createS8Db();
  await setFeatures(db, S8_FEATURES);
  direct = await seedPublisherB(db);
  exchange = await seedExchange(db);
});
after(async () => { await db.close(); });

const doubleReserved = async () => (await db.query(`SELECT agent_id,count(*)::int n FROM ping_reservations
  WHERE consumed_call_sid IS NULL AND expires_at>clock_timestamp() GROUP BY agent_id HAVING count(*)>1`)).rows;
const freeAgents = () => db.query('DELETE FROM ping_reservations');

// Advisory locks held by this session whose 64 bit key is hashtextextended(text,0).
async function heldLocks(texts) {
  const { rows } = await db.query(`SELECT t.text FROM unnest($1::text[]) t(text)
    WHERE EXISTS(SELECT 1 FROM pg_locks l WHERE l.locktype='advisory' AND l.pid=pg_backend_pid()
      AND l.classid::bigint=((hashtextextended(t.text,0)>>32)&4294967295)
      AND l.objid::bigint=(hashtextextended(t.text,0)&4294967295))`, [texts]);
  return rows.map(row => row.text);
}

test('a reserving direct decision locks campaign plus identity, never the source', async () => {
  const campaign = direct['ma-central'];
  await db.exec('BEGIN');
  try {
    const d = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550008101', callId: 'lock-1' });
    assert.equal(d.available, true);
    assert.deepEqual(await heldLocks([`ping-decide:${B.source}`, `ping-decide:${campaign}id:lock-1`]),
      [`ping-decide:${campaign}id:lock-1`]);
  } finally { await db.exec('ROLLBACK'); }
  await db.exec('BEGIN');
  try {
    await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550008102', callId: 'lock-2', engine: 'shadow' });
    assert.deepEqual(await heldLocks([`ping-decide:${B.source}`, `ping-decide:${campaign}id:lock-2`]), []);
  } finally { await db.exec('ROLLBACK'); }
});

test('the function bodies no longer carry the per source lock', async () => {
  for (const fn of ['ping_decide_campaign(uuid,uuid,jsonb,text)', 'exchange_ping(text,jsonb)']) {
    const { rows: [row] } = await db.query('SELECT pg_get_functiondef($1::regprocedure) AS def', [fn]);
    assert.ok(!row.def.includes("'ping-decide:'||src.id::text,0"), fn);
    assert.ok(!/FROM exchange_sources WHERE source_id=src\.id AND active FOR UPDATE/.test(row.def), fn);
  }
});

test('exchange_ping locks the exchange_sources row only for weighted rotation', async () => {
  // A row locked FOR UPDATE by this transaction carries this transaction's id in xmax.
  const rowLocked = async () => (await db.query(`SELECT xmax::text=(txid_current()%4294967296)::text AS locked
    FROM exchange_sources WHERE source_id=$1`, [OP.source])).rows[0].locked;
  for (const [strategy, expected] of [['priority_waterfall', false], ['highest_price', false], ['weighted_rotation', true]]) {
    await freeAgents();
    await db.query('UPDATE exchange_sources SET strategy=$1 WHERE source_id=$2', [strategy, OP.source]);
    await db.exec('BEGIN');
    try {
      const r = await exchangePing(db, { phone: '+15550008201', callId: `rot-lock-${strategy}` });
      assert.equal(r.available, true);
      assert.equal(await rowLocked(), expected, strategy);
      assert.deepEqual(await heldLocks([`exchange-ping:${OP.source}:id:rot-lock-${strategy}`]),
        [`exchange-ping:${OP.source}:id:rot-lock-${strategy}`]);
    } finally { await db.exec('ROLLBACK'); }
  }
  await db.query(`UPDATE exchange_sources SET strategy='priority_waterfall',rotation_state='{}' WHERE source_id=$1`, [OP.source]);
});

test('interleaved pings for different campaigns and identities never double reserve an agent', async () => {
  await freeAgents();
  const accepted = [];
  for (let i = 0; i < 24; i++) {
    const phone = `+1555000${String(8300 + i).padStart(4, '0')}`;
    const kind = i % 3;
    if (kind === 0) {
      const d = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone, callId: `il-${i}` });
      if (d.available) accepted.push(d.agent_id);
    } else if (kind === 1) {
      const d = await pingDecide(db, { key: B.hash, campaign: 'medsupp-central', state: 'MO', phone, callId: `il-${i}` });
      if (d.available) accepted.push(d.agent_id);
    } else {
      const r = await exchangePing(db, { phone, callId: `il-${i}`, state: i % 2 ? 'TX' : 'FL' });
      if (r.available) accepted.push('exchange');
    }
    assert.deepEqual(await doubleReserved(), [], `after ping ${i}`);
  }
  // Two shared direct agents and three exchange agents: at most five holds.
  assert.equal(accepted.length, 5);
  assert.equal((await db.query(`SELECT count(DISTINCT agent_id)::int n FROM ping_reservations
    WHERE consumed_call_sid IS NULL AND expires_at>clock_timestamp()`)).rows[0].n, 5);
  // Every later ping saw the pool exhausted, not an error.
  const { rows } = await db.query(`SELECT reason,count(*)::int n FROM ping_decisions
    WHERE engine IN ('generic','exchange') GROUP BY reason`);
  assert.ok(!rows.some(row => row.reason === 'error_rejected'), JSON.stringify(rows));
});

test('the same identity on two campaigns gets two agents, and a re-ping keeps its own', async () => {
  await freeAgents();
  const a = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550008401', callId: 'same-1' });
  const b = await pingDecide(db, { key: B.hash, campaign: 'medsupp-central', state: 'KS', phone: '+15550008401', callId: 'same-1' });
  assert.ok(a.available && b.available);
  assert.notEqual(a.agent_id, b.agent_id);
  const again = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550008401', callId: 'same-1' });
  assert.equal(again.agent_id, a.agent_id);
  assert.deepEqual(await doubleReserved(), []);
});

test('the agent re-check skips an agent held by a live reservation', async () => {
  await freeAgents();
  // agent_x would be chosen first; hold it with a reservation from another campaign.
  await db.query(`INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
    VALUES($1,$2,'id:held','KS',$3,clock_timestamp()+interval '30 seconds')`, [B.tenant, direct['medsupp-central'], B.agents[0]]);
  const { rows: [held] } = await db.query('SELECT ping_agent_held($1) AS a,ping_agent_held($2) AS b', B.agents);
  assert.deepEqual([held.a, held.b], [true, false]);
  const d = await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: '+15550008501', callId: 'recheck-1' });
  assert.equal(d.agent_id, B.agents[1]);
  assert.deepEqual(await doubleReserved(), []);
});

test('weighted rotation state stays consistent with sandbox and direct pings interleaved', async () => {
  await db.query(`UPDATE exchange_sources SET strategy='weighted_rotation',rotation_state='{}' WHERE source_id=$1`, [OP.source]);
  // A sandbox twin of the exchange publisher with the same routes.
  const twin = '0e000000-0000-4000-8000-0000000000ba';
  await db.query(`INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash,sandbox)
    VALUES($1,$2,'Exchange Sandbox','publisher',true,$3,true)`, [twin, OP.tenant, 'f'.repeat(64)]);
  await db.query(`INSERT INTO exchange_sources(source_id,strategy) VALUES($1,'weighted_rotation')`, [twin]);
  await db.query(`INSERT INTO exchange_routes(source_id,campaign_id,priority,weight)
    SELECT $1,campaign_id,priority,weight FROM exchange_routes WHERE source_id=$2`, [twin, OP.source]);
  const wins = {};
  for (let i = 0; i < 8; i++) {
    await freeAgents();
    const r = await exchangePing(db, { phone: `+1555000${8600 + i}`, callId: `wr-${i}` });
    assert.equal(r.available, true);
    wins[r.transfer_number] = (wins[r.transfer_number] || 0) + 1;
    await exchangePing(db, { phone: `+1555000${8700 + i}`, callId: `wr-sbx-${i}`, key: 'f'.repeat(64) });
    await pingDecide(db, { key: B.hash, campaign: 'ma-central', state: 'KS', phone: `+1555000${8800 + i}`, callId: `wr-d-${i}` });
    const { rows: [state] } = await db.query('SELECT rotation_state FROM exchange_sources WHERE source_id=$1', [OP.source]);
    const sum = Object.values(state.rotation_state).reduce((total, value) => total + Number(value), 0);
    assert.equal(sum, 0, JSON.stringify(state.rotation_state));
  }
  // Weights 1, 2, 1 over eight auctions.
  assert.deepEqual(wins, { [BUYERS.east.transfer]: 2, [BUYERS.central.transfer]: 4, [BUYERS.pacific.transfer]: 2 });
  assert.deepEqual((await db.query('SELECT rotation_state FROM exchange_sources WHERE source_id=$1', [twin])).rows[0].rotation_state, {});
  assert.equal((await db.query('SELECT count(*)::int n FROM exchange_auctions WHERE source_id=$1', [twin])).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM exchange_auctions WHERE source_id=$1 AND strategy=$2',
    [OP.source, 'weighted_rotation'])).rows[0].n, 8);
  assert.ok(Object.values(exchange).length === 3);
});
