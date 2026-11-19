// Stand-in for ./pingS9Db.js, loaded only by the S10 re-run of the S9 lead and
// data vendor suites (pingParityS10.test.js). Same exports; createS9Db also
// applies 190.
import { createS9Db as createS9Only } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './pingS9Db.js';

export async function createS9Db(options) {
  const db = await applyS10(await createS9Only(options));
  process.stderr.write('ping-s9-suite-s10-migrations-applied\n');
  return db;
}
