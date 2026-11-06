import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
for (const k of ['PUBLIC_BASE_URL','SUPABASE_URL'])process.env[k]='https://example.test';
for(const k of ['SUPABASE_SECRET_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET'])process.env[k]='fixture';
const {openDeepgramTrack}=await import('../src/media/deepgramTrack.js');
function setup(){
 let now=100000;const sockets=[],messages=[],intervals=[];
 class Socket extends EventEmitter{
  constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
  send(x,cb){this.sent.push(x);cb?.();}terminate(){this.readyState=3;this.emit('close',1006,'terminated');}
  open(){this.readyState=1;this.emit('open');}
 }
 const track=openDeepgramTrack({speaker:'agent',claims:{callSid:'test'},Socket,notify:x=>messages.push(x),now:()=>now,timelineOrigin:0,
  reserveReconnect:()=>true,onLimit:async()=>{},reportUsage:async()=>{},schedule:()=>({unref(){}}),cancel(){},every:fn=>(intervals.push(fn),{unref(){}}),cancelEvery(){}});
 return {track,sockets,messages,intervals,advance:n=>now+=n};
}
test('idle KeepAlive contains no audio and stops after close',()=>{const x=setup();x.sockets[0].open();x.advance(5000);x.intervals[0]();assert.deepEqual(x.sockets[0].sent,[JSON.stringify({type:'KeepAlive'})]);x.track.close();});
test('reconnect waits for next audio and never duplicates sockets',()=>{const x=setup();const old=x.sockets[0];old.open();old.terminate();assert.equal(x.sockets.length,1);x.track.send(Buffer.alloc(160),20000);assert.equal(x.sockets.length,2);assert.equal(old.readyState,3);x.sockets[1].open();assert.equal(x.sockets[1].sent.filter(Buffer.isBuffer).length,1);x.track.send(Buffer.alloc(160),20020);assert.equal(x.sockets.length,2);x.track.close();});
test('reconnected and idle-gap timestamps follow call timeline',()=>{const x=setup();x.sockets[0].open();x.track.send(Buffer.alloc(160),1000);x.track.send(Buffer.alloc(160),20000);x.sockets[0].emit('message',JSON.stringify({type:'Results',is_final:true,start:.02,duration:.02,channel:{alternatives:[{transcript:'hello'}]}}));assert.equal(x.messages.at(-1).startMs,20000);x.track.close();});
test('20 reconnect cap stops and alerts',()=>{const x=setup();x.sockets[0].open();for(let n=0;n<21;n++){x.sockets.at(-1).terminate();x.track.send(Buffer.alloc(160),n*1000);x.sockets.at(-1).open();}assert.equal(x.sockets.length,21);assert.equal(x.track.stats().exhausted,true);assert.ok(x.messages.some(m=>m.status==='unavailable'));x.track.close();});
