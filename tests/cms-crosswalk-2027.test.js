import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCrosswalk } from '../scripts/sep-data/ingest-plan-crosswalk.js';
import { parseCsv } from '../scripts/sep-data/common.js';
const landscape = [{contract_id:'H0001',plan_id:'002',county_fips:'34007',county_name:'Camden',state_code:'NJ'}, {contract_id:'H0001',plan_id:'003',county_fips:'34007',county_name:'Camden',state_code:'NJ'}];
const row = (status, oldPlan='001', newPlan='002') => ({ PREVIOUS_CONTRACT_ID:'H0001', PREVIOUS_PLAN_ID:oldPlan, CURRENT_CONTRACT_ID:'H0001', CURRENT_PLAN_ID:newPlan, STATUS:status });
test('new plans sharing the NEW placeholder remain distinct', () => {
  const result=prepareCrosswalk([row('New Plan','NEW','002'),row('New Plan','NEW','003')],landscape);
  assert.equal(result.records.length,2);
  assert.notEqual(result.records[0].source_key,result.records[1].source_key);
  assert.equal(result.records[0].old_plan_id,null);
});
test('termination retains source without inventing county or successor', () => {
  const input={...row('Terminated/Non-renewed Contract'),CURRENT_CONTRACT_ID:'TERMINATED',CURRENT_PLAN_ID:'TERMINATED'};
  const {records}=prepareCrosswalk([input],landscape);
  assert.equal(records[0].county_fips,null);
  assert.equal(records[0].new_contract_id,null);
  assert.equal(records[0].county_mapping_status,'unavailable');
});
test('SAR current counties are explicitly not affected counties', () => {
  const {records}=prepareCrosswalk([row('Renewal Plan with SAR')],landscape);
  assert.equal(records[0].termination_type,'service_area_reduction');
  assert.equal(records[0].county_mapping_status,'current_service_area');
});
test('all CMS statuses retained, unknown statuses fail', () => {
  assert.equal(prepareCrosswalk([row('Renewal Plan with SAE')],landscape).records[0].termination_type,'renewal');
  assert.equal(prepareCrosswalk([row('Consolidated Renewal Plan')],landscape).records[0].termination_type,'consolidated_renewal');
  assert.throws(()=>prepareCrosswalk([row('Unexpected')],landscape),/Unknown/);
});
test('summary CSV skips title and reads exact 2027 Overall column', () => {
  const rows=parseCsv('2027 Summary Star View,,,,\nContract Number,2026 Overall,2027 Overall\nH0001,5,2.5\n', {headerIncludes:['Contract Number','2027 Overall']});
  assert.equal(rows[0]['2027 Overall'],'2.5');
});
test('a prior plan with multiple CMS transitions retains each status and successor', () => {
  const { records }=prepareCrosswalk([row('Renewal Plan with SAR'),row('Consolidated Renewal Plan','001','003')],landscape);
  assert.equal(records.length,2);
  assert.deepEqual(new Set(records.map(r=>r.termination_type)),new Set(['service_area_reduction','consolidated_renewal']));
});
