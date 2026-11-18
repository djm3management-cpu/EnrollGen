// Stand-in for ./pingS6Db.js, loaded only by the S7 re-run of the S6 suites
// (pingParityS7.test.js). Same exports; createS6Db also applies 183.
import { createS6Db as createS6Only } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';

export * from './pingS6Db.js';

export async function createS6Db(options) {
  const db = await applyS7(await createS6Only(options));
  process.stderr.write('ping-s6-suite-s7-migrations-applied\n');
  return db;
}
