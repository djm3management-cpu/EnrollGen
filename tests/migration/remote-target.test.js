import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF, takeRemoteFlags, assertDatabaseTarget, assertSupabaseApiTarget, refuseProduction } from '../../scripts/lib/remote-target.js';
import { parseArgs } from '../../scripts/migration/live-to-fresh/lib/args.js';

// Synthetic values only. No test opens a socket: every refusal happens before connect.
const REF = 'abcdefghijklmnopqrst', HOST = 'aws-0-test-region.pooler.supabase.com';
const dir = mkdtempSync(join(tmpdir(), 'remote-target-')), CA = join(dir, 'ca.crt');
writeFileSync(CA, 'synthetic');
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const remote = { host: HOST, ref: REF };
const good = `postgresql://postgres.${REF}@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`;
const OLD = 'postgresql://u@127.0.0.1:55432/old';

test('localhost targets behave as before and need no opt-in', () => {
  assert.equal(assertDatabaseTarget('postgresql://u:p@127.0.0.1:54322/postgres', 'new'), 'postgresql://u:p@127.0.0.1:54322/postgres');
  assert.throws(() => assertDatabaseTarget('postgresql://u@127.0.0.1/db?sslrootcert=/x', 'new'), /override/);
  assert.equal(parseArgs(['--old', OLD, '--new', 'postgresql://u@localhost/new']).remote, null);
});

test('a remote target is refused without the explicit opt-in', () => {
  assert.throws(() => assertDatabaseTarget(good, 'new'), /localhost/);
  assert.throws(() => parseArgs(['--old', OLD, '--new', good]), /localhost/);
});

test('the opt-in accepts exactly one host and ref, verify-full TLS with a CA, and no URL password', () => {
  assert.equal(assertDatabaseTarget(good, 'new', remote), good);
  assert.deepEqual(parseArgs(['--old', OLD, '--new', good, '--remote-host', HOST, '--remote-ref', REF]).remote, remote);
  const direct = `postgresql://postgres@db.${REF}.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`;
  assert.equal(assertDatabaseTarget(direct, 'new', { host: `db.${REF}.supabase.co`, ref: REF }), direct);
  assert.throws(() => assertDatabaseTarget(good.replace(HOST, 'other.pooler.supabase.com'), 'new', remote), /does not match --remote-host/);
  assert.throws(() => assertDatabaseTarget(good.replace(`postgres.${REF}`, 'postgres.zyxwvutsrqponmlkjihg'), 'new', remote), /does not name --remote-ref/);
  assert.throws(() => assertDatabaseTarget(good.replace(`postgres.${REF}@`, `postgres.${REF}:secret@`), 'new', remote), /PGPASSWORD/);
  assert.throws(() => assertDatabaseTarget(good.replace('verify-full', 'require'), 'new', remote), /verify-full/);
  assert.throws(() => assertDatabaseTarget(good.replace(encodeURIComponent(CA), encodeURIComponent(join(dir, 'missing.crt'))), 'new', remote), /sslrootcert/);
  assert.throws(() => assertDatabaseTarget(`${good}&host=elsewhere`, 'new', remote), /override/);
  assert.throws(() => takeRemoteFlags(['--remote-host', HOST]), /together/);
  assert.throws(() => takeRemoteFlags(['--remote-host', HOST, '--remote-ref', 'short']), /20-character/);
  assert.throws(() => takeRemoteFlags(['--remote-host', '127.0.0.1', '--remote-ref', REF]), /single DNS host/);
});

test('OLD stays local even with the opt-in', () => {
  assert.throws(() => parseArgs(['--old', good, '--new', good, '--remote-host', HOST, '--remote-ref', REF]), /--old must point at localhost/);
});

test('the production project is refused in every position', () => {
  const prodUrl = `postgresql://postgres.${PRODUCTION_REF}@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`;
  assert.throws(() => refuseProduction(`https://${PRODUCTION_REF}.supabase.co`), /production/);
  assert.throws(() => takeRemoteFlags(['--remote-host', HOST, '--remote-ref', PRODUCTION_REF]), /production/);
  assert.throws(() => takeRemoteFlags(['--remote-host', `db.${PRODUCTION_REF}.supabase.co`, '--remote-ref', REF]), /production/);
  assert.throws(() => assertDatabaseTarget(prodUrl, 'new', remote), /production/);
  assert.throws(() => assertDatabaseTarget(prodUrl, 'new', { host: HOST, ref: PRODUCTION_REF }), /production/);
  assert.throws(() => assertDatabaseTarget(`postgresql://postgres@db.${PRODUCTION_REF.toUpperCase()}.supabase.co/postgres`, 'new'), /production/);
  assert.throws(() => parseArgs(['--old', OLD, '--new', prodUrl, '--remote-host', HOST, '--remote-ref', PRODUCTION_REF]), /production/);
  assert.throws(() => parseArgs(['--old', OLD, '--emit-provisioning', '/tmp/x', '--app-origin', `https://${PRODUCTION_REF}.supabase.co`]), /production/);
  assert.throws(() => assertSupabaseApiTarget(`https://${PRODUCTION_REF}.supabase.co`, remote), /production/);
});

test('SUPABASE_URL is the local stack or exactly the opted-in project API', () => {
  assert.equal(assertSupabaseApiTarget('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
  assert.throws(() => assertSupabaseApiTarget(`https://${REF}.supabase.co`), /local stack/);
  assert.equal(assertSupabaseApiTarget(`https://${REF}.supabase.co`, remote), `https://${REF}.supabase.co`);
  for (const bad of [`http://${REF}.supabase.co`, `https://zyxwvutsrqponmlkjihg.supabase.co`, `https://${REF}.supabase.co.evil.example`, `https://${REF}.supabase.co/rest/v1`])
    assert.throws(() => assertSupabaseApiTarget(bad, remote), /exactly the --remote-ref/);
});

test('bootstrap CLI refuses production and unflagged remote targets before connecting', () => {
  const cli = fileURLToPath(new URL('../../scripts/bootstrap-database.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 20000 });
  const prod = run(['--connection', `postgresql://postgres.${PRODUCTION_REF}@${HOST}:5432/postgres`, '--remote-host', HOST, '--remote-ref', REF]);
  assert.equal(prod.status, 1); assert.match(prod.stderr, /Refusing the production project/);
  const unflagged = run(['--connection', good]);
  assert.equal(unflagged.status, 1); assert.match(unflagged.stderr, /permits localhost only/);
  const withPassword = run(['--connection', good.replace(`postgres.${REF}@`, `postgres.${REF}:secret@`), '--remote-host', HOST, '--remote-ref', REF]);
  assert.equal(withPassword.status, 1); assert.match(withPassword.stderr, /PGPASSWORD/); assert.doesNotMatch(withPassword.stderr, /secret/);
});
