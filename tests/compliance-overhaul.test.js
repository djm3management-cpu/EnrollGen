import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptCoverage,sortTranscript} from '../src/compliance/rules/transcript.js';
import {RULE_CATALOG} from '../src/compliance/rules/catalog.js';
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
 assert.equal(transcriptCoverage({call_duration_seconds:100,transcript_diarized:[line('first',0),line('first',0,'customer'),{...line('last',95000),end_ms:96000},{...line('last',95000,'customer'),end_ms:96000}]}).complete,true);
 assert.deepEqual(sortTranscript([{id:'b',start_ms:2},{id:'a',start_ms:1}]).map(x=>x.id),['a','b']);
 assert.equal(transcriptCoverage({transcript_diarized:null}).complete,false);
});
test('LLM cannot hard fail, regardless of hard misconduct classification',()=>{
 for(const r of RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT'))assert.equal(isHardViolation(r.id,{anti_pattern_match:true,hard_cms_violation:true,confidence:1,transcript_segment:'quote',segment_start_ms:0},'ma-cy2027-2026-10-01'),false);
});
test('needs and generic extras are coaching only, a carrier pitch or known plan name is a trigger',()=>{
 assert.equal(evaluateTpmo2027([line('Are you interested in dental benefits or a lower premium?',1000)]).firstBenefit,null);
 const extra=evaluateTpmo2027([line('We can look at dental and OTC benefits',1000)]);assert.equal(extra.firstBenefit,null);assert.equal(extra.coachingFlags.length,1);
 assert.ok(evaluateTpmo2027([line('Humana has a plan that covers these services',1000)]).firstBenefit);
 assert.ok(evaluateTpmo2027([line('The Secure Choice H1234 plan',1000)],{plan_name:'Secure Choice H1234'}).firstBenefit);
});
test('known stale multi-day calls cannot authorize a billable gap fill',()=>{assert.equal(transcriptCoverage({call_duration_seconds:574708,transcript_diarized:[line('last',30000)]}).durationNeedsVerification,true);});
