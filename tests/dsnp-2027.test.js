import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import XLSX from 'xlsx';
import { PGlite } from '@electric-sql/pglite';
import { parseDsnpWorkbook, loadDsnpPlans, renderDsnpSql } from '../scripts/parse_cms_dsnp.js';
import { INTEGRATED_LANE, PDP_LANE } from '../src/lib/dualLisSep.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const migration = read('supabase/migrations/081_dsnp_alignment_2027.sql');
const row = { 'Contract ID': 'H1234', 'Plan ID': '001', 'Legal Entity Name': 'Fixture', State: 'NJ', 'D-SNP Integration Status': 'CO', 'Applicable Integrated Plan': 'Yes' };
const workbook = (rows, sheet = 'CY 2027 Data') => ({ SheetNames: [sheet], Sheets: { [sheet]: XLSX.utils.json_to_sheet(rows) } });
const options = { live: true, fileName: 'cy-2027-list.xlsx' };

test('CY2027 layout preserves AIP, leading zeros and unknown EAE/MCO; legacy layout remains readable', () => {
  const { plans } = parseDsnpWorkbook(workbook([row]), options);
  assert.deepEqual(plans[0], { state: 'NJ', county: null, carrier: 'Fixture', planName: 'Fixture', contractId: 'H1234', planId: '001', integrationLevel: 'AIP', eaeStatus: null, affiliatedMco: null });
  const legacy = { ...row, 'Integration Status': 'HIDE', 'Exclusive Aligned Enrollment': 'No' }; delete legacy['D-SNP Integration Status'];
  assert.equal(parseDsnpWorkbook(workbook([legacy]), options).plans[0].eaeStatus, false);
  assert.equal(parseDsnpWorkbook(workbook([{ ...row, 'D-SNP Integration Status': 'CO-P', 'Applicable Integrated Plan': 'No' }]), options).plans[0].integrationLevel, 'CO-P');
});
test('year, missing ID, changed layout/values and conflicting duplicates fail before any DB work', () => {
  for (const change of [{ 'Plan ID': '' }, { 'Plan ID': 'bad' }, { 'Contract ID': '' }, { State: '' }, { 'Plan Year': '2026' }, { 'Contract Year': '2026', 'Plan Year': '2027' }, { 'D-SNP Integration Status': 'Unknown' }, { 'Applicable Integrated Plan': '' }, { 'EAE Status': 'Unknown' }]) {
    assert.throws(() => parseDsnpWorkbook(workbook([{ ...row, ...change }]), options));
  }
  assert.throws(() => parseDsnpWorkbook(workbook([row], 'CY 2026 Data'), options));
  assert.throws(() => parseDsnpWorkbook(workbook([row], 'Data'), options));
  assert.throws(() => parseDsnpWorkbook(workbook([row]), { ...options, year: 2026 }));
  assert.throws(() => parseDsnpWorkbook(workbook([row]), { ...options, fileName: '2026-list.xlsx' }));
  assert.throws(() => parseDsnpWorkbook(workbook([{ State: 'NJ' }]), options));
  assert.throws(() => parseDsnpWorkbook(workbook([]), options));
  assert.throws(() => parseDsnpWorkbook(workbook([row, { ...row, 'Applicable Integrated Plan': 'No' }]), options));
  assert.equal(parseDsnpWorkbook(workbook([row, row]), options).plans.length, 1);
  assert.equal(parseDsnpWorkbook(workbook([{ ...row, County: 'Mercer' }, { ...row, County: 'Ocean' }]), options).plans.length, 2);
});
async function db() {
  const pg = new PGlite();
  await pg.exec(read('supabase/migrations/004_snp_routing_tables.sql'));
  await pg.exec(read('supabase/migrations/005_dsnp_eae_allow_null_county.sql'));
  return pg;
}
test('SQL export executes the same replacement and values as the parameterized loader', async () => {
  const pg = await db();
  try {
    await pg.exec(migration);
    const rows = [
      { ...row, 'Legal Entity Name': "O'Brien \\ $1; -- café", 'Plan Name': "A\nB", 'EAE Status': 'Yes' },
      { ...row, 'Plan ID': '2', County: 'Mercer', 'EAE Status': 'No', 'Affiliated Medicaid Managed Care Organization': "MCO's \\ name" },
      { ...row, 'Plan ID': '3' },
    ];
    const { plans } = parseDsnpWorkbook(workbook(rows), options);
    const select = 'SELECT plan_year,state,county,carrier,plan_name,contract_id,plan_id,integration_level,eae_status,affiliated_medicaid_mco FROM dsnp_eae_lookup ORDER BY plan_id';
    await loadDsnpPlans(pg, plans);
    const expected = (await pg.query(select)).rows;
    await loadDsnpPlans(pg, parseDsnpWorkbook(workbook([{ ...row, 'Plan ID': '99' }]), options).plans);
    const sql = await renderDsnpSql(plans);
    assert.ok(sql.startsWith('BEGIN;\nSELECT plan_year FROM public.dsnp_eae_lookup LIMIT 0;\nDELETE FROM public.dsnp_eae_lookup WHERE plan_year = 2027;\n'));
    assert.ok(sql.endsWith('COMMIT;\n'));
    await pg.exec(sql);
    assert.deepEqual((await pg.query(select)).rows, expected);
  } finally { await pg.close(); }
});
test('SQL CLI needs no database credentials and enforces live validation before writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsnp-sql-test-'));
  try {
    const file = join(dir, 'cy2027-fixture.xlsx');
    const output = join(dir, 'load.sql');
    const run = (...args) => spawnSync(process.execPath, ['scripts/parse_cms_dsnp.js', '--file', file, ...args], {
      encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: '', SUPABASE_DB_PASSWORD: '' },
    });
    XLSX.writeFile(workbook([row]), file);
    const result = run('--sql-out', output);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /VALUES \(2027,'NJ',NULL,'Fixture'/);
    rmSync(output);
    XLSX.writeFile(workbook([row], 'Data'), file);
    assert.notEqual(run('--sql-out', output).status, 0);
    assert.equal(existsSync(output), false);
    assert.match(run('--sql-out').stderr, /requires an output path/);
    assert.match(run('--sql-out', output, '--dry-run').stderr, /mutually exclusive/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('081 executes and reapplies on empty table; unknown EAE accepted and non-2027 rejected', async () => {
  const pg = await db();
  try {
    await pg.exec(migration); await pg.exec(migration);
    assert.equal((await pg.query('SELECT count(*) n FROM dsnp_eae_lookup')).rows[0].n, 0);
    await loadDsnpPlans(pg, parseDsnpWorkbook(workbook([row]), options).plans);
    const data = (await pg.query('SELECT * FROM dsnp_eae_lookup')).rows;
    assert.equal(data.length, 1); assert.equal(data[0].plan_year, 2027); assert.equal(data[0].eae_status, null);
    await assert.rejects(pg.query('UPDATE dsnp_eae_lookup SET plan_year=2026'), /dsnp_eae_py2027_only/);
    // A failure after DELETE restores the previous complete dataset.
    await assert.rejects(loadDsnpPlans(pg, [{ ...parseDsnpWorkbook(workbook([row]), options).plans[0], carrier: null }]));
    assert.deepEqual((await pg.query('SELECT * FROM dsnp_eae_lookup')).rows, data);
    await loadDsnpPlans(pg, parseDsnpWorkbook(workbook([{ ...row, 'Plan ID': '2' }]), options).plans);
    assert.deepEqual((await pg.query('SELECT plan_id FROM dsnp_eae_lookup')).rows, [{ plan_id: '002' }]);
  } finally { await pg.close(); }
});
test('081 refuses undated historical rows and rolls back schema changes', async () => {
  const pg = await db();
  try {
    await pg.exec("INSERT INTO dsnp_eae_lookup(state,county,carrier,plan_name,contract_id,plan_id,integration_level) VALUES('NJ','Mercer','Old','Old','H1234','001','HIDE')");
    await assert.rejects(pg.exec(migration), /Undated D-SNP/); await pg.exec('ROLLBACK');
    assert.equal((await pg.query('SELECT count(*) n FROM dsnp_eae_lookup')).rows[0].n, 1);
    assert.equal((await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name='dsnp_eae_lookup' AND column_name='plan_year'")).rows.length, 0);
  } finally { await pg.close(); }
});

// Bundle browser modules with only their external lookup services stubbed.
async function browserModule(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], plugins: [{ name: 'lookup-stubs', setup(builder) {
    builder.onResolve({ filter: /(?:supabase|sepGeo|sepCms|sepPlanDb|embeddings)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path.endsWith('supabase')
      ? `export const supabase={rpc:async()=>globalThis.__cmsResponse,from:()=>{const q={select:()=>q,eq:()=>q,limit:()=>Promise.resolve(globalThis.__dsnpResponse)};return q;}};export const supabaseCms=supabase;`
      : args.path.endsWith('embeddings') ? 'export const getQueryEmbedding=async()=>[0];'
      : args.path.endsWith('sepCms') ? 'export const fetchPlansFromSupabase=async()=>[];export const transformCmsPlan=x=>x;'
      : args.path.endsWith('sepGeo') ? 'export const getStateFromZip=()=>"NJ";'
      : 'export const getCountyFromZip=()=>"Mercer";' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
test('empty/unavailable alignment table stays pending; F35 landscape evidence and verification wording survive', async () => {
  const { hasCurrentDsnpList, DSNP_INTEGRATION_PENDING } = await browserModule('src/lib/dsnpIntegration.js');
  for (const response of [{ data: [], error: null }, { data: null, error: { message: 'missing column' } }]) {
    globalThis.__dsnpResponse = response; assert.equal(await hasCurrentDsnpList(), false);
  }
  globalThis.__dsnpResponse = { data: [{ id: 1 }], error: null }; assert.equal(await hasCurrentDsnpList(), true);
  const { buildSnpRoutingRecommendation } = await browserModule('src/lib/snpRouting.js');
  const plan = { snp: 'D-SNP', cid: 'H1234', pbp: '001', states: ['NJ'], countyName: 'Mercer', name: 'Fixture', carrier: 'uhc', dsnpIntegrationStatus: 'HIDE' };
  const input = { medicaidStatus: 'full_qmb_plus', chronicCondition: 'none', memberPriority: 'benefits', zip: '08540', lookup: { countyResolved: true, plans: [plan], dsnpAlignmentRows: [], routingRules: [] } };
  const pending = buildSnpRoutingRecommendation(input);
  assert.equal(pending.routeLabel, 'D-SNP'); assert.equal(pending.alignment.pending, true);
  assert.match(pending.summary, /pending CMS list/); assert.ok(pending.alerts.some(a => a.text === DSNP_INTEGRATION_PENDING));
  assert.ok(pending.sepLanes.includes(INTEGRATED_LANE)); assert.ok(pending.sepLanes.includes(PDP_LANE));
  const unknown = buildSnpRoutingRecommendation({ ...input, lookup: { ...input.lookup, plans: [{ ...plan, dsnpIntegrationStatus: '' }] } });
  assert.equal(unknown.alignment.integratedPlan, false);
  for (const integration_level of ['AIP', 'HIDE', 'FIDE', 'CO']) {
    const alignment = { plan_year: 2027, state: 'NJ', county: null, contract_id: 'H1234', plan_id: '001', integration_level, eae_status: null };
    const loaded = buildSnpRoutingRecommendation({ ...input, lookup: { ...input.lookup, dsnpAlignmentRows: [alignment] } });
    assert.equal(loaded.alignment.pending, false); assert.equal(loaded.alignment.integratedPlan, integration_level !== 'CO'); assert.equal(loaded.alignment.eaeStatus, null);
    for (const wrong of [{ state: 'NY' }, { contract_id: 'H9999' }, { plan_id: '002' }, { plan_year: 2026 }, { county: 'Ocean' }]) {
      const unmatched = buildSnpRoutingRecommendation({ ...input, lookup: { ...input.lookup, dsnpAlignmentRows: [{ ...alignment, ...wrong }] } });
      assert.equal(unmatched.alignment.pending, true);
    }
  }
  delete globalThis.__dsnpResponse;
});

test('SEP and plan table render pending CMS list without suppressing county results', async () => {
  const { default: SEPResultsPanel } = await browserModule('src/components/SEPResultsPanel.jsx');
  const html = renderToStaticMarkup(createElement(SEPResultsPanel, { zip: '08540', result: { zip: '08540', seps: [{ sep_type: 'Integrated-care monthly D-SNP SEP', available: false, evidence: 'Verify full-benefit status and aligned MCO enrollment.' }] } }));
  assert.match(html, /pending CMS list/); assert.match(html, /Verify full-benefit/);
  const { PlanTable } = await browserModule('src/components/sep/PlanTable.jsx');
  const table = renderToStaticMarkup(createElement(PlanTable, { planFilterCarrier: 'all', planFilterType: 'all', planFilterSnp: 'all', planSearch: '', planCarrierOpts: [], planTypeOpts: [], expandedPlans: {}, filteredPlans: [{ snp: 'D-SNP', cid: 'H1234', pbp: '001', carrier: 'uhc', name: 'County fixture', prem: 0, moop: 1000 }] }));
  assert.match(table, /pending CMS list/); assert.match(table, /County fixture/);
});
test('copilot retains county references and warns against inferring EAE/MCO with empty list', async () => {
  const { fetchCmsPlanReferences } = await browserModule('src/lib/cmsPlanRag.js');
  globalThis.__dsnpResponse = { data: [], error: null };
  globalThis.__cmsResponse = { data: [{ plan_id: 7, similarity: 0.9, content: 'SNP type: Dual-Eligible; County: Mercer' }], error: null };
  const result = await fetchCmsPlanReferences({ query: 'D-SNP benefits', state: 'NJ', county: 'Mercer' });
  assert.equal(result.error, null); assert.equal(result.results.length, 1);
  assert.match(result.contextBlock, /pending CMS list/); assert.match(result.contextBlock, /Do not infer affiliated Medicaid MCO or exclusive aligned enrollment/);
  assert.match(result.contextBlock, /Mercer, NJ/); assert.equal(result.sources.length, 1);
  globalThis.__dsnpResponse = { data: [{ id: 1 }], error: null };
  const loaded = await fetchCmsPlanReferences({ query: 'D-SNP', state: 'NJ', county: 'Mercer' });
  assert.doesNotMatch(loaded.contextBlock, /pending CMS list/);
  assert.match(loaded.contextBlock, /Do not infer affiliated Medicaid MCO or exclusive aligned enrollment/);
  delete globalThis.__dsnpResponse; delete globalThis.__cmsResponse;
});
