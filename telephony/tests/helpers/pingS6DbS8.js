// Stand-in for ./pingS6Db.js, loaded only by the S8 re-run of the S6 suites
// (pingParityS8.test.js). Same exports; createS6Db also applies 183 and 184.
import { createS6Db as createS6Only } from './pingS6Db.js';
import { applyS7 } from './pingS7Db.js';
import { applyS8 } from './pingS8Db.js';

export * from './pingS6Db.js';

export async function createS6Db(options) {
  const db = await applyS8(await applyS7(await createS6Only(options)));
  process.stderr.write('ping-s6-suite-s8-migrations-applied\n');
  return db;
}
