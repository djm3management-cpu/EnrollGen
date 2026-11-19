// Stand-in for ./pingS6Db.js, loaded only by the S10 re-run of the S6 suites
// (pingParityS10.test.js). Same exports; createS6Db also applies 183 to 187 and 190.
import { createS6Db as createS6Only } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './pingS6Db.js';

export async function createS6Db(options) {
  const db = await applyS10(await applyS9(await applyS8(await applyS7(await createS6Only(options)))));
  process.stderr.write('ping-s6-suite-s10-migrations-applied\n');
  return db;
}
