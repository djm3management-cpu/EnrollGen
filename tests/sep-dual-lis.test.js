import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evaluateDualLisSep,isIntegratedDsnp,dualLisSepCards,normalizeDualLisRpcResult} from '../src/lib/dualLisSep.js';
import {getSEPsForState,getSEPsForZip} from '../src/lib/sepEngine.js';
import {DUAL_LIS_SEP_QUIZ} from '../src/data/dualLisSepQuiz.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/068_sep_dual_lis.sql');
const pg=new PGlite();const query=(q,p=[])=>pg.query(q,p).then(r=>r.rows);
const plan={snp:'D-SNP',dsnpIntegrationStatus:'HIDE'};
const verified={partDAtRisk:false,pdpElectionUsedThisMonth:false,integratedElectionUsedThisMonth:false,targetPlan:plan,targetPlanInServiceArea:true,alignedEnrollmentVerified:true};
const keys=['ma_sep_guide_2026','state_fl','state_ky','state_nj','state_tx','state_va'];
let originalOtherRules;
before(async()=>{
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 await pg.exec(read('scripts/sep-data/schema.sql').split('CREATE OR REPLACE FUNCTION public.get_available_seps')[0]);
 const cms=read('supabase/migrations/054_cms_landscape_2027.sql');
 await pg.exec(cms.slice(cms.indexOf('CREATE TABLE IF NOT EXISTS public.cms_plans_py2027'),cms.indexOf('CREATE INDEX IF NOT EXISTS cms_plans_py2027_area_idx')));
 await pg.exec(`CREATE TABLE knowledge_base(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,category text,key text,title text,content text,metadata jsonb,version integer DEFAULT 1,is_active boolean,source_urls text[],updated_at timestamptz);
 CREATE TABLE knowledge_updates(knowledge_base_id uuid REFERENCES knowledge_base(id),previous_content text,new_content text,change_summary text,change_source text,status text,reviewed_by text);
 CREATE TABLE compliance_intents(intent_code text PRIMARY KEY,sample_phrases text[],description text);
 CREATE TABLE snp_routing_rules(rule_key text PRIMARY KEY,sep_paths text[],primary_route text,rule_summary text);`);
 const historical=read('supabase/migrations/009_knowledge_base.sql');
 const pattern=/\(NULL, 'sep_guide', '([^']+)', '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)'::jsonb, 1, true, ARRAY/g;
 for(const match of historical.matchAll(pattern)) if(keys.includes(match[1])) {
   await query('INSERT INTO knowledge_base(category,key,title,content,metadata,is_active,source_urls) VALUES(\'sep_guide\',$1,$2,$3,$4,true,ARRAY[\'original-source\'])',[match[1],match[2].replaceAll("''","'"),match[3].replaceAll("''","'"),match[4].replaceAll("''","'")]);
 }
 assert.equal((await query('SELECT count(*) n FROM knowledge_base'))[0].n,6);
 await pg.exec(`INSERT INTO knowledge_base(category,key,content,metadata,is_active) SELECT category,key,content,metadata,false FROM knowledge_base WHERE key='state_fl';
 INSERT INTO knowledge_base(tenant_id,category,key,content,metadata,is_active) SELECT '00000000-0000-4000-8000-000000000001',category,key,content||' Custom tenant note.',metadata,true FROM knowledge_base WHERE key='state_tx';
 INSERT INTO knowledge_base(category,key,content,metadata,is_active) VALUES('unrelated','state_fl','Unrelated carrier content','{"untouched":true}',true);`);
 await query('INSERT INTO compliance_intents VALUES($1,$2,$3)',['ELIG_007_SEP_REASON_DOCUMENTED',['Unrelated example.','Your dual-eligible status qualifies you for a continuous SEP, which means you can make changes to your plan at any time.'],'Keep this description.']);
 await query('INSERT INTO snp_routing_rules VALUES($1,$2,$3,$4)',['partial_dual_no_chronic',['AEP','Dual/LIS SEP when Medicaid or Extra Help applies'],'STANDARD MA WITH GIVEBACK','Preserve routing.']);
 originalOtherRules=(await query('SELECT primary_route,rule_summary FROM snp_routing_rules'))[0];
 await pg.exec(migration);
});
after(()=>pg.close());

