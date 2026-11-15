import {sourceFiles} from '../scripts/security/source-files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import Papa from 'papaparse';
import { SPREADSHEET_LIMITS, readWorkbook, sheetObjects, sheetArrays, runSpreadsheetWorker, excelSerialIsoDate } from '../netlify/functions/_spreadsheet.js';
import { parseRtsFile, readRtsUploadForm, MAX_RTS_MULTIPART_BYTES } from '../netlify/functions/_rtsIngestion.js';
import { readTabularFile, toIsoDate } from '../scripts/sep-data/common.js';
import { parseDsnpWorkbook } from '../scripts/parse_cms_dsnp.js';
import { prepareDsnp2027 } from '../scripts/sep-data/prepare-dsnp-2027.js';
import { packZip, unpackZip } from './helpers/spreadsheetZip.js';

const fixture = name => new URL(`./fixtures/spreadsheets/${name}`, import.meta.url);
const bytes = name => readFileSync(fixture(name));
const golden = JSON.parse(bytes('sheetjs-golden.json'));
const upload = (buffer, name = 'renamed.xlsx') => parseRtsFile(new File([buffer], name));
const entries = () => unpackZip(bytes('shapes.xlsx'));
const changed = (path, transform) => { const parts = entries(); parts[path] = transform(parts[path].toString()); return packZip(parts); };
for (const [name, expected] of Object.entries(golden).filter(([name]) => name.endsWith('.xlsx'))) {
  test(`${name}: every sheet preserves captured rows, headers, formats and dates`, async () => {
    const workbook = await readWorkbook(fixture(name));
    assert.deepEqual(workbook.map(({ sheet, data }) => ({ sheet, objects: sheetObjects(data, null), arrays: sheetArrays(data) })), expected);
  });
}

test('RTS workbook output preserves first sheet, complete sheet names and existing cell cleaning', async () => {
  const result = await upload(bytes('shapes.xlsx'));
  const expected = golden['shapes.xlsx'][0].objects.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : value])));
  assert.deepEqual(result, { rows: expected, headers: Object.keys(expected[0]), sheetName: 'Roster', sheetNames: ['Roster', 'Notes'] });
});

test('CSV and TSV uploads keep Papa header, quoting, multiline, missing-field and blank-line behavior', async () => {
  for (const [name, delimiter] of [['source.csv', ','], ['source.tsv', '\t']]) {
    const data = Papa.unparse([{ ' Agent ': ' Synthetic ', NPN: '001234', Note: 'a,"b"\nc' }], { delimiter });
    const result = await upload(Buffer.from(data + '\r\n\r\n'), name);
    assert.deepEqual(result.rows, [{ Agent: 'Synthetic', NPN: '001234', Note: 'a,"b"\nc' }]);
    assert.equal(result.sheetName, null);
  }
  assert.deepEqual((await upload(Buffer.from('A,B\nx\n'), 'source.csv')).rows, [{ A: 'x' }]);
  assert.deepEqual((await upload(Buffer.from('A,B'), 'source.csv')).headers, ['A', 'B']);
  await assert.rejects(upload(Buffer.from('A,B\nx,y,z\n'), 'source.csv'), /Unable to parse CSV/);
});

test('serial conversion preserves captured SSF values and handles invalid values', () => {
  for (const { serial, iso } of golden.serialDates) {
    assert.equal(excelSerialIsoDate(serial), iso, `${serial}`);
    assert.equal(toIsoDate(serial), serial === -1 ? new Date(String(serial)).toISOString().slice(0, 10) : iso, `${serial}`);
  }
  for (const number of [NaN, Infinity, -Infinity]) assert.equal(toIsoDate(number), null);
  assert.equal(toIsoDate(new Date('2027-01-02T00:00:00Z')), '2027-01-02');
});

