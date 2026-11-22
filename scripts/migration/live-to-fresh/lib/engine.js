// Batched, resumable, idempotent table copy OLD -> NEW.
//
// Read:   SELECT to_jsonb(t)::text FROM old.t WHERE pk > cursor ORDER BY pk LIMIT n
// Map:    per-row pure transform, plus an optional async batch hook (PII)
// Write:  one NEW transaction per batch, session_replication_role=replica,
//         INSERT ... SELECT FROM jsonb_populate_recordset ... ON CONFLICT (pk) DO NOTHING,
//         plus ledger progress/rejects/transforms in the same transaction.
// A failed batch is retried row by row; a row that still fails becomes a
// reject (table, old pk, reason code). Nothing is dropped silently and the
// run never aborts on the first reject. Error text from the database is never
// stored or printed, only SQLSTATE and constraint names.

import { parseLossless, stringifyLossless, scalar } from './json.js';
import { quoteIdent, retentionAnchors } from './catalog.js';
import { retentionAnchorExpression } from './transforms.js';
import * as ledger from './ledger.js';

export class InjectedFailure extends Error {}

export function pkText(row, pk) {
  return pk.map(c => String(scalar(row[c.name]))).join('|');
}

function safeReason(e) {
  if (e instanceof InjectedFailure) throw e;
  const code = e?.code || 'error';
  const constraint = e?.constraint ? `:${e.constraint}` : '';
  return `sql_${code}${constraint}`;
}

export class Copier {
  constructor({ oldDb, newDb, oldCols, newCols, newPks, anchors, log = () => {}, batchSize = 500, dryRun = false, failAfterBatches = null }) {
    Object.assign(this, { oldDb, newDb, oldCols, newCols, newPks, anchors, log, batchSize, dryRun, failAfterBatches });
    this.batches = 0;
  }

  static async create(opts) {
    const { tableColumns, primaryKeys } = await import('./catalog.js');
    // Sequential: one pg client runs one query at a time.
    const oldCols = await tableColumns(opts.oldDb), newCols = await tableColumns(opts.newDb);
    const newPks = await primaryKeys(opts.newDb), anchors = await retentionAnchors(opts.newDb);
    return new Copier({ ...opts, oldCols, newCols, newPks, anchors });
  }

  // Build the column list and SELECT expressions for the NEW insert.
  insertShape(spec) {
    const target = spec.target || spec.table;
    const newCols = this.newCols.get(target);
    if (!newCols) throw Error(`NEW table ${target} not found`);
    const oldNames = new Set((this.oldCols.get(spec.table) || []).map(c => c.name));
    const produced = new Set(spec.produces || []);
    const skip = new Set(spec.skipColumns || []);
    const cols = [], exprs = [];
    let overriding = false;
    for (const c of newCols) {
      if (c.generated) continue;
      if (skip.has(c.name)) continue;
      if (spec.sqlColumns && spec.sqlColumns[c.name]) { cols.push(c.name); exprs.push(spec.sqlColumns[c.name]); continue; }
      if (c.name === 'retention_started_at' && !oldNames.has(c.name) && this.anchors.has(target)) {
        cols.push(c.name); exprs.push(retentionAnchorExpression(this.anchors.get(target)) || 'clock_timestamp()'); continue;
      }
      if (oldNames.has(c.name) || produced.has(c.name)) {
        cols.push(c.name); exprs.push(`r.${quoteIdent(c.name)}`);
        if (c.identity === 'a') overriding = true;
      }
    }
    // Derived columns that reference other derived columns are evaluated over r.
    return { target, cols, exprs, overriding };
  }

