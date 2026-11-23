// Storage copy step against an in-process fake Storage API on 127.0.0.1. Synthetic bytes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyStorage, storageClient, parseStorageCopyArgs } from '../../scripts/migration/live-to-fresh/storage-copy.mjs';
import { PRODUCTION_REF } from '../../scripts/lib/remote-target.js';

const KEY = 'synthetic-service-key';
async function fakeStorage({ buckets, corruptOnStore = false }) {
  const objects = new Map(); let uploads = 0;
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url, 'http://x'), parts = url.pathname.split('/').slice(3).map(decodeURIComponent);
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    if (req.method === 'GET' && parts[0] === 'bucket') { const b = buckets[parts[1]]; if (!b) { res.writeHead(404).end('{}'); return; } res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: parts[1], public: b.public })); return; }
    if (parts[0] === 'object') {
      const authed = parts[1] === 'authenticated', bucket = authed ? parts[2] : parts[1], path = parts.slice(authed ? 3 : 2).join('/'), k = `${bucket}/${path}`;
      if (req.method === 'GET') { if (!objects.has(k)) { res.writeHead(400).end('{}'); return; } res.writeHead(200).end(objects.get(k)); return; }
      if (req.method === 'POST') { if (!buckets[bucket]) { res.writeHead(400).end('{}'); return; } if (objects.has(k)) { res.writeHead(409).end('{}'); return; } uploads++; const stored = Buffer.from(body); if (corruptOnStore && stored.length) stored[0] ^= 0xff; objects.set(k, stored); res.writeHead(200).end('{}'); return; }
    }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, objects, uploads: () => uploads, close: () => new Promise(r => server.close(r)) };
}
const md5 = b => createHash('md5').update(b).digest('hex');
function synthetic(n, src = 'src-bucket', dst = 'dst-bucket') {
  const files = Array.from({ length: n }, (_, i) => ({ path: `tenant-x/CA${i}/RE${i}.wav`, bytes: randomBytes(1000 + i * 37) }));
  const manifest = { objects: files.map(f => ({ old_bucket: src, old_path: f.path, new_bucket: dst, new_path: f.path, bytes: f.bytes.length, mimetype: 'audio/wav', etag: `"${md5(f.bytes)}"`, unreferenced: false, copy: true })) };
  return { files, manifest };
}
const tmp = () => mkdtempSync(join(tmpdir(), 'storage-copy-'));

