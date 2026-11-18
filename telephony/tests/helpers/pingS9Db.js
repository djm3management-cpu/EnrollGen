// PGlite harness for session S9: the S8a database plus migrations 185 to 187
// (lead ping-post and the consumer data vendor slot) and minimal stand-ins for
// the CRM objects a lead post writes: the 017 and 044 contact columns, 058
// pipelines, stages and opportunity columns, tenant_agents.role, and
// save_opportunity and ensure_opportunities_pipeline with the 058 signatures
// (the real ones also encrypt the title and log PII access, which needs the
// Vault). Synthetic identities only.
import { migration } from './pingDb.js';
import { createS8Db } from './pingS8Db.js';

export const MIGRATIONS_S9 = ['185_ping_lead_schema.sql', '186_ping_lead_ping_post.sql',
  '187_ping_call_channel_vendor_signals.sql'];
export const S9_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true,
  PING_RETENTION_ALERTS_ENABLED: true, PING_SCORECARD_ENABLED: true, PING_SCREENER_ENABLED: true });

// Only the columns and routines 185 to 187 touch, with the production names.
const CRM_STANDINS = `
  CREATE TABLE IF NOT EXISTS contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    phone text,assigned_agent_id text,created_at timestamptz NOT NULL DEFAULT now());
  CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone ON contacts(tenant_id,phone) WHERE phone IS NOT NULL;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name text,ADD COLUMN IF NOT EXISTS last_name text,
    ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS zip text,ADD COLUMN IF NOT EXISTS state text,
    ADD COLUMN IF NOT EXISTS address text,ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'lead',
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
  ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
    CHECK (source IN ('fmo_transfer','tms','manual','ghl_import','sms_inbound'));
  ALTER TABLE tenant_agents ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'agent';
  CREATE TABLE IF NOT EXISTS pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    name text NOT NULL,line_of_business text,is_default boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS pipeline_stages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,name text NOT NULL,position integer NOT NULL,is_won boolean NOT NULL DEFAULT false,
    is_lost boolean NOT NULL DEFAULT false);
  CREATE TABLE IF NOT EXISTS opportunities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,assigned_agent_id uuid,status text NOT NULL DEFAULT 'open',
    stage_entered_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
  ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pipeline_id uuid,ADD COLUMN IF NOT EXISTS stage_id uuid,
    ADD COLUMN IF NOT EXISTS line_of_business text,ADD COLUMN IF NOT EXISTS lead_source_id uuid,
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  CREATE OR REPLACE FUNCTION public.ensure_opportunities_pipeline(p_tenant_id uuid,p_requesting_agent_id uuid)
  RETURNS uuid LANGUAGE plpgsql AS $$
  DECLARE p uuid;
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM tenant_agents WHERE id=p_requesting_agent_id AND tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'Access denied'; END IF;
    SELECT id INTO p FROM pipelines WHERE tenant_id=p_tenant_id AND is_default;
    IF p IS NULL THEN
      INSERT INTO pipelines(tenant_id,name,is_default) VALUES(p_tenant_id,'Default Pipeline',true) RETURNING id INTO p;
      INSERT INTO pipeline_stages(tenant_id,pipeline_id,name,position,is_won,is_lost) VALUES
        (p_tenant_id,p,'New Lead',0,false,false),(p_tenant_id,p,'Contacted',1,false,false),
        (p_tenant_id,p,'Pending',2,false,false),(p_tenant_id,p,'Enrolled',3,true,false),
        (p_tenant_id,p,'Disenrolled',4,false,true);
    END IF;
    RETURN p;
  END $$;
  CREATE OR REPLACE FUNCTION public.save_opportunity(p_tenant_id uuid,p_requesting_agent_id uuid,p_fields jsonb,
    p_opportunity_id uuid DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql AS $$
  DECLARE o uuid; s pipeline_stages;
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM tenant_agents WHERE id=p_requesting_agent_id AND tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'Access denied'; END IF;
    SELECT * INTO s FROM pipeline_stages WHERE id=(p_fields->>'stage_id')::uuid
      AND pipeline_id=(p_fields->>'pipeline_id')::uuid AND tenant_id=p_tenant_id;
    IF s.id IS NULL THEN RAISE EXCEPTION 'Select a valid pipeline and stage'; END IF;
    IF NOT EXISTS(SELECT 1 FROM contacts WHERE id=(p_fields->>'contact_id')::uuid AND tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'Select a contact in this workspace'; END IF;
    IF nullif(btrim(p_fields->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Enter an opportunity title'; END IF;
    INSERT INTO opportunities(tenant_id,pipeline_id,stage_id,contact_id,assigned_agent_id,line_of_business,lead_source_id,status)
    VALUES(p_tenant_id,s.pipeline_id,s.id,(p_fields->>'contact_id')::uuid,nullif(p_fields->>'assigned_agent_id','')::uuid,
      p_fields->>'line_of_business',nullif(p_fields->>'lead_source_id','')::uuid,'open') RETURNING id INTO o;
    RETURN o;
  END $$;`;

