import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCoachingDispatch,runTranscriptDispatch} from '../src/transcripts.js';
const call='e1640000-0000-4000-8000-000000000001',token='e1640000-0000-4000-8000-000000000002';
test('disabled coaching dispatch performs no database or transport work',async()=>{
 const bomb=()=>assert.fail('disabled work');await runCoachingDispatch({coachingEnabled:false,db:{rpc:bomb},transport:bomb});
});
test('coaching dispatch uses existing queue RPC, trusted app destination, secret and opaque token only',async()=>{
 const requests=[],db={rpc:async name=>{assert.equal(name,'get_post_call_coaching_dispatch');return {data:[{call_id:call,coaching_token:token}]};}};
 await runCoachingDispatch({db,secret:'fixture',coachingEnabled:true,transport:async(url,init)=>{requests.push({url:String(url),init});return {ok:true};}});
 assert.equal(requests.length,1);assert.ok(requests[0].url.endsWith('/.netlify/functions/post-call-coaching-background'));assert.equal(requests[0].init.headers['x-enrollgen-job-secret'],'fixture');assert.deepEqual(JSON.parse(requests[0].init.body),{callId:call,token});assert.equal(requests[0].init.redirect,'error');
});
test('coaching transport failure leaves durable queue claims untouched and cannot change scoring',async()=>{
 let delivered=0;await runCoachingDispatch({secret:'fixture',coachingEnabled:true,db:{rpc:async()=>({data:[{call_id:call,coaching_token:token},{call_id:call,coaching_token:token}]})},transport:async()=>{delivered++;throw Error('synthetic');}});assert.equal(delivered,2);
 const calls=[];await runTranscriptDispatch({scoringEnabled:false,db:{rpc:async name=>{calls.push(name);return {data:[]};}}});assert.deepEqual(calls,['reconcile_telephony_transcripts']);
});
