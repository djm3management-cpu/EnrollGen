// Stand-in for ./pingDb.js, loaded only by the S4 parity re-run
// (pingParityS4.test.js). Same exports; createPingDb also applies 173 to 178.
import { createPingDb as createS1Db } from './pingDb.js';
import { applyS2 } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';

export * from './pingDb.js';

export async function createPingDb(options) {
  const db = await applyS4(await applyS3(await applyS2(await createS1Db(options)), { pepper: FIXTURE_PEPPER }));
  const { rows: [row] } = await db.query(`SELECT to_regprocedure('public.shopper_history_count(text,integer)') IS NOT NULL
    AND to_regclass('public.ping_retention_alerts') IS NOT NULL AS ok`);
  if (!row.ok) throw new Error('S4 migrations missing');
  process.stderr.write('ping-parity-s4-migrations-applied\n');
  return db;
}
