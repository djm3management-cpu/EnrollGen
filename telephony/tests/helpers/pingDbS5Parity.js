// Stand-in for ./pingDb.js, loaded only by the S5 parity re-run
// (pingParityS5.test.js). Same exports; createPingDb also applies 173 to 180.
import { createPingDb as createS1Db } from './pingDb.js';
import { applyS2 } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';

export * from './pingDb.js';

export async function createPingDb(options) {
  const db = await applyS5(await applyS4(await applyS3(await applyS2(await createS1Db(options)), { pepper: FIXTURE_PEPPER })));
  const { rows: [row] } = await db.query(`SELECT to_regprocedure('public.refresh_agent_performance(uuid)') IS NOT NULL
    AND to_regprocedure('public.ping_scorecard(uuid,timestamptz,timestamptz,text[])') IS NOT NULL AS ok`);
  if (!row.ok) throw new Error('S5 migrations missing');
  process.stderr.write('ping-parity-s5-migrations-applied\n');
  return db;
}
