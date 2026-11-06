import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
for (const k of ['PUBLIC_BASE_URL','SUPABASE_URL'])process.env[k]='https://example.test';
for(const k of ['SUPABASE_SECRET_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[k]='fixture';
const {openDeepgramTrack}=await import('../src/media/deepgramTrack.js');
function setup(overrides={}){
 let now=100000;const sockets=[],messages=[],intervals=[],timers=[];
 class Socket extends EventEmitter{
  constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
  send(x,cb){this.sent.push(x);cb?.();}terminate(){this.readyState=3;this.emit('close',1006,'terminated');}
  open(){this.readyState=1;this.emit('open');}
 }
 const track=openDeepgramTrack({speaker:'agent',claims:{callSid:'test'},Socket,notify:x=>messages.push(x),now:()=>now,timelineOrigin:0,
  registerStream:()=>true,reserveReconnect:()=>true,onLimit:async()=>{},reportUsage:async()=>{},schedule:fn=>{timers.push(fn);return {unref(){}}},cancel(){},every:fn=>(intervals.push(fn),{unref(){}}),cancelEvery(){},...overrides});
 return {track,sockets,messages,intervals,timers,advance:n=>now+=n};
}
test('idle KeepAlive contains no audio and stops after close',()=>{const x=setup();x.sockets[0].open();x.advance(5000);x.intervals[0]();assert.deepEqual(x.sockets[0].sent,[JSON.stringify({type:'KeepAlive'})]);x.track.close();});
test('reconnect waits for next audio and never duplicates sockets',()=>{const x=setup();const old=x.sockets[0];old.open();old.terminate();assert.equal(x.sockets.length,1);x.track.send(Buffer.alloc(160),20000);assert.equal(x.sockets.length,2);assert.equal(old.readyState,3);x.sockets[1].open();assert.equal(x.sockets[1].sent.filter(Buffer.isBuffer).length,1);x.track.send(Buffer.alloc(160),20020);assert.equal(x.sockets.length,2);x.track.close();});
test('reconnected and idle-gap timestamps follow call timeline',()=>{const x=setup();x.sockets[0].open();x.track.send(Buffer.alloc(160),1000);x.track.send(Buffer.alloc(160),20000);x.sockets[0].emit('message',JSON.stringify({type:'Results',is_final:true,start:.02,duration:.02,channel:{alternatives:[{transcript:'hello'}]}}));assert.equal(x.messages.at(-1).startMs,20000);x.track.close();});
test('20 reconnect cap stops and alerts',()=>{const x=setup();x.sockets[0].open();for(let n=0;n<21;n++){x.sockets.at(-1).terminate();x.track.send(Buffer.alloc(160),n*1000);x.sockets.at(-1).open();}assert.equal(x.sockets.length,21);assert.equal(x.track.stats().exhausted,true);assert.ok(x.messages.some(m=>m.status==='unavailable'));x.track.close();});
test('old socket must finish closing before a replacement is created',()=>{const x=setup();const old=x.sockets[0];old.open();old.terminate=()=>{old.readyState=2};old.emit('error',Error('fixture'));x.track.send(Buffer.alloc(160),2000);assert.equal(x.sockets.length,1);old.readyState=3;old.emit('close',1006);assert.equal(x.sockets.length,2);x.sockets[1].open();x.track.close();});
test('backpressure drains buffered speech without creating another billable stream',()=>{const x=setup();x.sockets[0].open();x.sockets[0].bufferedAmount=65536;x.track.send(Buffer.alloc(160),2000);assert.equal(x.sockets.length,1);assert.equal(x.track.stats().queuedFrames,1);x.sockets[0].bufferedAmount=0;x.timers.at(-1)();assert.equal(x.track.stats().queuedFrames,0);assert.equal(x.sockets[0].sent.filter(Buffer.isBuffer).length,1);x.track.close();});
test('durable per-call budget refusal prevents a new stream',()=>{const x=setup({reserveReconnect:()=>false});x.sockets[0].open();x.sockets[0].terminate();x.track.send(Buffer.alloc(160),2000);assert.equal(x.sockets.length,1);assert.equal(x.track.stats().exhausted,true);assert.equal(x.messages.at(-1).status,'unavailable');x.track.close();});
test('initial registration failure opens no provider socket',()=>{const x=setup({registerStream:()=>false});assert.equal(x.sockets.length,0);assert.equal(x.track.stats().exhausted,true);assert.equal(x.messages.at(-1).status,'unavailable');x.track.close();});
test('audio is retained while durable stream registration is pending',async()=>{let release;const x=setup({registerStream:()=>new Promise(resolve=>{release=resolve;})});x.track.send(Buffer.alloc(160),5000);assert.equal(x.sockets.length,0);assert.equal(x.track.stats().queuedFrames,1);release(true);await Promise.resolve();assert.equal(x.sockets.length,1);x.sockets[0].open();assert.equal(x.sockets[0].sent.filter(Buffer.isBuffer).length,1);x.track.close();});
