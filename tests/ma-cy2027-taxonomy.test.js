import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALL_INTENTS, getIntentByCode } from '../src/compliance/intents/index.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';
import { MA_2027_POLICY_VERSION } from '../src/compliance/shared/scoringPolicy.js';
import { MA_CY2027_GUIDANCE } from '../src/data/maCompliance2027.js';
import { INTENT_CLASSIFICATION_SYSTEM } from '../src/compliance/prompts/intent-classification.js';
import { getCmsKnowledgeForQuestion, setDbCmsKnowledgeEntries } from '../src/context/CopilotCmsKnowledge.js';
import { analyzeTranscript } from '../src/context/TranscriptAnalyzer.js';
import { engineBuilders, promptOptions } from './helpers/copilotPrompts.js';

const soa = 'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027';
const sharing = 'RECORD_005_DATA_SHARING_CONSENT';
const timing = 'CALL_OPEN_009_TPMO_TIMING_2027';
const retired = ['SOA_003_SOA_48HR_RULE','SOA_007_WALK_IN_EXCEPTION','SOA_008_LAST_4_DAYS_EXCEPTION',
  'PLAN_026_NO_SUPERLATIVES','PECL_014_MULTI_LANGUAGE_INSERT','CONDUCT_012_CARRIER_NAMES_12PT'];
const item = (code, points = 1) => ({ id:code,intent_id:code,intent_code:code,question_text:getIntentByCode(code)?.description || 'Historical wording',
  category:getIntentByCode(code)?.category || 'fixture',points_possible:points });
const currentTemplate = {policy_version:MA_2027_POLICY_VERSION,passing_threshold:85};
const detection = (code, patch = {}) => ({intent_code:code,detected:true,applicable:true,confidence:0.99,
  speaker:'agent',evidence_text:'Quoted transcript evidence',anti_pattern:false,...patch});
const utterance = (text,start_ms=0,end_ms=1000,speaker='agent') => ({text,start_ms,end_ms,speaker});
async function classified(text, observations = [], direction='inbound') {
  return classifyCall({diarized:[utterance(text),utterance('Thank you.',179000,180000)],
    callContext:{call_direction:direction,product_type:'MA'},
    callLLM:async (system,prompt) => {
      assert.ok(system.includes('Same-call')); assert.ok(prompt.includes('Whole-call context'));
      return {detections:observations};
    }});
}

test('active taxonomy removes retired flags and adds required critical scope-before-plans', () => {
  for(const code of retired) assert.equal(getIntentByCode(code),null,code);
  assert.equal(new Set(ALL_INTENTS.map(i=>i.intent_code)).size,ALL_INTENTS.length);
  const scope=getIntentByCode(soa);
  assert.equal(scope.is_required,true);assert.equal(scope.failure_severity,'critical');
  assert.equal(scope.auto_fail,false);assert.equal(scope.subcategory,null);
  assert.equal(getIntentByCode(timing).auto_fail,true);
  assert.ok(getIntentByCode('CONDUCT_012_CARRIER_NAMES'));
  const claims=getIntentByCode('PLAN_028_NO_UNSUBSTANTIATED_CLAIMS');
  assert.match(claims.description,/Superlatives are allowed/);assert.equal(claims.auto_fail,false);
});

test('same-call SOA is evaluated for inbound and scheduled outbound calls; retired exceptions are absent', async () => {
  for(const direction of ['inbound','outbound']) {
    const result=await classified('Our appointment is today. Before reviewing plans, may we discuss Medicare Advantage? Yes.',[detection(soa)],direction);
    const found=result.detections.find(d=>d.intent_code===soa);
    assert.equal(found.detected,true);assert.notEqual(found.direction_excluded,true);
    const card=scoreCall({detections:result.detections,templateItems:[item(soa)],template:currentTemplate});
    assert.equal(card.overall_score,100);assert.equal(card.scorecard_items[0].result,'pass');
    assert.ok(result.detections.every(d=>!retired.includes(d.intent_code)));
  }
  const late=await classified('This plan includes dental. Now may we discuss Medicare Advantage?',
    [detection(soa,{detected:false,anti_pattern:true,evidence_text:'This plan includes dental. Now may we discuss Medicare Advantage?'})]);
  assert.equal(scoreCall({detections:late.detections,templateItems:[item(soa)],template:currentTemplate}).scorecard_items[0].result,'fail');
});

