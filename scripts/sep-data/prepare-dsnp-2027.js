import XLSX from 'xlsx';
import { parseDsnpWorkbook } from '../parse_cms_dsnp.js';

export function prepareDsnp2027(integratedFile, statusFile, landscape) {
  const options = { year: 2027, sheet: 'CY 2027 Data', live: true, fileName: '2027.xlsx' };
  const listed = parseDsnpWorkbook(XLSX.readFile(integratedFile), options).plans;
  const detailedWorkbook = XLSX.readFile(statusFile);
  const detailed = parseDsnpWorkbook(detailedWorkbook, options).plans;
  const aipByKey = new Map(XLSX.utils.sheet_to_json(detailedWorkbook.Sheets['CY 2027 Data'], { raw: false }).map(r => [`${r.State}:${r['Contract ID']}:${String(r['Plan ID']).padStart(3, '0')}`, r['Applicable Integrated Plan'] === 'Yes']));
  const key = p => `${p.state}:${p.contractId}:${p.planId}`;
  const byKey = new Map(detailed.map(p => [key(p), p]));
  for (const p of listed) {
    const match = byKey.get(key(p));
    if (!match || JSON.stringify(match) !== JSON.stringify(p)) throw new Error(`D-SNP workbook conflict: ${key(p)}`);
  }
  const matched = new Set();
  const missing = new Set();
  const countyRows = new Map();
  const typeMap = { 'Dual-Eligible': 'D-SNP', 'Chronic or Disabling Condition': 'C-SNP', 'Institutional': 'I-SNP' };
  for (const row of landscape) {
    if (row.category !== 'SNP') continue;
    const snpType = typeMap[row.snp_type];
    if (!snpType) throw new Error(`Unknown SNP type ${row.snp_type}`);
    const pkey = `${row.state_code}:${row.contract_id}:${row.plan_id}`;
    const match = snpType === 'D-SNP' ? byKey.get(pkey) : null;
    if (snpType === 'D-SNP') { if (match) matched.add(pkey); else missing.add(pkey); }
    const record = {
      contract_id: row.contract_id, plan_id: row.plan_id, plan_name: row.plan_name,
      organization_name: row.carrier, snp_type: snpType,
      county_fips: row.county_fips, county_name: row.county_name, state_code: row.state_code, plan_year: 2027,
      integration_level: match?.integrationLevel || null,
      applicable_integrated_plan: match ? aipByKey.get(pkey) : null,
      integration_source: match ? 'CMS CY2027 integration-status workbook' : null,
    };
    const rkey = `${pkey}:${snpType}:${row.county_fips}`;
    const prior = countyRows.get(rkey);
    if (prior && JSON.stringify(prior) !== JSON.stringify(record)) throw new Error(`Conflicting SNP segments: ${rkey}`);
    countyRows.set(rkey, record);
  }
  const alignment = detailed.map(p => ({
    plan_year: 2027, state: p.state, county: p.county, carrier: p.carrier, plan_name: p.planName,
    contract_id: p.contractId, plan_id: p.planId, integration_level: p.integrationLevel,
    applicable_integrated_plan: aipByKey.get(key(p)),
    eae_status: p.eaeStatus, affiliated_medicaid_mco: p.affiliatedMco,
  }));
  const counts = {};
  for (const row of countyRows.values()) if (row.snp_type === 'D-SNP') counts[row.integration_level || 'unmatched'] = (counts[row.integration_level || 'unmatched'] || 0) + 1;
  return { countyRows: [...countyRows.values()], alignment, report: {
    integratedList: listed.length, detailedList: detailed.length, matchedSourcePlans: matched.size,
    sourcePlansWithoutLandscape: detailed.filter(p => !matched.has(key(p))).map(key),
    landscapePlansWithoutSource: [...missing], countyRows: countyRows.size, dsnpCountyCounts: counts,
  } };
}
