// Stand-in for ./pingDb.js, loaded only by the S9 parity re-run
// (pingParityS9.test.js). Same exports; createPingDb also applies 173 to 187.
import { createPingDb as createS1Db } from './pingDb.js';
import { applyS2 } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';

export * from './pingDb.js';

export async function createPingDb(options) {
  const db = await applyS9(await applyS8(await applyS7(await applyS6(await applyS5(await applyS4(await applyS3(
    await applyS2(await createS1Db(options)), { pepper: FIXTURE_PEPPER })))))));
  const { rows: [row] } = await db.query(`SELECT to_regprocedure('public.lead_post_accept(text,uuid,jsonb)') IS NOT NULL
    AND to_regprocedure('public.ping_decide_signals(text,text,jsonb,text,jsonb)') IS NOT NULL AS ok`);
  if (!row.ok) throw new Error('S9 migrations missing');
  process.stderr.write('ping-parity-s9-migrations-applied\n');
  return db;
}
