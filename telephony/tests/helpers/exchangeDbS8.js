// Stand-in for ./exchangeDb.js, loaded only by the S8 re-run of the S3 suites
// (pingParityS8.test.js). Same exports; createS3Db also applies 177 to 184.
import { createS3Db as createS3Only } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';

export * from './exchangeDb.js';

export async function createS3Db(options) {
  const db = await applyS8(await applyS7(await applyS6(await applyS5(await applyS4(await createS3Only(options))))));
  process.stderr.write('ping-s3-suite-s8-migrations-applied\n');
  return db;
}