test('copies every object, preserves paths, verifies size and SHA-256, and writes a 0600 ledger; logs carry no content or paths', async () => {
  const s = await fakeStorage({ buckets: { 'src-bucket': { public: false }, 'dst-bucket': { public: false } } });
  const dir = tmp();
  try {
    const { files, manifest } = synthetic(10);
    for (const f of files) s.objects.set(`src-bucket/${f.path}`, f.bytes);
    const logs = []; const client = storageClient(s.url, KEY);
    const t = await copyStorage({ manifest, ledgerFile: join(dir, 'ledger.json'), source: client, target: client, concurrency: 3, log: m => logs.push(m) });
    assert.equal(t.verified, 10); assert.equal(t.copied, 10); assert.deepEqual(t.failed, []);
    for (const f of files) assert.ok(s.objects.get(`dst-bucket/${f.path}`).equals(f.bytes));
    assert.equal(statSync(join(dir, 'ledger.json')).mode & 0o777, 0o600);
    assert.equal(Object.keys(JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8')).verified).length, 10);
    const text = JSON.stringify([logs, t]);
    assert.ok(!files.some(f => text.includes(f.path) || text.includes(f.bytes.toString('base64').slice(0, 16))));
    // Resume: a second run re-uploads nothing.
    const before = s.uploads();
    const t2 = await copyStorage({ manifest, ledgerFile: join(dir, 'ledger.json'), source: client, target: client });
    assert.equal(t2.skippedFromLedger, 10); assert.equal(s.uploads(), before);
    // Lost ledger: identical bytes already in the target are accepted without overwrite.
    const t3 = await copyStorage({ manifest, ledgerFile: join(dir, 'ledger2.json'), source: client, target: client });
    assert.equal(t3.alreadyPresent, 10); assert.equal(s.uploads(), before);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('mismatches fail per object and are never recorded as verified', async () => {
  const dir = tmp();
  const s = await fakeStorage({ buckets: { 'src-bucket': { public: false }, 'dst-bucket': { public: false } }, corruptOnStore: true });
  try {
    const { files, manifest } = synthetic(3);
    for (const f of files) s.objects.set(`src-bucket/${f.path}`, f.bytes);
    s.objects.delete(`src-bucket/${files[2].path}`); // missing source
    const client = storageClient(s.url, KEY);
    const t = await copyStorage({ manifest, ledgerFile: join(dir, 'l.json'), source: client, target: client });
    assert.equal(t.verified, 0);
    assert.deepEqual(t.failed.map(f => f.reason).sort(), ['source object missing', 'target bytes differ after upload', 'target bytes differ after upload']);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'l.json'), 'utf8')).verified, {});
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
  const s2 = await fakeStorage({ buckets: { 'src-bucket': { public: false }, 'dst-bucket': { public: false } } });
  const dir2 = tmp();
  try {
    const { files, manifest } = synthetic(2);
    s2.objects.set(`src-bucket/${files[0].path}`, files[0].bytes);
    s2.objects.set(`src-bucket/${files[1].path}`, Buffer.concat([files[1].bytes.subarray(0, 10), Buffer.alloc(files[1].bytes.length - 10)]));
    s2.objects.set(`dst-bucket/${files[0].path}`, Buffer.alloc(files[0].bytes.length));
    const client = storageClient(s2.url, KEY);
    const t = await copyStorage({ manifest, ledgerFile: join(dir2, 'l3.json'), source: client, target: client });
    assert.deepEqual(t.failed.map(f => f.reason).sort(), ['source bytes differ from manifest etag', 'target already holds different bytes at this path']);
    assert.ok(s2.objects.get(`dst-bucket/${files[0].path}`).equals(Buffer.alloc(files[0].bytes.length)), 'never overwrites');
  } finally { await s2.close(); rmSync(dir2, { recursive: true, force: true }); }
});

test('refuses public or missing target buckets, and the production project as target', async () => {
  const s = await fakeStorage({ buckets: { 'src-bucket': { public: false }, 'dst-bucket': { public: true } } });
  const dir = tmp();
  try {
    const { manifest } = synthetic(1); const client = storageClient(s.url, KEY);
    await assert.rejects(copyStorage({ manifest, ledgerFile: join(dir, 'l.json'), source: client, target: client }), /not private/);
    await assert.rejects(copyStorage({ manifest: synthetic(1, 'src-bucket', 'nope').manifest, ledgerFile: join(dir, 'l.json'), source: client, target: client }), /missing/);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
  const base = ['--manifest', 'm', '--ledger', 'l', '--source-url', 'https://abcdefghijklmnopqrst.supabase.co'];
  assert.throws(() => parseStorageCopyArgs([...base, '--target-url', `https://${PRODUCTION_REF}.supabase.co`, '--target-ref', PRODUCTION_REF]), /production/);
  assert.throws(() => parseStorageCopyArgs([...base, '--target-url', 'https://zyxwvutsrqponmlkjihg.supabase.co', '--target-ref', 'abcdefghijklmnopqrst']), /exactly the --remote-ref/);
  assert.throws(() => parseStorageCopyArgs([...base, '--target-url', 'https://zyxwvutsrqponmlkjihg.supabase.co']), /--target-ref is required/);
  assert.throws(() => parseStorageCopyArgs(['--manifest', 'm', '--ledger', 'l', '--source-url', 'https://evil.example', '--target-url', 'http://127.0.0.1:54321']), /source-url/);
  assert.equal(parseStorageCopyArgs([...base, '--target-url', 'https://zyxwvutsrqponmlkjihg.supabase.co', '--target-ref', 'zyxwvutsrqponmlkjihg']).targetRef, 'zyxwvutsrqponmlkjihg');
});