test('full dual, partial dual, LIS-only and neither: distinct monthly election rights',()=>{
 for(const [subject,pdp,integrated] of [
  [{medicaidStatus:'full_dual',hasLis:true},'eligible','eligible'],
  [{medicaidStatus:'partial_dual',hasLis:true},'eligible','ineligible'],
  [{medicaidStatus:'partial_dual',hasLis:false},'eligible','ineligible'],
  [{medicaidStatus:'none',hasLis:true},'eligible','ineligible'],
  [{medicaidStatus:'none',hasLis:false},'ineligible','ineligible'],
 ])assert.deepEqual(evaluateDualLisSep({...verified,...subject}),{pdp,integrated});
});
test('missing evidence, unaligned MCO, FFS, non-integrated plan and wrong service area cannot authorize integrated care',()=>{
 assert.deepEqual(evaluateDualLisSep(),{pdp:'verification_required',integrated:'verification_required'});
 for(const missing of ['alignedEnrollmentVerified','targetPlan','targetPlanInServiceArea','integratedElectionUsedThisMonth']) {
  const subject={...verified,medicaidStatus:'full_dual'};delete subject[missing];assert.equal(evaluateDualLisSep(subject).integrated,'verification_required',missing);
 }
 for(const change of [{alignedEnrollmentVerified:false},{targetPlanInServiceArea:false},{targetPlan:{snp:'D-SNP',dsnpIntegrationStatus:'Non-integrated'}},{targetPlan:{snp:'C-SNP',dsnpIntegrationStatus:'HIDE'}}])
  assert.equal(evaluateDualLisSep({...verified,medicaidStatus:'full_dual',...change}).integrated,'ineligible');
 for(const targetPlan of [{snp:'D-SNP'},{snp:'D-SNP',dsnpIntegrationStatus:'Pending'},{snp:'D-SNP',dsnpAipIdentifier:'No'}])
  assert.equal(evaluateDualLisSep({...verified,medicaidStatus:'full_dual',targetPlan}).integrated,'verification_required');
});
test('PDP drug-management exclusion and monthly use stay separate from integrated care',()=>{
 for(const change of [{partDAtRisk:true},{pdpElectionUsedThisMonth:true}])assert.deepEqual(evaluateDualLisSep({...verified,medicaidStatus:'full_dual',...change}),{pdp:'ineligible',integrated:'eligible'});
 assert.equal(evaluateDualLisSep({...verified,medicaidStatus:'full_dual',integratedElectionUsedThisMonth:true}).integrated,'ineligible');
 for(const missing of ['partDAtRisk','pdpElectionUsedThisMonth']){const subject={...verified,medicaidStatus:'partial_dual'};delete subject[missing];assert.equal(evaluateDualLisSep(subject).pdp,'verification_required');}
});
test('only explicit FIDE/HIDE/AIP integration evidence qualifies; No/unknown never becomes truthy evidence',()=>{
 for(const status of ['FIDE','HIDE','FIDE SNP','HIDE-SNP'])assert.equal(isIntegratedDsnp({snp:'D-SNP',dsnpIntegrationStatus:status}),true);
 for(const value of ['Yes','1','true','AIP'])assert.equal(isIntegratedDsnp({snp:'D-SNP',dsnpAipIdentifier:value}),true);
 for(const value of ['No','0','unknown','pending',''])assert.equal(isIntegratedDsnp({snp:'D-SNP',dsnpAipIdentifier:value}),false);
 assert.equal(isIntegratedDsnp({snp:'C-SNP',dsnpAipIdentifier:'Yes'}),false);
});
test('both browser lookup paths return PDP-only and integrated-only cards, with member status explicit',()=>{
 const plans=[{cat:'PDP',name:'Drug plan'},plan,{cat:'MA',name:'Standard MA'},{snp:'D-SNP',dsnpAipIdentifier:'No'}];
 const options={plans,subject:{...verified,medicaidStatus:'partial_dual'}};
 for(const cards of [dualLisSepCards(options),getSEPsForState('NJ',[],options),getSEPsForZip('08540',[],options)]){
  const pdp=cards.find(card=>card.id==='medicare-dual-lis'),integrated=cards.find(card=>card.id==='medicare-integrated-care');
  assert.deepEqual(pdp.eligibleProducts,['PDP']);assert.deepEqual(pdp.matchingPlans,[plans[0]]);assert.equal(pdp.eligibilityStatus,'eligible');
  assert.deepEqual(integrated.eligibleProducts,['D-SNP']);assert.deepEqual(integrated.matchingPlans,[plan]);assert.equal(integrated.eligibilityStatus,'ineligible');
  assert.doesNotMatch(JSON.stringify([pdp,integrated]),/quarter/i);
 }
});
test('pre-068 RPC compatibility removes retired claims and generic D-SNP plan evidence; current RPC is unchanged',()=>{
 const other={sep_type:'Institutional',available:true};
 const result=normalizeDualLisRpcResult({zip:'08540',seps:[other,{sep_type:'Dual Eligible SNP (D-SNP) SEP',available:true,period:'quarterly',plans:[{name:'Unverified D-SNP'}]}]});
 assert.equal(result.seps[0],other);assert.equal(result.seps.length,3);
 for(const card of result.seps.slice(1)){assert.equal(card.available,null);assert.deepEqual(card.plans,[]);assert.equal(card.eligibility_status,'verification_required');}
 assert.doesNotMatch(JSON.stringify(result),/quarter|Unverified D-SNP/);
 assert.equal(normalizeDualLisRpcResult(result),result);
});
test('068 executes against real historical knowledge seeds; corrects text AND nested metadata and audits prior evidence',async()=>{
 const active=await query("SELECT key,content,metadata FROM knowledge_base WHERE is_active AND category='sep_guide'");
 assert.equal(active.length,7);
 for(const row of active){assert.doesNotMatch(row.content+' '+JSON.stringify(row.metadata),/regardless of.{0,25}Medicaid|loses?.{0,15}Medicaid coverage|election is (?:NOT|not) available|will auto.enroll|automatically enroll/i,row.key);assert.ok(row.metadata.f35_corrected_at);}
 assert.match(active.find(row=>row.key==='ma_sep_guide_2026').content,/standalone PDP.*MA-to-MA/);
 assert.match(active.find(row=>row.content.includes('Custom tenant note.')).content,/Custom tenant note\./);
 const audits=await query('SELECT * FROM knowledge_updates');assert.equal(audits.length,7);assert.ok(audits.some(row=>/regardless of/.test(row.previous_content)));assert.ok(JSON.parse(audits[0].change_summary).previous_metadata);
 const inactive=(await query('SELECT content FROM knowledge_base WHERE NOT is_active'))[0];assert.match(inactive.content,/regardless of/);
 assert.equal((await query("SELECT content FROM knowledge_base WHERE category='unrelated'"))[0].content,'Unrelated carrier content');
});
test('068 corrects deployed compliance phrase and guidance paths while preserving routing fields',async()=>{
 const intent=(await query('SELECT * FROM compliance_intents'))[0];assert.equal(intent.sample_phrases[0],'Unrelated example.');assert.match(intent.sample_phrases[1],/standalone PDP.*MA-to-MA/);assert.equal(intent.description,'Keep this description.');
 const rule=(await query('SELECT * FROM snp_routing_rules'))[0];assert.deepEqual({primary_route:rule.primary_route,rule_summary:rule.rule_summary},originalOtherRules);assert.equal(rule.sep_paths[0],'AEP');assert.match(rule.sep_paths[1],/does not authorize standard MA/);
});
test('RPC separates conditional PDP right from verified integrated area plans; respects county/year/type and AIP No',async()=>{
 await pg.exec("INSERT INTO zip_county_crosswalk(zip,county_fips,state_code) VALUES('08540','34021','NJ');");
 for(const [id,type,integration,aip,county,year] of [['H1','Dual-Eligible','HIDE',null,'34021',2027],['H2','Dual-Eligible',null,'Yes','34021',2027],['H3','Dual-Eligible',null,'No','34021',2027],['H4','Dual-Eligible','HIDE',null,'34025',2027],['H5','Chronic or Disabling Condition','HIDE',null,'34021',2027]])
  await query("INSERT INTO cms_plans_py2027(plan_year,category,state_code,county_name,county_fips,carrier,contract_id,plan_id,segment_id,contract_plan_segment_id,plan_name,snp_type,dsnp_integration_status,dsnp_aip_identifier,source_file) VALUES($1,'SNP','NJ','Mercer',$2,'Fixture',$3,'001','000',$3,'Fixture plan',$4,$5,$6,'fixture')",[year,county,id,type,integration,aip]);
 const result=(await query("SELECT get_available_seps('08540') result"))[0].result;
 const pdp=result.seps.find(card=>card.sep_type==='Dual / LIS monthly PDP SEP');assert.equal(pdp.available,null);assert.equal(pdp.area_based,false);assert.deepEqual(pdp.eligible_products,['PDP']);
 const integrated=result.seps.find(card=>card.sep_type==='Integrated-care monthly D-SNP SEP');assert.equal(integrated.available,true);assert.equal(integrated.eligibility_status,'verification_required');assert.equal(integrated.plan_count,2);assert.deepEqual(integrated.plans.map(p=>p.contract_id).sort(),['H1','H2']);
 const unknown=(await query("SELECT get_available_seps('99999') result"))[0].result;assert.deepEqual(unknown.seps,[]);assert.match(unknown.error,/not found/);
 await pg.exec('UPDATE cms_plans_py2027 SET dsnp_integration_status=NULL,dsnp_aip_identifier=NULL');
 const empty=(await query("SELECT get_available_seps('08540') result"))[0].result.seps.find(card=>card.sep_type==='Integrated-care monthly D-SNP SEP');assert.equal(empty.available,false);assert.equal(empty.plan_count,0);
});
test('reapplying 068 does not duplicate audit entries or mutate unrelated history',async()=>{
 const before=(await query('SELECT count(*) n FROM knowledge_updates'))[0].n;await pg.exec(migration);assert.equal((await query('SELECT count(*) n FROM knowledge_updates'))[0].n,before);
});
test('8-question SEP quiz covers beneficiary cases and safeguards with valid answer keys',()=>{
 assert.equal(DUAL_LIS_SEP_QUIZ.length,8);assert.equal(new Set(DUAL_LIS_SEP_QUIZ.map(q=>q.id)).size,8);
 for(const item of DUAL_LIS_SEP_QUIZ){assert.ok(item.choices.some(([key])=>key===item.answer));assert.ok(item.explanation.length>40);}
 const text=JSON.stringify(DUAL_LIS_SEP_QUIZ);for(const pattern of [/full-benefit/i,/partial dual/i,/Extra Help/i,/neither Medicaid/i,/unaligned/i,/potential-at-risk/i,/calendar month/i,/unknown/i])assert.match(text,pattern);
});
