// Stand-in for ./pingDb.js, loaded only by the S2 parity re-run
// (pingParityS2.test.js). Same exports; createPingDb also applies 173 and 174.
import { createPingDb as createS1Db } from './pingDb.js';
import { applyS2 } from './pingS2Db.js';

export * from './pingDb.js';

export async function createPingDb(options) {
  const db = await applyS2(await createS1Db(options));
  const { rows: [row] } = await db.query(`SELECT to_regclass('public.ping_source_controls') IS NOT NULL
    AND to_regprocedure('public.ping_claim_arrival(text,text,text,text,text[],text,timestamptz)') IS NOT NULL AS ok`);
  if (!row.ok) throw new Error('S2 migrations missing');
  process.stderr.write('ping-parity-s2-migrations-applied\n');
  return db;
}
