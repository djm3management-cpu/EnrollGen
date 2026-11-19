// Stand-in for ./pingS5Db.js, loaded only by the S10 re-run of the S5 suites
// (pingParityS10.test.js). Same exports; createS5Db also applies 181 to 187 and 190.
import { createS5Db as createS5Only } from './pingS5Db.js';
import { applyS6 } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './pingS5Db.js';

export async function createS5Db(options) {
  const db = await applyS10(await applyS9(await applyS8(await applyS7(await applyS6(await createS5Only(options))))));
  process.stderr.write('ping-s5-suite-s10-migrations-applied\n');
  return db;
}
