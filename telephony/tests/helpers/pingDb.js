// PGlite harness for the ping platform: the Paragon schema as of migration 067
// (the live paragon_ping) plus migrations 171 and 172. Synthetic identities only.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const tenant = '0e000000-0000-4000-8000-0000000000a1';
export const source = '0e000000-0000-4000-8000-0000000000b1';
export const hash = 'b'.repeat(64);
export const AGENTS = ['agent_a', 'agent_b', 'agent_c'];
export const FULL = ['aetna', 'humana', 'uhc', 'wellcare', 'devoted', 'healthspring'];
const OPEN_DAY = { enabled: true, start: '00:00', end: '23:59' };
export const OPEN_HOURS = { timezone: 'America/New_York', days: Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => [day, OPEN_DAY])) };

export const migration = name => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const fixture = name => readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url), 'utf8');

// The real fail-closed switch from migration 150, without its unrelated fences.
async function featureSwitch() {
  const sql = await migration('150_deployment_feature_switches.sql');
  const start = sql.indexOf('CREATE FUNCTION public.deployment_feature_enabled');
  const end = sql.indexOf('END $$;', start) + 'END $$;'.length;
  if (start < 0 || end < start) throw Error('deployment_feature_enabled not found in 150');
  return sql.slice(start, end);
}

/** Sets service-role claims and the server feature header for later statements. */
export async function setFeatures(db, features = { PING_PLATFORM_ENABLED: true }) {
  await db.query(`SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)`,
    [JSON.stringify({ role: 'service_role' }), JSON.stringify({ 'x-enrollgen-features': JSON.stringify(features) })]);
}

/**
 * Builds the database. Eligibility (by slug and state): agent_a full in AR/KS,
 * agent_b partial in AR/KS (no aetna), agent_c AR only without uhc (critical).
 */
export async function createPingDb({ paragon = true, eligibility = true } = {}) {
  const db = new PGlite();
  await db.exec(await fixture('paragon-billing-schema.sql'));
  await db.exec(`ALTER TABLE inbound_calls ADD routed_agent_id text,ADD return_reason text;
    ALTER TABLE call_records ADD contact_id uuid;`);
  await db.query('INSERT INTO tenants VALUES($1)', [tenant]);
  if (paragon) await db.query(`INSERT INTO lead_sources VALUES($1,$2,'Paragon Media','publisher',true,$3)`, [source, tenant, hash]);
  await db.query('INSERT INTO vendor_controls(tenant_id,vendor_pause,staffed_hours) VALUES($1,false,$2)', [tenant, OPEN_HOURS]);
  for (const [index, slug] of AGENTS.entries()) {
    await db.query(`INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,$2,$3,$4,true)`,
      [tenant, `Synthetic ${slug}`, String(91000001 + index), slug]);
    await db.query(`INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES($1,$2,'available',true)`, [slug, slug]);
  }
  for (const name of ['051_paragon_vendor_matrix.sql', '052_paragon_ping_and_claim.sql', '053_paragon_zip_and_reports.sql',
    '055_paragon_vendor_report.sql', '056_resolve_recent_paragon_ping.sql', '057_paragon_vendor_report_proof.sql',
    '067_paragon_billing_hours.sql']) await db.exec(await migration(name));
  // 067 seeds production hours for the production tenant only; keep ours open.
  await db.query('UPDATE vendor_controls SET staffed_hours=$2 WHERE tenant_id=$1', [tenant, OPEN_HOURS]);
  if (paragon && eligibility) {
    const row = async (slug, state, carriers) => db.query(`INSERT INTO vendor_agent_state_eligibility
      (source_id,plan_year,agent_id,state,aetna,humana,uhc,wellcare,devoted,healthspring,updated_by)
      SELECT $1,2027,id,$3,$4,$5,$6,$7,$8,$9,'test' FROM tenant_agents WHERE agent_slug=$2`,
      [source, slug, state, ...FULL.map(carrier => carriers.includes(carrier))]);
    for (const state of ['AR', 'KS']) {
      await row('agent_a', state, FULL);
      await row('agent_b', state, FULL.filter(carrier => carrier !== 'aetna'));
    }
    await row('agent_c', 'AR', FULL.filter(carrier => carrier !== 'uhc'));
  }
  await db.exec(await featureSwitch());
  // Stand-in for the operator profile routine 171 extends (161, 168, 170).
  await db.exec(`CREATE FUNCTION public.configure_operational_profile(p_summary jsonb) RETURNS void
    LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM jsonb_each(p_summary) WHERE key NOT IN ('feature_conference_calling_enabled'))
      THEN RAISE EXCEPTION 'unknown key'; END IF;
    END $$;`);
  await db.exec(await migration('171_ping_platform_foundation.sql'));
  await db.exec(await migration('172_ping_decide.sql'));
  return db;
}

/** Rebuilds the generic campaign and carrier rows from the legacy tables, like the 172 seed. */
export async function syncGenericConfig(db, engineMode = 'generic') {
  await db.exec(`DELETE FROM ping_campaigns WHERE source_id NOT IN (SELECT source_id FROM vendor_routing_config);`);
  await db.query(`UPDATE ping_campaigns p SET allowed_states=c.allowed_states,required_carriers=c.required_carriers,
    critical_carriers=c.critical_carriers,plan_year=c.plan_year,reservation_ttl_seconds=c.reservation_ttl_seconds,engine_mode=$1
    FROM vendor_routing_config c WHERE c.source_id=p.source_id`, [engineMode]);
  await db.exec(`DELETE FROM agent_campaign_carriers;
    INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,enabled,updated_by)
    SELECT p.tenant_id,p.id,e.plan_year,e.agent_id,e.state,v.carrier,true,'test'
    FROM ping_campaigns p JOIN vendor_agent_state_eligibility e ON e.source_id=p.source_id
    CROSS JOIN LATERAL (VALUES ('aetna',e.aetna),('humana',e.humana),('uhc',e.uhc),
      ('wellcare',e.wellcare),('devoted',e.devoted),('healthspring',e.healthspring)) v(carrier,enabled)
    WHERE v.enabled;`);
}

export const paragonPing = async (db, { state, phone = null, callId = null, routing = true }) => (await db.query(
  'SELECT paragon_ping($1,$2,$3,$4,$5) AS d', [hash, state, phone, callId, routing])).rows[0].d;

export const pingDecide = async (db, { state, phone = null, callId = null, routing = true, engine = 'generic',
  campaign = null, extra = {}, key = hash }) => (await db.query('SELECT ping_decide($1,$2,$3,$4) AS d',
  [key, campaign, { phone, state, call_id: callId, routing_enabled: routing, ...extra }, engine])).rows[0].d;
