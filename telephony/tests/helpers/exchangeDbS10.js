// Stand-in for ./exchangeDb.js, loaded only by the S10 re-run of the S3 suites
// (pingParityS10.test.js). Same exports; createS3Db also applies 177 to 187 and 190.
import { createS3Db as createS3Only } from './exchangeDb.js';
import { applyS4 } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './exchangeDb.js';

export async function createS3Db(options) {
  const db = await applyS10(await applyS9(await applyS8(await applyS7(await applyS6(await applyS5(await applyS4(await createS3Only(options))))))));
  process.stderr.write('ping-s3-suite-s10-migrations-applied\n');
  return db;
}
