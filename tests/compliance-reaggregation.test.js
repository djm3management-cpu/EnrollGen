import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreCall} from '../src/compliance/engine/ScoringEngine.js';
import {aggregateSavedDetections, detectionsFromSavedItems} from '../src/compliance/engine/SavedResultAggregator.js';
import {classifyCall} from '../src/compliance/engine/IntentClassifier.js';
import {currentScoredCards} from '../netlify/functions/compliance.js';
import {INTENT_CLASSIFICATION_SYSTEM} from '../src/compliance/prompts/intent-classification.js';
const code='SOA_001_SOA_REFERENCE';
const item=(intent_code=code,points_possible=10)=>({id:intent_code,intent_code,question_text:'Original saved wording',category:'fixture',points_possible,is_auto_fail:true});
const score=(detections,items=[item()])=>scoreCall({detections,templateItems:items,template:{passing_threshold:85},preserveRuleText:true});
const detection=(patch={})=>({intent_code:code,detected:true,confidence:0.95,transcript_segment:'Authorized discussion',...patch});

test('missing and unevaluated rules never become failures or change denominator',()=>{
 const result=score([detection()],[item(),item('unscored'),item('absent')]);
 assert.equal(result.overall_score,100);assert.equal(result.total_points_possible,10);
 assert.deepEqual(result.scorecard_items.map(i=>i.result),['pass','na','na']);assert.equal(result.auto_fail_triggered,false);
 assert.equal(score([]).overall_grade,'N/A');assert.equal(score([]).corrective_actions_needed,false);
});
test('late positive evidence replaces high-confidence segment absence; absent prerequisites do not deduct',()=>{
 const merged=aggregateSavedDetections({detections:[detection({detected:false,confidence:0.99,detection_method:'intent_classifier',sequence_violation:true,sequence_violation_detail:'detected but prerequisite other was not found'})],segments:[
  {segment_index:0,result:{detections:[{intent_code:code,detected:false,confidence:0.99,anti_pattern:true,evidence_text:'No statement appears in the segment.'}]}},
  {segment_index:2,result:{detections:[{intent_code:code,detected:true,confidence:0.91,evidence_text:'Authorized discussion',anti_pattern:false}]}}
 ]});
 assert.equal(merged[0].detected,true);assert.equal(merged[0].confidence,0.91);assert.equal(merged[0].anti_pattern_match,false);
 assert.equal(score(merged).overall_score,100);
 assert.equal(score([detection({sequence_violation:true,sequence_violation_detail:'detected but prerequisite other was not found'})]).overall_score,100);
});
test('old template auto-fail flags cannot auto-fail a soft or unconfirmed violation',()=>{
 for(const intent_code of ['CONDUCT_006_PROFESSIONAL_TONE','CONDUCT_004_NO_MISLEADING_LANGUAGE']){
  const result=score([detection(),detection({intent_code,anti_pattern_match:true})],[item(),item(intent_code,2)]);
  assert.equal(result.auto_fail_triggered,false);assert.equal(result.overall_score,83.33);
 }
 const intent_code='CONDUCT_004_NO_MISLEADING_LANGUAGE';
 const hard=score([detection(),detection({intent_code,anti_pattern_match:true,detection_method:'cms_hard_violation'})],[item(),item(intent_code,2)]);
 assert.equal(hard.auto_fail_triggered,true);assert.equal(hard.overall_grade,'F');
 assert.equal(score([detection({intent_code,anti_pattern_match:true,detection_method:'cms_hard_violation',confidence:0.8})],[item(intent_code)]).auto_fail_triggered,false);
});
test('re-aggregation retains historical rule meaning, labels and observed misconduct',()=>{
 const intent_code='CONDUCT_001_NO_CROSS_SELLING';
 const original=detection({intent_code,anti_pattern_match:true,llm_reasoning:'Original rule interpretation',detection_method:'intent_classifier'});
 const merged=aggregateSavedDetections({detections:[original]});
 assert.deepEqual(merged,[original]);
 const result=score(merged,[item(intent_code)]);
 assert.equal(result.scorecard_items[0].question_text,'Original saved wording');
 assert.equal(result.scorecard_items[0].result,'fail');assert.equal(result.auto_fail_triggered,false);
});
test('saved scorecard items are a fallback without inventing failures for zero-confidence items',()=>{
 const template=[{...item(),compliance_intents:{intent_code:code}}];
 const detections=detectionsFromSavedItems([{template_item_id:code,result:'pass',confidence:0.95,evidence_text:'Saved evidence'},
  {template_item_id:code,result:'fail',confidence:0,notes:'Intent not detected'}],template);
 assert.equal(score(detections).overall_score,100);
});
test('aggregates select current revision and exclude N/A zeros',()=>{
 const cards=[{id:'old',call_id:'one',overall_score:0,call_records:{compliance_scorecard_id:'new'}},
  {id:'new',call_id:'one',overall_score:90,overall_grade:'A',call_records:{compliance_scorecard_id:'new'}},
  {id:'na',call_id:'two',overall_score:0,overall_grade:'N/A',call_records:{compliance_scorecard_id:'na'}}];
 assert.deepEqual(currentScoredCards(cards).map(c=>c.id),['new']);
});
test('new-call rules respect inbound verbal SOA and no scheduled outbound evidence; mock only',async()=>{
 const soaDet={intent_code:code,detected:true,confidence:0.95,anti_pattern:false,evidence_text:'May we discuss Medicare Advantage? Yes.'};
 const diarized=[{speaker:'agent',text:'Thank you for calling. May we discuss Medicare Advantage?',start_ms:0,end_ms:5000},
  {speaker:'customer',text:'Yes.',start_ms:5000,end_ms:6000},{speaker:'agent',text:'Thank you.',start_ms:179000,end_ms:180000}];
 const r=await classifyCall({diarized,callContext:{call_direction:'inbound'},callLLM:async(system,user)=>{
  assert.ok(system.includes('brief post-enrollment mention'));assert.ok(user.includes('Call direction: inbound'));
  return {detections:[soaDet]};
 }});
 assert.ok(!r.detections.some(d=>d.intent_code==='SOA_003_SOA_48HR_RULE'));
 assert.equal(r.detections.find(d=>d.intent_code===code).detected,true);
 for(const phrase of ['lookup','speech-to-text','hard_cms_violation'])assert.ok(INTENT_CLASSIFICATION_SYSTEM.includes(phrase));
});
