import { recordingWav } from '../../tests/helpers/recordingWav.js';
import express from 'express';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRecordingMediaHandler } from '../src/recordingMedia.js';
import { fetchRecordingMedia, providerJson } from '../src/recordings.js';
const AC='AC'+'a'.repeat(32),RE='RE'+'b'.repeat(32),CA='CA'+'c'.repeat(32),token='a'.repeat(43);
const wav=recordingWav();
const config={twilioAccountSid:AC,twilioAuthToken:'fixture-secret'};
async function app(t,{expiry=Date.now()+300_000,providerCall=CA,account=AC}={}){
  const requests=[];
  const ticket={account_sid:account,recording_sid:RE,expected_call_sid:CA,channels:2,download:true,expires_at:new Date(expiry).toISOString()};
  const db={from(table){assert.equal(table,'recording_download_tickets');return {select(){return this;},eq(key,value){assert.equal(key,'token_hash');this.valid=value===createHash('sha256').update(token).digest('hex');return this;},async maybeSingle(){return {data:this.valid?ticket:null,error:null};}};}};
  const media=createRecordingMediaHandler({db,config,log:()=>{},fetchImpl:async(url,options)=>{
    requests.push({url,options});assert.equal(options.method,undefined);assert.match(options.headers.Authorization,/^Basic /);
    if(url.endsWith('.json'))return Response.json({account_sid:AC,sid:RE,call_sid:providerCall,channels:2});
    assert.match(url,/RequestedChannels=2/);
    return options.headers.Range?new Response(wav.subarray(0,4),{status:206,headers:{'content-range':`bytes 0-3/${wav.length}`,'content-length':'4','accept-ranges':'bytes'}})
      :new Response(wav,{headers:{'content-length':String(wav.length),'accept-ranges':'bytes'}});
  }});
  const application=express();application.get('/api/recordings/media/:token',media);
  const server=createServer(application);
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {url:`http://127.0.0.1:${server.address().port}/api/recordings/media/${token}`,requests};
}
test('provider download streams exact WAV with attachment headers and no provider credentials in response',async t=>{
  const {url,requests}=await app(t);const response=await fetch(url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav);
  assert.match(response.headers.get('content-disposition'),/^attachment; filename="recording-RE/);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('authorization'),null);assert.equal(requests.length,2);
});
test('native playback Range is forwarded only after ticket and provider CallSid verification',async t=>{
  const {url,requests}=await app(t);const response=await fetch(url,{headers:{Range:'bytes=0-3'}});assert.equal(response.status,206);assert.equal(await response.text(),'RIFF');assert.equal(requests[1].options.headers.Range,'bytes=0-3');
  const invalid=await fetch(url,{headers:{Range:'bytes=0-1,5-6'}});assert.equal(invalid.status,416);assert.equal(requests.length,2);
});
test('expired, forged and account-mismatched capabilities fail before any provider request',async t=>{
  for(const opts of [{expiry:Date.now()-1},{account:'AC'+'f'.repeat(32)}]){
    const {url,requests}=await app(t,opts);assert.equal((await fetch(url)).status,404);assert.equal(requests.length,0);
  }
  const {url,requests}=await app(t);assert.equal((await fetch(url.slice(0,-1)+'z')).status,404);assert.equal(requests.length,0);
});
test('forged legacy RecordingSid cannot retrieve media from a different call',async t=>{
  const {url,requests}=await app(t,{providerCall:'CA'+'f'.repeat(32)});assert.equal((await fetch(url)).status,404);assert.equal(requests.length,1);
});
test('HTTPS redirects strip Twilio authorization on object storage and reject untrusted destinations',async()=>{
  const visits=[];const response=await fetchRecordingMedia(`https://api.twilio.com/recording.wav`,config,{},async(url,options)=>{
    visits.push({url,options});return visits.length===1?new Response(null,{status:302,headers:{location:'https://twilio-recordings.s3.amazonaws.com/fixture?signature=fixture'}}):new Response(wav);
  });assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav);assert.ok(visits[0].options.headers.Authorization);assert.equal(visits[1].options.headers.Authorization,undefined);
  for(const destination of ['http://api.twilio.com/media','https://evil.test/media','https://api.twilio.com.evil.test/media','https://127.0.0.1/media'])await assert.rejects(fetchRecordingMedia('https://api.twilio.com/recording.wav',config,{},async()=>new Response(null,{status:302,headers:{location:destination}})),/invalid_media_redirect/);
});
test('provider JSON is bounded while streaming',async()=>{
  await assert.rejects(providerJson(new Response('x'.repeat(200)),100),/metadata_too_large/);
});
