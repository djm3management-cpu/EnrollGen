// PGlite harness for session S8a: the S7 database plus migration 184 (buyer
// API keys and audit, publisher sandbox, lock narrowing). Synthetic
// identities only.
import { migration } from './pingDb.js';
import { createS7Db } from './pingS7Db.js';

export const MIGRATIONS_S8 = ['184_ping_buyer_api_sandbox_locks.sql'];
export const S8_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true, PING_SCORECARD_ENABLED: true, PING_SCREENER_ENABLED: true });

/** Applies 184 to a database that already has 171 to 183. */
export async function applyS8(db) {
  for (const name of MIGRATIONS_S8) await db.exec(await migration(name));
  return db;
}

export async function createS8Db(options) {
  return applyS8(await createS7Db(options));
}
