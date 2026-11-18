// Stand-in for ./pingDb.js, loaded only by the S3 parity re-run
// (pingParityS3.test.js). Same exports; createPingDb also applies 173 to 176.
import { createPingDb as createS1Db } from './pingDb.js';
import { applyS2 } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';

export * from './pingDb.js';

export async function createPingDb(options) {
  const db = await applyS3(await applyS2(await createS1Db(options)), { pepper: FIXTURE_PEPPER });
  const { rows: [row] } = await db.query(`SELECT to_regprocedure('public.ping_decide_campaign(uuid,uuid,jsonb,text)') IS NOT NULL
    AND to_regprocedure('public.exchange_ping(text,jsonb)') IS NOT NULL AS ok`);
  if (!row.ok) throw new Error('S3 migrations missing');
  process.stderr.write('ping-parity-s3-migrations-applied\n');
  return db;
}
