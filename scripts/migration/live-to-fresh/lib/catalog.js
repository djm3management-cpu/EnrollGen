// Read-only catalog introspection used to build the copy plan at runtime,
// so the code follows the schemas as they actually are.

export async function tableColumns(db, schema = 'public') {
  const r = await db.query(`
    SELECT c.relname AS t, a.attname AS n, format_type(a.atttypid, a.atttypmod) AS ty,
           a.attnotnull AS nn, a.atthasdef AS has_default, a.attidentity::text AS ident, a.attgenerated::text AS gen
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
     WHERE c.relnamespace=$1::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
     ORDER BY c.relname, a.attnum`, [schema]);
  const out = new Map();
  for (const row of r.rows) {
    if (!out.has(row.t)) out.set(row.t, []);
    out.get(row.t).push({ name: row.n, type: row.ty, notNull: row.nn, hasDefault: row.has_default, identity: row.ident || '', generated: row.gen || '' });
  }
  return out;
}

export async function primaryKeys(db, schema = 'public') {
  const r = await db.query(`
    SELECT c.relname AS t, a.attname AS n, format_type(a.atttypid, a.atttypmod) AS ty, k.ord
      FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid
      CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.attnum
     WHERE p.contype='p' AND c.relnamespace=$1::regnamespace
     ORDER BY c.relname, k.ord`, [schema]);
  const out = new Map();
  for (const row of r.rows) {
    if (!out.has(row.t)) out.set(row.t, []);
    out.get(row.t).push({ name: row.n, type: row.ty });
  }
  return out;
}

export async function foreignKeys(db, schema = 'public') {
  const r = await db.query(`
    SELECT p.conname, c.relname AS child, rc.relname AS parent, rn.nspname AS parent_schema,
           (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(p.conkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.n) AS cols,
           (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(p.confkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=p.confrelid AND a.attnum=k.n) AS pcols
      FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_class rc ON rc.oid=p.confrelid
      JOIN pg_namespace rn ON rn.oid=rc.relnamespace
     WHERE p.contype='f' AND c.relnamespace=$1::regnamespace`, [schema]);
  return r.rows.map(x => ({ name: x.conname, child: x.child, parent: x.parent, parentSchema: x.parent_schema, cols: pgArray(x.cols), pcols: pgArray(x.pcols) }));
}

// Anchor column argument of NEW's retention_anchor_insert trigger, per table.
export async function retentionAnchors(db, schema = 'public') {
  const r = await db.query(`
    SELECT c.relname AS t, pg_get_triggerdef(g.oid) AS def
      FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
     WHERE NOT g.tgisinternal AND g.tgname='retention_anchor_insert' AND c.relnamespace=$1::regnamespace`, [schema]);
  const out = new Map();
  for (const { t, def } of r.rows) {
    const m = def.match(/retention_anchor_insert\('?([a-z_][a-z0-9_]*)'?\)/);
    out.set(t, m ? m[1] : null);
  }
  return out;
}

// Same-or-different routine body check, e.g. for encryption functions.
export async function routineHash(db, name, schema = 'public') {
  const r = await db.query(`SELECT md5(string_agg(prosrc, '' ORDER BY oid)) AS h FROM pg_proc WHERE proname=$1 AND pronamespace=$2::regnamespace`, [name, schema]);
  return r.rows[0]?.h || null;
}

export async function routineSource(db, name, schema = 'public') {
  const r = await db.query(`SELECT prosrc FROM pg_proc WHERE proname=$1 AND pronamespace=$2::regnamespace`, [name, schema]);
  return r.rows[0]?.prosrc || null;
}

// Schema holding pgcrypto's pgp_sym_decrypt (extensions on Supabase, may be public elsewhere).
export async function pgcryptoSchema(db) {
  const r = await db.query(`SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='pgp_sym_decrypt' ORDER BY n.nspname='extensions' DESC LIMIT 1`);
  if (!r.rows[0]) throw Error('pgcrypto is not installed in OLD');
  return r.rows[0].nspname;
}

export function pgArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').filter(Boolean).map(s => s.replace(/^"|"$/g, ''));
  return [];
}

export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// Parents before children; self references and cycles are tolerated (the
// load runs with triggers off and FKs are verified afterwards).
export function topoOrder(tables, fks) {
  const set = new Set(tables), deps = new Map(tables.map(t => [t, new Set()]));
  for (const fk of fks) if (fk.parentSchema === 'public' && set.has(fk.child) && set.has(fk.parent) && fk.child !== fk.parent) deps.get(fk.child).add(fk.parent);
  const out = [], state = new Map();
  const visit = t => {
    if (state.get(t) === 2) return;
    if (state.get(t) === 1) return; // cycle: break here
    state.set(t, 1);
    for (const p of [...deps.get(t)].sort()) visit(p);
    state.set(t, 2); out.push(t);
  };
  for (const t of [...tables].sort()) visit(t);
  return out;
}
