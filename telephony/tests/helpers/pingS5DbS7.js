// Stand-in for ./pingS5Db.js, loaded only by the S7 re-run of the S5 suites
// (pingParityS7.test.js). Same exports; createS5Db also applies 181 to 183.
import { createS5Db as createS5Only } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';

export * from './pingS5Db.js';

export async function createS5Db(options) {
  const db = await applyS7(await applyS6(await createS5Only(options)));
  process.stderr.write('ping-s5-suite-s7-migrations-applied\n');
  return db;
}
