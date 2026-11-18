// Stand-in for ./pingS2Db.js, loaded only by the S7 re-run of the S2 suites
// (pingParityS7.test.js). Same exports; createS2Db also applies 175 to 183.
import { createS2Db as createS2Only } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';

export * from './pingS2Db.js';

export async function createS2Db(options) {
  const db = await applyS7(await applyS6(await applyS5(await applyS4(await applyS3(await createS2Only(options),
    { pepper: FIXTURE_PEPPER })))));
  process.stderr.write('ping-s2-suite-s7-migrations-applied\n');
  return db;
}
