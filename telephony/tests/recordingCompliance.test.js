import express from 'express';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { recordingWav } from '../../tests/helpers/recordingWav.js';
import { createRecordingComplianceHandler } from '../src/recordingCompliance.js';

const AC='AC'+'a'.repeat(32), RE='RE'+'b'.repeat(32), CA='CA'+'c'.repeat(32);
const tenant='00000000-0000-4000-8000-000000000001', token='a'.repeat(43), wav=recordingWav();
const config={twilioAccountSid:AC,twilioAuthToken:'secret'};
async function app(t, {ticket:overrides={},providerCall=CA,unknownLength=false,ignoreRange=false,stored=false,missingStorage=false,body=wav}={}) {
  const requests=[];
  const ticket={tenant_id:tenant,recording_id:'one-recording',account_sid:AC,recording_sid:RE,expected_call_sid:CA,
    channels:2,format:'wav',expires_at:new Date(Date.now()+86_400_000).toISOString(),...(stored?{storage_path:`${tenant}/one.wav`}:{}),...overrides};
  const db={from(table){assert.equal(table,'recording_compliance_tickets');return {
    select(){return this;},eq(key,value){assert.equal(key,'token_hash');this.valid=value===createHash('sha256').update(token).digest('hex');return this;},
    async maybeSingle(){return {data:this.valid?ticket:null,error:null};},
  };},storage:{from(bucket){assert.equal(bucket,'call-recordings');return {async createSignedUrl(path,ttl){
    assert.equal(path,ticket.storage_path);assert.equal(ttl,300);return {data:{signedUrl:'https://storage.test/audio.wav'},error:null};
  }};}}};
  const handler=createRecordingComplianceHandler({db,config,log:()=>{},fetchImpl:async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('.json'))return Response.json({account_sid:AC,sid:RE,call_sid:providerCall,channels:2});
    if(url.startsWith('https://storage.test/')) {
      assert.equal(options.headers.Authorization,undefined);
      if(missingStorage)return new Response(null,{status:404});
    } else {assert.match(options.headers.Authorization,/^Basic /);assert.match(url,ticket.format==='mp3'?/\.mp3\?/:/\.wav\?/);}
    const range=options.headers.Range;
    if(range&&!ignoreRange) {
      if(range===`bytes=${body.length}-`)return new Response(null,{status:416,headers:{'content-range':`bytes */${body.length}`}});
      const suffix=range==='bytes=-4',start=suffix?body.length-4:2,end=suffix?body.length-1:5;
      return new Response(body.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${body.length}`,...(!unknownLength?{'content-length':'4'}:{})}});
    }
    return new Response(body,{headers:unknownLength?{}:{'content-length':String(body.length)}});
  }});
  const application=express();application.all('/api/recordings/conversly/:token',handler);
  const server=createServer(application);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {url:`http://127.0.0.1:${server.address().port}/api/recordings/conversly/${token}`,requests,ticket};
}
test('24-hour bearer can be HEADed and fetched repeatedly without a session, IP or user-agent binding',async t=>{
  const {url}=await app(t);
  for(const method of ['HEAD','GET','GET','HEAD']) {
    const response=await fetch(url,{method,headers:{'User-Agent':`client-${method}`}});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/wav');
    assert.equal(response.headers.get('content-length'),String(wav.length));assert.equal(response.headers.get('accept-ranges'),'bytes');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):wav);
  }
});
test('GET ranges include exact bytes and headers for provider and Storage; HEAD ignores Range',async t=>{
  for(const stored of [false,true]) {
    const {url}=await app(t,{stored});
    for(const range of ['bytes=2-5','bytes=-4']) {
      const response=await fetch(url,{headers:{Range:range}});assert.equal(response.status,206);
      assert.equal(response.headers.get('content-length'),'4');
      assert.match(response.headers.get('content-range'),new RegExp(`/${wav.length}$`));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),range==='bytes=-4'?wav.subarray(-4):wav.subarray(2,6));
    }
    const head=await fetch(url,{method:'HEAD',headers:{Range:'bytes=2-5'}});
    assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(wav.length));
    const invalid=await fetch(url,{headers:{Range:`bytes=${wav.length}-`}});
    assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),`bytes */${wav.length}`);
  }
});
test('missing upstream length and ignored ranges use accurate local lengths and ranges',async t=>{
  for(const unknownLength of [false,true]) {
    const {url}=await app(t,{unknownLength,ignoreRange:true});
    const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(wav.length));
    const response=await fetch(url,{headers:{Range:'bytes=2-5'}});assert.equal(response.status,206);
    assert.equal(response.headers.get('content-length'),'4');assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav.subarray(2,6));
    const open=await fetch(url,{headers:{Range:'bytes=2-'}});assert.equal(open.status,206);
    assert.deepEqual(Buffer.from(await open.arrayBuffer()),wav.subarray(2));
    const invalid=await fetch(url,{headers:{Range:'bytes=5-2'}});assert.equal(invalid.status,416);
  }
  const {url}=await app(t,{unknownLength:true});
  const response=await fetch(url,{headers:{Range:'bytes=2-5'}});assert.equal(response.headers.get('content-length'),'4');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav.subarray(2,6));
});
test('MP3 requests fetch MP3 bytes with audio/mpeg and matching filename and length',async t=>{
  const mp3=Buffer.from('ID3-fixture-audio');const {url}=await app(t,{ticket:{format:'mp3'},body:mp3});
  const response=await fetch(url);assert.equal(response.headers.get('content-type'),'audio/mpeg');
  assert.equal(response.headers.get('content-length'),String(mp3.length));assert.match(response.headers.get('content-disposition'),/\.mp3"$/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),mp3);
});
test('expired, forged, wrong-account and wrong-call tickets fail closed',async t=>{
  for(const options of [{ticket:{expires_at:new Date(Date.now()-1).toISOString()}},{ticket:{expires_at:'invalid'}},
    {ticket:{account_sid:'AC'+'f'.repeat(32)}},{providerCall:'CA'+'f'.repeat(32)},
    {stored:true,ticket:{storage_path:'other-tenant/file.wav'}}]) {
    const {url}=await app(t,options);assert.equal((await fetch(url)).status,404);
  }
  const {url,requests}=await app(t);assert.equal((await fetch(url.slice(0,-1)+'z')).status,404);assert.equal(requests.length,0);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
  assert.equal((await fetch(url,{headers:{Range:'bytes=0-1,3-4'}})).status,416);assert.equal(requests.length,0);
});
test('missing WAV storage falls back to the same verified provider recording',async t=>{
  const {url,requests}=await app(t,{stored:true,missingStorage:true});
  const response=await fetch(url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav);
  assert.equal(requests.length,3);
});
