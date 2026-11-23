// Reset-to-empty on the in-process fresh install (stand-in platform) and a fake Storage API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { emptyLocalDatabase } from '../helpers/freshInstall.js';
import { bootstrapEntries } from '../../scripts/bootstrap-database.mjs';
import { statements } from '../../scripts/lib/bootstrap-sql.js';
import { fingerprint, compareFingerprints, resetDatabase, resetStorage, emptyCheck, parseAcl, defaultPrivilegeStatements, parseResetArgs } from '../../scripts/migration/live-to-fresh/reset-to-empty.mjs';
import { PRODUCTION_REF } from '../../scripts/lib/remote-target.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PGlite has a single role; give it the connecting-role shape node-pg would see.
const adapt = pg => ({ query: (sql, params) => pg.query(sql, params) });

test('bootstrap + data + migration ledger + storage policy, then reset: empty check passes and the fingerprint equals the baseline', async () => {
  const pg = await emptyLocalDatabase();
  try {
    const db = adapt(pg);
    // Hosted storage tables carry explicit ACLs; give the stand-in the same shape.
    await pg.exec('GRANT ALL ON storage.objects, storage.buckets TO CURRENT_USER');
    const baseline = await fingerprint(db);
    assert.equal((await emptyCheck(db)).empty, true);
    for (const entry of bootstrapEntries()) for (const s of statements(entry.sql)) if (!/^CREATE EXTENSION IF NOT EXISTS supabase_vault/i.test(s)) await pg.exec(s);
    await pg.exec(`CREATE SCHEMA migration_ledger; CREATE TABLE migration_ledger.runs(id int);
      INSERT INTO storage.objects(bucket_id,name) VALUES('message-media','synthetic/0.gif');
      CREATE POLICY synthetic_storage ON storage.buckets FOR SELECT TO service_role USING(true);`);
    const dirty = compareFingerprints(baseline, await fingerprint(db));
    assert.equal(dirty.equal, false);
    assert.ok(dirty.changed.some(k => k.startsWith('defacl:')) || dirty.added.some(k => k.startsWith('defacl:')), 'bootstrap changed default privileges');
    // Storage rows are removed by the Storage API on hosted; the stand-in has no API.
    await pg.exec(`DELETE FROM storage.objects; DELETE FROM storage.buckets;`);
    const done = await resetDatabase(db, baseline);
    assert.deepEqual(done.schemas.sort(), ['migration_ledger', 'oct_slim_086_rollback', 'oct_slim_088_rollback', 'pii_vault']);
    assert.ok(done.tables > 200 && done.routines > 400 && done.defaultPrivilegeStatements > 0);
    assert.equal(done.storagePolicies, 1);
    assert.equal((await emptyCheck(db)).empty, true);
    const cmp = compareFingerprints(baseline, await fingerprint(db));
    assert.deepEqual({ added: cmp.added, removed: cmp.removed, changed: cmp.changed }, { added: [], removed: [], changed: [] });
  } finally { await pg.close(); }
});

test('default-privilege restoration emits exact GRANT/REVOKE pairs and refuses other owners', () => {
  assert.deepEqual([...parseAcl('{postgres=arwdDxtm/postgres,=X/postgres,"weird role"=r*/x}').entries()].map(([k, v]) => [k, [...v].join('')]), [['postgres', 'arwdDxtm'], ['PUBLIC', 'X'], ['weird role', 'r']]);
  const baseline = { 'defacl:postgres:public:r': '{postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}' };
  const current = { 'defacl:postgres:public:r': '{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}', 'defacl:postgres:-:f': '{postgres=X/postgres}' };
  assert.deepEqual(defaultPrivilegeStatements(baseline, current, 'postgres'), [
    'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO "anon"',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO "authenticated"',
  ]);
  assert.throws(() => defaultPrivilegeStatements({}, { 'defacl:supabase_admin:public:r': '{}' }, 'postgres'), /cannot be restored/);
});

test('storage reset empties and deletes only allowlisted buckets and refuses anything else', async () => {
  const calls = []; let buckets = ['call-recordings', 'message-media', 'rehearsal-test-src'], failDeletes = 1;
  const server = createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== 'Bearer k') { res.writeHead(401).end(); return; }
    if (req.method === 'GET' && req.url === '/storage/v1/bucket') { res.writeHead(200).end(JSON.stringify(buckets.map(id => ({ id })))); return; }
    if (req.method === 'POST' && req.url.endsWith('/empty')) { res.writeHead(200).end('{}'); return; }
    if (req.method === 'DELETE') { if (failDeletes-- > 0) { res.writeHead(400).end('{}'); return; } res.writeHead(200).end('{}'); return; }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await resetStorage(url, 'k', { waitMs: 1 }), buckets);
    assert.equal(calls.filter(c => c.startsWith('DELETE')).length, 4);
    buckets = ['call-recordings', 'someone-elses-bucket']; calls.length = 0;
    await assert.rejects(resetStorage(url, 'k', { waitMs: 1 }), /outside the application\/test allowlist/);
    assert.deepEqual(calls, ['GET /storage/v1/bucket']);
  } finally { await new Promise(r => server.close(r)); }
});

test('reset refuses production, other refs, unconfirmed or unflagged targets before connecting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reset-')), ca = join(dir, 'ca.crt'); writeFileSync(ca, 'x');
  try {
    const REF = 'abcdefghijklmnopqrst', HOST = 'aws-0-x.pooler.supabase.com';
    const url = ref => `postgresql://postgres.${ref}@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
    const ok = ['--connection', url(REF), '--remote-host', HOST, '--remote-ref', REF, '--baseline', 'b', '--api-url', `https://${REF}.supabase.co`, '--confirm-reset', REF];
    assert.equal(parseResetArgs(ok).remote.ref, REF);
    assert.throws(() => parseResetArgs(ok.map(a => a === REF ? PRODUCTION_REF : a.replace(REF, PRODUCTION_REF))), /production/);
    assert.throws(() => parseResetArgs([...ok.slice(0, -1), 'zyxwvutsrqponmlkjihg']), /repeat --remote-ref/);
    assert.throws(() => parseResetArgs(ok.map(a => a === `https://${REF}.supabase.co` ? 'https://zyxwvutsrqponmlkjihg.supabase.co' : a)), /exactly the --remote-ref/);
    assert.throws(() => parseResetArgs(ok.map(a => a === url(REF) ? url('zyxwvutsrqponmlkjihg') : a)), /does not name --remote-ref/);
    assert.throws(() => parseResetArgs(['--connection', 'postgresql://u@127.0.0.1/x', '--baseline', 'b', '--api-url', 'http://127.0.0.1:54321', '--confirm-reset', REF]), /explicitly named project/);
    assert.throws(() => parseResetArgs(ok.filter((a, i) => i < 10)), /required to reset/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
