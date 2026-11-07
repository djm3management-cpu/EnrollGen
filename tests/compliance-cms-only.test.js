import test from 'node:test';import assert from 'node:assert/strict';
import {ACTIVE_RULE_CATALOG,RETIRED_RULE_IDS,RULES_VERSION} from '../src/compliance/rules/catalog.js';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {WORDING_REFERENCE} from '../src/compliance/rules/cmsBasis.js';
import {classifyJudgmentOnce} from '../src/compliance/engine/JudgmentPass.js';
import {aggregateVersion} from '../src/compliance/engine/VersionAggregator.js';
import {scoreCall} from '../src/compliance/engine/ScoringEngine.js';
import {hasTpmo2027} from '../src/compliance/shared/tpmo2027.js';
const l=(text,start_ms=0,speaker='agent')=>({id:`${speaker}-${start_ms}`,text,start_ms,end_ms:start_ms+1000,speaker});
const tpmo='We do not offer every plan available in your area. Currently represent, looks like, two organizations which offer about 16 products in your area. Please contact medicare.gov at 1800 to get information on all of your options.';
const scope='We have Medicare Advantage plans and prescription drug plans. Would you like to discuss all of these options or are you only interested in certain ones?';
const topics={providers:'Your doctor and specialists are in network with this plan.',pharmacy:'Your pharmacy is a preferred in-network pharmacy.',drugs:'Your medications are covered on the formulary with a five dollar copay.',services:'Your specialist office visit copay is $20.',premiums:'Your monthly plan premium is zero dollars.',benefits:'This plan includes dental and vision benefits.',needs:'Do you have durable medical equipment or physical therapy requirements?'};
const call=(extra=[])=>({id:'call',tenant_id:'tenant',product_type:'MA',call_direction:'inbound',call_outcome:'enrolled',plan_name:'Humana Value Choice PPO',call_duration_seconds:1200,metadata:{full_call_recorded:true},transcript_diarized:[l('This Medicare call is recorded; is it okay if I continue?',0),l('Yes',1200,'customer'),l(tpmo,10000),l(scope,20000),l('Yes',21200,'customer'),l('Humana Value Choice PPO is the plan I am presenting.',40000),...Object.values(topics).map((t,i)=>l(t,60000+i*40000)),l('Enrolling in this plan will replace your current coverage and end your other MA plan.',400000),l('We will begin the enrollment in Humana Value Choice PPO.',450000),l('Would you like to enroll in Humana Value Choice PPO?',500000),l('Yes, I want to enroll.',501200,'customer'),...extra,l('I am submitting your enrollment now.',700000),l('Thank you',1199000),l('Fixture close',1199000,'customer')]});
const item=(c,id)=>evaluateRules(c).items.find(i=>i.rule_id===id);
test('full original rubric is active; only three retirements and August 3 wording source',()=>{
 assert.equal(RULES_VERSION,'cy2027-full-rubric-6');assert.equal(ACTIVE_RULE_CATALOG.filter(r=>r.product_type==='MA').length,135);assert.equal(ACTIVE_RULE_CATALOG.length,159);assert.equal(RETIRED_RULE_IDS.size,3);assert.equal(WORDING_REFERENCE.date,'2026-08-03');
 for(const r of ACTIVE_RULE_CATALOG.filter(r=>r.cmsBasis))assert.ok(r.cmsBasis.sources.every(s=>s.reference&&/^https:\/\/(?:www\.)?(?:cms\.gov|ecfr\.gov|govinfo\.gov)\//.test(s.url)));
});
for(const r of ACTIVE_RULE_CATALOG.filter(r=>r.bucket==='DETERMINISTIC'&&r.cmsBasis&& !['metadata','agency','recordingRefusal'].includes(r.cmsBasis.method)))test(`${r.id}: CMS-positive full-call evidence matches`,()=>{assert.equal(item(call(),r.id).result,'pass');});
for(const r of ACTIVE_RULE_CATALOG.filter(r=>r.cmsBasis?.method==='topic'))test(`${r.id}: before submission anywhere counts; after submission fails without AUTO-FAIL`,()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!==topics[r.cmsBasis.topic]);c.transcript_diarized.push(l(topics[r.cmsBasis.topic],800000));
 assert.equal(item(c,r.id).result,'fail',JSON.stringify(item(c,r.id)));assert.equal(item(c,r.id).auto_fail_triggered,false);
 c.transcript_diarized.push(l(topics[r.cmsBasis.topic],650000));assert.equal(item(c,r.id).result,'pass');
 if(r.stage==='enrollment'){c.call_outcome='callback_scheduled';assert.equal(item(c,r.id).result,'na');}
});
test('application-only questions do not satisfy pharmacy or drug coverage topics',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>![topics.pharmacy,topics.drugs].includes(x.text));c.transcript_diarized.push(l('Which pharmacy do you use?',100000),l('Will you have any other prescription drug coverage?',200000));
 assert.equal(item(c,'PECL_006_PHARMACY_NETWORK_CONFIRMED').result,'fail');assert.equal(item(c,'PECL_007_DRUG_COVERAGE_CONFIRMED').result,'fail');
});
test('a topic needs no extra affirmative; missing submission time is REVIEW rather than invented ordering',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>!x.text.includes('submitting your enrollment'));
 assert.equal(item(c,'PECL_005_PROVIDER_NETWORK_CONFIRMED').result,'review');
});
test('generic enrollment assent without a named plan cannot satisfy consent',()=>{
 const c=call();c.plan_name=null;c.transcript_diarized=c.transcript_diarized.filter(x=>!x.text.includes('Humana'));c.transcript_diarized.push(l('Do you want to enroll in this plan?',500000));assert.equal(item(c,'ENROLL_002_VERBAL_CONSENT').result,'fail');
});
test('SOA intake about self versus family is not product-scope agreement',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!==scope);c.transcript_diarized.push(l('Are you interested in discussing Medicare options for yourself?',20000));assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'fail');
});
test('complete TPMO includes the information-on-options clause and handles all-organizations variant explicitly',()=>{
 assert.equal(hasTpmo2027(tpmo),true);assert.equal(hasTpmo2027(tpmo.replace('to get information on all of your options.','')),false);
 assert.equal(hasTpmo2027('Currently we represent two organizations which offer sixteen products. Contact Medicare.gov for help with plan choices.',{tpmo_sells_all:true}),true);
});
test('code alone can AUTO-FAIL a supported late disclosure; no quote means no AUTO-FAIL',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!==tpmo);c.transcript_diarized.push(l(tpmo,100000));assert.equal(item(c,'CALL_OPEN_009_TPMO_TIMING_2027').auto_fail_triggered,true);
 c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!==tpmo);assert.equal(item(c,'CALL_OPEN_009_TPMO_TIMING_2027').auto_fail_triggered,false);
});
for(const seconds of [0,73,899])test(`${seconds}s call makes no request`,async()=>{
 const c={...call(),call_duration_seconds:seconds};let requests=0;await classifyJudgmentOnce({callContext:c,diarized:c.transcript_diarized,callLLM:async()=>{requests++;throw Error('Forbidden')}});assert.equal(requests,0);assert.equal(evaluateRules(c).status,'N/A');
});
for(const outcome of ['customer_hung_up','wrong_number','voicemail_left','hostile_caller','short_call_hangup','test_call'])test(`${outcome}: no request regardless of duration`,async()=>{
 const c={...call(),call_outcome:outcome};let requests=0;await classifyJudgmentOnce({callContext:c,diarized:c.transcript_diarized,callLLM:async()=>{requests++;throw Error('Forbidden')}});assert.equal(requests,0);
});
test('AI compliant/no-finding output adds no points; anchored concerns remain REVIEW and never hard fail',()=>{
 const id='CONDUCT_004_NO_MISLEADING_LANGUAGE',t={id:'t',intent_id:'i',intent_code:id,category:'SALES_CONDUCT',points_possible:100};
 for(const concern of [false,true]){const s=scoreCall({callContext:call(),templateItems:[t],template:{},detections:[{intent_code:id,detected:true,anti_pattern_match:concern,confidence:1,transcript_segment:'A quote',segment_start_ms:1000,hard_cms_violation:true,detection_method:'judgment_review'}]});assert.equal(s.total_points_possible,0);assert.equal(s.auto_fail_triggered,false);assert.equal(s.scorecard_items[0].result,concern?'review':'na');}
});
test('CMS re-evaluation does not inherit an old script-based administrator failure for a deterministic topic',()=>{
 const id='PECL_005_PROVIDER_NETWORK_CONFIRMED',r=aggregateVersion({call:call(),source:{id:'old',template_id:'t',rules_version:'cy2027-script-stages-3'},items:[{id:'old-item',template_item_id:'ti',decided_by:'Admin',result:'fail',points_possible:20,points_earned:0}],templateItems:[{id:'ti',intent_id:'i',category:'PRE_ENROLLMENT_CHECKLIST',points_possible:20}],intents:[{id:'i',intent_code:id}]});assert.equal(r.items[0].result,'pass');assert.equal(r.items[0].points_possible,2);assert.equal(r.scorecard.overall_score,100);
});
test('trigger-size missing tail remains incomplete without any numeric result',()=>{
 const c={...call(),call_duration_seconds:4390,transcript_diarized:[l('Medicare',544579)]};const r=aggregateVersion({call:c,source:{id:'old',template_id:'t'},items:[],templateItems:[{id:'ti',intent_id:'i',category:'OPEN',points_possible:1}],intents:[{id:'i',intent_code:'CALL_OPEN_009_TPMO_TIMING_2027'}]});assert.equal(r.scorecard.scoring_state,'incomplete');assert.equal(r.scorecard.overall_score,null);assert.equal(r.scorecard.auto_fail_triggered,false);
});

