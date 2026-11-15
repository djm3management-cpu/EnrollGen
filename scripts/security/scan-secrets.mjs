import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceFiles, directoryFiles} from './source-files.mjs';
import {secretAllowlist} from './secret-allowlist.mjs';
import {matchesException, reviewExceptions} from './secret-exceptions.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
// Whole-value documentation placeholders only. Provider-shaped keys are NEVER
// exempt merely because they contain "test", or because they live in tests/.
const placeholder = value => /^(?:(?:[a-z]+_)?replace[-_](?:with[-_])?[a-z0-9_-]+|your[-_][a-z0-9_-]+|<[^<>\r\n]+>|\$\{[A-Z_]+\}|fixture|fake-only|placeholder|test|secret|changeme|CHANGEME|\.\.\.)$/i.test(value);
const patterns = [
  ['openai-key', /\bsk-(?:proj-|admin-)?[A-Za-z0-9_-]{20,}/g],
  ['clerk-secret', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['signing-secret', /\bwhsec_[A-Za-z0-9+/=_-]{16,}/g],
  ['supabase-service-key', /\bsb_secret_[A-Za-z0-9_-]{16,}/g],
  ['resend-key', /\bre_[A-Za-z0-9_]{20,}/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['password-connection-string', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|https?):\/\/[^\s/@:'"`]+:([^\s/@'"`]+)@[^\s'"`]+/gi],
  ['webhook-capability', /https:\/\/(?:hooks\.slack\.com\/services\/|(?:[^/\s]+\.)?leadconnectorhq\.com\/hooks\/|(?:[^/\s]+\.)?gohighlevel\.com\/hooks\/|discord(?:app)?\.com\/api\/webhooks\/)[^\s'"`<>]+/gi],
  ['webhook-capability', /https?:\/\/[^\s'"`<>]+[?&](?:token|key|secret|signature|access_token|capability)=[A-Za-z0-9_%+./=-]{16,}/gi],
];
const assignment = /["']?([A-Za-z_][A-Za-z0-9_.-]*(?:KEY|TOKEN|SECRET|PASSWORD)|pushSecret|postbackSecret|apiKey|authToken|signingSecret|password)["']?[ \t]*[:=][ \t]*(?:["']([^"'\r\n]+)["']|([A-Za-z0-9_+/=.:%@-]{16,})(?=[ \t]*(?:$|[#;,}])))/gmi;
function assignmentType(name) {
  if (!/(?:API_?KEY|API_?TOKEN|AUTH_?TOKEN|ACCESS_?TOKEN|SECRET|PASSWORD|SERVICE_ROLE_KEY|SERVICE_KEY)$/i.test(name) || /PUBLIC|PUBLISHABLE|ANON|JWT_KEY|PRICE_ID|KEY_HASH/i.test(name)) return null;
  if (/SUPABASE.*(?:SERVICE|SECRET)/i.test(name)) return 'supabase-service-key';
  if (/TWILIO/i.test(name)) return 'twilio-secret';
  if (/DEEPGRAM/i.test(name)) return 'deepgram-key';
  if (/OPENAI/i.test(name)) return 'openai-key';
  if (/CLERK/i.test(name)) return 'clerk-secret';
  if (/RESEND/i.test(name)) return 'resend-key';
  if (/STRIPE/i.test(name) && !/WEBHOOK/i.test(name)) return 'stripe-key';
  if (/SECRET|signing|pushSecret|postbackSecret/i.test(name)) return 'signing-secret';
  return 'provider-credential';
}
export function scanText(content, file, {allowlist = secretAllowlist, fingerprints = false, now = new Date()} = {}) {
  const findings = [], seen = new Set();
  const add = (type, value, offset) => {
    if (placeholder(value)) return;
    const line = content.slice(0, offset).split('\n').length, column = offset - content.lastIndexOf('\n', offset-1);
    const finding = {path:file, line, column, type, sha256:digest(value)};
    if (allowlist.some(entry => matchesException(entry, finding, now))) return;
    const key = `${line}:${type}:${digest(value)}`;
    if (!seen.has(key)) findings.push({path: file, line, type, ...(fingerprints ? {sha256:digest(value), column} : {})});
    seen.add(key);
  };
  for (const [type, regex] of patterns) {
    for (const match of content.matchAll(regex)) {
      // Credential-free example connection URLs and capability placeholders.
      if (type === 'password-connection-string' && placeholder(match[1])) continue;
      if (type === 'webhook-capability' && /(?:\/\.\.\.|\/your[-_]|=replace-with-|=<)/i.test(match[0])) continue;
      add(type, match[0], match.index);
    }
  }
  for (const match of content.matchAll(assignment)) {
    const type = assignmentType(match[1]), value = match[2] || match[3];
    if (match[3] && !/^[A-Z][A-Z0-9_]*$/.test(match[1])) continue;
    if (type && value.length >= 16 && !/[\s{}()]/.test(value) && !/^(?:https?:\/\/|[a-z]+\.)/.test(value)) add(type, value, match.index);
  }
  // Legacy Supabase service-role JWTs have no unique prefix beyond JWT itself.
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url')).role === 'service_role') add('supabase-service-key', match[0], match.index);
    } catch { /* Not a decodable JWT. Other rules still apply. */ }
  }
  return findings;
}
export function scanFiles(root, {directory = false, ...options} = {}) {
  return (directory ? directoryFiles(root) : sourceFiles(root)).flatMap(file => scanText(readFileSync(path.join(root, file)).toString('utf8'), file, options));
}
export function historyReport(root) {
  const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024});
  const commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean), cache = new Map(), findings = [];
  for (const commit of commits) {
    const entries = git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean);
    const missing = entries.map(entry => entry.match(/^\d+ blob ([a-f0-9]+)\t([\s\S]*)$/)).filter(Boolean).filter(m => !cache.has(m[1]));
    const ids = [...new Set(missing.map(m => m[1]))];
    if (ids.length) {
      const batch = spawnSync('git', ['cat-file', '--batch'], {cwd: root, input: ids.join('\n')+'\n', maxBuffer: 512 * 1024 * 1024});
      if (batch.status !== 0) throw Error('History object read failed');
      let offset = 0;
      for (const id of ids) {
        const end = batch.stdout.indexOf(10, offset), header = batch.stdout.subarray(offset, end).toString().split(' '), size = Number(header[2]);
        if (header[1] !== 'blob' || !Number.isSafeInteger(size)) throw Error('Invalid history object');
        const content = batch.stdout.subarray(end+1, end+1+size).toString('utf8');
        // Keep only redacted findings in memory; match allowlists per path below.
        cache.set(id, scanText(content, '', {allowlist:[], fingerprints:true})); offset = end+size+2;
      }
    }
    for (const entry of entries) {
      const match = entry.match(/^\d+ blob ([a-f0-9]+)\t([\s\S]*)$/);
      if (!match) continue;
      for (const finding of cache.get(match[1])) {
        if (secretAllowlist.some(entry => matchesException(entry, {...finding,path:match[2]}, new Date(), {history:true}))) continue;
        const safe = {line:finding.line, type:finding.type};
        findings.push({commit, ...safe, path:match[2]});
      }
    }
  }
  const byType = {}, byPath = {};
  for (const f of findings) { byType[f.type] = (byType[f.type] || 0)+1; byPath[f.path] = (byPath[f.path] || 0)+1; }
  return {commitsScanned: commits.length, findingCount: findings.length, byType, byPath, findings};
}
export function run(args, {allowlist = secretAllowlist, now = new Date(), log = console.log} = {}) {
  if (args[0] === '--history' && args.length === 2) {
    const report = historyReport(process.cwd());
    writeFileSync(path.resolve(args[1]), JSON.stringify(report, null, 2)+'\n', {flag: 'wx', mode: 0o600});
    console.log(`PASS history scan: ${report.commitsScanned} commits; ${report.findingCount} redacted findings`);
    return 0;
  }
  if (args.length && !(args[0] === '--directory' && args.length === 2)) throw Error('Usage: scan-secrets.mjs [--directory path | --history new-report.json]');
  const review = reviewExceptions(allowlist, now);
  for (const message of [...review.warnings, ...review.failures]) log(message);
  const findings = scanFiles(args[1] ? path.resolve(args[1]) : process.cwd(), {directory: Boolean(args.length), allowlist, now});
  for (const f of findings) log(`${f.path}:${f.line}: ${f.type}`);
  const failed = findings.length || review.failures.length;
  log(`${failed ? 'FAIL' : 'PASS'} secret scan: ${findings.length} findings; ${review.warnings.length} active exceptions`);
  return failed ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch { console.error('FAIL secret scan: unable to complete safely'); process.exitCode = 1; }
}