for (const [name, content, pattern] of [
  ['legacy XLS renamed as XLSX', () => bytes('legacy.xls'), /Save the file as \.xlsx/],
  ['macro workbook renamed as XLSX', () => bytes('macro.xlsm'), /Save the file as \.xlsx/],
  ['renamed PDF', () => Buffer.from('%PDF-1.7\nsynthetic'), /signature.*\.xlsx/],
  ['renamed text', () => Buffer.from('Agent,NPN\nSynthetic,001234'), /signature.*\.xlsx/],
  ['renamed ZIP without spreadsheet contents', () => packZip({ 'note.txt': 'synthetic' }), /content signature/],
  ['upload over 10 MiB', () => Buffer.alloc(SPREADSHEET_LIMITS.uploadBytes + 1), /smaller than 10 MB/],
  ['too many sheets', () => changed('xl/workbook.xml', xml => xml.replace('</sheets>', '<sheet name="Extra" sheetId="99" r:id="rId99"/>'.repeat(SPREADSHEET_LIMITS.sheets) + '</sheets>')), /Sheet limit/],
  ['too many rows, sparse address', () => changed('xl/worksheets/sheet1.xml', xml => xml.replace('r="A4"', `r="A${SPREADSHEET_LIMITS.rows + 1}"`)), /Row limit/],
  ['too many columns, sparse address', () => changed('xl/worksheets/sheet1.xml', xml => xml.replace('r="A4"', 'r="CW4"')), /Column limit/],
  ['unsafe XML entity declaration', () => changed('xl/workbook.xml', xml => '<!DOCTYPE workbook [<!ENTITY bomb "bad">]>' + xml), /Unsafe XML/],
]) test(`rejects ${name}`, async () => { await assert.rejects(upload(content()), pattern); });

test('legacy and macro signatures are rejected even under CSV and misleading legacy extensions', async () => {
  for (const name of ['fake.csv', 'fake.tsv', 'fake.xls', 'fake.xlsm']) {
    for (const source of ['legacy.xls', 'macro.xlsm']) await assert.rejects(upload(bytes(source), name), /Save the file as \.xlsx/);
  }
  // Content decides: an ordinary XLSX with a misleading legacy suffix still parses.
  assert.equal((await upload(bytes('shapes.xlsx'), 'ordinary.xls')).rows.length, 2);
});

test('decompressed size bounds reject real and forged-size ZIP bombs before reader work', async () => {
  const parts = entries();
  parts['padding.xml'] = ' '.repeat(SPREADSHEET_LIMITS.decompressedBytes + 1);
  const bomb = packZip(parts);
  assert.ok(bomb.length < SPREADSHEET_LIMITS.uploadBytes);
  await assert.rejects(upload(bomb), /Decompressed size limit/);
  // Lie consistently in both headers: bounded native inflation still stops it.
  const end = bomb.length - 22;
  let cursor = bomb.readUInt32LE(end + 16);
  while (bomb.readUInt32LE(cursor) === 0x02014b50) {
    const n = bomb.readUInt16LE(cursor + 28), x = bomb.readUInt16LE(cursor + 30), c = bomb.readUInt16LE(cursor + 32);
    if (bomb.subarray(cursor + 46, cursor + 46 + n).toString() === 'padding.xml') {
      bomb.writeUInt32LE(1, cursor + 24);
      bomb.writeUInt32LE(1, bomb.readUInt32LE(cursor + 42) + 22);
    }
    cursor += 46 + n + x + c;
  }
  await assert.rejects(upload(bomb), /Decompressed size limit/);
});

test('all sheets are bounded, including custom worksheet paths and ignored later sheets', async () => {
  const parts = entries();
  parts['xl/custom.xml'] = parts['xl/worksheets/sheet2.xml'].toString().replace('r="A2"', 'r="XFD2"');
  delete parts['xl/worksheets/sheet2.xml'];
  parts['xl/_rels/workbook.xml.rels'] = parts['xl/_rels/workbook.xml.rels'].toString().replace('worksheets/sheet2.xml', 'custom.xml');
  await assert.rejects(upload(packZip(parts)), /Column limit/);
});

