import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { parsePenetrationCsv, loadPenetration, renderPenetrationSql } from '../scripts/parse_cms_penetration.js';
import { countyPenetration, fetchCountyPenetration, penetrationLabel, penetrationColor } from '../src/lib/countyPenetration.js';
const header = 'State Name,County Name,FIPSST,FIPSCNTY,FIPS,Eligibles,Enrolled,Penetration\n';
const csv = header + 'Alabama,Autauga,1,1,1001,"12,460","7,739",62.11%\nHawaii,Kalawao,15,5,15005,13,*,\n';
const parse = text => parsePenetrationCsv(text, { month: '2026-09' });
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('parser preserves leading FIPS zeros, reported rates and suppressed unknowns', () => {
  const { rows } = parse(csv);
  assert.deepEqual(rows[0], { state: 'AL', county: 'Autauga', fips: '01001', eligibles: 12460, ma_enrollees: 7739, penetration_pct: 62.11, file_month: '2026-09-01' });
  assert.equal(rows[1].ma_enrollees, null); assert.equal(rows[1].penetration_pct, null);
  // CMS can publish a capped 100% even when source numerator exceeds denominator.
  assert.equal(parse(header + 'Virgin Islands,St. John,78,20,78020,976,3137,100.00%').rows[0].penetration_pct, 100);
  assert.equal(parse(csv + 'Guam,Pending County Designation,66,10,66010,100,12,12%').skipped, 1);
});
test('layout, month, invalid counts/FIPS and conflicting duplicates fail closed', () => {
  for (const text of ['', csv.replace('Eligibles', 'Other'), csv.replace('1001', 'abc'), csv.replace('12,460', '-1'), csv.replace('62.11%', '101%'), csv.replace('13,*,', '13,*,10%'), csv + 'Alabama,Autauga,1,1,1001,2,2,100%']) assert.throws(() => parse(text));
  assert.throws(() => parsePenetrationCsv(csv, { month: '2026-13' }));
  assert.throws(() => parsePenetrationCsv(csv, { month: '2026-09', fileName: 'State_County_Penetration_MA_2026_08.csv' }));
});
test('migration and exported SQL execute; month replacement preserves history and rollback', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    const migration = read('supabase/migrations/088_county_penetration.sql');
    await db.exec(migration); await db.exec(migration);
    const rows = parse(csv).rows;
    await loadPenetration(db, rows.map(row => ({ ...row, file_month: '2026-08-01' })));
    rows[0].county = "O'Brien \\ $1; -- café";
    await db.exec(await renderPenetrationSql(rows));
    const actual = (await db.query("SELECT * FROM cms_county_penetration WHERE file_month = '2026-09-01' ORDER BY fips")).rows;
    assert.equal(actual.length, 2); assert.equal(actual[0].county, rows[0].county); assert.equal(actual[1].ma_enrollees, null);
    await assert.rejects(loadPenetration(db, [{ ...rows[0], eligibles: -1 }]));
    assert.equal((await db.query('SELECT count(*) n FROM cms_county_penetration')).rows[0].n, 4);
    await db.exec('SET ROLE anon;');
    assert.equal((await db.query('SELECT count(*) n FROM cms_county_penetration')).rows[0].n, 4);
    await assert.rejects(db.query('DELETE FROM cms_county_penetration'), /permission denied/);
  } finally { await db.close(); }
});
test('CLI dry-run and sql-out are credential-free and reject incompatible options', () => {
  const dir = mkdtempSync(join(tmpdir(), 'penetration-test-'));
  try {
    const input = join(dir, 'State_County_Penetration_MA_2026_09.csv'), output = join(dir, 'load.sql');
    writeFileSync(input, csv);
    const run = (...args) => spawnSync(process.execPath, ['scripts/parse_cms_penetration.js', '--file', input, '--month', '2026-09', ...args], { encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: '' } });
    assert.equal(run('--dry-run').status, 0);
    assert.equal(existsSync(output), false);
    const exported = run('--sql-out', output); assert.equal(exported.status, 0, exported.stderr);
    assert.match(readFileSync(output, 'utf8'), /BEGIN;[\s\S]*COMMIT;/);
    assert.match(run('--sql-out').stderr, /requires an output path/);
    assert.match(run('--sql-out', output, '--dry-run').stderr, /mutually exclusive/);
    assert.match(run().stderr, /SUPABASE_DB_URL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('county map distinguishes unknown, suppressed and real zero; FIPS prevents name misjoins', () => {
  const rows = parse(csv).rows;
  assert.equal(countyPenetration(rows, 'Autauga County').fips, '01001');
  assert.equal(countyPenetration(rows, 'Autauga', '99999'), null);
  assert.equal(penetrationLabel(null), 'No data');
  assert.equal(penetrationLabel(rows[1]), 'No data');
  assert.equal(penetrationLabel({ penetration_pct: 0 }), '0.00%');
  assert.equal(penetrationColor(null), 'var(--bg-elevated)');
  const geometry = JSON.parse(read('src/data/countyMaps/AL.json'));
  assert.equal(geometry.find(path => path.county === 'Autauga').fips, '01001');
  assert.match(geometry[0].d, /^M.*Z$/);
  const ui = read('src/components/sep/CountyPenetration.jsx');
  for (const label of ['Medicare eligibles:', 'MA enrollees:', 'Penetration:', 'CMS file month:', 'No data', 'onKeyDown', 'penetrationColor(row)']) assert.ok(ui.includes(label));
  assert.match(read('src/components/SEPLookup.jsx'), /<CountyPenetration/);
});
test('latest GLOBAL file month governs state reads, so omitted CT/AK never show old data', async () => {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    return { select(fields) { calls.push(fields); return this; }, order() { return this; }, limit() { return Promise.resolve({ data: [{ file_month: '2026-09-01' }] }); }, eq(field, value) {
      calls.push([field, value]);
      return field === 'file_month' ? Promise.resolve({ data: [] }) : this;
    } };
  } };
  assert.deepEqual(await fetchCountyPenetration(client, 'CT'), { rows: [], month: '2026-09-01' });
  assert.deepEqual(calls.filter(Array.isArray), [['state', 'CT'], ['file_month', '2026-09-01']]);
  await assert.rejects(fetchCountyPenetration({ from() { return { select() { return this; }, order() { return this; }, limit() { return Promise.resolve({ error: { message: 'internal' } }); } }; } }, 'AL'), /unavailable/);
});