  async copyTable(spec, ctx = {}) {
    const table = spec.table, pk = this.newPks.get(spec.target || table);
    if (!pk && !spec.noPk) throw Error(`NEW table ${spec.target || table} has no primary key`);
    const orderPk = spec.sourcePk || pk;
    const shape = this.insertShape(spec);
    const target = shape.target;
    const progress = this.dryRun ? null : await ledger.getProgress(this.newDb, table);
    if (progress?.done) return { table, skipped: true, ...progress };
    let cursor = progress?.cursor || null;
    const totals = { table, read: 0, inserted: 0, rejected: 0, transformed: 0 };
    const pkTypes = orderPk.map(c => (this.oldCols.get(table) || []).find(o => o.name === c.name)?.type || 'text');
    const orderBy = orderPk.map(c => `t.${quoteIdent(c.name)}`).join(', ');
    const conflict = spec.conflict !== undefined ? spec.conflict : pk ? `ON CONFLICT (${pk.map(c => quoteIdent(c.name)).join(', ')}) DO NOTHING` : '';
    const insertSql = `INSERT INTO public.${quoteIdent(target)} (${shape.cols.map(quoteIdent).join(', ')})${shape.overriding ? ' OVERRIDING SYSTEM VALUE' : ''}
      SELECT ${shape.exprs.join(', ')} FROM jsonb_populate_recordset(NULL::public.${quoteIdent(target)}, $1::jsonb) r ${conflict}
      RETURNING 1`;

    for (;;) {
      const where = cursor ? `WHERE (${orderBy}) > (${cursor.map((_, i) => `$${i + 1}::${pkTypes[i]}`).join(', ')})` : '';
      const filter = spec.where ? (where ? ` AND (${spec.where})` : `WHERE ${spec.where}`) : '';
      const res = await this.oldDb.query(
        `SELECT to_jsonb(t)::text AS j FROM public.${quoteIdent(table)} t ${where}${filter} ORDER BY ${orderBy} LIMIT ${this.batchSize}`,
        cursor || []);
      if (!res.rows.length) break;
      const rows = res.rows.map(r => parseLossless(r.j));
      const nextCursor = orderPk.map(c => String(scalar(rows[rows.length - 1][c.name])));
      totals.read += rows.length;

      // 1. Pure per-row mapping.
      let mapped = [], rejects = [], transforms = [];
      for (const row of rows) {
        const key = pkText(row, orderPk);
        const out = spec.map ? spec.map(row, ctx) : { row };
        if (out.reject) { rejects.push({ pk: key, reason: out.reject }); continue; }
        for (const t of out.transform || []) transforms.push({ pk: key, kind: t.kind, detail: t.detail || {} });
        mapped.push({ key, row: out.row });
      }
      // 2. Async batch hook (re-encryption, remaps that need lookups).
      if (spec.prepare && mapped.length) {
        try {
          mapped = await spec.prepare(mapped, ctx);
        } catch {
          const kept = [];
          for (const m of mapped) {
            try { kept.push(...(await spec.prepare([m], ctx))); } catch (e) { rejects.push({ pk: m.key, reason: `prepare_failed:${e.message.replace(/[^a-zA-Z_ ]/g, '').trim().replace(/ /g, '_')}` }); }
          }
          mapped = kept;
        }
        mapped = mapped.filter(m => { if (m.reject) { rejects.push({ pk: m.key, reason: m.reject }); return false; } return true; });
      }

      if (this.dryRun) {
        totals.inserted += mapped.length; totals.rejected += rejects.length; totals.transformed += transforms.length;
        cursor = nextCursor; continue;
      }

      // 3. Write the batch; on failure fall back to row-by-row.
      if (this.failAfterBatches !== null && this.batches >= this.failAfterBatches) throw new InjectedFailure('Injected failure');
      let inserted = 0;
      const writeRows = async list => {
        await this.newDb.query('BEGIN');
        try {
          await this.newDb.query(`SET LOCAL session_replication_role = replica`);
          if (spec.write) return list.length ? await spec.write(this.newDb, list, { ...ctx, shape, target }) : 0;
          const r = list.length ? await this.newDb.query(insertSql, [stringifyLossless(list.map(m => m.row))]) : { rows: [] };
          if (spec.afterInsert && list.length) await spec.afterInsert(this.newDb, list, ctx);
          return r.rows.length;
        } catch (e) { await this.newDb.query('ROLLBACK'); throw e; }
      };
      try {
        inserted = await writeRows(mapped);
      } catch {
        inserted = 0;
        const okRows = [];
        for (const m of mapped) {
          try { const n = await writeRows([m]); await this.newDb.query('COMMIT'); inserted += n; okRows.push(m); }
          catch (e) { rejects.push({ pk: m.key, reason: safeReason(e) }); }
        }
        mapped = okRows;
        await this.newDb.query('BEGIN');
      }
      const okKeys = new Set(mapped.map(m => m.key));
      const newRejects = await ledger.recordRejects(this.newDb, table, rejects);
      await ledger.recordTransforms(this.newDb, table, transforms.filter(t => okKeys.has(t.pk)));
      await ledger.saveProgress(this.newDb, table, { cursor: nextCursor, rowsRead: rows.length, inserted, rejected: newRejects, done: false });
      await this.newDb.query('COMMIT');
      this.batches++;
      totals.inserted += inserted; totals.rejected += rejects.length; totals.transformed += transforms.filter(t => okKeys.has(t.pk)).length;
      cursor = nextCursor;
      this.log(`${table}: ${totals.read} read, ${totals.inserted} inserted, ${totals.rejected} rejected`);
    }
    if (!this.dryRun) {
      await ledger.saveProgress(this.newDb, table, { cursor, rowsRead: 0, inserted: 0, rejected: 0, done: true });
      if (shape.overriding || spec.resyncIdentity) await this.resyncIdentity(target);
    }
    return totals;
  }

  // After explicit ids, move identity sequences past the maximum.
  async resyncIdentity(table) {
    for (const c of this.newCols.get(table) || []) {
      if (!c.identity) continue;
      await this.newDb.query(`SELECT setval(pg_get_serial_sequence($1, $2), GREATEST((SELECT coalesce(max(${quoteIdent(c.name)}),0) FROM public.${quoteIdent(table)}), 1), (SELECT count(*)>0 FROM public.${quoteIdent(table)}))`, [`public.${table}`, c.name]);
    }
  }
}