test('CSV dimensions are bounded before cell truncation or model work', async () => {
  await assert.rejects(upload(Buffer.from('A\n' + 'Synthetic\n'.repeat(SPREADSHEET_LIMITS.rows)), 'a.csv'), /Row limit/);
  await assert.rejects(upload(Buffer.from(Array.from({ length: 101 }, (_, i) => `Column${i}`).join(',')), 'a.csv'), /Column limit/);
});

test('slow synchronous parsing is terminated and awaited by the deadline', async () => {
  const start = Date.now();
  await assert.rejects(runSpreadsheetWorker(Buffer.from('synthetic'), 'xlsx', { ...SPREADSHEET_LIMITS, parseMs: 100 }, async function stalledJob() { while (true) { /* CPU-bound adversarial parser */ } }), /parse time limit exceeded/);
  assert.ok(Date.now() - start < 3000);
});

test('cached formula values are read as data; formulas and external references are never evaluated', async () => {
  const workbook = changed('xl/worksheets/sheet1.xml', xml => xml.replace('<c r="D2"><v>12.5</v></c>', '<c r="D2"><f>WEBSERVICE("https://synthetic.invalid/never-call")</f><v>42</v></c>').replace('<c r="D4"><v>0</v></c>', '<c r="D4"><f>1+1</f></c>'));
  const result = await upload(workbook);
  assert.equal(result.rows[0].Amount, '42');
  assert.equal(result.rows[1].Amount, null);
});

test('common operator reader preserves header selection, duplicate handling, sheets and dates', async () => {
  const rows = await readTabularFile({ file: fixture('offset.xlsx').pathname, headerIncludes: 'Code' });
  assert.deepEqual(rows, [{ Code: '001', '': '2' }, { Code: '002', '': '3' }]);
  const formatted = await readTabularFile({ file: fixture('formats.xlsx').pathname });
  assert.deepEqual(formatted, golden['formats.xlsx'][0].objects.map(row => ({ ...row, Text: ' spaces ' })));
  await assert.rejects(readTabularFile({ file: fixture('shapes.xlsx').pathname, sheet: 'Missing' }), /Sheet not found/);
});

const landscape = [{ plan_year: 2027, category: 'SNP', snp_type: 'Dual-Eligible', state_code: 'NJ', contract_id: 'H1234', plan_id: '001', plan_name: 'Synthetic Plan', carrier: 'Fixture', county_fips: '34021', county_name: 'Mercer' }];
test('D-SNP preparer reconciles fixture workbooks and emits the same complete records', async () => {
  const file = fixture('cy2027-dsnp.xlsx').pathname;
  const parsed = parseDsnpWorkbook(await readWorkbook(file), { live: true, fileName: 'cy2027-dsnp.xlsx' });
  assert.equal(parsed.sheetName, 'CY 2027 Data');
  const result = await prepareDsnp2027(file, file, landscape);
  assert.deepEqual(result.countyRows, [{ contract_id: 'H1234', plan_id: '001', plan_name: 'Synthetic Plan', organization_name: 'Fixture', snp_type: 'D-SNP', county_fips: '34021', county_name: 'Mercer', state_code: 'NJ', plan_year: 2027, integration_level: 'AIP', applicable_integrated_plan: true, integration_source: 'CMS CY2027 integration-status workbook' }]);
  assert.equal(result.alignment[0].eae_status, null);
  assert.equal(result.report.matchedSourcePlans, 1);
});

