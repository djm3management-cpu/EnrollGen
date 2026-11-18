// PGlite harness for the S8b portal functions: the S9 database (migrations
// 171 to 187 through the telephony helpers) plus stand-ins for the two
// objects the portal touches outside the ping migrations: tenant display
// columns (007), lead_sources.created_at (048) and admin_action_log (161,
// with its append only trigger).
// The client is Supabase shaped for exactly the calls the portal makes.
import { createS9Db, S9_FEATURES } from '../../telephony/tests/helpers/pingS9Db.js';
import { setFeatures } from '../../telephony/tests/helpers/pingDb.js';
import { seedExchange, exchangePing, BUYERS, OP } from '../../telephony/tests/helpers/exchangeDb.js';

export { BUYERS, OP, S9_FEATURES, exchangePing };

export async function createPortalDb() {
  const pg = await createS9Db();
  await setFeatures(pg, S9_FEATURES);
  await pg.exec(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name text, ADD COLUMN IF NOT EXISTS agency_display_name text;
    ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS admin_action_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
      actor_id text NOT NULL, tenant_id uuid NOT NULL REFERENCES tenants(id),
      action text NOT NULL CHECK(action ~ '^[a-z][a-z0-9_]{1,95}$'),
      target_type text NOT NULL, target_id text NOT NULL,
      result text NOT NULL CHECK(result IN ('succeeded','denied','authorized')),
      occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      before_summary jsonb NOT NULL DEFAULT '{}', after_summary jsonb NOT NULL DEFAULT '{}');
    CREATE OR REPLACE FUNCTION reject_admin_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Administrator action log is append only' USING ERRCODE='42501'; END $$;
    CREATE TRIGGER admin_action_immutable BEFORE UPDATE OR DELETE ON admin_action_log
      FOR EACH STATEMENT EXECUTE FUNCTION reject_admin_log_mutation();`);
  const campaigns = await seedExchange(pg);
  for (const [key, buyer] of Object.entries(BUYERS)) {
    await pg.query('UPDATE tenants SET name=$2 WHERE id=$1', [buyer.tenant, `Synthetic ${key} agency`]);
  }
  await pg.query('UPDATE tenants SET name=$2 WHERE id=$1', [OP.tenant, 'Synthetic operator']);
  return { pg, campaigns };
}

const ident = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad identifier ${name}`); return name; };
const param = value => (value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value);

/** A Supabase shaped client over PGlite. Records every table write in `writes`. */
export function portalClient(pg, { writes = [], failInsertInto = null } = {}) {
  const wrap = async work => {
    try { return { data: await work(), error: null }; } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
  };
  return {
    writes,
    rpc: (name, args = {}) => wrap(async () => {
      const keys = Object.keys(args);
      const { rows: [proc] } = await pg.query('SELECT proretset FROM pg_proc WHERE proname=$1 LIMIT 1', [ident(name)]);
      const sql = `SELECT * FROM ${ident(name)}(${keys.map((key, i) => `${ident(key)}=>$${i + 1}`).join(',')})`;
      const { rows, fields } = await pg.query(sql, keys.map(key => param(args[key])));
      const scalar = fields.length === 1 && fields[0].name === name;
      if (proc?.proretset) return scalar ? rows.map(row => row[name]) : rows;
      return scalar ? rows[0]?.[name] ?? null : rows;
    }),
    from(table) {
      let action = 'select'; let values = null; let columns = '*'; let single = false; let limit = null; const order = [];
      const filters = [];
      const query = {
        select(cols = '*') { columns = cols; return query; },
        insert(row) { action = 'insert'; values = row; return query; },
        update(row) { action = 'update'; values = row; return query; },
        eq(column, value) { filters.push([ident(column), '=', value]); return query; },
        is(column, value) { if (value !== null) throw new Error('is() supports null only'); filters.push([ident(column), 'is', null]); return query; },
        in(column, list) { filters.push([ident(column), 'in', list]); return query; },
        order(column, { ascending = true } = {}) { order.push(`${ident(column)} ${ascending ? 'ASC' : 'DESC'}`); return query; },
        limit(n) { limit = Number(n); return query; },
        single() { single = true; return query; },
        maybeSingle() { single = 'maybe'; return query; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      const where = args => (filters.length ? ` WHERE ${filters.map(([column, op, value]) => {
        if (op === 'is') return `${column} IS NULL`;
        args.push(value);
        return op === 'in' ? `${column}=ANY($${args.length})` : `${column}=$${args.length}`;
      }).join(' AND ')}` : '');
      const cols = () => (columns === '*' ? '*' : columns.split(',').map(c => ident(c.trim())).join(','));
      const run = () => wrap(async () => {
        const args = []; let sql;
        if (action !== 'select' && failInsertInto === table) throw Object.assign(new Error('synthetic write failure'), { code: '57014' });
        if (action === 'insert') {
          const keys = Object.keys(values).filter(key => values[key] !== undefined);
          args.push(...keys.map(key => param(values[key])));
          sql = `INSERT INTO ${ident(table)}(${keys.map(ident).join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${cols()}`;
        } else if (action === 'update') {
          const keys = Object.keys(values);
          args.push(...keys.map(key => param(values[key])));
          sql = `UPDATE ${ident(table)} SET ${keys.map((key, i) => `${ident(key)}=$${i + 1}`).join(',')}${where(args)} RETURNING ${cols()}`;
        } else {
          sql = `SELECT ${cols()} FROM ${ident(table)}${where(args)}${order.length ? ` ORDER BY ${order.join(',')}` : ''}${limit ? ` LIMIT ${limit}` : ''}`;
        }
        const { rows } = await pg.query(sql, args);
        if (action !== 'select') writes.push({ table, action, values });
        if (single === true && rows.length !== 1) throw Object.assign(new Error('expected one row'), { code: 'PGRST116' });
        return single ? rows[0] ?? null : rows;
      });
      return query;
    },
  };
}
