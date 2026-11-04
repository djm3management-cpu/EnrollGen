import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidenceOutbox,residenceEnvelope} from '../src/lib/paragonResidence.js';
const call={params:{paragon:'true',inboundCallId:'owned-call',twilioCallSid:'CA'+'1'.repeat(32)}};
test('only an explicitly agent-entered, call-bound lookup creates an envelope; vendor prefill is not residence',()=>{
 assert.equal(residenceEnvelope(call,{zip:'07001',state:'NJ'}),null);
 assert.equal(residenceEnvelope(null,{zip:'07001',state:'NJ',entry:'agent_typed'}),null);
 assert.equal(residenceEnvelope({params:{...call.params,paragon:'false'}},{zip:'07001',entry:'agent_typed'}),null);
 const first=residenceEnvelope(call,{zip:'07001',state:'NJ',entry:'agent_typed'});assert.equal(first.call_sid,call.params.twilioCallSid);
});
test('independent outbox persists transient failures across reloads with backoff and deduplicates per call',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let now=0,attempts=0;
 const payload=residenceEnvelope(call,{zip:'07001',state:'NJ',entry:'agent_typed'}),send=async()=>{attempts++;return new Response('{}',{status:attempts<3?503:202});};
 const options={storage,getToken:async()=>'',scope:'user:org',now:()=>now,send};let box=createResidenceOutbox(options);
 box.enqueue(payload);box.enqueue(payload);await box.flush();assert.equal(attempts,1);await box.flush();assert.equal(attempts,1);
 now=1001;box=createResidenceOutbox(options);await box.flush();assert.equal(attempts,2);
 now=3002;await box.flush();assert.equal(attempts,3);assert.equal(JSON.parse([...values.values()][0]).length,0);
});
test('another user/org never flushes a previous identity outbox and stale-call responses stop retries',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let sent=0;
 const first=createResidenceOutbox({storage,getToken:async()=>'',scope:'one:org',send:async()=>{sent++;return new Response('{}',{status:409});}});
 first.enqueue(residenceEnvelope(call,{zip:'07001',state:'NJ',entry:'agent_typed'}));
 const second=createResidenceOutbox({storage,getToken:async()=>'',scope:'two:org',send:async()=>{sent++;}});await second.flush();assert.equal(sent,0);
 await first.flush();assert.equal(sent,1);await first.flush();assert.equal(sent,1);
});