test('TPMO tolerates spoken phone numbers and ASR omission of the possessive without dropping the options clause',()=>{
 assert.equal(hasTpmo2027(tpmo.replace('medicare.gov at 1800','one eight hundred Medicare').replace('all of your options','all options')),true);
});
test('new versions use the active CMS template even when the historical template omitted a requirement',()=>{
 const r=aggregateVersion({call:call(),source:{id:'old',template_id:'old-script'},targetTemplateId:'active-cms',items:[],templateItems:[{id:'new-scope',intent_id:'scope',category:'SOA',points_possible:20}],intents:[{id:'scope',intent_code:'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027'}]});
 assert.equal(r.scorecard.template_id,'active-cms');assert.equal(r.scorecard.supersedes_id,'old');assert.equal(r.items[0].result,'pass');assert.equal(r.scorecard.total_points_possible,3);
});

test('contract renewal language is not a current-coverage replacement explanation',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>!x.text.includes('replace your current'));
 c.transcript_diarized.push(l('Enrollment in this plan depends on the plan contract renewal with Medicare.',350000));assert.equal(item(c,'IMPACT_001_CURRENT_PLAN_DISENROLL').result,'fail');
});

test('pharmacy intake plus an actual network explanation qualifies, but a doctor-network answer does not',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!==topics.pharmacy);
 c.transcript_diarized.push(l('Which pharmacy do you use?',100000),l('That one is in network.',102000));assert.equal(item(c,'PECL_006_PHARMACY_NETWORK_CONFIRMED').result,'pass');
 c.transcript_diarized=c.transcript_diarized.filter(x=>x.text!=='That one is in network.');c.transcript_diarized.push(l('Your doctor is in network.',102000));assert.equal(item(c,'PECL_006_PHARMACY_NETWORK_CONFIRMED').result,'fail');
});

test('explicit product selection and direct intent to enroll are affirmative without the word yes',()=>{
 const c=call();c.transcript_diarized=c.transcript_diarized.map(x=>x.start_ms===21200?{...x,text:'Just Medicare Advantage.'}:x.start_ms===501200?{...x,text:'I want to enroll.'}:x);
 assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'pass');assert.equal(item(c,'ENROLL_002_VERBAL_CONSENT').result,'pass');
});
