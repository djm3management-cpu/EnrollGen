import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCallLog, loadCallLogPages } from '../src/lib/callLogApi.js';
test('browser call-log requests use bearer auth, encode filters, and surface server failure',async()=>{
 const original=globalThis.fetch;
 try {
  let requests=0;
  globalThis.fetch=async(url,options)=>{
   requests++;const params=new URL(url,'https://test').searchParams;
   assert.equal(options.headers.Authorization,'Bearer signed-clerk-token');assert.equal(options.method,'GET');
   assert.equal(params.get('search'),'Mike, (cell) +16093201600');assert.equal(params.get('direction'),'outbound');
   return new Response(JSON.stringify({rows:[{direction:'outbound'}],count:1}));
  };
  assert.equal((await loadCallLog(async()=>'signed-clerk-token',{direction:'outbound',search:'Mike, (cell) +16093201600',from:null})).count,1);
  await assert.rejects(loadCallLog(async()=>null),/Sign in/);assert.equal(requests,1);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Workspace unavailable'}),{status:403});
  await assert.rejects(loadCallLog(async()=>'signed-clerk-token'),/Workspace unavailable/);
 } finally {globalThis.fetch=original;}
});
test('dashboard call-log pagination retrieves all pages in stable sort and respects cancellation',async()=>{
 const original=globalThis.fetch;let offsets=[];
 try {
  globalThis.fetch=async url=>{
   const params=new URL(url,'https://test').searchParams;const offset=Number(params.get('offset'));offsets.push(offset);
   assert.equal(params.get('limit'),'500');assert.equal(params.get('ascending'),'1');assert.equal(params.get('from'),'2026-10-01T00:00:00Z');
   const rows=Array.from({length:offset===0?500:1},(_,i)=>({log_id:String(offset+i)}));
   return new Response(JSON.stringify({rows,count:501}));
  };
  const rows=await loadCallLogPages(async()=>'token',{ascending:'1',from:'2026-10-01T00:00:00Z'});
  assert.equal(rows.length,501);assert.deepEqual(offsets,[0,500]);assert.equal(new Set(rows.map(r=>r.log_id)).size,501);
  offsets=[];assert.deepEqual(await loadCallLogPages(async()=>'token',{ascending:'1'},()=>true),[]);assert.deepEqual(offsets,[]);
 } finally {globalThis.fetch=original;}
});
