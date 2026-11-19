// The operator MBI key backfill (scripts/gold/backfill-mbi-keys.mjs) on the
// fresh install with synthetic MBIs only: localhost only, a dry run by
// default that writes nothing, execution only with the flag, keys only for
// completed non-test intakes, and no plaintext leaves the database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase } from './helpers/freshInstall.js';
import { backfillArguments, runBackfill } from '../scripts/gold/backfill-mbi-keys.mjs';

let pg;
const T = '00000000-0000-4000-8000-0000000000b1';
const SYNTHETIC = ['1EG4TE5MK72', '5AA1AA1AA11', 'not-an-mbi'];
before(async () => {
  pg = await freshDatabase();
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Synthetic backfill agency')", [T]);
  await pg.query("INSERT INTO enrolled_agents(tenant_id,clerk_user_id,name,is_active) VALUES($1,'user_backfill','Synthetic',true)", [T]);
  const [{ id: agent }] = (await pg.query('SELECT id FROM enrolled_agents WHERE tenant_id=$1', [T])).rows;
  for (const [i, mbi] of [...SYNTHETIC, SYNTHETIC[0]].entries()) {
    const contact = (await pg.query('INSERT INTO contacts(tenant_id) VALUES($1) RETURNING id', [T])).rows[0].id;
    const call = (await pg.query(`INSERT INTO call_records(tenant_id,agent_id,agent_name,contact_id,call_type,call_direction,product_type,call_start)
      VALUES($1,$2,'Synthetic',$3,'enrollment','inbound','MA',now()) RETURNING id`, [T, agent, contact])).rows[0].id;
    await pg.query(`INSERT INTO enrollment_intakes(tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at,is_test_enrollment)
      VALUES($1,$2,$3,'{}',jsonb_build_object('mbi',encrypt_pii_value($4)),'Other',now(),$5)`, [T, call, contact, mbi, i === 3]);
  }
  await pg.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",
    [JSON.stringify({ 'x-enrollgen-features': JSON.stringify({ MEMBER_STATUS_IMPORT_ENABLED: true }) })]);
  await pg.query('SET ROLE service_role');
  await pg.query('SELECT provision_member_mbi_pepper($1)', ['synthetic-backfill-pepper-0123456789abcdef']);
  await pg.query('RESET ROLE');
});
after(async () => { await pg?.close(); });

test('arguments: explicit localhost only, bounded batches, dry run unless --execute', () => {
  assert.deepEqual(backfillArguments(['--connection', 'postgres://localhost/db']),
    { execute: false, batchSize: 100, maxBatches: 10, connectionString: 'postgres://localhost/db' });
  for (const bad of [['--connection', 'postgres://db.example.com/db'], ['--connection', 'postgres://localhost/db?sslmode=require'],
    ['--connection', 'postgres://localhost/db', '--batch-size', '0'], ['--connection', 'postgres://localhost/db', '--max-batches', '500'],
    ['--connection', 'postgres://localhost/db', '--everything']]) assert.throws(() => backfillArguments(bad));
});

test('a dry run counts and writes nothing; execute needs the flag; only completed non-test intakes are keyed', async () => {
  const keys = async () => (await pg.query('SELECT count(*)::int n FROM enrollment_intakes WHERE tenant_id=$1 AND mbi_match_key IS NOT NULL', [T])).rows[0].n;
  const dry = await runBackfill({ db: pg, env: {} });
  assert.deepEqual(dry, { mode: 'dry_run', pending: 3, processed: 0, keyed: 0 });
  assert.equal(await keys(), 0);
  await pg.query('RESET ROLE');
  await assert.rejects(runBackfill({ db: pg, execute: true, env: {} }), /MEMBER_STATUS_IMPORT_ENABLED/);
  await pg.query('RESET ROLE');
  const run = await runBackfill({ db: pg, execute: true, batchSize: 1, env: { MEMBER_STATUS_IMPORT_ENABLED: 'true' } });
  assert.deepEqual([run.mode, run.processed, run.keyed], ['execute', 3, 2], 'the invalid MBI gets no key');
  await pg.query('RESET ROLE');
  assert.equal(await keys(), 2);
  const rows = (await pg.query("SELECT to_jsonb(t)::text r FROM admin_action_log t WHERE action='mbi_key_backfill'")).rows;
  assert.equal(rows.length > 0, true);
  assert.ok(rows.every(r => !SYNTHETIC.some(m => r.r.includes(m))));
  assert.ok(!JSON.stringify(run).match(/[0-9][A-Z]{2}[0-9]/), 'counts only');
});
