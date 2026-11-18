// Stand-in for ./pingS4Db.js, loaded only by the S5 re-run of the S4 suites
// (pingParityS5.test.js). Same exports; createS4Db also applies 179 and 180.
import { createS4Db as createS4Only } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';

export * from './pingS4Db.js';

export async function createS4Db(options) {
  const db = await applyS5(await createS4Only(options));
  process.stderr.write('ping-s4-suite-s5-migrations-applied\n');
  return db;
}