/** Applies 185 to 187 to a database that already has 171 to 184. */
export async function applyS9(db) {
  await db.exec(CRM_STANDINS);
  for (const name of MIGRATIONS_S9) await db.exec(await migration(name));
  return db;
}

export async function createS9Db(options) {
  return applyS9(await createS8Db(options));
}

export const TRUSTEDFORM = `https://cert.trustedform.com/${'a1'.repeat(20)}`;
export const JORNAYA = 'C0FFEE00-1234-4ABC-9DEF-0123456789AB';

/** A valid post body; override fields as needed. Synthetic identities only. */
export const leadPost = (overrides = {}) => ({ first_name: 'Synthetic', last_name: 'Lead', phone: '+15552010001',
  email: 'synthetic.lead@example.test', zip: '66002', state: 'KS', consent_cert_id: TRUSTEDFORM, ...overrides });

/**
 * Adds a channel 'lead' campaign (ma, humana required by default, $12 a lead)
 * with the tenant's agents (or only `agents`) eligible in `states`. Returns its id.
 */
export async function seedLeadCampaign(db, { tenant, source, agents = null, states = ['KS', 'MO'], carriers = ['humana'],
  name = 'web-leads', price = 12, extra = {} }) {
  const columns = { lead_price: price, ...extra };
  const keys = Object.keys(columns);
  const { rows: [row] } = await db.query(`INSERT INTO ping_campaigns(tenant_id,source_id,name,product_line,engine_mode,
    allowed_states,required_carriers,critical_carriers,plan_year,pricing_model,rate,channel${keys.map(key => `,${key}`).join('')})
    VALUES($1,$2,$3,'ma','generic',$4,$5,'{}',2027,'per_call',0,'lead'${keys.map((_, i) => `,$${i + 6}`).join('')}) RETURNING id`,
  [tenant, source, name, states, carriers, ...keys.map(key => columns[key])]);
  await db.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
    SELECT $1,$2,2027,a.id,s.state,c.carrier,'test' FROM tenant_agents a
    CROSS JOIN unnest($3::text[]) s(state) CROSS JOIN unnest($4::text[]) c(carrier)
    WHERE a.tenant_id=$1 AND ($5::text[] IS NULL OR a.agent_slug=ANY($5))`, [tenant, row.id, states, carriers, agents]);
  return row.id;
}

export const leadPing = async (db, { key, campaign = null, payload, signals = null }) => (await db.query(
  'SELECT lead_ping_decide($1,$2,$3,$4) AS r', [key, campaign, payload, signals])).rows[0].r;
export const exchangeLeadPing = async (db, { key, payload, signals = null }) => (await db.query(
  'SELECT exchange_lead_ping($1,$2,$3) AS r', [key, payload, signals])).rows[0].r;
export const leadPostAccept = async (db, { key, id, payload }) => (await db.query(
  'SELECT lead_post_accept($1,$2,$3) AS r', [key, id, payload])).rows[0].r;
