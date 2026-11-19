// PGlite harness for the Gold Standards attestation gate: the S9 database plus
// migration 190 (publisher attestations and source_attestation_missing). The
// other Gold Standards migrations (188, 189) need the CRM schema and run in the
// root suite against the complete fresh install.
import { migration } from './pingDb.js';
import { createS9Db, S9_FEATURES } from './pingS9Db.js';

export const MIGRATIONS_S10 = ['190_ping_source_attestations.sql'];
export const S10_FEATURES = Object.freeze({ ...S9_FEATURES, SOURCE_ATTESTATIONS_ENABLED: true });

/** Applies 190 to a database that already has 171 to 187. */
export async function applyS10(db) {
  for (const name of MIGRATIONS_S10) await db.exec(await migration(name));
  return db;
}

export async function createS10Db(options) {
  return applyS10(await createS9Db(options));
}
