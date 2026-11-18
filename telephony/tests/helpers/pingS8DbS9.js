// Stand-in for ./pingS8Db.js, loaded only by the S9 re-run of the S8a suites
// (sandbox, lock narrowing, buyer API, load baseline) in pingParityS9.test.js.
// Same exports; createS8Db also applies 185 to 187.
import { createS8Db as createS8Only } from './pingS8Db.js';
import { applyS9 } from './pingS9Db.js';

export * from './pingS8Db.js';

export async function createS8Db(options) {
  const db = await applyS9(await createS8Only(options));
  process.stderr.write('ping-s8-suite-s9-migrations-applied\n');
  return db;
}
