// PGlite harness for session S2: the S1 database from pingDb.js plus 076
// (duplicate callers), 158 (admit_vendor) and migrations 173 and 174.
// Synthetic identities only.
import { createPingDb, migration } from './pingDb.js';

export const MIGRATIONS_S2 = ['173_ping_publisher_controls.sql', '174_ping_arrival_billing.sql'];

/** Applies the S2 prerequisites and migrations to an S1 database. */
export async function applyS2(db) {
  // Columns the fixture omits but the fresh install has (048, 049).
  await db.exec(`ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS twilio_number text;
    ALTER TABLE inbound_calls ADD COLUMN IF NOT EXISTS duplicate_flag boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS to_number text;`);
  await db.exec(await migration('076_duplicate_callers.sql'));
  await db.exec(await migration('158_admission_limits.sql'));
  // Stand-in for 151's deployment vendor setting.
  await db.exec(`CREATE OR REPLACE FUNCTION public.deployment_vendor_name() RETURNS text
    LANGUAGE sql STABLE AS $$ SELECT 'Paragon Media'::text $$;`);
  for (const name of MIGRATIONS_S2) await db.exec(await migration(name));
  return db;
}

export async function createS2Db(options) {
  return applyS2(await createPingDb(options));
}

// A second publisher in a Central time tenant, fully separate from Paragon.
export const B = Object.freeze({
  tenant: '0e000000-0000-4000-8000-0000000000a2',
  source: '0e000000-0000-4000-8000-0000000000b2',
  hash: 'd'.repeat(64),
  number: '+15005550100',
  agents: ['agent_x', 'agent_y'],
  carriers: ['aetna', 'humana'],
});
const CENTRAL_DAY = { enabled: true, start: '00:00', end: '23:59' };
export const CENTRAL_HOURS = { timezone: 'America/Chicago', days: Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => [day, CENTRAL_DAY])) };

/**
 * Seeds "Test Publisher B" with two generic campaigns (ma and medsupp, KS and
 * MO, $35 per call, 120 billable seconds, 30 second TTL) and two agents fully
 * eligible in KS and MO for both. Returns the campaign ids by name.
 */
export async function seedPublisherB(db) {
  await db.query('INSERT INTO tenants VALUES($1)', [B.tenant]);
  await db.query(`INSERT INTO lead_sources(id,tenant_id,name,type,active,ping_key_hash,twilio_number)
    VALUES($1,$2,'Test Publisher B','publisher',true,$3,$4)`, [B.source, B.tenant, B.hash, B.number]);
  await db.query('INSERT INTO vendor_controls(tenant_id,vendor_pause,staffed_hours) VALUES($1,false,$2)', [B.tenant, CENTRAL_HOURS]);
  for (const [index, slug] of B.agents.entries()) {
    await db.query(`INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,$2,$3,$4,true)`,
      [B.tenant, `Synthetic ${slug}`, String(92000001 + index), slug]);
    await db.query(`INSERT INTO agent_availability(agent_id,agent_name,status,available,last_assigned_at)
      VALUES($1,$1,'available',true,now()-make_interval(hours=>$2))`, [slug, 10 - index]);
  }
  const campaigns = {};
  for (const [name, line] of [['ma-central', 'ma'], ['medsupp-central', 'medsupp']]) {
    const { rows: [row] } = await db.query(`INSERT INTO ping_campaigns(tenant_id,source_id,name,product_line,engine_mode,
      allowed_states,required_carriers,critical_carriers,plan_year,pricing_model,rate,billable_seconds,reservation_ttl_seconds)
      VALUES($1,$2,$3,$4,'generic','{KS,MO}',$5,'{humana}',2027,'per_call',35,120,30) RETURNING id`,
      [B.tenant, B.source, name, line, B.carriers]);
    campaigns[name] = row.id;
    await db.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
      SELECT $1,$2,2027,a.id,s.state,c.carrier,'test' FROM tenant_agents a
      CROSS JOIN unnest('{KS,MO}'::text[]) s(state) CROSS JOIN unnest($3::text[]) c(carrier)
      WHERE a.tenant_id=$1`, [B.tenant, row.id, B.carriers]);
  }
  return campaigns;
}

/** Valid Twilio call SID for test number n. */
export const callSid = n => `CA${n.toString(16).padStart(32, '0')}`;

/**
 * Minimal Supabase-shaped client over PGlite for the calls billing.js and
 * arrival.js make: rpc with named arguments, and from().select/insert/update
 * with eq, in, order, limit, single and maybeSingle.
 */
export function supabaseLike(db) {
  const wrap = async work => { try { return { data: await work(), error: null }; } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; } };
  const ident = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad identifier ${name}`); return name; };
  return {
    rpc: (name, args = {}) => wrap(async () => {
      const keys = Object.keys(args);
      const sql = `SELECT * FROM ${ident(name)}(${keys.map((key, i) => `${ident(key)}=>$${i + 1}`).join(',')})`;
      const { rows, fields } = await db.query(sql, keys.map(key => args[key]));
      return fields.length === 1 && fields[0].name === name ? rows[0]?.[name] ?? null : rows;
    }),
    from(table) {
      let action = 'select'; let values = null; let columns = '*'; let single = false; let limit = null; let order = null;
      const filters = [];
      const query = {
        select(cols = '*') { if (action === 'select') columns = cols; return query; },
        insert(row) { action = 'insert'; values = row; return query; },
        update(row) { action = 'update'; values = row; return query; },
        eq(column, value) { filters.push([ident(column), '=', value]); return query; },
        in(column, list) { filters.push([ident(column), 'in', list]); return query; },
        order(column, { ascending = true } = {}) { order = `${ident(column)} ${ascending ? 'ASC' : 'DESC'}`; return query; },
        limit(n) { limit = Number(n); return query; },
        single() { single = true; return query; },
        maybeSingle() { single = 'maybe'; return query; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      const where = args => filters.length ? ` WHERE ${filters.map(([column, op, value]) => {
        args.push(value);
        return op === 'in' ? `${column}=ANY($${args.length})` : `${column}=$${args.length}`;
      }).join(' AND ')}` : '';
      const run = () => wrap(async () => {
        const args = []; let sql;
        if (action === 'insert') {
          const keys = Object.keys(values).filter(key => values[key] !== undefined);
          args.push(...keys.map(key => values[key]));
          sql = `INSERT INTO ${ident(table)}(${keys.map(ident).join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
        } else if (action === 'update') {
          const keys = Object.keys(values);
          args.push(...keys.map(key => values[key]));
          sql = `UPDATE ${ident(table)} SET ${keys.map((key, i) => `${ident(key)}=$${i + 1}`).join(',')}${where(args)} RETURNING *`;
        } else {
          const cols = columns === '*' ? '*' : columns.split(',').map(c => ident(c.trim())).join(',');
          sql = `SELECT ${cols} FROM ${ident(table)}${where(args)}${order ? ` ORDER BY ${order}` : ''}${limit ? ` LIMIT ${limit}` : ''}`;
        }
        const { rows } = await db.query(sql, args);
        if (single === true && rows.length !== 1) throw Object.assign(new Error('expected one row'), { code: 'PGRST116' });
        return single ? rows[0] ?? null : rows;
      });
      return query;
    },
  };
}
