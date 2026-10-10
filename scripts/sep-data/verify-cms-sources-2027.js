import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient, parseArgs, readTabularFile } from './common.js';
import { prepareCrosswalk } from './ingest-plan-crosswalk.js';
import { prepareDsnp2027 } from './prepare-dsnp-2027.js';

const args = parseArgs();
for (const key of ['landscape-file', 'crosswalk-file', 'integration-file', 'status-file', 'stars-file', 'low-performing-file']) {
  if (!args[key]) throw new Error(`Provide --${key} PATH`);
}
const landscape = (await fs.readFile(args['landscape-file'], 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
assert.ok(landscape.every(row => row.plan_year === 2027));
const crosswalk = prepareCrosswalk(await readTabularFile({ file: args['crosswalk-file'], headerIncludes: ['PREVIOUS_CONTRACT_ID', 'CURRENT_CONTRACT_ID', 'STATUS'] }), landscape);
const dsnp = prepareDsnp2027(args['integration-file'], args['status-file'], landscape);
const sourceStars = await readTabularFile({ file: args['stars-file'], headerIncludes: ['Contract Number', '2027 Overall'] });
const ratingByContract = new Map(sourceStars.map(row => [row['Contract Number'].trim(), Number(row['2027 Overall'])]));
const lowRows = await readTabularFile({ file: args['low-performing-file'], headerIncludes: ['Contract Number', 'Reason for LPI'] });
const lowByContract = new Map(lowRows.map(row => [row['Contract Number'].trim(), row['Reason for LPI'].trim()]));
const coverage = new Set(landscape.map(row => `${row.contract_id}:${row.county_fips}`));
const expectedStars = new Map();
for (const row of landscape) {
  const rating = ratingByContract.get(row.contract_id);
  if ((Number.isFinite(rating) && rating >= 1 && rating <= 5) || lowByContract.has(row.contract_id)) {
    expectedStars.set(`${row.contract_id}:${row.county_fips}`, { ...row, rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null });
  }
}
const supabase = await createSupabaseAdminClient();
async function count(table, filter = query => query) {
  const { count, error } = await filter(supabase.from(table).select('id', { count: 'exact', head: true }).eq('plan_year', 2027));
  if (error) throw error;
  return count;
}
async function readAll(table, fields, filter = query => query) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await filter(supabase.from(table).select(fields).eq('plan_year', 2027)).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
const report = {};
report.non2027 = {};
for (const table of ['star_ratings_by_county', 'plan_terminations', 'snp_plans_by_county', 'dsnp_eae_lookup']) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).or('plan_year.neq.2027,plan_year.is.null');
  if (error) throw error;
  assert.equal(count, 0);
  report.non2027[table] = count;
}
report.stars = await count('star_ratings_by_county');
assert.equal(report.stars, expectedStars.size);
const fiveStars = await readAll('star_ratings_by_county', 'contract_id,county_fips,overall_star_rating', query => query.eq('overall_star_rating', 5));
report.fiveStarRows = fiveStars.length;
assert.equal(fiveStars.length, [...expectedStars.values()].filter(row => row.rating === 5).length);
assert.ok(fiveStars.every(row => ratingByContract.get(row.contract_id) === 5 && coverage.has(`${row.contract_id}:${row.county_fips}`)));
const low = await readAll('star_ratings_by_county', 'contract_id,county_fips,low_performing_reason', query => query.eq('low_performing', true));
assert.equal(low.length, [...expectedStars.values()].filter(row => lowByContract.has(row.contract_id)).length);
assert.ok(low.every(row => lowByContract.get(row.contract_id) === row.low_performing_reason && coverage.has(`${row.contract_id}:${row.county_fips}`)));
report.lowPerforming = { sourceContracts: lowByContract.size, loadedContracts: new Set(low.map(row => row.contract_id)).size, countyRows: low.length };
report.crosswalk = { rows: await count('plan_terminations'), statuses: {} };
assert.equal(report.crosswalk.rows, crosswalk.records.length);
for (const type of new Set(crosswalk.records.map(row => row.termination_type))) {
  const actual = await count('plan_terminations', query => query.eq('termination_type', type));
  assert.equal(actual, crosswalk.records.filter(row => row.termination_type === type).length);
  report.crosswalk.statuses[type] = actual;
}
report.snp = { rows: await count('snp_plans_by_county'), alignmentRows: await count('dsnp_eae_lookup') };
assert.equal(report.snp.rows, dsnp.countyRows.length);
assert.equal(report.snp.alignmentRows, dsnp.alignment.length);
const alignment = await readAll('dsnp_eae_lookup', 'state,contract_id,plan_id,integration_level,applicable_integrated_plan,eae_status,affiliated_medicaid_mco');
const alignmentKey = row => `${row.state}:${row.contract_id}:${row.plan_id}`;
const expectedAlignment = new Map(dsnp.alignment.map(row => [alignmentKey(row), row]));
for (const row of alignment) {
  const expected = expectedAlignment.get(alignmentKey(row));
  assert.ok(expected);
  for (const field of ['integration_level', 'applicable_integrated_plan', 'eae_status', 'affiliated_medicaid_mco']) assert.equal(row[field], expected[field]);
}
report.counties = {};
for (const state of ['NJ', 'PA']) {
  const stars = await readAll('star_ratings_by_county', 'contract_id,county_fips,county_name,overall_star_rating,low_performing', query => query.eq('state_code', state));
  assert.equal(stars.length, [...expectedStars.values()].filter(row => row.state_code === state).length);
  for (const row of stars) {
    const expected = expectedStars.get(`${row.contract_id}:${row.county_fips}`);
    assert.equal(row.overall_star_rating, expected.rating);
    assert.equal(row.low_performing, lowByContract.has(row.contract_id));
    assert.equal(row.county_name, expected.county_name);
  }
  const snp = await readAll('snp_plans_by_county', 'contract_id,plan_id,county_fips,integration_level,applicable_integrated_plan', query => query.eq('state_code', state));
  const key = row => `${row.contract_id}:${row.plan_id}:${row.county_fips}`;
  const expectedSnp = new Map(dsnp.countyRows.filter(row => row.state_code === state).map(row => [key(row), row]));
  assert.equal(snp.length, expectedSnp.size);
  for (const row of snp) {
    const expected = expectedSnp.get(key(row));
    assert.ok(expected);
    assert.equal(row.integration_level, expected.integration_level);
    assert.equal(row.applicable_integrated_plan, expected.applicable_integrated_plan);
  }
  const fields = 'source_key,source_status,old_contract_id,old_plan_id,new_contract_id,new_plan_id,termination_type,county_fips,county_mapping_status';
  const transitions = await readAll('plan_terminations', fields, query => query.eq('state_code', state));
  const transitionKey = row => `${row.source_key}:${row.county_fips}`;
  const expectedTransitions = new Map(crosswalk.records.filter(row => row.state_code === state).map(row => [transitionKey(row), row]));
  assert.equal(transitions.length, expectedTransitions.size);
  for (const row of transitions) {
    const expected = expectedTransitions.get(transitionKey(row));
    assert.ok(expected);
    for (const field of fields.split(',')) assert.equal(row[field], expected[field]);
  }
  report.counties[state] = { stars: stars.length, counties: new Set(stars.map(row => row.county_fips)).size, snp: snp.length, crosswalk: transitions.length };
}
// Use the browser's anonymous role for the production SEP Finder contract.
const publicClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { count: publicAlignmentCount, error: publicAlignmentError } = await publicClient.from('dsnp_eae_lookup')
  .select('id', { count: 'exact', head: true }).eq('plan_year', 2027);
