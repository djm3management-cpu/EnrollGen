import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {transcriptCoverage} from '../src/compliance/rules/transcript.js';
import {applyEventDeductions} from '../src/compliance/rules/eventDeductions.js';
import {complianceItemStatus} from '../src/lib/complianceScore.js';
const l=(text,start_ms=0,speaker='agent',duration=1000)=>({id:`${speaker}-${start_ms}`,text,start_ms,end_ms:start_ms+duration,speaker});
const tpmo='We do not offer every plan. We represent two organizations which offer sixteen products. Contact Medicare.gov for information on all of your options.';
const call=(extra=[],metadata={})=>({id:'test',tenant_id:'tenant',product_type:'MA',call_direction:'inbound',call_outcome:'enrolled',call_duration_seconds:1200,metadata,transcript_diarized:[l('Medicare call',0),l('Hello',0,'customer'),l(tpmo,10000),l('This plan gives you $20',300000),l('We will start the enrollment.',400000),...extra,l('I submitted your application.',900000),l('Goodbye',1199000),l('Goodbye',1199000,'customer')]});
const item=(c,id)=>evaluateRules(c).items.find(i=>i.rule_id===id);
const row=(id,points,result='fail',extra={})=>({rule_id:id,points_possible:points,points_earned:result==='pass'?points:0,result,...extra});
test('one missing SOA event costs only the largest original weight and persists covered text',()=>{
 const rows=[row('SOA_001_SOA_REFERENCE',3),row('SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027',3),row('SOA_004_SOA_SCOPE_STATED',2)];applyEventDeductions(rows);assert.equal(rows.reduce((s,r)=>s+r.points_possible-r.points_earned,0),3);assert.equal(rows[1].result,'fail');assert.equal(rows[0].points_possible,0);assert.equal(complianceItemStatus(rows[0]).label,'Covered by SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027');
});
test('complete-but-late TPMO only costs timing, while missing resource only costs the component',()=>{
 let rows=[row('CALL_OPEN_008_TPMO_DISCLAIMER_2027',3),row('CALL_OPEN_009_TPMO_TIMING_2027',3,'fail',{missing:'Required event occurred after deadline'})];applyEventDeductions(rows);assert.equal(rows[0].points_possible,0);assert.equal(rows[1].points_possible,3);
 rows=[row('CALL_OPEN_008_TPMO_DISCLAIMER_2027',3),row('CALL_OPEN_009_TPMO_TIMING_2027',3),row('CALL_OPEN_010_TPMO_ORG_COUNT',2,'pass'),row('CALL_OPEN_013_TPMO_RESOURCE_2027',2)];applyEventDeductions(rows);assert.equal(rows.filter(r=>r.result==='fail').length,1);assert.equal(rows[3].points_possible,2);
});
test('same quoted AI event deduplicates confirmed deductions; distinct violations remain distinct',()=>{
 const same=[row('CONDUCT_004_NO_MISLEADING_LANGUAGE',3,'fail',{evidence_text:'quote',evidence_timestamp_ms:100}),row('PLAN_027_NO_MISLEADING_COMPARISONS',3,'fail',{evidence_text:'quote',evidence_timestamp_ms:100})];applyEventDeductions(same);assert.equal(same.filter(r=>r.result==='fail').length,1);
 const separate=[row('CONDUCT_004_NO_MISLEADING_LANGUAGE',3,'fail',{evidence_text:'one',evidence_timestamp_ms:100}),row('PLAN_027_NO_MISLEADING_COMPARISONS',3,'fail',{evidence_text:'two',evidence_timestamp_ms:200})];applyEventDeductions(separate);assert.equal(separate.filter(r=>r.result==='fail').length,2);
});
for(const text of ['Are you interested in discussing Medicare options for yourself?','You are interested in discussing these options for yourself, correct?'])test(`POA never supplies SOA: ${text}`,()=>{
 const c=call([l('We have Medicare Advantage and prescription drug plans.',50000),l(text,60000),l('Yes',61500,'customer')]);assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'fail');
});
for(const reply of ['Uh-huh','mm-hmm','yep','okay','sure'])test(`Section 3 product agreement accepts ${reply}, including 1.5s overlap`,()=>{
 const c=call([l('We have Medicare Advantage and prescription drug plans. Would you like to discuss all of these options or certain ones?',100000,'agent',5000),l(reply,103500,'customer',1200)]);assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'pass');
});
test('list and overview can span different lines; refusal does not become agreement',()=>{
 const c=call([l('We have Medicare Advantage and stand-alone prescription drug plans.',100000),l('I can give you a brief overview of each of these plans, then you can decide which plan might be best for you based on your needs. Would that be okay?',120000),l('No, do not discuss them.',121500,'customer')]);assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'fail');
});
for(const text of ['Talking to me does not obligate you to enroll.','Talking to me does not obligate you to do so.'])test(`voluntary anywhere: ${text}`,()=>assert.equal(item(call([l(text,50000)]),'IMPACT_009_VOLUNTARY_DISENROLLMENT').result,'pass'));
for(const text of ['You would be good to go January 1.','It starts January 1.','Your coverage would begin January 1.'])test(`effective date: ${text}`,()=>assert.equal(item(call([l(text,70000)]),'ELIG_008_EFFECTIVE_DATE_STATED').result,'pass'));
for(const text of ["Which plan you're with for 2026?",'Who are you with now?','What plan do you have?'])test(`current coverage with reply: ${text}`,()=>{
 assert.equal(item(call([l(text,80000),l('Humana',81500,'customer')]),'NEEDS_011_CURRENT_COVERAGE_TYPE').result,'pass');assert.equal(item(call([l(text,80000)]),'NEEDS_011_CURRENT_COVERAGE_TYPE').result,'fail');
});
for(const text of ['If you did take any meds, your tier one and two is $0.','Your drug deductible is $300.'])test(`drug price wording: ${text}`,()=>assert.equal(item(call([l(text,500000)]),'PLAN_010_DRUG_COVERAGE_OVERVIEW').result,'pass'));
test('plan type and network explanation may be separated by many minutes',()=>{
 assert.equal(item(call([l('Humana Value Choice PPO is the plan.',350000),l('Out of network visits cost more.',700000)]),'PLAN_003_PLAN_TYPE_EXPLAINED').result,'pass');
});
test('conditional warnings fail closed, not on a product list or negative statement',()=>{
 const c=call([l('We offer Medicare Supplement and Medicare Advantage plans.',100000),l('I do not have a Medicare Supplement.',101500,'customer')]);assert.equal(item(c,'IMPACT_003_MEDSUP_LOSS_WARNING').result,'na');assert.equal(item(c,'IMPACT_008_COVERAGE_GAP_WARNING').result,'na');
 assert.equal(item(call([],{prior_coverage_type:'Medigap'}),'IMPACT_003_MEDSUP_LOSS_WARNING').result,'fail');
 assert.equal(item(call([],{current_coverage_end_date:'2026-12-30',new_effective_date:'2027-01-01'}),'IMPACT_008_COVERAGE_GAP_WARNING').result,'fail');
 assert.equal(item(call([],{current_coverage_end_date:'2026-12-31',new_effective_date:'2027-01-01'}),'IMPACT_008_COVERAGE_GAP_WARNING').result,'na');
});
test('employer check requires enrollment, while known MA switch accepts new-plan benefits wording',()=>{
 assert.equal(item({...call([]),call_outcome:'callback_scheduled'},'IMPACT_004_EMPLOYER_COVERAGE_CHECK').result,'na');
 const c=call([l('When your UHC coverage begins, get all of your medical and prescription drug benefits from UnitedHealthcare.',600000)],{prior_coverage_type:'MA'});assert.equal(item(c,'IMPACT_002_OG_MEDICARE_IMPACT').result,'pass');
});
test('per-channel coverage: missing first 105 minutes, missing customer tail, and agent-start 120s boundary',()=>{
 const c=call([]);assert.equal(transcriptCoverage(c).complete,true);
 const missing={...c,transcript_diarized:c.transcript_diarized.filter(l=>l.speaker!=='agent'||l.start_ms>6300000)};assert.equal(transcriptCoverage(missing).complete,false);
 const tail={...c,transcript_diarized:c.transcript_diarized.filter(l=>l.speaker!=='customer'||l.start_ms<600000)};assert.equal(transcriptCoverage(tail).complete,false);
 const long={...c,call_duration_seconds:4000,transcript_diarized:[l('first',120000),l('last',3999000),l('start',0,'customer'),l('end',3999000,'customer')]};assert.equal(transcriptCoverage(long).complete,true);long.transcript_diarized[0].start_ms=120001;assert.equal(transcriptCoverage(long).complete,false);
});
test('13281a25 real Section 3 follows POA and ends with the actual product agreement, not the self question',()=>{
 const c=call([l('Are you interested in discussing Medicare options for yourself?',240000),l('Yes.',241500,'customer'),l('Yeah. So, would you like to discuss, of course, the the Medicare Advantage Plan',268582,'agent',4520),l('plans that potentially could,',273102,'agent',1830),l('have made... That may include that part b giveback',274932,'agent',3980),l("or a OTC benefit or food card. Is that what you're, interested in discussing?",278912,'agent',4140),l('Yes. Brilliant.',282561,'customer',2300)]);
 const result=item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027');assert.equal(result.result,'pass');assert.equal(result.evidence_timestamp_ms,268582);assert.match(result.evidence_text,/interested in discussing/);
});
test('75e3b687 actual overview exchange passes independently of its earlier self/POA answers',()=>{
 const c=call([l('are you interested in discussing Medicare options for yourself?',251281,'agent',4040),l('Yes.',253770,'customer',4020),l('And, do you make your own health care decisions?',255321,'agent',4900),l('Yes.',260810,'customer',2160),l('So I can give you a brief overview of, some Medicare Advantage plans that could potentially',270301,'agent',5650),l('have those,',275951,'agent',2950),l('OTC allowance or, get back. Is that... Would that be okay?',278901,'agent',3780),l('Yes.',282020,'customer',3980)]);
 const result=item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027');assert.equal(result.result,'pass');assert.equal(result.evidence_timestamp_ms,270301);
});
test('a missing agent opening cannot reach a provider or produce a numeric version',async()=>{
 const {classifyJudgmentOnce}=await import('../src/compliance/engine/JudgmentPass.js');
 const {aggregateVersion}=await import('../src/compliance/engine/VersionAggregator.js');
 const c={...call([]),call_duration_seconds:7200,transcript_diarized:[l('Medicare question',6308747),l('Goodbye',7199000),l('Hello',0,'customer'),l('Goodbye',7199000,'customer')]};
 let requests=0;await classifyJudgmentOnce({callContext:c,diarized:c.transcript_diarized,callLLM:async()=>{requests++;throw Error('Forbidden provider request');}});assert.equal(requests,0);
 const v=aggregateVersion({call:c,source:{id:'old',template_id:'template'},items:[],templateItems:[{id:'t',intent_id:'i',intent_code:'CALL_OPEN_009_TPMO_TIMING_2027',category:'CALL_OPENING'}],intents:[]});assert.equal(v.scorecard.scoring_state,'incomplete');assert.equal(v.scorecard.overall_score,null);assert.equal(v.scorecard.auto_fail_triggered,false);
});
