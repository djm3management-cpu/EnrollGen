import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_INTENTS} from '../src/compliance/intents/index.js';
import {RULE_CATALOG,RETIRED_RULE_IDS,RULES_VERSION} from '../src/compliance/rules/catalog.js';
import {ORIGINAL_MA_RUBRIC} from '../src/compliance/rules/originalRubric.js';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {detectCallStages} from '../src/compliance/rules/callStages.js';
import {hasTpmo2027,evaluateTpmo2027,findBenefitTrigger} from '../src/compliance/shared/tpmo2027.js';
import {aggregateVersion} from '../src/compliance/engine/VersionAggregator.js';
const line=(text,start_ms,speaker='agent',duration=1000)=>({id:`${speaker}-${start_ms}`,text,start_ms,end_ms:start_ms+duration,speaker});
const complete='We do not offer every plan available in your area. We represent two organizations which offer sixteen products. Contact Medicare.gov for information on all of your options.';
const call=extras=>({id:'fixture',tenant_id:'tenant',product_type:'MA',call_direction:'inbound',call_outcome:'enrolled',call_duration_seconds:7200,transcript_diarized:[line('Our Medicare call is recorded.',0),line('Yes',1500,'customer'),line(complete,10000),line('This plan gives you $20.',700000),line('We will start the enrollment process.',5000000),line('Devoted C SNP Choice plan is your selected plan.',5143702),...extras,line("Thank you. And I'll now submit the enrollment.",6691632),line('Goodbye',7199000),line('Fixture close',7199000,'customer')]});
const item=(c,id)=>evaluateRules(c).items.find(i=>i.rule_id===id);
test('restore all 138 original MA definitions except exactly the three approved retirements; preserve every weight',()=>{
 assert.equal(RULES_VERSION,'cy2027-full-rubric-6');assert.equal(Object.keys(ORIGINAL_MA_RUBRIC).length,138);
 const active=RULE_CATALOG.filter(r=>r.product_type==='MA'&&r.bucket!=='RETIRE');assert.equal(active.length,135);assert.equal(active.reduce((s,r)=>s+r.points,0),251);
 assert.deepEqual([...RETIRED_RULE_IDS].sort(),['CONDUCT_013_NO_COMPARISON_BY_NAME','ELIG_010_ESRD_STATUS_CHECK','ENROLL_008_CMS_REVIEW_PERIOD']);
 for(const r of active){assert.equal(r.points,ORIGINAL_MA_RUBRIC[r.id].points_possible);if(!r.cmsBasis)assert.equal(r.description,ALL_INTENTS.find(i=>i.intent_code===r.id).description);}
});
for(const relative of ['which offer','who offer','that offer'])for(const company of ['organizations','carriers','companies'])test(`TPMO: ${company} ${relative}`,()=>{
 assert.equal(hasTpmo2027(`We don't offer every plan. We represent, looks like, two ${company} ${relative} 16 plans. Contact medicare dot gov for more info on all options.`),true);
});
for(const resource of ['Medicare.gov','medicare dot gov','1-800-MEDICARE','1800 Medicare','one eight hundred Medicare','1800'])test(`TPMO resource ${resource}`,()=>assert.ok(hasTpmo2027(complete.replace('Medicare.gov',resource))));
for(const options of ['information on all of your options','more info on all options','help with plan choices'])test(`TPMO options ${options}`,()=>assert.ok(hasTpmo2027(complete.replace('information on all of your options',options))));
test('Mark exact stored TPMO at 149490ms: full counts/resources/options and observed free-plan ASR variant',()=>{
 const first=line('We do not offer free plan available in the area. We represent eight organizations',145180,'agent',4310);
 const second=line("who offer 32 products. Contact medicare.gov, one eight hundred Medicare to get more info on all options. Plans are insured or covered by a Medicare Advantage organization with a Medicare contract or an approved part d sponsor. Enroll in the plan depends on the plan's contract renewal with Medicare.",149490,'agent',24850);
 const result=evaluateTpmo2027([line('We do not offer every plan',90000),first,second,line('They give you $93 a month towards your part B premium.',598730)]);
 assert.equal(result.beforeBenefits,true);assert.equal(result.disclaimer.start_ms,145180);
 assert.equal(hasTpmo2027('We offer every plan. We represent two companies that offer sixteen products. Contact 1800 for all options.'),false);
});
test('Dylan exact consent: name/DOB lead-in then And I agree; named plan is elsewhere in enrollment',()=>{
 const c=call([line('I submitted something with the doctor name.',6088802),line('enrollment now, please state your name',6674152),line('date of birth,',6676462),line('and that you agree.',6677592),line('My name.',6680171,'customer'),line('Date of birth.',6684461,'customer'),line('My birth date.',6685611,'customer'),line('And I agree.',6689391,'customer')]);
 assert.equal(detectCallStages(c).submission.start_ms,6691632);
 const r=item(c,'ENROLL_002_VERBAL_CONSENT');assert.equal(r.result,'pass');assert.match(r.evidence_text,/And I agree/);assert.match(r.evidence_text,/Devoted C SNP Choice/);assert.equal(r.evidence_timestamp_ms,6674152);
 const refused={...c,transcript_diarized:c.transcript_diarized.map(l=>l.text==='And I agree.'?{...l,text:'No, I do not agree.'}:l)};assert.equal(item(refused,'ENROLL_002_VERBAL_CONSENT').result,'fail');
});
test('an opening plan mention cannot supply the selected plan for a later enrollment signature',()=>{
 const c=call([line('Please state your name and that you agree.',6677592),line('And I agree.',6689391,'customer')]);
 c.transcript_diarized=c.transcript_diarized.map(l=>l.start_ms===5143702?{...l,start_ms:5000,end_ms:6000}:l);assert.equal(item(c,'ENROLL_002_VERBAL_CONSENT').result,'fail');
});
test('pre-enrollment passes cite plan/enrollment stage; opening small talk is insufficient',()=>{
 const c=call([line('Your current doctor is in network.',100000)]);assert.equal(item(c,'PECL_005_PROVIDER_NETWORK_CONFIRMED').result,'fail');
 c.transcript_diarized.push(line('Your current doctor is in network.',900000));const r=item(c,'PECL_005_PROVIDER_NETWORK_CONFIRMED');assert.equal(r.result,'pass');assert.equal(r.evidence_timestamp_ms,900000);
});
test('drug topic requires both coverage and costs; intake alone never passes',()=>{
 const c=call([line('Which pharmacy do you use?',900000),line('Will you have any other prescription drug coverage?',910000),line('Your prescriptions are covered.',1000000)]);
 assert.equal(item(c,'PECL_007_DRUG_COVERAGE_CONFIRMED').result,'fail');c.transcript_diarized.push(line('Your prescriptions are covered with a $5 copay.',1100000));assert.equal(item(c,'PECL_007_DRUG_COVERAGE_CONFIRMED').result,'pass');assert.equal(item(c,'PECL_006_PHARMACY_NETWORK_CONFIRMED').result,'fail');
});
for(const text of ['The plan has to verify that you qualify.','Assistance with your Part B premium such as Medicaid or Extra Help?','T Mobile home Internet is $55 a month.'])test(`not a benefit pitch: ${text}`,()=>assert.equal(findBenefitTrigger(line(text,1000)),null));
test('restored agency judgment pass keeps its original weight; AI violation remains review until admin confirms original weight',()=>{
 const c=call([]),code='NEEDS_004_MEDICATION_DETAILS',t={id:'t',intent_id:'i',intent_code:code,category:'NEEDS_ASSESSMENT'},prior={id:'p',template_item_id:'t',result:'pass',confidence:.95,evidence_text:'I take a particular medicine and dose.',evidence_timestamp_ms:900000};
 let r=aggregateVersion({call:c,source:{id:'old',template_id:'a'},items:[prior],templateItems:[t],intents:[]});assert.equal(r.items[0].points_possible,1);assert.equal(r.items[0].points_earned,1);
 const conduct={...t,intent_code:'CONDUCT_004_NO_MISLEADING_LANGUAGE'};r=aggregateVersion({call:c,source:{id:'old',template_id:'a'},items:[{...prior,result:'fail'}],templateItems:[conduct],intents:[]});assert.equal(r.items[0].result,'review');assert.equal(r.items[0].points_possible,0);assert.equal(r.scorecard.auto_fail_triggered,false);
 r=aggregateVersion({call:c,source:{id:'old',template_id:'a'},items:[{...prior,result:'review'}],templateItems:[conduct],intents:[],decision:{item_id:'p',decision:'confirm'}});assert.equal(r.items[0].points_possible,3);assert.equal(r.scorecard.auto_fail_triggered,false);
});
test('stored agency plan pass with opening evidence is REVIEW, never awarded plan points',()=>{
 const c=call([]),t={id:'t',intent_id:'i',intent_code:'PLAN_001_PLAN_NAME_STATED',category:'PLAN_PRESENTATION'};
 const r=aggregateVersion({call:c,source:{id:'old',template_id:'a'},items:[{template_item_id:'t',result:'pass',confidence:1,evidence_text:'Small talk.',evidence_timestamp_ms:1000}],templateItems:[t],intents:[]});assert.equal(r.items[0].result,'review');assert.equal(r.items[0].points_possible,0);
});
test('recording refusal cannot inherit old consent; a later explicit renewed consent resolves it',()=>{
 const c=call([line('May I record this enrollment?',5100000),line('No.',5101500,'customer')]);
 assert.equal(item(c,'CALL_OPEN_003_RECORDING_DECLINE').result,'fail');assert.equal(item(c,'CALL_OPEN_002_RECORDING_CONSENT').result,'fail');
 c.transcript_diarized.push(line('Can I record this enrollment now?',5200000),line('Yes.',5201500,'customer'));
 assert.equal(item(c,'CALL_OPEN_003_RECORDING_DECLINE').result,'pass');assert.equal(item(c,'CALL_OPEN_002_RECORDING_CONSENT').result,'pass');
});
