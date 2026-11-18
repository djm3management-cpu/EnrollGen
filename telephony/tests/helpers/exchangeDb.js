// PGlite harness for session S3: the S2 database plus migrations 175 and 176,
// a Vault stand-in holding a fixture pepper, one operator tenant owning an
// exchange publisher and three buyer tenants in Eastern, Central and Pacific
// time. Synthetic identities only.
import { createHash } from 'node:crypto';
import { migration } from './pingDb.js';
import { createS2Db } from './pingS2Db.js';

export const MIGRATIONS_S3 = ['175_ping_exchange_foundation.sql', '176_exchange_ping.sql'];
export const FIXTURE_PEPPER = 'fixture-pepper-for-tests-only-0123456789abcdef';
export const EXCHANGE_FEATURES = Object.freeze({ PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true });

// Same stand-in shape as tests/helpers/freshInstall.js; tests only.
const VAULT_STANDIN = `CREATE SCHEMA IF NOT EXISTS vault;
  CREATE TABLE IF NOT EXISTS vault.decrypted_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decrypted_secret text);
  CREATE OR REPLACE FUNCTION vault.create_secret(secret text,name text,description text) RETURNS uuid
  LANGUAGE plpgsql AS $$DECLARE i uuid; BEGIN INSERT INTO vault.decrypted_secrets(decrypted_secret) VALUES(secret) RETURNING id INTO i; RETURN i; END$$;`;

/** Applies 175 and 176 to an S2 database. The pepper is provisioned only when asked. */
export async function applyS3(db, { pepper = null } = {}) {
  await db.exec(VAULT_STANDIN);
  for (const name of MIGRATIONS_S3) await db.exec(await migration(name));
  // Fixture provisioning without touching the session's feature switches.
  if (pepper) await db.query(`INSERT INTO ping_platform_secrets(name,vault_secret_id)
    VALUES('phone_pepper',vault.create_secret($1,'ping_phone_pepper','fixture'))`, [pepper]);
  return db;
}

export async function createS3Db(options) {
  return applyS3(await createS2Db(options), { pepper: FIXTURE_PEPPER });
}


/** The peppered hash the database stores for a loser's phone. */
export const fixturePhoneHash = phone => createHash('sha256').update(`${FIXTURE_PEPPER}${phone}`).digest('hex');

export const OP = Object.freeze({
  tenant: '0e000000-0000-4000-8000-0000000000a9',
  source: '0e000000-0000-4000-8000-0000000000b9',
  hash: 'e'.repeat(64),
});

const allWeek = (timezone, start = '00:00', end = '23:59') => ({ timezone, days: Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => [day, { enabled: true, start, end }])) });
export { allWeek };

// Buyers by key. Each has its own tenant, intake source, hours, agent,
// carrier rows, transfer number, rate and price plan.
export const BUYERS = Object.freeze({
  east: { tenant: '0e000000-0000-4000-8000-0000000000c1', source: '0e000000-0000-4000-8000-0000000000d1',
    zone: 'America/New_York', agent: 'agent_east', transfer: '+15005550201', rate: 30, priority: 1, weight: 1,
    plan: { included: 2, overage: 0.05, routed: 1.5 } },
  central: { tenant: '0e000000-0000-4000-8000-0000000000c2', source: '0e000000-0000-4000-8000-0000000000d2',
    zone: 'America/Chicago', agent: 'agent_central', transfer: '+15005550202', rate: 40, priority: 2, weight: 2,
    plan: { included: 100, overage: 0.04, routed: 2 } },
  pacific: { tenant: '0e000000-0000-4000-8000-0000000000c3', source: '0e000000-0000-4000-8000-0000000000d3',
    zone: 'America/Los_Angeles', agent: 'agent_pacific', transfer: '+15005550203', rate: 50, priority: 3, weight: 1,
    plan: { included: 100, overage: 0.03, routed: 2.5 } },
});

/**
 * Seeds the operator publisher (an active exchange source, priority_waterfall)
 * and the three buyers with one generic campaign each, allowed in TX and FL,
 * aetna required, routed from the publisher. Returns campaign ids by buyer key.
 */
export async function seedExchange(db) {
  await db.query('INSERT INTO tenants VALUES($1)', [OP.tenant]);
  await db.query(`INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash)
    VALUES($1,$2,'Exchange Publisher','publisher',true,$3)`, [OP.source, OP.tenant, OP.hash]);
  await db.query(`INSERT INTO exchange_sources(source_id,strategy) VALUES($1,'priority_waterfall')`, [OP.source]);
  const campaigns = {};
  for (const [key, buyer] of Object.entries(BUYERS)) {
    await db.query('INSERT INTO tenants VALUES($1)', [buyer.tenant]);
    await db.query(`INSERT INTO lead_sources(id,tenant_id,name,type,active) VALUES($1,$2,$3,'direct',true)`,
      [buyer.source, buyer.tenant, `Buyer ${key} intake`]);
    await db.query('INSERT INTO vendor_controls(tenant_id,vendor_pause,staffed_hours) VALUES($1,false,$2)',
      [buyer.tenant, allWeek(buyer.zone)]);
    await db.query(`INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,$2,$3,$4,true)`,
      [buyer.tenant, `Synthetic ${buyer.agent}`, String(93000001 + Object.keys(campaigns).length), buyer.agent]);
    await db.query(`INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES($1,$1,'available',true)`, [buyer.agent]);
    const { rows: [row] } = await db.query(`INSERT INTO ping_campaigns(tenant_id,source_id,name,product_line,engine_mode,
      allowed_states,required_carriers,critical_carriers,plan_year,pricing_model,rate,billable_seconds,reservation_ttl_seconds,transfer_number)
      VALUES($1,$2,$3,'ma','generic','{TX,FL}','{aetna}','{}',2027,'per_call',$4,90,30,$5) RETURNING id`,
    [buyer.tenant, buyer.source, `exchange-${key}`, buyer.rate, buyer.transfer]);
    campaigns[key] = row.id;
    await db.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
      SELECT $1,$2,2027,a.id,s.state,'aetna','test' FROM tenant_agents a CROSS JOIN unnest('{TX,FL}'::text[]) s(state)
      WHERE a.tenant_id=$1`, [buyer.tenant, row.id]);
    await db.query(`INSERT INTO exchange_routes(source_id,campaign_id,priority,weight) VALUES($1,$2,$3,$4)`,
      [OP.source, row.id, buyer.priority, buyer.weight]);
    await db.query(`INSERT INTO platform_price_plans(tenant_id,included_pings,overage_per_ping,per_routed_call,per_screener_minute,effective_at)
      VALUES($1,$2,$3,$4,0,now()-interval '1 day')`, [buyer.tenant, buyer.plan.included, buyer.plan.overage, buyer.plan.routed]);
  }
  return campaigns;
}

export const exchangePing = async (db, { phone = '+15550007000', state = 'TX', callId = null, routing = true,
  extra = {}, key = OP.hash } = {}) => (await db.query('SELECT exchange_ping($1,$2) AS r',
  [key, { phone, state, call_id: callId, routing_enabled: routing, ...extra }])).rows[0].r;
