import test from 'node:test';import assert from 'node:assert/strict';
import {classifyJudgmentOnce} from '../src/compliance/engine/JudgmentPass.js';
test('one mock request sees full sorted transcript and cannot inject deterministic decisions',async()=>{
 let calls=0;
 const result=await classifyJudgmentOnce({callContext:{product_type:'MA',call_direction:'inbound',call_duration_seconds:4500},diarized:[{speaker:'agent',text:'FINAL AT 75 MINUTES',start_ms:4499000,end_ms:4500000},{speaker:'agent',text:'First sentence about Medicare',start_ms:0,end_ms:1000},{speaker:'customer',text:'Yes',start_ms:1100,end_ms:2000},{speaker:'agent',text:'This plan gives you $50',start_ms:100000,end_ms:101000}],passId:'fixture',callLLM:async(system,transcript)=>{
  calls++;assert.ok(transcript.indexOf('First sentence')<transcript.indexOf('FINAL'));assert.match(transcript,/4499000/);assert.match(system,/never final violations/);assert.doesNotMatch(system,/Agent guarantees future annuity returns/);
  return {detections:[{intent_code:'CALL_OPEN_009_TPMO_TIMING_2027',detected:false,anti_pattern:true,hard_cms_violation:true,evidence_text:'invented'},{intent_code:'PLAN_025_BENEFITS_ACCURATE',detected:true,anti_pattern:true,evidence_text:'invented quote',confidence:.99}],sentiment:{},assessment:{a:{r:7,l:7,k:7,n:'Fixture assessment.'},b:{e:7,l:'low',r:[]}}};
 }});
 assert.equal(calls,1);const flag=result.detections.find(d=>d.intent_code==='PLAN_025_BENEFITS_ACCURATE');assert.equal(flag.transcript_segment,null);assert.equal(flag.hard_cms_violation,false);assert.equal(result.detections.filter(d=>d.intent_code==='CALL_OPEN_009_TPMO_TIMING_2027').length,1);
});
