// Stand-in for ./pingS4Db.js, loaded only by the S9 re-run of the S4 suites
// (pingParityS9.test.js). Same exports; createS4Db also applies 179 to 187.
import { createS4Db as createS4Only } from './pingS4Db.js';
import { applyS5 } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';

export * from './pingS4Db.js';

export async function createS4Db(options) {
  const db = await applyS9(await applyS8(await applyS7(await applyS6(await applyS5(await createS4Only(options))))));
  process.stderr.write('ping-s4-suite-s9-migrations-applied\n');
  return db;
}
