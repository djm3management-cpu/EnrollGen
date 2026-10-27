import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { complianceItemStatus, isUnscoredCompliance } from '../src/lib/complianceScore.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';

const source=readFileSync(new URL('../src/components/callDetail/ComplianceReviewModal.jsx',import.meta.url),'utf8');
const section=source.slice(source.indexOf('function CategorySection('),source.indexOf('function TranscriptPanel('));
const {code}=transformSync(section,{loader:'jsx',jsxFactory:'element'});
const render=vm.runInNewContext(code+';CategorySection',{
  complianceItemStatus,CATEGORY_LABELS:{CALL_OPENING:'Call Opening'},useState:()=>[true,()=>{}],
  redactSensitiveText:v=>v,element:(type,props,...children)=>({type,props,children}),
});
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];

test('actual review section labels excluded outbound rules N/A and leaves them out of category counts',()=>{
  const tree=render({category:'CALL_OPENING',items:[
    {id:'greeting',question_text:'Inbound greeting',result:'pass'},
    {id:'ptc',question_text:'Outbound permission to contact',result:'na',points_possible:0,notes:'Not applicable, OUTBOUND intent on inbound call'},
    {id:'partial',question_text:'Partial evidence',result:'partial'},
  ],onJumpToEvidence(){}});
  const rows=walk(tree).filter(n=>n.props?.className?.startsWith('compliance-review-flag '));
  assert.deepEqual(rows.map(n=>n.children[0].children[0]),['PASS','N/A','PARTIAL']);
  assert.match(rows[1].props.className,/is-neutral/);assert.doesNotMatch(rows[1].props.className,/is-fail/);
  assert.match(JSON.stringify(tree),/1\/2 passed/);assert.match(JSON.stringify(tree),/1 excluded/);
  assert.match(JSON.stringify(rows[1]),/Not applicable, OUTBOUND intent on inbound call/);
});

test('unscored timing review is distinguished from N/A and real failures',()=>{
  assert.equal(complianceItemStatus({result:'na',notes:'Manual review required: early disclosure wording unclear'}).label,'REVIEW');
  for(const result of ['na','not_applicable','unscored'])assert.equal(complianceItemStatus({result}).label,'N/A');
  assert.equal(complianceItemStatus({result:'fail'}).label,'FAIL');
});

test('a high numeric score never hides the outstanding manual review in the actual score banner',()=>{
  const bannerSource=source.slice(source.indexOf('function ScoreBanner('),source.indexOf('function CategorySection('));
  const transformed=transformSync(bannerSource,{loader:'jsx',jsxFactory:'element'}).code;
  const banner=vm.runInNewContext(transformed+';ScoreBanner',{isUnscoredCompliance,COMPLIANCE_WARNING_THRESHOLD:80,
    element:(type,props,...children)=>({type,props,children})});
  const tree=banner({scorecard:{overall_score:97.44,overall_grade:'A+',pass_fail:'PASS',
    risk_flags:['Manual review required: earlier TPMO wording is uncertain.']}});
  assert.match(JSON.stringify(tree),/REVIEW REQUIRED/);assert.doesNotMatch(JSON.stringify(tree),/AUTO-FAIL/);
});

test('saved inbound direction excludes outbound-only checks despite outbound-sounding script language',async()=>{
  const result=await classifyCall({callContext:{call_direction:'inbound',product_type:'MA'},
    diarized:[{speaker:'agent',text:'I am calling to follow up on your request. You submitted a form and gave us permission to contact you.',start_ms:0,end_ms:10000},
      {speaker:'agent',text:'Thank you.',start_ms:179000,end_ms:180000}],
    callLLM:async()=>({detections:[]})});
  assert.equal(result.detectedDirection,'inbound');
  const ptc=result.detections.find(d=>d.intent_code==='CALL_OPEN_014_OUTBOUND_PTC_VALID');
  assert.equal(ptc.direction_excluded,true);
  const score=scoreCall({detections:result.detections,templateItems:[{id:'ptc',intent_code:ptc.intent_code,points_possible:5,category:'CALL_OPENING'}],template:{}});
  assert.equal(score.total_points_possible,0);assert.equal(score.scorecard_items[0].result,'na');
});