test('operator CLIs export Papa CSV and run the async SNP preparation locally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p09-operator-'));
  try {
    const file = fixture('cy2027-dsnp.xlsx').pathname, csv = join(dir, 'plans.csv'), json = join(dir, 'plans.json'), input = join(dir, 'landscape.jsonl');
    const run = args => {
      const result = spawnSync(process.execPath, ['--import', './tests/fixtures/deployment-env.js', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      assert.equal(result.status, 0, result.stderr);
      return result;
    };
    run(['scripts/parse_cms_dsnp.js', '--file', file, '--csv-out', csv]);
    assert.deepEqual(Papa.parse(readFileSync(csv, 'utf8'), { header: true, skipEmptyLines: true }).data, [{ state: 'NJ', county: '', carrier: 'Fixture', planName: 'Fixture', contractId: 'H1234', planId: '001', integrationLevel: 'AIP', eaeStatus: '', affiliatedMco: '' }]);
    writeFileSync(input, landscape.map(JSON.stringify).join('\n') + '\n');
    run(['scripts/sep-data/ingest-snp-plans.js', '--integration-file', file, '--status-file', file, '--landscape-file', input, '--dry-run', '--output', json]);
    assert.equal(JSON.parse(readFileSync(json)).countyRows[0].integration_level, 'AIP');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Netlify-style esbuild bundle preserves the terminable reader and installed Node API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p09-bundle-'));
  // Keep the bundle under the source tree so normal installed package resolution applies.
  const output = resolve('node_modules/.cache/p09-spreadsheet-bundle.mjs');
  try {
    await build({ entryPoints: ['netlify/functions/_rtsIngestion.js'], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const { parseRtsFile: bundled } = await import(`${new URL('file://' + output).href}?test=${Date.now()}`);
    assert.deepEqual(await bundled(new File([bytes('shapes.xlsx')], 'fixture.xlsx')), await upload(bytes('shapes.xlsx')));
  } finally { rmSync(output, { force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test('no tracked source imports or requires the removed spreadsheet package', () => {
  const packageName = ['xl', 'sx'].join('');
  const importPattern = new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*(?:\\(\\s*)?|\\brequire(?:\\.resolve)?\\s*\\(\\s*)["']${packageName}(?:[/"'])`);
  const files = sourceFiles().filter(file => /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(file));
  const offenders = files.filter(file => importPattern.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
  const root = JSON.parse(readFileSync('package.json'));
  const lock = JSON.parse(readFileSync('package-lock.json'));
  assert.equal(root.dependencies[packageName], undefined);
  assert.equal(root.dependencies['read-excel-file'], '9.3.17');
  assert.equal(Object.keys(lock.packages).some(path => path.endsWith(`/node_modules/${packageName}`) || path === `node_modules/${packageName}`), false);
});


test('multipart upload bounds declared and streamed bodies before form buffering', async () => {
  await assert.rejects(readRtsUploadForm(new Request('https://synthetic.example/upload', { method: 'POST', body: 'x', headers: { 'content-length': String(MAX_RTS_MULTIPART_BYTES + 1) } })), /upload body exceeds/);
  let canceled = false;
  const request = new Request('https://synthetic.example/upload', { method: 'POST', duplex: 'half', body: new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_RTS_MULTIPART_BYTES)); controller.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  }) });
  await assert.rejects(readRtsUploadForm(request), /upload body exceeds/);
  assert.equal(canceled, true);
  const form = new FormData(); form.set('file', new File(['A,B\nx,y'], 'synthetic.csv'));
  const valid = await readRtsUploadForm(new Request('https://synthetic.example/upload', { method: 'POST', body: form }));
  assert.equal(valid.get('file').name, 'synthetic.csv');
});

test('worksheet used ranges preserve offset headers and trailing blank columns', async () => {
  const parts = entries();
  parts['xl/worksheets/sheet1.xml'] = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="C3:E4"/><sheetData><row r="3"><c r="C3" t="str"><v>Agent</v></c><c r="D3" t="str"><v>NPN</v></c></row><row r="4"><c r="C4" t="str"><v>Synthetic</v></c><c r="D4" t="str"><v>001234</v></c></row></sheetData></worksheet>';
  const parsed = await upload(packZip(parts));
  assert.deepEqual(parsed.rows, [{ Agent: 'Synthetic', NPN: '001234', __EMPTY: null }]);
});
