import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostCallStatusHandler} from '../src/postCallStatus.js';
import {verifyTerminalParentCall} from '../src/parentCallStatus.js';
const config={twilioAccountSid:'ACfixture',twilioAuthToken:'fixture'},sid='CA'+'a'.repeat(32);
test('only a provider-confirmed terminal parent is accepted; stream closure has no authority',async()=>{
 for(const [status,parent,expected] of [['in-progress',null,false],['completed','CAparent',false],['completed',null,true]]) {
  assert.equal(await verifyTerminalParentCall({callSid:sid,config,send:async()=>Response.json({sid,account_sid:config.twilioAccountSid,status,parent_call_sid:parent})}),expected);
 }
 await assert.rejects(verifyTerminalParentCall({callSid:sid,config,send:async()=>new Response(null,{status:503})}));
});
test('status proxy consumes a short-lived ticket, returns only lifecycle data, and rejects an invalid ticket',async()=>{
 let consumed=false,calls=0;
 const db={from(){return {delete(){return this;},eq(){return this;},gt(){return this;},select(){return this;},async maybeSingle(){if(consumed)return {data:null};consumed=true;return {data:{call_sid:sid}};}};}};
 const handler=createPostCallStatusHandler({db,config,send:async()=>{calls++;return Response.json({sid,account_sid:config.twilioAccountSid,status:'in-progress',secret:'hidden'});}});
 const res=()=>({code:200,status(n){this.code=n;return this;},end(){return this;},json(value){this.value=value;return this;}});
 const first=res();await handler({body:{token:'a'.repeat(43)}},first);assert.deepEqual(first.value,{sid,status:'in-progress',parent_call_sid:null});
 const second=res();await handler({body:{token:'a'.repeat(43)}},second);assert.equal(second.code,403);assert.equal(calls,1);
});
