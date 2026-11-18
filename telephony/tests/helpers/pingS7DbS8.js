// Stand-in for ./pingS7Db.js, loaded only by the S8 re-run of the S7 screener
// suites through screenerHarness.js (pingParityS8.test.js). Same exports;
// createS7Db also applies 184.
import { createS7Db as createS7Only } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';

export * from './pingS7Db.js';

export async function createS7Db(options) {
  const db = await applyS8(await createS7Only(options));
  process.stderr.write('ping-s7-suite-s8-migrations-applied\n');
  return db;
}
