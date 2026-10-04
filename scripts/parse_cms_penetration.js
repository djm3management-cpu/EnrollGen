/** Import the official CMS monthly MA State/County Penetration CSV, without inferring suppressed counts. */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { parseArgs, parseCsv, stateFromCountyFips, loadLocalEnv } from './sep-data/common.js';

const headers = ['State Name', 'County Name', 'FIPSST', 'FIPSCNTY', 'FIPS', 'Eligibles', 'Enrolled', 'Penetration'];
const clean = value => String(value ?? '').trim();
function count(value, row) {
  const text = clean(value).replace(/,/g, '');
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error(`Invalid count in row ${row}.`);
  return Number(text);
}
export function parsePenetrationCsv(text, { month, fileName = '' } = {}) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Provide --month YYYY-MM.');
  const filenameMonth = fileName.match(/State_County_Penetration_MA_(20\d{2})_(\d{2})/i);
  if (filenameMonth && `${filenameMonth[1]}-${filenameMonth[2]}` !== month) throw new Error('File month does not match --month.');
  const sourceRows = parseCsv(text);
  const missing = headers.filter(header => !Object.keys(sourceRows[0] || {}).includes(header));
  if (missing.length) throw new Error(`CMS penetration layout changed. Missing: ${missing.join(', ')}.`);
  const mapped = new Map();
  let skipped = 0;
  for (const [index, source] of sourceRows.entries()) {
    const county = clean(source['County Name']);
    const stateName = clean(source['State Name']);
    if (/pending|unknown|total/i.test(county) || /pending|unknown|total/i.test(stateName)) { skipped++; continue; }
    const raw = clean(source.FIPS);
    if (!/^\d{1,5}$/.test(raw)) throw new Error(`Invalid FIPS in row ${index + 2}.`);
    const fips = raw.padStart(5, '0');
    const state = stateFromCountyFips(fips).state_code;
    if (!state || !county || !stateName || fips.slice(2) === '000' ||
      `${clean(source.FIPSST).padStart(2, '0')}${clean(source.FIPSCNTY).padStart(3, '0')}` !== fips) {
      throw new Error(`Invalid state/county FIPS in row ${index + 2}.`);
    }
    const eligibles = count(source.Eligibles, index + 2);
    const suppressed = clean(source.Enrolled) === '*';
    const enrollees = suppressed ? null : count(source.Enrolled, index + 2);
    const rawRate = clean(source.Penetration);
    let penetration = null;
    if (rawRate && !suppressed) {
      if (!/^\d+(\.\d+)?%?$/.test(rawRate)) throw new Error(`Invalid penetration in row ${index + 2}.`);
      penetration = Number(rawRate.replace('%', ''));
      if (penetration > 100) throw new Error(`Penetration outside 0–100 in row ${index + 2}.`);
    }
    if (suppressed && rawRate) throw new Error(`Suppressed row ${index + 2} unexpectedly contains a rate.`);
    const row = { state, county, fips, eligibles, ma_enrollees: enrollees, penetration_pct: penetration, file_month: `${month}-01` };
    if (mapped.has(fips) && JSON.stringify(mapped.get(fips)) !== JSON.stringify(row)) throw new Error(`Conflicting duplicate FIPS ${fips}.`);
    mapped.set(fips, row);
  }
  if (!mapped.size) throw new Error('No county rows; refusing an empty replacement.');
  return { rows: [...mapped.values()], skipped };
}
export async function loadPenetration(client, rows) {
  if (!rows.length || rows.some(row => row.file_month !== rows[0].file_month)) throw new Error('Load requires nonempty rows from one file month.');
  try {
    await client.query('BEGIN');
    await client.query('SELECT file_month FROM public.cms_county_penetration LIMIT 0');
    await client.query('DELETE FROM public.cms_county_penetration WHERE file_month = $1', [rows[0].file_month]);
    for (const row of rows) await client.query(`INSERT INTO public.cms_county_penetration
      (state,county,fips,eligibles,ma_enrollees,penetration_pct,file_month) VALUES ($1,$2,$3,$4,$5,$6,$7)`, Object.values(row));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
export async function renderPenetrationSql(rows) {
  const statements = [];
  await loadPenetration({ async query(sql, values = []) {
    statements.push(sql.replace(/\$(\d+)/g, (_, index) => {
      const value = values[Number(index) - 1];
      return value === null ? 'NULL' : typeof value === 'number' ? String(value) : pg.escapeLiteral(value);
    }) + ';');
  } }, rows);
  return statements.join('\n') + '\n';
}
async function main() {
  const args = parseArgs();
  if (typeof args.file !== 'string') throw new Error('Usage: node scripts/parse_cms_penetration.js --file CSV --month YYYY-MM [--dry-run | --sql-out PATH]');
  if (args['sql-out'] !== undefined && (typeof args['sql-out'] !== 'string' || !args['sql-out'].trim())) throw new Error('--sql-out requires an output path.');
  if (args['sql-out'] && args['dry-run']) throw new Error('--sql-out and --dry-run are mutually exclusive.');
  const { rows, skipped } = parsePenetrationCsv(await readFile(args.file, 'utf8'), { month: args.month, fileName: path.basename(args.file) });
  console.log(`Parsed ${rows.length} counties for ${args.month}; ${skipped} pending/unknown/aggregate rows excluded; ${rows.filter(row => row.ma_enrollees === null).length} suppressed enrollments preserved as NULL.`);
  if (args['dry-run']) return;
  if (args['sql-out']) { await writeFile(args['sql-out'], await renderPenetrationSql(rows)); console.log(`Wrote ${rows.length} county rows to ${args['sql-out']}.`); return; }
  await loadLocalEnv();
  if (!process.env.SUPABASE_DB_URL) throw new Error('Set SUPABASE_DB_URL for a live load; apply migration 088 first.');
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try { await loadPenetration(client, rows); } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
