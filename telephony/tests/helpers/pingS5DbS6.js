// Stand-in for ./pingS5Db.js, loaded only by the S6 re-run of the S5 suites
// (pingParityS6.test.js). Same exports; createS5Db also applies 181 and 182.
import { createS5Db as createS5Only } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';

export * from './pingS5Db.js';

export async function createS5Db(options) {
  const db = await applyS6(await createS5Only(options));
  process.stderr.write('ping-s5-suite-s6-migrations-applied\n');
  return db;
}
