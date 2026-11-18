// Stand-in for ./pingS2Db.js, loaded only by the S3 re-run of the S2 suites
// (pingParityS3.test.js). Same exports; createS2Db also applies 175 and 176.
import { createS2Db as createS2Only } from './pingS2Db.js';
import { applyS3, FIXTURE_PEPPER } from './exchangeDb.js';

export * from './pingS2Db.js';

export async function createS2Db(options) {
  const db = await applyS3(await createS2Only(options), { pepper: FIXTURE_PEPPER });
  process.stderr.write('ping-s2-suite-s3-migrations-applied\n');
  return db;
}
