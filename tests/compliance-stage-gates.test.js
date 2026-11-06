import {scoreCall} from '../src/compliance/engine/ScoringEngine.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {detectCallStages,scoringEligibility,excludedOutcome} from '../src/compliance/rules/callStages.js';
import {SCRIPT_RULE_BASIS,ruleHasScriptBasis} from '../src/compliance/rules/scriptBasis.js';
import {RULE_CATALOG,ACTIVE_RULE_CATALOG} from '../src/compliance/rules/catalog.js';
import {classifyJudgmentOnce} from '../src/compliance/engine/JudgmentPass.js';
import {classifyCall} from '../src/compliance/engine/IntentClassifier.js';
import {estimateJudgment} from '../src/compliance/engine/judgmentRequest.js';
import {aggregateVersion} from '../src/compliance/engine/VersionAggregator.js';
import {generateScorecard} from '../src/compliance/engine/ScorecardGenerator.js';
import {acknowledgmentAfter,beforeSubmission} from '../src/compliance/rules/acknowledgment.js';
import {complianceViewModel} from '../src/lib/complianceScore.js';
const line=(text,start=0,speaker='agent',length=1000)=>({id:`${speaker}-${start}`,text,start_ms:start,end_ms:start+length,speaker});
const base=(extra={})=>({id:'call',tenant_id:'tenant',call_direction:'inbound',product_type:'MA',call_duration_seconds:1200,call_outcome:'interested_needs_info',transcript_diarized:[line('Thank you for calling about Medicare'),line('I would like help',2000,'customer'),line('Thank you',1199000)],...extra});
const result=(call,id)=>evaluateRules(call).items.find(i=>i.rule_id===id);
for(const duration of [0,1,73,899])test(`${duration}s connected call is N/A with zero model calls through both entry points`,async()=>{
 const c=base({call_duration_seconds:duration,transcript_diarized:[line('Medicare',0),line('Yes',Math.max(0,duration*1000-1000),'customer')]});
 for(const classify of [classifyJudgmentOnce,classifyCall]){
  let count=0;await classify({callContext:c,diarized:c.transcript_diarized,callLLM:async()=>{count++;throw Error('must not call')}});assert.equal(count,0);
 }
 const evaluated=evaluateRules(c);assert.equal(evaluated.status,'N/A');assert.ok(evaluated.items.every(i=>i.result==='na'));assert.equal(estimateJudgment(c).estimated_cost_usd,0);
});
test('exactly 15 minutes is eligible, unknown talk time is incomplete',()=>{
 assert.equal(scoringEligibility(base({call_duration_seconds:900,transcript_diarized:[line('Medicare'),line('Yes',2000,'customer'),line('End',899000)]})).status,'eligible');
 assert.equal(scoringEligibility(base({call_duration_seconds:null})).status,'incomplete');
});
for(const outcome of ['customer_hung_up','short_call_hangup','wrong_number','voicemail_left','hostile_caller','test_call','hang-up','short call','no_answer'])test(`${outcome}: excluded even on a long connected call`,()=>{
 assert.equal(excludedOutcome(outcome),true);assert.equal(scoringEligibility(base({call_outcome:outcome})).status,'na');
});
test('short calls stay N/A even when their transcript is incomplete; long enrolled trigger stays incomplete',()=>{
 assert.equal(scoringEligibility(base({call_duration_seconds:600,transcript_diarized:[]})).status,'na');
 assert.equal(scoringEligibility(base({call_outcome:'enrolled',call_duration_seconds:4390,transcript_diarized:[line('Medicare',544000)]})).status,'incomplete');
});
test('a connected non-Medicare chat does not reach opening applicability',()=>{
 const c=base({transcript_diarized:[line('Hello'),line('Hello',2000,'customer'),line('Goodbye',1199000)]});
 assert.equal(scoringEligibility(c).status,'na');assert.equal(result(c,'CALL_OPEN_001_RECORDING_ANNOUNCE').result,'na');
});
test('opening-only conversation does not grade needs, qualifications or plan rules',()=>{
 const c=base();assert.equal(scoringEligibility(c).status,'eligible');
 assert.equal(result(c,'CALL_OPEN_001_RECORDING_ANNOUNCE').result,'fail');
 for(const id of ['NEEDS_014_TRAVEL_FREQUENCY','ELIG_001_PARTS_AB_CONFIRM','PLAN_006_MOOP_STATED'])assert.equal(result(c,id).result,'na');
});
test('needs questions are not plan presentation; an actual plan pitch reaches presentation',()=>{
 const c=base();c.transcript_diarized.splice(2,0,line('Are you looking for giveback or OTC benefits?',5000),line('Which doctors do you see?',10000));
 assert.equal(detectCallStages(c).plan,false);assert.equal(result(c,'PLAN_006_MOOP_STATED').result,'na');assert.equal(result(c,'NEEDS_014_TRAVEL_FREQUENCY').result,'fail');
 c.transcript_diarized.splice(2,0,line('This plan gives you $50 each month.',500000));
 assert.equal(result(c,'PLAN_006_MOOP_STATED').result,'fail');
});
test('travel matches the actual lifestyle script, rather than a travel benefit pitch',()=>{
 const c=base();c.transcript_diarized.splice(2,0,line('Is travel or living elsewhere at times part of your lifestyle?',5000));
 assert.equal(result(c,'NEEDS_014_TRAVEL_FREQUENCY').result,'pass');
});
for(const outcome of ['enrollment_started','enrolled_pending_verification','callback_scheduled','interested_needs_info'])test(`${outcome}: an application start flag never enables enrollment closing rules`,()=>{
 const c=base({call_outcome:outcome,enrollment_completed:true,metadata:{enrollment_started:true}});
 assert.equal(result(c,'ENROLL_002_VERBAL_CONSENT').result,'na');
});
test('Enrolled exact outcome enables consent; start of application does not set submission deadline',()=>{
 const c=base({call_outcome:'Enrolled'});c.transcript_diarized.splice(2,0,line('We will begin the application.',5000),line('Do you consent to enroll in this plan?',10000),line('Yes',11200,'customer'),line('I am submitting your enrollment now.',20000));
 assert.equal(result(c,'ENROLL_002_VERBAL_CONSENT').result,'pass');assert.equal(detectCallStages(c).submission.start_ms,20000);
});
test('AEP/OEP suppress SEP even with stale SEP metadata; a conditional SEP explanation alone does not identify one',()=>{
 for(const period of ['AEP','OEP'])assert.equal(result(base({election_period:period,sep:'moving'}),'ELIG_007_SEP_REASON_DOCUMENTED').result,'na');
 const c=base();c.transcript_diarized.splice(2,0,line('Outside annual enrollment, you would need a special enrollment period.',5000));assert.equal(detectCallStages(c).identifiedSep,false);
 c.election_period='SEP';c.transcript_diarized.splice(2,0,line("It is open enrollment still.",6000));assert.equal(detectCallStages(c).identifiedSep,false);
});
test('confirmed SEP metadata enables only that rule on a reached qualification stage',()=>{
 const c=base({election_period:'SEP'});c.transcript_diarized.splice(2,0,line('A few qualifying questions. Your special enrollment is because you moved.',5000));assert.equal(result(c,'ELIG_007_SEP_REASON_DOCUMENTED').result,'pass');
});
for(const text of ['yes','yeah','yep','correct','right','I do','I understand','okay','uh-huh','mm-hmm'])test(`PECL acknowledgment accepts ${text} within 30 seconds or next customer utterance`,()=>{
 const statement=line('A verified scripted checklist statement.',1000);
 assert.ok(acknowledgmentAfter(statement,[line(text,31000,'customer')],{pecl:true}));
 assert.ok(acknowledgmentAfter(statement,[line(text,90000,'customer')],{pecl:true}));
});
test('PECL refusal blocks a later yes and application questions never satisfy removed checklist rules',()=>{
 const statement=line('Checklist statement',1000);assert.equal(acknowledgmentAfter(statement,[line('No',5000,'customer'),line('Yes',10000,'customer')],{pecl:true}),null);
 const c=base({call_outcome:'enrolled'});c.transcript_diarized.splice(2,0,line('Which pharmacy do you use?',5000),line('Yes',6200,'customer'),line('Will you have any other prescription drug coverage?',8000),line('Yes',9200,'customer'));
 for(const rule of RULE_CATALOG.filter(r=>r.id.startsWith('PECL_')))assert.equal(result(c,rule.id).result,'na');
});
test('PECL during application passes order before submission; an unknown submission time is reviewable',()=>{
 const checklist={...line('Checklist',10000),end_ms:20000};assert.equal(beforeSubmission(checklist,line('Submitted',30000)),true);assert.equal(beforeSubmission(checklist,line('Submitted',15000)),false);assert.equal(beforeSubmission(checklist,null),null);
});
test('removed rules and inapplicable historical admin findings cannot return to denominator',()=>{
 const c=base(),templateItems=[{id:'t',intent_id:'i',points_possible:5,category:'PLAN_PRESENTATION'}],intents=[{id:'i',intent_code:'PLAN_006_MOOP_STATED'}],items=[{id:'old',template_item_id:'t',decided_by:'Admin',result:'fail',points_possible:5,points_earned:0}];
 const v=aggregateVersion({call:c,source:{id:'card',template_id:'template'},templateItems,intents,items});assert.equal(v.items[0].result,'na');assert.equal(v.items[0].points_possible,0);
 for(const id of ['PLAN_009_REFERRAL_REQUIREMENTS','IMPACT_008_COVERAGE_GAP_WARNING'])assert.equal(result(base(),id).result,'na');
});
test('N/A scorecard has no percentage or counted items, and is not displayed as a broken scorecard',()=>{
 const c=base({call_duration_seconds:600}),templateItems=[{id:'t',intent_id:'i',points_possible:5,category:'CALL_OPENING'}];const v=aggregateVersion({call:c,source:{id:'card',template_id:'template'},templateItems,intents:[{id:'i',intent_code:'CALL_OPEN_001_RECORDING_ANNOUNCE'}],items:[]});
 assert.equal(v.scorecard.scoring_state,'na');assert.equal(v.scorecard.overall_score,null);assert.equal(v.scorecard.total_points_possible,0);assert.ok(v.items.every(i=>i.result==='na'&&i.points_earned===0&&i.points_possible===0));
 const view=complianceViewModel({scorecard:v.scorecard,items:[],coverage:{complete:false}});assert.equal(view.status,'N/A');assert.equal(view.incomplete,false);assert.equal(view.score,null);
});
test('automatic generator records N/A before template, job or paid-pass access',async()=>{
 const writes=[];const db={rpc:async(name,args)=>{writes.push({name,args});return {data:'na-header',error:null}},from(){throw Error('No template, usage or scoring access allowed')}};
 const r=await generateScorecard({supabase:db,callRecord:base({call_duration_seconds:100}),callLLM:async()=>{throw Error('Forbidden')}});
 assert.equal(r.notApplicable,true);assert.deepEqual(writes.map(x=>x.name),['mark_compliance_not_applicable']);
});
test('every active rule has an explicit existing source line and never leaks across product scripts',()=>{
 assert.equal(ACTIVE_RULE_CATALOG.length,87);
 for(const rule of ACTIVE_RULE_CATALOG){assert.ok(SCRIPT_RULE_BASIS[rule.id]);for(const source of rule.scriptBasis.sources){if(source.kind==='cms'){assert.match(source.url,/^https:\/\/www\.ecfr\.gov\//);assert.ok(source.reference&&source.summary);continue;}const text=readFileSync(source.file,'utf8').split('\n')[source.line-1];assert.ok(text?.trim(),`${rule.id} ${source.file}:${source.line}`);assert.ok(!/^\s*[\]}),]+\s*$/.test(text),`${rule.id} cannot cite only a closing bracket`);}}
 assert.equal(ruleHasScriptBasis('NEEDS_002_HEALTH_HISTORY_ASKED','MA'),false);assert.equal(ruleHasScriptBasis('NEEDS_002_HEALTH_HISTORY_ASKED','Med Sup'),true);assert.equal(ruleHasScriptBasis('CALL_OPEN_010_TPMO_ORG_COUNT','ACA'),false);
});

test('CMS recording integrity is metadata-only; transcript endpoint cannot prove a complete recording',()=>{
 const c=base();assert.equal(result(c,'RECORD_001_FULL_CALL_RECORDED').result,'review');
 const t={id:'recording',intent_code:'RECORD_001_FULL_CALL_RECORDED',points_possible:5,category:'CALL_RECORDING_COMPLIANCE'};
 const scored=scoreCall({callContext:c,templateItems:[t],template:{},detections:[{intent_code:t.intent_code,detected:false,confidence:1,detection_method:'deterministic_review'}]});
 assert.equal(scored.scorecard_items[0].result,'review');assert.equal(scored.scorecard_items[0].decided_by,'Code');assert.equal(scored.total_points_possible,0);
 c.metadata={full_call_recorded:true};assert.equal(result(c,t.intent_code).result,'pass');
});
test('inter-TPMO sharing requires an identified sharing event and verified written consent metadata',()=>{
 const c=base();assert.equal(result(c,'RECORD_005_DATA_SHARING_CONSENT').result,'na');
 c.metadata={tpmo_sharing:true};assert.equal(result(c,'RECORD_005_DATA_SHARING_CONSENT').result,'review');
 c.metadata.tpmo_sharing_written_consent=false;assert.equal(result(c,'RECORD_005_DATA_SHARING_CONSENT').result,'fail');assert.equal(result(c,'RECORD_005_DATA_SHARING_CONSENT').auto_fail_triggered,false);
});
test('CMS comparison restriction stays active for real comparisons outside the PDP-specific branch',()=>{
 const c=base();c.transcript_diarized.splice(2,0,line('This plan gives you $50',5000));assert.equal(result(c,'PLAN_027_NO_MISLEADING_COMPARISONS').result,'na');
 c.transcript_diarized.splice(2,0,line('Compared to your current plan, the premium is lower.',10000));assert.equal(result(c,'PLAN_027_NO_MISLEADING_COMPARISONS').result,'review');
});

test('unknown legacy/custom template intents fail closed outside the allowlist',()=>{
 const t={id:'custom',intent_id:'intent',intent_code:'CUSTOM_UNMAPPED',category:'TEST',points_possible:50};
 const scored=scoreCall({templateItems:[t],template:{},detections:[{intent_code:t.intent_code,detected:true,confidence:1}]});assert.equal(scored.total_points_possible,0);assert.equal(scored.scorecard_items[0].result,'na');
 const prior={id:'old',template_item_id:t.id,decided_by:'Admin',result:'pass',points_earned:50,points_possible:50};
 const v=aggregateVersion({call:base(),source:{id:'old-card',template_id:'template'},templateItems:[t],items:[prior],intents:[{id:t.intent_id,intent_code:t.intent_code}]});assert.equal(v.items[0].result,'na');assert.equal(v.items[0].points_earned,0);
});
