// PGlite harness for session S4: the S3 database plus migrations 177 and 178
// and minimal stand-ins for the CRM tables rule 8 reads (017 contacts, 058 and
// 062 opportunities, enrolled_agents, call_records sale columns). Synthetic
// identities only.
import { migration } from './pingDb.js';
import { createS3Db } from './exchangeDb.js';

export const MIGRATIONS_S4 = ['177_ping_filter_rules.sql', '178_ping_filter_decide.sql'];
export const S4_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true });

// Only the columns ping_existing_client reads, with the production names.
const CRM_STANDINS = `
  CREATE TABLE IF NOT EXISTS contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    phone text,assigned_agent_id text,created_at timestamptz NOT NULL DEFAULT now());
  CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone ON contacts(tenant_id,phone) WHERE phone IS NOT NULL;
  CREATE TABLE IF NOT EXISTS enrolled_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,clerk_user_id text,
    is_active boolean DEFAULT true);
  CREATE TABLE IF NOT EXISTS opportunities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,assigned_agent_id uuid,status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
    stage_entered_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
  ALTER TABLE tenant_agents ADD COLUMN IF NOT EXISTS clerk_user_id text;
  ALTER TABLE call_records ADD COLUMN IF NOT EXISTS agent_id uuid,ADD COLUMN IF NOT EXISTS call_start timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS is_test_enrollment boolean;`;

/** Applies 177 and 178 to a database that already has 171 to 176. */
export async function applyS4(db) {
  await db.exec(CRM_STANDINS);
  for (const name of MIGRATIONS_S4) await db.exec(await migration(name));
  return db;
}

export async function createS4Db(options) {
  return applyS4(await createS3Db(options));
}

/**
 * Makes phone an existing client of tenant: a contact with a sale. sale is
 * 'call' (an enrolled call record by ownerSlug), 'opportunity' (a won
 * opportunity assigned to ownerSlug) or 'none' (a contact only). sticky sets
 * contacts.assigned_agent_id. Returns the contact id.
 */
export async function makeClient(db, { tenant, phone, sale = 'call', ownerSlug = null, sticky = null,
  outcome = 'enrolled', status = 'won', deleted = false, at = null }) {
  const { rows: [contact] } = await db.query(`INSERT INTO contacts(tenant_id,phone,assigned_agent_id)
    VALUES($1,$2,$3) ON CONFLICT (tenant_id,phone) WHERE phone IS NOT NULL DO UPDATE SET assigned_agent_id=EXCLUDED.assigned_agent_id
    RETURNING id`, [tenant, phone, sticky]);
  const agent = ownerSlug ? (await db.query('SELECT id FROM tenant_agents WHERE tenant_id=$1 AND agent_slug=$2',
    [tenant, ownerSlug])).rows[0] : null;
  if (sale === 'call') {
    let enrolled = null;
    if (agent) {
      const clerk = `clerk_${ownerSlug}`;
      await db.query('UPDATE tenant_agents SET clerk_user_id=$2 WHERE id=$1', [agent.id, clerk]);
      enrolled = (await db.query('INSERT INTO enrolled_agents(tenant_id,clerk_user_id) VALUES($1,$2) RETURNING id',
        [tenant, clerk])).rows[0].id;
    }
    await db.query(`INSERT INTO call_records(tenant_id,contact_id,call_outcome,agent_id,call_start)
      VALUES($1,$2,$3,$4,coalesce($5::timestamptz,now()))`, [tenant, contact.id, outcome, enrolled, at]);
  } else if (sale === 'opportunity') {
    await db.query(`INSERT INTO opportunities(tenant_id,contact_id,assigned_agent_id,status,stage_entered_at,deleted_at)
      VALUES($1,$2,$3,$4,coalesce($5::timestamptz,now()),CASE WHEN $6 THEN now() END)`,
    [tenant, contact.id, agent?.id ?? null, status, at, deleted]);
  }
  return contact.id;
}
