// Stand-in for ./pingS8Db.js, loaded only by the S10 re-run of the S8a suites
// (sandbox, lock narrowing, buyer API, load baseline) in pingParityS10.test.js.
// Same exports; createS8Db also applies 185 to 187 and 190.
import { createS8Db as createS8Only } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';
import { applyS10 } from './pingS10Db.js';

export * from './pingS8Db.js';

export async function createS8Db(options) {
  const db = await applyS10(await applyS9(await createS8Only(options)));
  process.stderr.write('ping-s8-suite-s10-migrations-applied\n');
  return db;
}
