import {enableFixtureScoring} from './helpers/complianceFixture.js';
enableFixtureScoring();
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPostCallEnded} from '../netlify/lib/postCallGuard.js';
import {retryPostCall} from '../netlify/lib/postCallRetry.js';
import {createSuggestionDedupe} from '../src/lib/copilotDedupe.js';
const sid='CA'+'a'.repeat(32);
function dbFor(session={id:'s',tenant_id:'t',twilio_call_sid:sid}) {
 return {from(table){return {select(){return this;},eq(){return this;},async single(){return {data:table==='sessions'?session:null};},async insert(){return {data:null};}};}};
}
test('fresh provider check rejects active parent, child leg, and verification outage',async()=>{
 const db=dbFor(),options=status=>({env:{TELEPHONY_BASE_URL:'https://telephony.test'},send:async()=>Response.json({sid,status})});
 await assert.rejects(verifyPostCallEnded(db,{session_id:'s'},options('in-progress')),e=>e.status===409);
 await assert.rejects(verifyPostCallEnded(db,{session_id:'s'},{...options('completed'),send:async()=>Response.json({sid,status:'completed',parent_call_sid:'parent'})}),e=>e.status===409);
 await assert.rejects(verifyPostCallEnded(db,{session_id:'s'},{...options('completed'),send:async()=>new Response(null,{status:503})}),e=>e.status===503);
 await verifyPostCallEnded(db,{session_id:'s',twilio_call_sid:'forged'},options('completed'));
});
test('retry uses four total attempts with exponential delays and preserves successful response',async()=>{
 const delays=[];let attempts=0;
 const response=await retryPostCall(async()=>new Response('{}',{status:++attempts<4?503:200}),{wait:async n=>delays.push(n)});
 assert.equal(response.status,200);assert.equal(attempts,4);assert.deepEqual(delays,[1000,2000,4000]);
 for(const status of [429,500,502,503,504]){let n=0;await retryPostCall(async()=>{n++;return new Response('{}',{status});},{wait:async()=>{}});assert.equal(n,4);}
 let n=0;await retryPostCall(async()=>{n++;return new Response('{}',{status:409});});assert.equal(n,1);
});
test('suggestion dedupe blocks paraphrased inhaler cards, allows other topics and meaningful new data',()=>{
 let now=0;const d=createSuggestionDedupe({now:()=>now});
 const text='Confirm inhaler name strength frequency form and pharmacy then verify Sunfire carrier formulary';
 assert.equal(d.accept(text,{transcript:'I use an inhaler'}),true);
 assert.equal(d.accept('Ask for nebulizer name dose frequency and pharmacy; verify carrier formulary',{transcript:'I use an inhaler'}),false);
 assert.equal(d.accept('Confirm their primary doctor is in network',{transcript:'I use an inhaler'}),true);
 assert.equal(d.accept('Verify Advair 250 strength and frequency in the formulary',{transcript:'I use an inhaler Advair 250'}),true);
 now+=180001;assert.equal(d.accept('Check nebulizer solution coverage',{transcript:'I use an inhaler Advair 250'}),true);
 d.clear();assert.equal(d.accept(text),true);
});

test('scoring checks parent status before invoking any model or writing a result',async()=>{
 const {createScoreCallHandler}=await import('../netlify/functions/score-call-background.js');
 const previous=process.env.SCORE_CALL_JOB_SECRET;process.env.SCORE_CALL_JOB_SECRET='fixture';
 let modelCalls=0,verified=0;
 const db={from(){return {select(){return this;},eq(){return this;},async single(){return {data:{id:'call',session_id:'session',tenant_id:'tenant',call_outcome:'enrolled',twilio_call_sid:sid}};}};}};
 try {
  const handler=createScoreCallHandler({getDb:()=>db,classify:async()=>{modelCalls++;},verifyEnded:async()=>{verified++;throw Object.assign(new Error('Call is active'),{status:409});}});
  const response=await handler(new Request('https://app.test/score',{method:'POST',headers:{'x-enrollgen-job-secret':'fixture'},body:JSON.stringify({callId:'call',tenantId:'tenant'})}));
  assert.equal(response.status,202);assert.equal((await response.json()).reason,'parent_call_active');assert.equal(verified,1);assert.equal(modelCalls,0);
 }finally{if(previous===undefined)delete process.env.SCORE_CALL_JOB_SECRET;else process.env.SCORE_CALL_JOB_SECRET=previous;}
});
