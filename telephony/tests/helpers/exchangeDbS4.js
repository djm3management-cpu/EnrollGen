// Stand-in for ./exchangeDb.js, loaded only by the S4 re-run of the S3 suites
// (pingParityS4.test.js). Same exports; createS3Db also applies 177 and 178.
import { createS3Db as createS3Only } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';

export * from './exchangeDb.js';

export async function createS3Db(options) {
  const db = await applyS4(await createS3Only(options));
  process.stderr.write('ping-s3-suite-s4-migrations-applied\n');
  return db;
}
