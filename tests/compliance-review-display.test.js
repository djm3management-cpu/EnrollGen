import test from 'node:test';
import assert from 'node:assert/strict';
import { complianceItemStatus, complianceViewModel } from '../src/lib/complianceScore.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';

test('review All filter includes N/A and preserve partial and review states',()=>{
 const items=[{category:'opening',result:'pass'},{category:'opening',result:'na'},{category:'opening',result:'partial'},{category:'opening',result:'review'}];
 assert.equal(complianceViewModel({items,coverage:{complete:true}}).groups.opening.length,4);
 assert.equal(complianceViewModel({items,coverage:{complete:true},filter:'na'}).groups.opening.length,1);
});

test('unscored timing review is distinguished from N/A and real failures',()=>{
  assert.equal(complianceItemStatus({result:'na',notes:'Manual review required: early disclosure wording unclear'}).label,'REVIEW');
  for(const result of ['na','not_applicable','unscored'])assert.equal(complianceItemStatus({result}).label,'N/A');
  assert.equal(complianceItemStatus({result:'fail'}).label,'FAIL');
});

test('incomplete coverage hides numeric scores and high scores retain review warnings',()=>{
 const scorecard={overall_score:97.44,pass_fail:'PASS',risk_flags:['Manual review required: early disclaimer uncertain']};
 const view=complianceViewModel({scorecard,items:[{result:'pass',category:'opening'}],coverage:{complete:true}});assert.equal(view.reviewRequired,true);assert.equal(view.status,'PASS');
 const incomplete=complianceViewModel({scorecard:{...scorecard,auto_fail_triggered:true},coverage:{complete:false}});assert.equal(incomplete.score,null);assert.equal(incomplete.status,'SCORING INCOMPLETE');
});

test('saved inbound direction excludes outbound-only checks despite outbound-sounding script language',async()=>{
  const result=await classifyCall({callContext:{call_direction:'inbound',product_type:'MA'},
    diarized:[{speaker:'agent',text:'I am calling to follow up on your request. You submitted a form and gave us permission to contact you.',start_ms:0,end_ms:10000},
      {speaker:'agent',text:'Thank you.',start_ms:179000,end_ms:180000}],
    callLLM:async()=>({detections:[],assessment:{a:{r:7,l:7,k:7,n:'Fixture assessment.'},b:{e:7,l:'low',r:[]}}})});
  assert.equal(result.detectedDirection,'inbound');
  assert.equal(result.detections.some(d=>d.intent_code==='CALL_OPEN_014_OUTBOUND_PTC_VALID'),false);
  const ptc={intent_code:'CALL_OPEN_014_OUTBOUND_PTC_VALID'};
  const score=scoreCall({detections:result.detections,templateItems:[{id:'ptc',intent_code:ptc.intent_code,points_possible:5,category:'CALL_OPENING'}],template:{}});
  assert.equal(score.total_points_possible,0);assert.equal(score.scorecard_items[0].result,'na');
});
