// Stand-in for ./pingS7Db.js, loaded only by the S10 re-run of the S7 screener
// suites through screenerHarness.js (pingParityS10.test.js). Same exports;
// createS7Db also applies 184 to 187 and 190.
import { createS7Db as createS7Only } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './pingS7Db.js';

export async function createS7Db(options) {
  const db = await applyS10(await applyS9(await applyS8(await createS7Only(options))));
  process.stderr.write('ping-s7-suite-s10-migrations-applied\n');
  return db;
}
