// migration_ledger: a private schema in NEW that makes the run resumable and
// auditable. It never holds row content or PII: only table names, old primary
// keys, reason codes and id maps. Browser roles get no access.

export const LEDGER_DDL = [
  `CREATE SCHEMA IF NOT EXISTS migration_ledger`,
  `REVOKE ALL ON SCHEMA migration_ledger FROM PUBLIC`,
  `CREATE TABLE IF NOT EXISTS migration_ledger.runs(
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     mode text NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
     finished_at timestamptz, outcome text)`,
  `CREATE TABLE IF NOT EXISTS migration_ledger.table_progress(
     table_name text PRIMARY KEY, cursor jsonb, rows_read bigint NOT NULL DEFAULT 0,
     inserted bigint NOT NULL DEFAULT 0, rejected bigint NOT NULL DEFAULT 0,
     done boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT clock_timestamp())`,
  `CREATE TABLE IF NOT EXISTS migration_ledger.rejects(
     table_name text NOT NULL, old_pk text NOT NULL, reason text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(table_name, old_pk))`,
  `CREATE TABLE IF NOT EXISTS migration_ledger.transforms(
     table_name text NOT NULL, old_pk text NOT NULL, kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
     created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(table_name, old_pk, kind))`,
  `CREATE TABLE IF NOT EXISTS migration_ledger.id_map(
     kind text NOT NULL, old_id text NOT NULL, new_id text NOT NULL, PRIMARY KEY(kind, old_id))`,
];

export async function ensureLedger(db) {
  for (const sql of LEDGER_DDL) await db.query(sql);
  for (const role of ['anon', 'authenticated']) {
    const exists = await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1`, [role]);
    if (exists.rows.length) await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA migration_ledger FROM ${role}`);
  }
}

export async function startRun(db, mode) {
  const r = await db.query(`INSERT INTO migration_ledger.runs(mode) VALUES($1) RETURNING id`, [mode]);
  return r.rows[0].id;
}
export async function finishRun(db, id, outcome) {
  await db.query(`UPDATE migration_ledger.runs SET finished_at=clock_timestamp(), outcome=$2 WHERE id=$1`, [id, outcome]);
}

export async function getProgress(db, table) {
  const r = await db.query(`SELECT cursor::text AS cursor, rows_read, inserted, rejected, done FROM migration_ledger.table_progress WHERE table_name=$1`, [table]);
  if (!r.rows[0]) return null;
  const p = r.rows[0];
  return { cursor: p.cursor ? JSON.parse(p.cursor) : null, rowsRead: Number(p.rows_read), inserted: Number(p.inserted), rejected: Number(p.rejected), done: p.done };
}

export async function saveProgress(db, table, { cursor, rowsRead, inserted, rejected, done }) {
  await db.query(`INSERT INTO migration_ledger.table_progress(table_name,cursor,rows_read,inserted,rejected,done,updated_at)
    VALUES($1,$2::jsonb,$3,$4,$5,$6,clock_timestamp())
    ON CONFLICT(table_name) DO UPDATE SET cursor=excluded.cursor, rows_read=migration_ledger.table_progress.rows_read+excluded.rows_read,
      inserted=migration_ledger.table_progress.inserted+excluded.inserted, rejected=migration_ledger.table_progress.rejected+excluded.rejected,
      done=excluded.done, updated_at=excluded.updated_at`,
  [table, cursor === null ? null : JSON.stringify(cursor), rowsRead, inserted, rejected, done]);
}

export async function recordRejects(db, table, rejects) {
  if (!rejects.length) return 0;
  const r = await db.query(`INSERT INTO migration_ledger.rejects(table_name,old_pk,reason)
    SELECT $1, x.pk, x.reason FROM jsonb_to_recordset($2::jsonb) x(pk text, reason text)
    ON CONFLICT DO NOTHING RETURNING 1`, [table, JSON.stringify(rejects)]);
  return r.rows.length;
}

export async function recordTransforms(db, table, transforms) {
  if (!transforms.length) return;
  await db.query(`INSERT INTO migration_ledger.transforms(table_name,old_pk,kind,detail)
    SELECT $1, x.pk, x.kind, x.detail FROM jsonb_to_recordset($2::jsonb) x(pk text, kind text, detail jsonb)
    ON CONFLICT DO NOTHING`, [table, JSON.stringify(transforms)]);
}

export async function putIdMap(db, kind, pairs) {
  if (!pairs.length) return;
  await db.query(`INSERT INTO migration_ledger.id_map(kind,old_id,new_id)
    SELECT $1, x.o, x.n FROM jsonb_to_recordset($2::jsonb) x(o text, n text) ON CONFLICT DO NOTHING`,
  [kind, JSON.stringify(pairs.map(([o, n]) => ({ o, n })))]);
}

export async function getIdMap(db, kind) {
  const r = await db.query(`SELECT old_id, new_id FROM migration_ledger.id_map WHERE kind=$1`, [kind]);
  return new Map(r.rows.map(x => [x.old_id, x.new_id]));
}
