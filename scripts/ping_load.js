// Ping platform load test (spec 3.11 and 7.3; session S8a).
//
//   npm run ping:load:short   50 pings a second for 10 seconds
//   npm run ping:load:long    50 pings a second for 300 seconds
//   node scripts/ping_load.js [--short|--long] [--rate N] [--duration S] [--exchange-share F] [--output FILE]
//
// Without PING_LOAD_DATABASE_URL it runs against an in-process PGlite database
// built from the test harness (migrations through 184, synthetic tenants). That
// is a single connection baseline: it measures decision cost, not concurrency,
// and cannot prove the spec target. With PING_LOAD_DATABASE_URL it drives a
// staging database through a connection pool; see docs/ping-load-test.md for
// the required fixtures and confirmations. It never prints the connection
// string or a key, refuses any non-local host that is not explicitly allowed,
// and exits nonzero on errors or a double reservation.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { runPingLoad } from '../telephony/tests/helpers/pingLoadRunner.js';
import { pgliteLoadTarget } from '../telephony/tests/helpers/pingLoadPglite.js';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const FEATURES = { PING_PLATFORM_ENABLED: true, PING_EXCHANGE_ENABLED: true };
const sha256 = value => createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const options = { rate: 50, durationSeconds: 10, exchangeShare: 0.5, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]; const next = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`); return argv[++i]; };
    if (arg === '--short') { options.rate = 50; options.durationSeconds = 10; }
    else if (arg === '--long') { options.rate = 50; options.durationSeconds = 300; }
    else if (arg === '--rate') options.rate = Number(next());
    else if (arg === '--duration') options.durationSeconds = Number(next());
    else if (arg === '--exchange-share') options.exchangeShare = Number(next());
    else if (arg === '--output') options.output = next();
    else throw new Error('Unknown ping load argument');
  }
  if (!(options.exchangeShare >= 0 && options.exchangeShare <= 1)) throw new Error('exchange share must be 0 to 1');
  return options;
}

const list = (value, fallback) => (value ? value.split(',').map(item => item.trim().toUpperCase()).filter(Boolean) : fallback);

/** A staging database. Fixtures are provisioned by the operator (docs/ping-load-test.md). */
async function postgresTarget(env) {
  const url = new URL(env.PING_LOAD_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PING_LOAD_DATABASE_URL must be a postgres URL');
  if (!LOCAL.has(url.hostname)) {
    if (env.PING_LOAD_ALLOWED_HOST !== url.hostname) throw new Error('Non-local host is not the explicitly allowed staging host');
    if (env.PING_LOAD_CONFIRM !== 'synthetic-staging') throw new Error('Set PING_LOAD_CONFIRM=synthetic-staging for a staging run');
  }
  if (!env.PING_LOAD_EXCHANGE_KEY && !env.PING_LOAD_DIRECT_KEY) throw new Error('Set PING_LOAD_EXCHANGE_KEY and/or PING_LOAD_DIRECT_KEY');
  const { default: pg } = await import('pg');
  const max = Math.min(100, Math.max(1, Number(env.PING_LOAD_CONNECTIONS) || 20));
  const pool = new pg.Pool({ connectionString: env.PING_LOAD_DATABASE_URL, max, connectionTimeoutMillis: 10000,
    statement_timeout: 10000 });
  pool.on('error', () => {});
  // Every pooled session acts as the service role with the ping flags on, as PostgREST would.
  pool.on('connect', client => {
    client.query(`SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)`,
      [JSON.stringify({ role: 'service_role' }), JSON.stringify({ 'x-enrollgen-features': JSON.stringify(FEATURES) })])
      .catch(() => {});
  });
  return {
    kind: `postgres-pool-${max}`,
    query: async (sql, args) => (await pool.query(sql, args)).rows,
    exchangeKeyHash: env.PING_LOAD_EXCHANGE_KEY ? sha256(env.PING_LOAD_EXCHANGE_KEY) : null,
    directKeyHash: env.PING_LOAD_DIRECT_KEY ? sha256(env.PING_LOAD_DIRECT_KEY) : null,
    directCampaign: env.PING_LOAD_DIRECT_CAMPAIGN || null,
    states: list(env.PING_LOAD_STATES, ['TX', 'FL']), directStates: list(env.PING_LOAD_DIRECT_STATES, ['KS', 'MO']),
    maxInFlight: max * 2,
    churnMs: env.PING_LOAD_CHURN_MS ? Number(env.PING_LOAD_CHURN_MS) : null,
    close: () => pool.end(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const deadline = setTimeout(() => { console.error('Ping load hard deadline reached'); process.exit(1); },
    (options.durationSeconds + 180) * 1000);
  deadline.unref();
  const target = process.env.PING_LOAD_DATABASE_URL ? await postgresTarget(process.env) : await pgliteLoadTarget();
  try {
    const result = await runPingLoad(target.query, { ...target, ...options });
    // One PGlite connection cannot show concurrency: never claim the spec target from it.
    if (target.kind.startsWith('pglite')) result.spec_target.met = null;
    const report = { target: target.kind, ...result,
      note: target.kind.startsWith('pglite') ? 'Single connection baseline; the spec target needs the staging run in docs/ping-load-test.md.' : null };
    const text = JSON.stringify(report, null, 2);
    if (options.output) writeFileSync(options.output, `${text}\n`);
    console.log(text);
    if (result.errors > 0 || result.double_reservations > 0) process.exitCode = 1;
  } finally { await target.close(); }
}

main().catch(error => { console.error(error.message.slice(0, 200)); process.exitCode = 1; });
