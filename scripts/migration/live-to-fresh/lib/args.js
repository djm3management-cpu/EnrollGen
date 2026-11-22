// Command-line parsing and the local-only connection guard.
// Both databases must be on this machine. Anything else is refused before
// a connection is attempted.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function assertLocalConnection(value, label) {
  let url;
  try { url = new URL(value); } catch { throw Error(`--${label} must be a postgresql:// URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error(`--${label} must be a postgresql:// URL`);
  if (!LOCAL_HOSTS.has(url.hostname)) throw Error(`--${label} must point at localhost or 127.0.0.1; refusing to run`);
  for (const key of ['host', 'hostaddr', 'service', 'options', 'sslrootcert', 'passfile']) {
    if (url.searchParams.has(key)) throw Error(`--${label} may not override the host or service via query parameters`);
  }
  return value;
}

export function parseArgs(argv) {
  const out = { dryRun: false, verify: false, table: null, old: null, new: null, emitProvisioning: null, batchSize: 500, appOrigin: null, telephonyOrigin: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--old') out.old = next();
    else if (a === '--new') out.new = next();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verify') out.verify = true;
    else if (a === '--table') out.table = next();
    else if (a === '--batch-size') out.batchSize = Number(next());
    else if (a === '--emit-provisioning') out.emitProvisioning = next();
    else if (a === '--app-origin') out.appOrigin = next();
    else if (a === '--telephony-origin') out.telephonyOrigin = next();
    else throw Error(`Unknown argument ${a}`);
  }
  if (!out.old) throw Error('--old <url> is required');
  assertLocalConnection(out.old, 'old');
  if (!out.emitProvisioning) {
    if (!out.new) throw Error('--new <url> is required');
    assertLocalConnection(out.new, 'new');
  } else if (out.new) assertLocalConnection(out.new, 'new');
  if (out.dryRun && out.verify) throw Error('--dry-run and --verify are exclusive');
  if (!Number.isInteger(out.batchSize) || out.batchSize < 1 || out.batchSize > 5000) throw Error('--batch-size must be 1..5000');
  return out;
}
