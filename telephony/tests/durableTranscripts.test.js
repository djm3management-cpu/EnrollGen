import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptWriter, runTranscriptDispatch } from '../src/transcripts.js';
test('finals save without browser delivery, retry stable segment ID and redact PHI',async()=>{
 const calls=[];let tries=0;
 const writer=createTranscriptWriter({db:{rpc:async(name,args)=>{calls.push({name,args});return {error:++tries===1 ? Error('offline'):null};}},claims:{attemptId:'attempt'},retryMs:1});
 writer({type:'transcript',isFinal:false,text:'interim'});
 await writer({type:'transcript',isFinal:true,speaker:'customer',text:'SSN 123-45-6789',timestamp:Date.now(),startMs:5,endMs:10});
 assert.equal(calls.length,2);assert.equal(calls[0].args.p_segment_id,calls[1].args.p_segment_id);
 assert.equal(calls[0].args.p_attempt_id,'attempt');assert.match(calls[0].args.p_text,/SSN_REDACTED/);
});
test('scoring dispatch without wrap-up reconciles first and retains 202 jobs until actual scoring confirmation',async()=>{
 const sequence=[];let patch;
 const chain={select:()=>chain,lte:()=>chain,limit:async()=>({data:[{call_id:'call',tenant_id:'tenant',revision:1,delivered_revision:0}]}),
 update:value=>{patch=value;return chain;},eq:()=>chain,then:resolve=>resolve({error:null})};
 await runTranscriptDispatch({db:{rpc:async()=>{sequence.push('reconcile');return {};},from:()=>chain},scoringUrl:'https://example.test/score',secret:'secret',
 transport:async(url,req)=>{sequence.push('score');assert.deepEqual(JSON.parse(req.body),{callId:'call',tenantId:'tenant'});return {ok:true,status:202};}});
 assert.deepEqual(sequence,['reconcile','score']);assert.equal(patch.delivered_revision,undefined);assert.equal(patch.last_error,null);
});