test('only the new template auto-fails verified TPMO timing, even when weighted score is high', () => {
  const code='CONDUCT_006_PROFESSIONAL_TONE';
  const ds=[{intent_code:code,detected:true,confidence:1,transcript_segment:'Professional conversation'},
    {intent_code:timing,detected:false,confidence:1,detection_method:'tpmo_2027_policy',transcript_segment:'Disclaimer after benefits'}];
  const templateItems=[item(code,100),item(timing)];
  const current=scoreCall({detections:ds,templateItems,template:currentTemplate});
  assert.ok(current.overall_score>98);assert.equal(current.auto_fail_triggered,true);assert.equal(current.pass_fail,'FAIL');
  const historical=scoreCall({detections:ds,templateItems,template:{passing_threshold:85},preserveRuleText:true});
  assert.equal(historical.auto_fail_triggered,false);assert.equal(historical.pass_fail,'PASS');
  assert.equal(historical.scorecard_items[1].question_text,item(timing).question_text);
});

test('no sharing, a live warm transfer and carrier enrollment are unscored rather than consent auto-fails', async () => {
  for(const text of ['We are reviewing your coverage; no data will be shared.',
    'With your permission I will warm transfer you now to another agent on this call.',
    'Your application will be sent to the carrier for this enrollment.']) {
    // Even a false omission from the model cannot deduct without applicability.
    const result=await classified(text,[detection(sharing,{applicable:false,detected:false,anti_pattern:true,hard_cms_violation:true})]);
    const card=scoreCall({detections:result.detections,templateItems:[item(sharing)],template:currentTemplate});
    assert.equal(card.scorecard_items[0].result,'na');assert.equal(card.total_points_possible,0);
    assert.equal(card.auto_fail_triggered,false);
  }
});

test('actual sharing with another TPMO for later contact evaluates written consent; confirmed unauthorized sharing can auto-fail', async () => {
  for(const consent of [true,false]) {
    const text=consent?'Your signed consent names TPMO B; we sent it your data for a later callback.'
      :'I sent your data to TPMO B for its callback tomorrow even though you refused written consent.';
    const result=await classified(text,[detection(sharing,{applicable:true,detected:consent,anti_pattern:!consent,
      hard_cms_violation:!consent,evidence_text:text})]);
    const card=scoreCall({detections:result.detections,templateItems:[item(sharing)],template:currentTemplate});
    assert.equal(card.scorecard_items[0].result,consent?'pass':'fail');
    assert.equal(card.auto_fail_triggered,!consent);
  }
});

test('supported superlatives do not trigger a standalone lexical violation', () => {
  const analysis=analyzeTranscript('This plan has the lowest premium among these three options according to their current Summary of Benefits.');
  assert.equal(analysis.results.no_misleading_claims.detected,true);
  const code='PLAN_028_NO_UNSUBSTANTIATED_CLAIMS';
  const card=scoreCall({detections:[{intent_code:code,detected:true,confidence:0.99,
    transcript_segment:'Best rating among these plans according to current CMS data'}],templateItems:[item(code)],template:currentTemplate});
  assert.equal(card.overall_score,100);assert.equal(card.auto_fail_triggered,false);
});

test('Co-Pilot prompts use the new rules and exclude obsolete retrieved timing guidance', async () => {
  for(const name of ['buildCoachingSystemPrompt','buildAskSystemPrompt']) {
    const prompt=engineBuilders('MA')[name](promptOptions());
    assert.ok(prompt.staticPrefix.includes(MA_CY2027_GUIDANCE));
    assert.doesNotMatch(prompt.staticPrefix,/48[ -]?hours?|60[ -]?seconds?|first minute/i);
  }
  setDbCmsKnowledgeEntries([{title:'TPMO disclaimer',content:'OLD_RULE_SENTINEL: complete within 60 seconds.'},
    {title:'Scope of Appointment',content:'OLD_SOA_SENTINEL: wait 48 hours.'}]);
  try {
    const block=JSON.stringify(getCmsKnowledgeForQuestion('TPMO Disclaimer','Scope of Appointment disclaimer timing',{}));
    assert.ok(!block.includes('OLD_RULE_SENTINEL'));assert.ok(!block.includes('OLD_SOA_SENTINEL'));
  } finally {setDbCmsKnowledgeEntries([]);}
  assert.doesNotMatch(INTENT_CLASSIFICATION_SYSTEM,/48[ -]?hours?|60[ -]?seconds?|first minute/i);
  const script=await readFile(new URL('../src/data/maScript2027.js',import.meta.url),'utf8');
  assert.doesNotMatch(script,/48[ -]?hours?|60[ -]?seconds?|first minute/i);
});
