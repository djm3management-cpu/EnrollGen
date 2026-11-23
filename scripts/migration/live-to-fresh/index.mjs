#!/usr/bin/env node
// Live-to-fresh data migration: production (old schema) -> fresh install.
// See scripts/migration/live-to-fresh/README.md and
// docs/migration/live-to-fresh-mapping.md. Both databases must be local.
//
//   node scripts/migration/live-to-fresh/index.mjs --old <url> --new <url> [--dry-run | --verify] [--table <name>]
//   node scripts/migration/live-to-fresh/index.mjs --old <url> --emit-provisioning <dir> [--app-origin ..] [--telephony-origin ..]
//
// OLD_PII_ENCRYPTION_KEY must be in the environment for runs that touch PII.
// Output never contains row values, PII, secrets or connection strings.

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pg from 'pg';
import { parseArgs } from './lib/args.js';
import { tableColumns, primaryKeys, foreignKeys, topoOrder, retentionAnchors, routineSource, routineHash, pgcryptoSchema, quoteIdent } from './lib/catalog.js';
import { Copier, RejectStop } from './lib/engine.js';
import * as ledger from './lib/ledger.js';
import { PiiCodec } from './lib/pii.js';
import * as P from './lib/plan.js';
import { storageManifest, exportExcluded, provisioningInputs, writePrivate, privateDir } from './lib/outputs.js';
import { verify } from './lib/verify.js';
import { parseLossless, stringifyLossless } from './lib/json.js';

const WORKDIR = process.env.MIGRATION_WORKDIR || join(homedir(), 'enrollgen-migration');
const say = msg => console.log(`[live-to-fresh] ${msg}`);

async function connect(url, { remote = false } = {}) {
  const c = new pg.Client({ connectionString: url, application_name: 'enrollgen-live-to-fresh', connectionTimeoutMillis: 10000 });
  await c.connect();
  // Hosted NEW: never echo a failing statement into the server log (bind values are
  // already excluded by the platform's log_parameter_max_length_on_error=0).
  if (remote) await c.query('SET log_min_error_statement = panic');
  return c;
}

export async function buildPlan(oldDb, newDb) {
  const oldCols = await tableColumns(oldDb), newCols = await tableColumns(newDb);
  const newFks = await foreignKeys(newDb), anchors = await retentionAnchors(newDb);
  const oldTables = [...oldCols.keys()];
  const excluded = new Set([...Object.keys(P.NOT_MIGRATED), ...P.PRE_PROVISION, ...P.SUBSET_TABLES, ...Object.keys(P.SINGLETONS)]);
  const absent = oldTables.filter(t => !newCols.has(t) && !P.NOT_MIGRATED[t]);
  const body = oldTables.filter(t => newCols.has(t) && !excluded.has(t));
  const ordered = topoOrder(body, newFks);
  return { oldCols, newCols, anchors, absent, ordered, migrated: [...P.PRE_PROVISION, ...ordered] };
}

async function provisioned(oldDb, newDb) {
  const tenant = (await oldDb.query(`SELECT id::text FROM public.tenants`)).rows[0]?.id;
  const s = (await newDb.query(`SELECT tenant_id::text AS t FROM public.deployment_settings WHERE singleton`)).rows[0];
  const want = Number((await oldDb.query(`SELECT count(*) FROM public.tenant_agents WHERE is_active AND clerk_user_id IS NOT NULL`)).rows[0].count);
  const have = Number((await newDb.query(`SELECT count(*) FROM public.tenant_agents WHERE is_active AND tenant_id=$1::uuid`, [tenant])).rows[0].count);
  return s?.t === tenant && have === want;
}

