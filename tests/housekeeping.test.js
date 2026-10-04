import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csvCell } from '../src/lib/csv.js';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('CSV neutralizes formulas, ignored whitespace, quotes and embedded newlines', () => {
  for (const value of ['=1+1', '+123', '-42', '@SUM(A1)', ' \t=1', '\uFEFF=2', '\r=3', '\ntext']) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(null), '""');
});

test('browser Biblia helper forwards bearer credentials without a provider key', async () => {
  const originalFetch = globalThis.fetch;
  const { fetchBibliaContent } = await load(await readFile(new URL('../src/lib/bibliaApi.js', import.meta.url), 'utf8'));
  try {
    globalThis.fetch = async (url, options) => {
      assert.ok(url.startsWith('/.netlify/functions/biblia?'));
      assert.ok(!url.includes('key='));
      assert.equal(options.headers.Authorization, 'Bearer session');
      return new Response(JSON.stringify({ text: 'verse', reference: 'John 3:16' }));
    };
    assert.equal((await fetchBibliaContent('John 3:16', 'leb', { getToken: async () => 'session' })).text, 'verse');
  } finally { globalThis.fetch = originalFetch; }
});

test('Biblia proxy authenticates, validates, withholds upstream errors and key', async () => {
  const source = (await readFile(new URL('../netlify/functions/biblia.js', import.meta.url), 'utf8'))
    .replace("import { requireClerkAuth } from './_clerkAuth.js';", `async function requireClerkAuth(request, options) {
      if (options.allowBypass !== false) throw new Error('bypass allowed');
      return request.headers.get('authorization') === 'Bearer good' ? {} : { response: new Response('{}', { status: 401 }) };
    }`);
  const handler = (await load(source)).default;
  const originalFetch = globalThis.fetch, originalKey = process.env.BIBLIA_API_KEY;
  const req = query => new Request('https://example.com/.netlify/functions/biblia?' + query, { headers: { authorization: 'Bearer good' } });
  try {
    process.env.BIBLIA_API_KEY = 'server-secret';
    assert.equal((await handler(new Request('https://example.com/'))).status, 401);
    assert.equal((await handler(req('operation=content&bibleId=arbitrary&reference=John'))).status, 400);
    globalThis.fetch = async url => {
      assert.equal(url.searchParams.get('key'), 'server-secret');
      return new Response('secret upstream text', { status: 403 });
    };
    const response = await handler(req('operation=content&bibleId=leb&reference=John'));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '{"error":"Bible provider unavailable"}');
    delete process.env.BIBLIA_API_KEY;
    assert.equal((await handler(req('operation=content&bibleId=leb&reference=John'))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BIBLIA_API_KEY; else process.env.BIBLIA_API_KEY = originalKey;
  }
});

test('skipped contact CSV neutralizes user supplied headers and fields', async () => {
  const source = (await readFile(new URL('../src/lib/contactImport.js', import.meta.url), 'utf8'))
    .replace('"./csv.js"', JSON.stringify(new URL('../src/lib/csv.js', import.meta.url).href))
    .replace('"./phone"', JSON.stringify(new URL('../src/lib/phone.js', import.meta.url).href));
  const { buildSkippedCsv } = await load(source);
  assert.equal(buildSkippedCsv([{ raw: { '=header': ' \t@formula', plain: 'a,"b"' }, flags: ['=bad'] }], ['=header', 'plain']),
    '"\'=header","plain","skip_reason"\n"\' \t@formula","a,""b""","\'=bad"');
});

test('static browser diagnostics require explicit development opt-in', async () => {
  const source = await readFile(new URL('../src/lib/debugLog.js', import.meta.url), 'utf8');
  for (const [env, expected] of [[{ DEV: false, VITE_DEBUG_LOGS: 'true' }, 0], [{ DEV: true }, 0], [{ DEV: true, VITE_DEBUG_LOGS: 'true' }, 1]]) {
    const calls = [];
    const logger = await load(`const environment = ${JSON.stringify(env)}; const console = { debug: event => globalThis.__debugEvents.push(event) };\n` + source.replaceAll('import.meta.env', 'environment'));
    globalThis.__debugEvents = calls;
    try { logger.debugLog('static event'); assert.equal(calls.length, expected); } finally { delete globalThis.__debugEvents; }
  }
});

test('source diagnostics contain static labels only, excluding the deleted legacy Operations surface', async () => {
  const { readdir } = await import('node:fs/promises');
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { await inspect(url); continue; }
      if (!/\.(jsx?|ts)$/.test(entry.name) || ['debugLog.js', 'OperationsTab.jsx', 'client.ts'].includes(entry.name)) continue;
      const source = await readFile(url, 'utf8');
      assert.doesNotMatch(source, /console\s*\./, url.pathname);
      for (const match of source.matchAll(/debugLog\(("(?:[^"\\]|\\.)*")\)/g)) assert.equal(typeof JSON.parse(match[1]), 'string');
      assert.equal([...source.matchAll(/debugLog\(/g)].length, [...source.matchAll(/debugLog\(("(?:[^"\\]|\\.)*")\)/g)].length, url.pathname);
    }
  }
  await inspect(new URL('../src/', import.meta.url));
});
