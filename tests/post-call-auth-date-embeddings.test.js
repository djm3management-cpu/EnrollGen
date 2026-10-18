import test from 'node:test';
import assert from 'node:assert/strict';
import {createClerkFetch,installTokenRefresh} from '../src/lib/clerkFetch.js';
import {normalizeDateInput} from '../src/lib/dateInput.js';
import {initialState,scriptReducer} from '../src/context/scriptReducer.js';
import {embeddingChunks,createEmbeddingsHandler} from '../netlify/functions/embeddings.js';

test('401 refreshes Clerk with skipCache exactly once and replays the request body',async()=>{
 const options=[],bodies=[];const getToken=async value=>{options.push(value);return value.skipCache?'fresh':'stale';};
 const send=async(_url,init)=>{bodies.push(init.body);return new Response('{}',{status:bodies.length===1?401:200});};
 assert.equal((await createClerkFetch(getToken,{send})('/test',{method:'POST',body:'original'})).status,200);
 assert.deepEqual(bodies,['original','original']);assert.equal(options[1].skipCache,true);
 let tries=0;await createClerkFetch(getToken,{send:async()=>{tries++;return new Response('{}',{status:401});}})('/test');assert.equal(tries,2);
});
test('Supabase refresh preserves template; online/visible events refresh and clean up listeners',async()=>{
 const seen=[];let requests=0;
 await createClerkFetch(async options=>{seen.push(options);return 'token';},{tokenOptions:{template:'supabase'},send:async()=>new Response('{}',{status:++requests===1?401:200})})('/rest');
 assert.deepEqual(seen[1],{template:'supabase',skipCache:true});
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let refreshes=0;
 const stop=installTokenRefresh({windowTarget:win,documentTarget:doc,getToken:async options=>{assert.equal(options.skipCache,true);refreshes++;return 'new';}});
 win.dispatchEvent(new Event('online'));await new Promise(resolve=>setImmediate(resolve));doc.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(refreshes,2);stop();win.dispatchEvent(new Event('online'));await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshes,2);
});
test('US dates normalize before input binding, invalid dates are rejected, identical note updates do not rerender',()=>{
 assert.equal(normalizeDateInput('01/01/2027'),'2027-01-01');assert.equal(normalizeDateInput('2027-01-01T00:00:00Z'),'2027-01-01');
 assert.equal(normalizeDateInput('02/30/2027'),'');assert.equal(normalizeDateInput('bad'),'');
 const changed=scriptReducer(initialState,{type:'SET_NOTE',field:'effectiveDate',value:'01/01/2027'});
 assert.equal(changed.notes.effectiveDate,'2027-01-01');
 assert.equal(scriptReducer(changed,{type:'SET_NOTE',field:'effectiveDate',value:'01/01/2027'}),changed);
});
test('Unicode chunks stay below token-safe byte bounds and long inputs combine into one valid vector',async()=>{
 const text='🦄 cancer '.repeat(2000);const chunks=embeddingChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk)<=6000));
 const handler=createEmbeddingsHandler({authenticate:async()=>({userId:'test'}),env:{OPENAI_API_KEY:'test'},send:async(_url,init)=>{
 const inputs=JSON.parse(init.body).input;assert.ok(inputs.every(input=>Buffer.byteLength(input)<=6000));
 return new Response(JSON.stringify({data:inputs.map((_,index)=>({index,embedding:Array(1536).fill(1)}))}));
 }});
 const response=await handler(new Request('https://test/embeddings',{method:'POST',body:JSON.stringify({input:text})}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.embedding.length,1536);assert.ok(data.chunks>1);assert.ok(Math.abs(Math.hypot(...data.embedding)-1)<1e-8);
});