if (publicAlignmentError) throw publicAlignmentError;
assert.equal(publicAlignmentCount, dsnp.alignment.length);
report.publicAlignmentRows = publicAlignmentCount;
report.finder = [];
for (const zip of ['08016', '08102', '18042', '19103', '99501']) {
  const { data, error } = await publicClient.rpc('get_available_seps', { input_zip: zip });
  if (error) throw error;
  assert.ok(!data.error, `ZIP ${zip}: ${data.error}`);
  const sep = data.seps.find(row => /5.star/i.test(row.sep_type));
  assert.ok(sep);
  const counties = new Set(data.counties.map(row => row.county_fips));
  const expected = new Set(fiveStars.filter(row => counties.has(row.county_fips)).map(row => row.contract_id));
  assert.equal(sep.available, expected.size > 0);
  assert.equal(sep.plans.length, expected.size);
  assert.ok(sep.plans.every(row => Number(row.stars) === 5 && expected.has(row.contract_id)));
  const termination = data.seps.find(row => /Plan Termination SEP/.test(row.sep_type));
  assert.equal(termination.available, false);
  assert.equal(termination.terminated_plans.length, 0);
  report.finder.push({ zip, fiveStarAvailable: sep.available, contracts: sep.plans.map(row => row.contract_id), unverifiedTerminationsExcluded: true });
}
console.log(JSON.stringify(report, null, 2));
if (args.output) await fs.writeFile(args.output, JSON.stringify(report, null, 2));
