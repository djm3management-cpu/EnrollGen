import test from 'node:test';import assert from 'node:assert/strict';import {complete} from '../src/lib/llm/client.ts';
const request={engine:'MA',path:'scoring',system:'Static judgment rules',messages:[{role:'user',content:'A sufficiently long full-call transcript. '.repeat(20)}]};
const runtime=(overrides={})=>({env:{SCORING_ENABLED:'true'},authorizeScoringRequest:async()=>{},telemetry:async()=>{},adapters:{openai:{complete:async()=>{throw Error('Unexpected provider request')},stream:async function*(){}},anthropic:{complete:async()=>{throw Error('Unexpected fallback')},stream:async function*(){}}},...overrides});
test('kill switch and missing ledger authorization prevent any provider invocation',async()=>{
 await assert.rejects(complete(request,runtime({env:{SCORING_ENABLED:'false'}})),/disabled/);
 await assert.rejects(complete(request,runtime({authorizeScoringRequest:undefined})),/ledger/);
});
test('global token cap fails before provider; scoring retries and Terra are disabled',async()=>{
 let providers=0,authorizations=0;
 await assert.rejects(complete(request,runtime({authorizeScoringRequest:async()=>{throw Error('daily_scoring_token_cap')}})),/daily_scoring_token_cap/);
 const r=runtime();r.authorizeScoringRequest=async()=>{authorizations++};r.adapters.openai.complete=async()=>{providers++;throw Object.assign(Error('transient'),{status:429});};
 await assert.rejects(complete(request,r),/transient/);assert.equal(providers,1);assert.equal(authorizations,1);
});
test('near-empty scoring payload is refused before reservation',async()=>{let count=0;await assert.rejects(complete({...request,messages:[{role:'user',content:'x'}]},runtime({authorizeScoringRequest:async()=>count++})),/too small/);assert.equal(count,0);});