async function copySingletons(oldDb, newDb, dryRun) {
  const results = [];
  for (const [table, key] of Object.entries(P.SINGLETONS)) {
    const o = (await oldDb.query(`SELECT to_jsonb(t)::text AS j FROM public.${quoteIdent(table)} t`)).rows;
    const nCols = (await newDb.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows.map(r => r.column_name);
    if (o.length !== 1) { results.push({ table, carried: [], notCarried: [{ column: '*', why: `OLD has ${o.length} rows` }] }); continue; }
    const row = parseLossless(o[0].j);
    const carried = Object.keys(row).filter(c => nCols.includes(c) && c !== key);
    const notCarried = Object.keys(row).filter(c => !nCols.includes(c)).map(c => ({ column: c, why: 'column absent in NEW' }));
    const before = (await newDb.query(`SELECT to_jsonb(t)::text AS j FROM public.${quoteIdent(table)} t`)).rows.map(r => parseLossless(r.j))[0] || null;
    const changed = carried.filter(c => before && JSON.stringify(before[c]) !== JSON.stringify(row[c]) && c !== 'updated_at' && c !== 'changed_at');
    if (!dryRun) {
      await newDb.query(`INSERT INTO public.${quoteIdent(table)} SELECT * FROM jsonb_populate_record(NULL::public.${quoteIdent(table)}, $1::jsonb)
        ON CONFLICT (${quoteIdent(key)}) DO UPDATE SET ${carried.map(c => `${quoteIdent(c)}=excluded.${quoteIdent(c)}`).join(', ')}`, [stringifyLossless(row)]);
    }
    results.push({ table, carried, changed, notCarried });
  }
  return results;
}

async function sweepOrphans(newDb, tables, dryRun, stopOnReject = false) {
  const fks = await foreignKeys(newDb), pks = await primaryKeys(newDb), set = new Set(tables), found = [];
  for (const fk of fks) {
    if (!set.has(fk.child)) continue;
    const pk = pks.get(fk.child);
    const cond = fk.cols.map(c => `c.${quoteIdent(c)} IS NOT NULL`).join(' AND ');
    const join = fk.cols.map((c, i) => `p.${quoteIdent(fk.pcols[i])} = c.${quoteIdent(c)}`).join(' AND ');
    const rows = (await newDb.query(`SELECT concat_ws('|', ${pk.map(c => `to_jsonb(c.${quoteIdent(c.name)})#>>'{}'`).join(', ')}) AS k FROM public.${quoteIdent(fk.child)} c WHERE ${cond} AND NOT EXISTS(SELECT 1 FROM ${quoteIdent(fk.parentSchema)}.${quoteIdent(fk.parent)} p WHERE ${join})`)).rows;
    if (!rows.length) continue;
    found.push({ constraint: fk.name, table: fk.child, rows: rows.length });
    if (dryRun) continue;
    if (stopOnReject) throw new RejectStop(`${fk.child}: ${rows.length} FK orphan(s) on ${fk.name}; stopped before moving them to the reject ledger`);
    await newDb.query('BEGIN');
    await newDb.query('SET LOCAL session_replication_role = replica');
    await ledger.recordRejects(newDb, fk.child, rows.map(r => ({ pk: r.k, reason: `fk_orphan:${fk.name}` })));
    await newDb.query(`DELETE FROM public.${quoteIdent(fk.child)} c WHERE ${cond} AND NOT EXISTS(SELECT 1 FROM ${quoteIdent(fk.parentSchema)}.${quoteIdent(fk.parent)} p WHERE ${join})`);
    await newDb.query('COMMIT');
  }
  return found;
}

export async function migrate(opts) {
  const started = Date.now();
  const oldDb = await connect(opts.old);
  if (opts.emitProvisioning) {
    const { profile, roster, missingGhl } = await provisioningInputs(oldDb, { appOrigin: opts.appOrigin || undefined, telephonyOrigin: opts.telephonyOrigin || undefined });
    privateDir(opts.emitProvisioning);
    writePrivate(join(opts.emitProvisioning, 'profile.json'), JSON.stringify(profile, null, 2));
    writePrivate(join(opts.emitProvisioning, 'roster.json'), JSON.stringify(roster, null, 2));
    say(`wrote profile.json and roster.json (${roster.length} active agents; ${missingGhl.length} without a GHL user mapping) to the given directory`);
    await oldDb.end();
    return;
  }
  const newDb = await connect(opts.new, { remote: !!opts.remote });
  const mode = opts.verify ? 'verify' : opts.dryRun ? 'dry-run' : 'migrate';
  let runId = null;
  try {
    // Guard: NEW's encryption routines must be the reviewed ones.
    for (const f of ['encrypt_pii_value', 'decrypt_pii_value', 'pii_blind_index']) {
      if (await routineHash(oldDb, f) !== await routineHash(newDb, f)) say(`note: ${f} body differs between OLD and NEW`);
    }
    const codec = new PiiCodec({ oldDb, newDb, oldKey: process.env.OLD_PII_ENCRYPTION_KEY, cryptoSchema: await pgcryptoSchema(oldDb) });
    const plan = await buildPlan(oldDb, newDb);
    plan.ghlAllowlist = P.ghlAllowlistFrom(await routineSource(newDb, 'minimize_ghl_delivery_snapshot'));

    if (opts.verify) {
      const result = await verify({ oldDb, newDb, codec, plan, log: say });
      const file = join(WORKDIR, 'verify-report.json');
      writePrivate(file, JSON.stringify(result, null, 2));
      const unbalanced = result.tables.filter(t => !t.balanced);
      const idMismatch = result.externalIds.filter(x => !x.match);
      const piiMismatch = Object.entries(result.pii).filter(([, v]) => v.mismatch);
      say(`tables checked ${result.tables.length}, unbalanced ${unbalanced.length}; external id columns ${result.externalIds.length}, mismatched ${idMismatch.length}`);
      say(`PII fields compared ${Object.values(result.pii).reduce((a, v) => a + v.fields, 0)}, mismatched ${piiMismatch.reduce((a, [, v]) => a + v.mismatch, 0)}; FK violations ${result.fk.violations} across ${result.fk.checked} FKs`);
      say(`embeddings identical: ${result.embeddings.map(e => `${e.table}=${e.identical}`).join(', ')}; scorecards missing template ${result.scoring.scorecardsMissingTemplate}`);
      say(`report written to verify-report.json in the migration workdir`);
      process.exitCode = unbalanced.length || idMismatch.length || piiMismatch.length || result.fk.violations || result.scoring.scorecardsMissingTemplate || result.scoring.itemsMissingTemplateItem || result.contacts.plaintextColumnsNonNull || result.contacts.blindIndexMismatches || result.embeddings.some(e => !e.identical) ? 1 : 0;
      return result;
    }

    if (!opts.dryRun) { await ledger.ensureLedger(newDb); runId = await ledger.startRun(newDb, mode); }
    const copier = await Copier.create({ oldDb, newDb, batchSize: opts.batchSize, dryRun: opts.dryRun, log: () => {}, stopOnReject: !!opts.remote });
    const ctx = { codec, newDb, oldDb, anchors: plan.anchors, ghlAllowlist: plan.ghlAllowlist };
    ctx.rosterClerkIds = new Set((await oldDb.query(`SELECT clerk_user_id FROM public.tenant_agents WHERE is_active AND clerk_user_id IS NOT NULL`)).rows.map(r => r.clerk_user_id));
    const results = [];
    const only = opts.table;
    const run = async spec => {
      if (only && spec.table !== only) return;
      const r = await copier.copyTable(spec, ctx);
      results.push(r);
      say(`${spec.table}: read ${r.read ?? r.rowsRead ?? 0}, ${opts.dryRun ? 'would insert' : 'inserted'} ${r.inserted}, rejected ${r.rejected}${r.skipped ? ' (already complete)' : ''}`);
    };

    // Q8 exports (outside the repo).
    if (!opts.dryRun && !only) {
      const ex = await exportExcluded(oldDb, P.EXCLUDED_EXPORTS, join(WORKDIR, 'excluded'));
      say(`excluded tables exported: ${ex.map(e => `${e.table}=${e.rows} rows`).join(', ')}`);
    }

    // 1. Pre-provisioning rows (ids must exist before the roster upsert).
    for (const t of P.PRE_PROVISION) await run(P.tableSpec(t, ctx));
    if (!opts.dryRun && !only && !(await provisioned(oldDb, newDb))) {
      say('NEW is not provisioned yet. Run scripts/provision-deployment.js --apply with the emitted profile and roster, then rerun this command.');
      await ledger.finishRun(newDb, runId, 'awaiting_provisioning');
      process.exitCode = 3;
      return { results, awaitingProvisioning: true };
    }

    // Provisioning upserts tenants (name/org/display) and bumps updated_at;
    // re-apply the OLD tenant row once more so a single run ends in the final state.
    if (!opts.dryRun && (!only || only === 'tenants')) {
      await newDb.query(`DELETE FROM migration_ledger.table_progress WHERE table_name='tenants'`);
      await run(P.tableSpec('tenants', ctx));
    }

    // 2. Scoring identity (Q5).
    const maps = await P.buildScoringMaps(oldDb, newDb);
    ctx.intentMap = maps.intentMap; ctx.itemMap = maps.itemMap;
    if (!opts.dryRun) {
      await ledger.putIdMap(newDb, 'compliance_intents', [...maps.intentMap]);
      await ledger.putIdMap(newDb, 'scoring_template_items', [...maps.itemMap]);
      await ledger.putIdMap(newDb, 'scoring_templates', [...maps.templateMap]);
    }
    say(`scoring: ${maps.oldTemplates} OLD templates; ${maps.insertTemplates.length} inserted as inactive history; ${maps.intentMap.size} intents and ${maps.itemMap.size} items mapped; ${maps.unmatchedIntents} intents unmatched`);
    const tplList = maps.insertTemplates.map(t => `'${t.replace(/[^0-9a-f-]/g, '')}'::uuid`).join(',') || 'NULL';
    await run({ table: 'scoring_templates', where: `t.id IN (${tplList})`, map: row => ({ row: { ...row, is_active: false } }) });
    await run({ table: 'scoring_template_items', where: `t.template_id IN (${tplList})`, map: row => P.tableSpec('intent_detections', ctx).map(row) });

    // 3. Everything else in NEW foreign-key order.
    for (const t of plan.ordered) await run(P.tableSpec(t, ctx));

    // 4. knowledge_base (Q7): only OLD keys absent from NEW's seed, tenant scoped.
    const nKeys = (await newDb.query(`SELECT DISTINCT key FROM public.knowledge_base`)).rows.map(r => r.key);
    const tenantId = (await oldDb.query(`SELECT id::text FROM public.tenants`)).rows[0].id;
    const extra = (await oldDb.query(`SELECT count(*) FROM public.knowledge_base WHERE NOT (key = ANY($1::text[]))`, [nKeys])).rows[0].count;
    say(`knowledge_base: ${extra} OLD rows have keys absent from NEW's seed`);
    if (Number(extra)) await run({ table: 'knowledge_base', where: `NOT (t.key = ANY(ARRAY[${nKeys.map(k => `'${k.replace(/'/g, "''")}'`).join(',') || "''"}]::text[]))`, map: row => ({ row: { ...row, tenant_id: tenantId } }) });

    if (only) return { results };

    // 5. Singletons (Q15).
    const singletons = await copySingletons(oldDb, newDb, opts.dryRun);
    for (const s of singletons) say(`singleton ${s.table}: carried ${s.carried.length} column(s), changed ${s.changed?.length ?? 0}, not carried ${s.notCarried.length}`);

    // 6. Post-load FK sweep (replica mode skips FK triggers).
    const orphans = await sweepOrphans(newDb, plan.migrated, opts.dryRun, !!opts.remote);
    say(`foreign-key sweep: ${orphans.reduce((a, o) => a + o.rows, 0)} orphan row(s)`);

    // 7. Storage manifest (outside the repo).
    const manifest = await storageManifest(oldDb);
    if (!opts.dryRun) writePrivate(join(WORKDIR, 'storage-manifest.json'), JSON.stringify(manifest, null, 2));
    say(`storage manifest: ${manifest.totals.objects} objects, ${manifest.totals.bytes} bytes, ${manifest.totals.unreferenced} unreferenced`);

    const seconds = Math.round((Date.now() - started) / 1000);
    const summary = { mode, seconds, absentInNew: plan.absent, tables: results.map(({ table, read, inserted, rejected, transformed, skipped }) => ({ table, read, inserted, rejected, transformed, skipped: !!skipped })), singletons, orphans, scoring: { inserted: maps.insertTemplates, intents: maps.intentMap.size, items: maps.itemMap.size } };
    if (!opts.dryRun) writePrivate(join(WORKDIR, 'migration-run.json'), JSON.stringify(summary, null, 2));
    say(`${mode} finished in ${seconds}s`);
    if (runId) await ledger.finishRun(newDb, runId, 'complete');
    return summary;
  } catch (e) {
    if (runId) { try { await newDb.query('ROLLBACK'); } catch {} try { await ledger.finishRun(newDb, runId, 'failed'); } catch {} }
    throw e;
  } finally {
    await oldDb.end(); await newDb.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`[live-to-fresh] ${e.message}`); process.exit(2); }
  privateDir(WORKDIR);
  migrate(opts).catch(e => {
    // Database errors can contain values; print only a code.
    console.error(`[live-to-fresh] failed: ${e.code ? `SQLSTATE ${e.code}` : e.message.split('\n')[0].replace(/(postgres(ql)?:\/\/)\S+/g, '$1<redacted>')}`);
    process.exitCode = 1;
  });
}
