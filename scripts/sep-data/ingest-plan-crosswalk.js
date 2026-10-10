import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanText, createSupabaseAdminClient, parseArgs, readTabularFile, upsertRows } from './common.js';
import { readLandscape2027 } from './landscape-2027.js';

export const CROSSWALK_TYPES = {
  'Renewal Plan': 'renewal',
  'Renewal Plan with SAE': 'renewal',
  'Renewal Plan with SAR': 'service_area_reduction',
  'Consolidated Renewal Plan': 'consolidated_renewal',
  'Terminated/Non-renewed Contract': 'terminated',
  'New Plan': 'new_plan',
  'Initial Contract': 'new_plan',
};
const id = value => /^\d{1,3}$/.test(String(value).trim()) ? String(value).trim().padStart(3, '0') : null;

export function prepareCrosswalk(rows, landscape) {
  const serviceMap = new Map();
  for (const row of landscape) {
    const key = `${row.contract_id}:${row.plan_id}`;
    if (!serviceMap.has(key)) serviceMap.set(key, new Map());
    serviceMap.get(key).set(row.county_fips, row);
  }
  const records = new Map();
  const sourceCounts = {};
  let unmapped = 0;
  for (const row of rows) {
    const status = cleanText(row.STATUS);
    const type = CROSSWALK_TYPES[status];
    if (!type) throw new Error(`Unknown crosswalk status: ${status}`);
    const oldContract = cleanText(row.PREVIOUS_CONTRACT_ID);
    const oldPlan = id(row.PREVIOUS_PLAN_ID);
    const newContract = cleanText(row.CURRENT_CONTRACT_ID) === 'TERMINATED' ? null : cleanText(row.CURRENT_CONTRACT_ID);
    const newPlan = id(row.CURRENT_PLAN_ID);
    if (!/^[A-Z]\d{4}$/.test(oldContract) || (type !== 'new_plan' && !oldPlan) || (type !== 'terminated' && (!/^[A-Z]\d{4}$/.test(newContract) || !newPlan))) throw new Error('Invalid crosswalk identifiers');
    sourceCounts[status] = (sourceCounts[status] || 0) + 1;
    // Current coverage never establishes former counties or the counties removed by SAR.
    const areas = [...(serviceMap.get(`${newContract}:${newPlan}`)?.values() || [])];
    if (!areas.length) unmapped++;
    const sourceKey = [oldContract, oldPlan || 'NEW', newContract || 'TERMINATED', newPlan || 'TERMINATED', status].join(':');
    for (const area of areas.length ? areas : [null]) {
      const record = {
        source_key: sourceKey, source_status: status,
        old_contract_id: oldContract, old_plan_id: oldPlan,
        old_plan_name: type === 'new_plan' ? null : cleanText(row.PREVIOUS_PLAN_NAME),
        old_organization_name: null, termination_type: type,
        new_contract_id: newContract, new_plan_id: newPlan,
        new_plan_name: type === 'terminated' ? null : cleanText(row.CURRENT_PLAN_NAME),
        county_fips: area?.county_fips || null, county_name: area?.county_name || null,
        state_code: area?.state_code || null,
        county_mapping_status: area ? 'current_service_area' : 'unavailable',
        effective_date: '2027-01-01', plan_year: 2027,
      };
      const key = `${sourceKey}:${record.county_fips}`;
      if (records.has(key)) throw new Error(`Duplicate source mapping: ${key}`);
      records.set(key, record);
    }
  }
  if (!records.size) throw new Error('Empty crosswalk');
  return { records: [...records.values()], sourceCounts, unmapped };
}

async function main() {
  const args = parseArgs();
  if (Number(args.year || 2027) !== 2027) throw new Error('Only PY2027 is supported');
  const rows = await readTabularFile({ file: args.file, url: args.url, sheet: args.sheet, headerIncludes: ['PREVIOUS_CONTRACT_ID', 'CURRENT_CONTRACT_ID', 'STATUS'] });
  const result = prepareCrosswalk(rows, await readLandscape2027(args));
  const counts = {};
  for (const row of result.records) counts[row.termination_type] = (counts[row.termination_type] || 0) + 1;
  console.log(JSON.stringify({ sourceRows: rows.length, sourceCounts: result.sourceCounts, prepared: result.records.length, countyMapped: result.records.filter(row => row.county_fips).length, unmappedSourceRows: result.unmapped, statusCounts: counts, priorYear: 37526, difference: result.records.length - 37526 }, null, 2));
  if (args.output) await fs.writeFile(args.output, JSON.stringify(result.records));
  if (args['dry-run']) return;
  const supabase = await createSupabaseAdminClient();
  await upsertRows({ supabase, table: 'plan_terminations', rows: result.records, onConflict: 'source_key,county_fips,plan_year' });
  const { count, error } = await supabase.from('plan_terminations').select('id', { count: 'exact', head: true }).eq('plan_year', 2027);
  if (error) throw error;
  if (count !== result.records.length) throw new Error(`Post-load count mismatch: ${count} versus ${result.records.length}`);
  console.log(`Verified plan_terminations: ${count} PY2027 rows`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
