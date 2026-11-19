// Operator backfill of enrollment_intakes.mbi_match_key for intakes saved
// before the MBI pepper existed (docs/feature-gold-standards.md). OFF BY
// DEFAULT: without --execute it only counts the intakes that lack a key.
// With --execute and MEMBER_STATUS_IMPORT_ENABLED=true it calls
// member_backfill_mbi_keys in bounded batches. Decryption happens inside the
// database; no MBI, plaintext or row content ever reaches this process or its
// log. Explicit localhost connections only; run it only in a separately
// authorized environment, after the pepper is provisioned.
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { createLogger } from '../../telephony/src/lib/logger.js';
import { featureHeaders, featureEnabled } from '../../telephony/src/lib/deploymentFeatures.js';

const logger = createLogger();

export function backfillArguments(args) {
  const result = { execute: false, batchSize: 100, maxBatches: 10 };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--execute') result.execute = true;
    else if (['--connection', '--batch-size', '--max-batches'].includes(arg)) {
      const value = args[++i]; if (!value) throw Error('Missing backfill argument');
      if (arg === '--connection') result.connectionString = value;
      else result[arg === '--batch-size' ? 'batchSize' : 'maxBatches'] = Number(value);
    } else throw Error('Unknown backfill argument');
  }
  const url = new URL(result.connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.search || url.hash) {
    throw Error('Explicit localhost connection required');
  }
  if (!Number.isInteger(result.batchSize) || result.batchSize < 1 || result.batchSize > 500) throw Error('Invalid batch size');
  if (!Number.isInteger(result.maxBatches) || result.maxBatches < 1 || result.maxBatches > 100) throw Error('Invalid batch count');
  return result;
}

const PENDING = `SELECT count(*)::int AS n FROM public.enrollment_intakes WHERE mbi_match_key IS NULL AND completed_at IS NOT NULL
  AND NOT is_test_enrollment AND pii_encrypted->'mbi' IS NOT NULL AND pii_encrypted->'mbi'<>'null'::jsonb`;

/** Counts (dry run) or keys (execute) intakes. Returns counts only. */
export async function runBackfill({ db, execute = false, batchSize = 100, maxBatches = 10, env = process.env }) {
  await db.query('SET ROLE service_role');
  await db.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",
    [JSON.stringify(featureHeaders(env))]);
  const pending = (await db.query(PENDING)).rows[0].n;
  if (!execute) return { mode: 'dry_run', pending, processed: 0, keyed: 0 };
  if (!featureEnabled('MEMBER_STATUS_IMPORT_ENABLED', env)) throw Error('MEMBER_STATUS_IMPORT_ENABLED must be true to execute');
  let after = null; let processed = 0; let keyed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { rows: [{ r }] } = await db.query('SELECT public.member_backfill_mbi_keys($1,$2) AS r', [after, batchSize]);
    processed += r.processed; keyed += r.keyed;
    if (r.processed < batchSize || !r.last) break;
    after = r.last;
  }
  return { mode: 'execute', pending, processed, keyed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const options = backfillArguments(process.argv.slice(2));
    db = new pg.Client({ connectionString: options.connectionString, connectionTimeoutMillis: 5000 }); await db.connect();
    const result = await runBackfill({ db, ...options });
    logger.info('mbi_key_backfill_completed', { success: true, count: result.keyed, pending: result.pending, mode: result.mode });
  } catch { logger.error('mbi_key_backfill_failed', { code: 'invalid_input' }); process.exitCode = 1; }
  finally { if (db) try { await db.end(); } catch { logger.error('mbi_key_backfill_failed', { code: 'database_unavailable' }); process.exitCode = 1; } }
}
