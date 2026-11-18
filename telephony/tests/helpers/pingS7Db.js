// PGlite harness for session S7: the S6 database plus migration 183 (the
// scripted screener). Synthetic identities and synthetic script text only.
import { migration } from './pingDb.js';
import { createS6Db } from './pingS6Db.js';

export const MIGRATIONS_S7 = ['183_ping_screener.sql'];
export const S7_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true, PING_SCORECARD_ENABLED: true, PING_SCREENER_ENABLED: true });

// The default draft script from docs/ping-screener-default-script.md.
export const DEFAULT_SCRIPT = Object.freeze({
  opening: "Thanks for calling. You've reached an automated assistant that connects you with a licensed insurance agent. This call may be recorded.",
  q_medicare: 'Are you on Medicare now, or turning 65 in the next few months? Say yes or no, or press 1 for yes.',
  q_zip: "What's your five-digit ZIP code?",
  q_reason: 'In a few words, what can we help you with today?',
  q_connect: 'Would you like me to connect you with a licensed agent now? Say yes, or press 1.',
  pass_line: 'Great, connecting you now.',
  fail_line: 'Thanks for calling. For questions about your current plan, please call the member services number on your insurance card. Goodbye.',
});

/** Applies 183 to a database that already has 171 to 182. */
export async function applyS7(db) {
  for (const name of MIGRATIONS_S7) await db.exec(await migration(name));
  return db;
}

export async function createS7Db(options) {
  return applyS7(await createS6Db(options));
}

/** Inserts a draft script (version n) for a campaign and returns its id. */
export async function addScript(db, { tenant, campaign, version = 1, disclaimer = null, ...overrides }) {
  const script = { ...DEFAULT_SCRIPT, ...overrides };
  const { rows: [row] } = await db.query(`INSERT INTO screener_scripts(tenant_id,campaign_id,version,opening,q_medicare,
    q_zip,q_reason,q_connect,pass_line,fail_line,disclaimer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
  [tenant, campaign, version, script.opening, script.q_medicare, script.q_zip, script.q_reason, script.q_connect,
    script.pass_line, script.fail_line, disclaimer]);
  return row.id;
}
