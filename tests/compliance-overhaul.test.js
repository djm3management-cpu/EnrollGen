import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptCoverage,sortTranscript} from '../src/compliance/rules/transcript.js';
import {RULE_CATALOG} from '../src/compliance/rules/catalog.js';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {evaluateTpmo2027} from '../src/compliance/shared/tpmo2027.js';
import {isHardViolation} from '../src/compliance/shared/scoringPolicy.js';
const line=(text,start_ms=0,speaker='agent')=>({text,start_ms,end_ms:start_ms+1000,speaker});
test('exact trigger TPMO after abandoned attempt passes before benefits',()=>{
 const rows=[line('we do not offer every plan. Actually I got ahead of myself',175000),line('We do not offer every plan available in your area.',207000),line('Currently represent, looks like, two, organizations which offer about 16 products in your area.',214000),line('Please contact medicare.gov at 1800 to get information on all of your options.',223000),line('this plan gives you $50',400000)];
 assert.equal(evaluateTpmo2027(rows).beforeBenefits,true);
});
test('needs question does not trigger benefits and unknown speaker cannot supply disclosure',()=>{
 assert.equal(evaluateTpmo2027([line('are you looking for giveback or OTC',123000)]).firstBenefit,null);
 assert.equal(evaluateTpmo2027([line('we do not offer every plan; we represent two organizations and sixteen products in your area. medicare.gov all your options',0,'customer')]).disclaimer,null);
});
test('coverage rejects missing tail and preserves segment identity when sorting',()=>{
 assert.equal(transcriptCoverage({call_duration_seconds:4390,transcript_diarized:[line('last',544000)]}).complete,false);
 assert.equal(transcriptCoverage({call_duration_seconds:100,transcript_diarized:[{...line('last',95000),end_ms:96000}]}).complete,true);
 assert.deepEqual(sortTranscript([{id:'b',start_ms:2},{id:'a',start_ms:1}]).map(x=>x.id),['a','b']);
 assert.equal(transcriptCoverage({transcript_diarized:null}).complete,false);
});
test('LLM cannot hard fail, regardless of hard misconduct classification',()=>{
 for(const rule of RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT'))assert.equal(isHardViolation(rule.id,{anti_pattern_match:true,hard_cms_violation:true,detected:false,confidence:1,transcript_segment:'confirmed violation',segment_start_ms:0},'ma-cy2027-2026-10-01'),false);
});
for(const rule of RULE_CATALOG.filter(r=>r.bucket==='DETERMINISTIC')) {
 test(`${rule.id}: absence is explicit and never evidence-free auto-fail`,()=>{
  const result=evaluateRules({product_type:rule.product_type||'MA',call_outcome:'enrolled',election_period:'SEP',medicaid:true,ptc_on_file:false,metadata:{has_prescriptions:true,pdp_mapd_comparison:true,non_renewing_plan:true,inbound_callback_received:true,prior_coverage_type:'MedSup',plan_benefits:['dental','vision','hearing','otc','fitness','transportation','telehealth','giveback']},call_direction:rule.subcategory==='OUTBOUND'?'outbound':'inbound',call_duration_seconds:1200,transcript_diarized:[line('Medicare',10000),line('Yes',12000,'customer'),line('This plan gives you $50',500000),{...line('Goodbye',1199000),end_ms:1200000}]});
  const item=result.items.find(x=>x.rule_id===rule.id);assert.notEqual(item.result,'pass');assert.equal(item.auto_fail_triggered,false);assert.ok(item.missing);
 });
}
test('consent requires beneficiary reply',()=>{
 const call={product_type:'MA',call_outcome:'enrolled',call_direction:'inbound',call_duration_seconds:1200,transcript_diarized:[line('Do you consent to enroll?',1000),line('no',2500,'customer'),line('Medicare conversation',1199000)]};
 assert.equal(evaluateRules(call).items.find(x=>x.rule_id==='ENROLL_002_VERBAL_CONSENT').result,'fail');
 call.transcript_diarized[1].text='yes';assert.equal(evaluateRules(call).items.find(x=>x.rule_id==='ENROLL_002_VERBAL_CONSENT').result,'pass');
});
for(const rule of RULE_CATALOG.filter(r=>r.bucket==='DETERMINISTIC')){
 test(`${rule.id}: approved positive wording matches with affirmative response`,()=>{
  let phrase=rule.sample_phrases.find(p=>rule.pattern?.test(p))||rule.sample_phrases[0];
  if(/TPMO/.test(rule.id))phrase='We do not offer every plan available in your area. We represent right now looks like two organizations which offer sixteen products in your area. Contact Medicare.gov to get information on all of your options.';
  if(/^SOA_00[134]/.test(rule.id))phrase='Before we discuss plans, may I have permission to discuss Medicare Advantage and prescription drug plans?';
  const rows=[line(phrase,1000),line('Yes, I agree and understand.',2500,'customer'),line('Medicare',10000),line('This plan gives you $50',500000),{...line('Thank you.',1199000),end_ms:1200000}];
  const result=evaluateRules({product_type:rule.product_type||'MA',call_outcome:'enrolled',election_period:'SEP',medicaid:true,ptc_on_file:true,metadata:{full_call_recorded:true,recording_gaps_absent:true,tpmo_sharing:true,tpmo_sharing_written_consent:true,has_prescriptions:true,pdp_mapd_comparison:true,non_renewing_plan:true,inbound_callback_received:true,prior_coverage_type:'MedSup',plan_benefits:['dental','vision','hearing','otc','fitness','transportation','telehealth','giveback']},call_direction:rule.subcategory==='OUTBOUND'?'outbound':'inbound',call_duration_seconds:1200,transcript_diarized:rows});
  assert.equal(result.items.find(i=>i.rule_id===rule.id).result,'pass',phrase);
 });
}
test('split recording statement is matched across agent segments, preserving source IDs',()=>{
 const call={product_type:'MA',call_direction:'inbound',call_duration_seconds:1200,transcript_diarized:[{...line('Please know this call will be',0),id:'first'},{...line('recorded for quality and training purposes',1200),id:'second'},line('Yes.',2500,'customer'),{...line('Medicare conversation',1199000),end_ms:1200000}]};
 const item=evaluateRules(call).items.find(i=>i.rule_id==='CALL_OPEN_001_RECORDING_ANNOUNCE');assert.equal(item.result,'pass');assert.match(item.evidence_text,/will be recorded/);assert.equal(item.evidence_timestamp_ms,0);
});
test('needs and generic extras are coaching only, a carrier pitch or known plan name is a trigger',()=>{
 assert.equal(evaluateTpmo2027([line('Are you interested in dental benefits or a lower premium?',1000)]).firstBenefit,null);
 const extra=evaluateTpmo2027([line('We can look at dental and OTC benefits',1000)]);assert.equal(extra.firstBenefit,null);assert.equal(extra.coachingFlags.length,1);
 assert.ok(evaluateTpmo2027([line('Humana has a plan that covers these services',1000)]).firstBenefit);
 assert.ok(evaluateTpmo2027([line('The Secure Choice H1234 plan',1000)],{plan_name:'Secure Choice H1234'}).firstBenefit);
});
test('known stale multi-day calls cannot authorize a billable gap fill',()=>{assert.equal(transcriptCoverage({call_duration_seconds:574708,transcript_diarized:[line('last',30000)]}).durationNeedsVerification,true);});
