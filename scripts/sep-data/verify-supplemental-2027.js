import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient, parseArgs } from './common.js';

const args = parseArgs();
if (!args.stars || !args.crosswalk || !args.dsnp) throw new Error('Provide --stars, --crosswalk, --dsnp dry-run JSON paths');
const supabase = await createSupabaseAdminClient();
const stars = JSON.parse(await fs.readFile(args.stars, 'utf8'));
const crosswalk = JSON.parse(await fs.readFile(args.crosswalk, 'utf8'));
const dsnp = JSON.parse(await fs.readFile(args.dsnp, 'utf8'));
const expected = {
  star_ratings_by_county: stars,
  plan_terminations: crosswalk,
  snp_plans_by_county: dsnp.countyRows,
  dsnp_eae_lookup: dsnp.alignment,
};
async function count(table, filter = query => query) {
  const { count, error } = await filter(supabase.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw error;
  return count;
}
async function read(table, filter = query => query) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await filter(supabase.from(table).select('*').order('id').range(offset, offset + 999));
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
function compareRows(actual, wanted, key) {
  assert.equal(actual.length, wanted.length);
  const indexed = new Map(wanted.map(row => [key(row), row]));
  for (const row of actual) {
    const source = indexed.get(key(row));
    assert.ok(source, `Unexpected row ${key(row)}`);
    for (const [field, value] of Object.entries(source)) {
      if (field === 'updated_at') continue;
      assert.deepEqual(row[field], value, `${key(row)}.${field}`);
    }
  }
}
const report = { tables: {}, crosswalkStatuses: {}, lowPerforming: {}, counties: [] };
for (const [table, wanted] of Object.entries(expected)) {
  const [total, old, other] = await Promise.all([
    count(table), count(table, q => q.eq('plan_year', 2026)),
    count(table, q => q.or('plan_year.neq.2027,plan_year.is.null')),
  ]);
  assert.equal(total, wanted.length, `${table} total`);
  assert.equal(old, 0, `${table} PY2026 rows`);
  assert.equal(other, 0, `${table} non-PY2027 rows`);
  report.tables[table] = { total, py2026: old, non2027: other };
}
for (const type of new Set(crosswalk.map(row => row.termination_type))) {
  const total = await count('plan_terminations', q => q.eq('termination_type', type));
  assert.equal(total, crosswalk.filter(row => row.termination_type === type).length);
  report.crosswalkStatuses[type] = total;
}
const low = await read('star_ratings_by_county', q => q.eq('low_performing', true));
compareRows(low, stars.filter(row => row.low_performing), row => `${row.contract_id}:${row.county_fips}`);
report.lowPerforming = { contracts: [...new Set(low.map(row => row.contract_id))], countyRows: low.length };
compareRows(await read('dsnp_eae_lookup'), dsnp.alignment, row => `${row.state}:${row.contract_id}:${row.plan_id}`);
if (!process.env.VITE_SUPABASE_ANON_KEY) throw new Error('Set VITE_SUPABASE_ANON_KEY to verify browser visibility');
const publicClient = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const publicAlignment = await publicClient.from('dsnp_eae_lookup').select('id', { count: 'exact', head: true }).eq('plan_year', 2027);
if (publicAlignment.error) throw publicAlignment.error;
assert.equal(publicAlignment.count, dsnp.alignment.length, 'Browser visibility of CMS D-SNP alignment');
report.publicAlignmentCount = publicAlignment.count;
const counties = [ ['NJ','Camden','34007','08102'], ['NJ','Burlington','34005','08016'], ['NJ','Gloucester','34015','08096'], ['PA','Philadelphia','42101','19103'], ['PA','Bucks','42017','18901'], ['PA','Montgomery','42091','19401'] ];
for (const [state, county, fips, zip] of counties) {
  const check = { state, county, fips, zip };
  for (const table of ['star_ratings_by_county','plan_terminations','snp_plans_by_county']) {
    const actual = await read(table, q => q.eq('county_fips', fips));
    const wanted = expected[table].filter(row => row.county_fips === fips);
    const key = row => table === 'plan_terminations' ? `${row.source_key}:${row.county_fips}` : `${row.contract_id}:${row.plan_id || ''}:${row.county_fips}`;
    compareRows(actual, wanted, key);
    check[table] = actual.length;
    if (table === 'snp_plans_by_county') {
      check.dsnp = actual.filter(row => row.snp_type === 'D-SNP').length;
      check.integration = {};
      for (const row of actual.filter(row => row.snp_type === 'D-SNP')) check.integration[row.integration_level] = (check.integration[row.integration_level] || 0) + 1;
    }
  }
  const { data, error } = await supabase.rpc('get_available_seps', {input_zip: zip});
  if (error) throw error;
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  assert.ok(result.counties.some(row => row.county_fips === fips));
  const fiveStar = result.seps.find(sep => /5.star/i.test(sep.sep_type));
  assert.ok(fiveStar);
  assert.ok(fiveStar.plans.every(plan => Number(plan.stars) === 5));
  const termination = result.seps.find(sep => /Plan Termination/.test(sep.sep_type));
  assert.ok(termination);
  assert.equal(termination.available, false);
  assert.deepEqual(termination.terminated_plans, []);
  check.fiveStarContracts = fiveStar.plans.length;
  check.terminationSep = termination.available;
  report.counties.push(check);
}
console.log(JSON.stringify(report, null, 2));
if (args.output) await fs.writeFile(args.output, JSON.stringify(report, null, 2));
