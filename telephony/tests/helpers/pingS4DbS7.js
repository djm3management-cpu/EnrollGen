// Stand-in for ./pingS4Db.js, loaded only by the S7 re-run of the S4 suites
// (pingParityS7.test.js). Same exports; createS4Db also applies 179 to 183.
import { createS4Db as createS4Only } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';

export * from './pingS4Db.js';

export async function createS4Db(options) {
  const db = await applyS7(await applyS6(await applyS5(await createS4Only(options))));
  process.stderr.write('ping-s4-suite-s7-migrations-applied\n');
  return db;
}
