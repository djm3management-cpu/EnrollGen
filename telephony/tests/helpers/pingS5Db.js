// PGlite harness for session S5: the S4 database plus migrations 179 and 180
// and the inbound_calls answer column the scorecard and performance routing
// read (045 answered_agent_id). Synthetic identities only.
import { migration } from './pingDb.js';
import { createS4Db } from './pingS4Db.js';

export const MIGRATIONS_S5 = ['179_ping_scorecard_usage.sql', '180_ping_performance_routing.sql'];
export const S5_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true, PING_SCORECARD_ENABLED: true });

// Only the column 179 and 180 read that the fixture omits, with the production name.
const ANSWER_STANDIN = 'ALTER TABLE inbound_calls ADD COLUMN IF NOT EXISTS answered_agent_id text;';

/** Applies 179 and 180 to a database that already has 171 to 178. */
export async function applyS5(db) {
  await db.exec(ANSWER_STANDIN);
  for (const name of MIGRATIONS_S5) await db.exec(await migration(name));
  return db;
}

export async function createS5Db(options) {
  return applyS5(await createS4Db(options));
}

/**
 * Records what happened after a claimed arrival: the inbound_calls row in the
 * claiming tenant (answered by `agent` when set) with an optional call record,
 * and the billing duration. seconds null leaves billing unfinalized.
 */
export async function completeCall(db, { tenant, sid, phone = null, agent = null, seconds = null, app = false,
  outcome = null, test = false }) {
  let record = null;
  if (app || outcome) {
    record = (await db.query(`INSERT INTO call_records(tenant_id,app_written,call_outcome,is_test_enrollment)
      VALUES($1,$2,$3,$4) RETURNING id`, [tenant, app, outcome, test])).rows[0].id;
  }
  await db.query(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,source_kind,answered_agent_id,call_record_id)
    VALUES($1,$2,$3,'publisher',$4,$5)`, [tenant, sid, phone, agent, record]);
  if (seconds != null) {
    await db.query(`UPDATE ping_call_billing SET arrived_at=clock_timestamp()-make_interval(secs=>$2),
      ended_at=clock_timestamp(),billable_seconds=$2,finalized_at=clock_timestamp() WHERE parent_call_sid=$1`, [sid, seconds]);
  }
  return record;
}
