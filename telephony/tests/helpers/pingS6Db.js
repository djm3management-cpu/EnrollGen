// PGlite harness for session S6: the S5 database plus migrations 181 and 182
// and minimal stand-ins for the tables RTS and county eligibility read (029 and
// 030 carrier_rts, 054 cms_plans_py2027, 151 tenant_agents.licensed_states,
// 000 enrolled_agents.licensed_states). Synthetic identities only.
import { migration } from './pingDb.js';
import { createS5Db } from './pingS5Db.js';

export const MIGRATIONS_S6 = ['181_ping_eligibility_sources.sql', '182_ping_rts_county_eligibility.sql'];
export const S6_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true, PING_SCORECARD_ENABLED: true });

// Only the columns 181 and 182 read, with the production names.
const ELIGIBILITY_STANDINS = `
  CREATE TABLE IF NOT EXISTS carrier_rts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    channel text NOT NULL DEFAULT 'Imported',carrier text NOT NULL,product_line text NOT NULL,agent_name text NOT NULL,
    agent_id uuid,status text DEFAULT '',state_appointments jsonb NOT NULL DEFAULT '[]',
    certifications jsonb NOT NULL DEFAULT '[]',effective_date date,termination_date date);
  CREATE TABLE IF NOT EXISTS cms_plans_py2027(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_year integer NOT NULL DEFAULT 2027 CHECK (plan_year=2027),category text NOT NULL,state_code text NOT NULL,
    county_fips text NOT NULL,carrier text NOT NULL,contract_plan_segment_id text NOT NULL);
  CREATE TABLE IF NOT EXISTS enrolled_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,clerk_user_id text,
    is_active boolean DEFAULT true);
  ALTER TABLE enrolled_agents ADD COLUMN IF NOT EXISTS licensed_states text[] DEFAULT '{}';
  ALTER TABLE tenant_agents ADD COLUMN IF NOT EXISTS clerk_user_id text,
    ADD COLUMN IF NOT EXISTS licensed_states jsonb NOT NULL DEFAULT '[]';`;

/** Applies 181 and 182 to a database that already has 171 to 180. */
export async function applyS6(db) {
  await db.exec(ELIGIBILITY_STANDINS);
  for (const name of MIGRATIONS_S6) await db.exec(await migration(name));
  return db;
}

export async function createS6Db(options) {
  return applyS6(await createS5Db(options));
}

/** Adds landscape rows: one plan per carrier name in the county. */
export async function addPlans(db, { county, state, carriers, category = 'MA-PD' }) {
  for (const [index, carrier] of carriers.entries()) {
    await db.query(`INSERT INTO cms_plans_py2027(category,state_code,county_fips,carrier,contract_plan_segment_id)
      VALUES($1,$2,$3,$4,$5)`, [category, state, county, carrier, `H${county}_${index}_${category}`]);
  }
}

/** Adds crosswalk rows: [[zip, county, state, res_ratio], ...]. */
export async function addCrosswalk(db, rows) {
  for (const [zip, county, state, ratio] of rows) {
    await db.query('INSERT INTO ping_zip_county_crosswalk(zip,county_fips,state_code,res_ratio) VALUES($1,$2,$3,$4)',
      [zip, county, state, ratio]);
  }
}
