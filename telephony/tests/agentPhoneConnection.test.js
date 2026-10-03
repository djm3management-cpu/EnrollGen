import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentPhoneConnection } from '../../src/lib/agentPhoneConnection.js';
function harness() {
  const sockets=[]; const timers=new Map(); const presence=[];
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
    open(){this.readyState=1;this.onopen();}
    send(data){this.sent.push(JSON.parse(data));}
    close(){this.readyState=3;this.onclose?.();}
    ack(){this.onmessage({data:JSON.stringify({type:'presence-ready'})});}
  }
  const connection=createAgentPhoneConnection({onMessage:()=>{},onPresenceReady:ready=>presence.push(ready),Socket,
    schedule:fn=>{const key={};timers.set(key,fn);return key;},cancel:key=>timers.delete(key)});
  const start=()=>connection.start({ws_url:'wss://test',ws_token:'signed'});
  return {connection,sockets,timers,presence,start};
}
test('phone readiness follows Twilio registration, not just opening a websocket',()=>{
  const h=harness(); h.start(); h.sockets[0].open();
  assert.deepEqual(h.sockets[0].sent,[{type:'phone-ready',ready:false}]);
  h.connection.setReady(true); assert.equal(h.sockets[0].sent.at(-1).ready,true);
  h.connection.setReady(false); assert.equal(h.sockets[0].sent.at(-1).ready,false);
});
test('refresh keeps old socket until replacement lease is acknowledged',()=>{
  const h=harness(); h.connection.setReady(true); h.start(); h.sockets[0].open();
  h.start(); h.sockets[1].open(); assert.equal(h.sockets[0].readyState,1);
  h.sockets[1].ack(); assert.equal(h.sockets[0].readyState,3);
  assert.equal(h.timers.size,0);
});
test('page close closes all sockets and suppresses reconnection',()=>{
  const h=harness(); h.start(); h.sockets[0].open(); h.connection.stop();
  assert.equal(h.sockets[0].readyState,3); assert.equal(h.timers.size,0);
});
test('unexpected disconnect retries; stopping cancels scheduled retry',()=>{
  const h=harness(); h.start(); h.sockets[0].open(); h.sockets[0].close();
  assert.equal(h.timers.size,1); h.connection.stop(); assert.equal(h.timers.size,0);
});

test('availability readiness requires a live server acknowledgment and clears on disconnect',()=>{
  const h=harness(); h.connection.setReady(true); h.start(); h.sockets[0].open();
  assert.deepEqual(h.presence,[]);
  h.sockets[0].ack(); assert.equal(h.presence.at(-1),true);
  h.sockets[0].close(); assert.equal(h.presence.at(-1),false);
  h.sockets[0].ack(); assert.equal(h.presence.at(-1),false);
});
test('unregistration and stop invalidate acknowledgments without opting back in',()=>{
  const h=harness(); h.connection.setReady(true); h.start(); h.sockets[0].open();
  h.sockets[0].ack();
  h.connection.setReady(false); h.sockets[0].ack(); assert.equal(h.presence.at(-1),false);
  h.connection.setReady(true); assert.equal(h.presence.at(-1),false);
  h.sockets[0].ack(); assert.equal(h.presence.at(-1),true);
  h.connection.stop(); h.sockets[0].ack(); assert.equal(h.presence.at(-1),false);
});
test('token refresh preserves readiness while a confirmed old socket remains alive',()=>{
  const h=harness(); h.connection.setReady(true); h.start(); h.sockets[0].open(); h.sockets[0].ack();
  h.start(); h.sockets[1].open(); h.sockets[1].ack();
  assert.ok(h.presence.every(Boolean));
  h.sockets[1].close(); assert.equal(h.presence.at(-1),false);
});

function recoveryHarness(refreshBundle) {
  const sockets=[], timers=[];
  class Socket {
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=0;sockets.push(this);}
    close(){this.readyState=3;this.onclose?.();}
    send(){}
  }
  const connection=createAgentPhoneConnection({onMessage:()=>{},Socket,refreshBundle,
    schedule:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},
    cancel:timer=>{const index=timers.indexOf(timer);if(index>=0)timers.splice(index,1);}});
  connection.start({ws_url:'wss://test/agent',ws_token:'old-expired-or-rotated'});
  return {connection,sockets,timers};
}
test('rejected handshake fetches fresh credentials before retry instead of repeating stale token',async()=>{
  let fetched=0;
  const h=recoveryHarness(async()=>{fetched++;return {ws_url:'wss://test/agent',ws_token:'fresh'};});
  h.sockets[0].close();
  await h.timers.shift().fn();
  assert.equal(fetched,1);assert.equal(h.sockets.length,2);
  assert.equal(h.sockets[1].url,'wss://test/agent?token=fresh');h.connection.stop();
});
test('failed credential refresh backs off and never retries the stale credential',async()=>{
  const h=recoveryHarness(async()=>{throw new Error('401');});h.sockets[0].close();
  for(let i=0;i<7;i++){const timer=h.timers.shift();assert.ok(timer.delay<=30000);await timer.fn();}
  assert.equal(h.sockets.length,1);assert.equal(h.timers[0].delay,30000);h.connection.stop();
});
test('stop or proactive refresh during credential fetch cannot resurrect an obsolete socket',async()=>{
  for(const stop of [true,false]){
    let resolve;const h=recoveryHarness(()=>new Promise(r=>{resolve=r;}));h.sockets[0].close();
    const pending=h.timers.shift().fn();
    if(stop)h.connection.stop();else h.connection.start({ws_url:'wss://test/agent',ws_token:'proactive'});
    resolve({ws_url:'wss://test/agent',ws_token:'obsolete'});await pending;
    assert.equal(h.sockets.length,stop?1:2);
    if(!stop)assert.match(h.sockets[1].url,/proactive$/);h.connection.stop();
  }
});

test('changing identity updates the credential fetcher used by subsequent reconnects',async()=>{
  const h=recoveryHarness(async()=>{throw new Error('obsolete identity fetcher');});
  h.connection.start({ws_url:'wss://test/agent',ws_token:'second-agent'},async()=>({ws_url:'wss://test/agent',ws_token:'fresh-second-agent'}));
  h.sockets[1].close();await h.timers.shift().fn();
  assert.equal(h.sockets[2].url,'wss://test/agent?token=fresh-second-agent');h.connection.stop();
});
