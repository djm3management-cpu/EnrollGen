import test from 'node:test';import assert from 'node:assert/strict';import {RecoveringSttSocket} from '../src/lib/recoveringSttSocket.js';
test('browser fallback sends KeepAlive without audio, reconnects once on speech and drains buffer',async()=>{
 const sockets=[];let clock=0,tick;class Socket{constructor(){this.readyState=0;this.sent=[];sockets.push(this);}send(x){this.sent.push(x);}close(){this.readyState=3;this.onclose?.({code:1006});}open(){this.readyState=1;this.onopen?.();}}
 const health=[];let billed=0;const stream=new RecoveringSttSocket('fixture',{Socket,getProtocols:async()=>[],callId:'fixture',now:()=>clock,every:f=>(tick=f,1),cancelEvery(){},onHealth:s=>health.push(s),onAudioSent:n=>billed+=n});
 await Promise.resolve();sockets[0].open();clock=5000;tick();assert.deepEqual(sockets[0].sent,[JSON.stringify({type:'KeepAlive'})]);assert.equal(billed,0);
 sockets[0].close();assert.equal(sockets.length,1);stream.send(new ArrayBuffer(640));await new Promise(resolve=>setImmediate(resolve));assert.equal(sockets.length,2);assert.equal(sockets[0].readyState,3);sockets[1].open();assert.equal(billed,640);assert.equal(sockets[1].sent.length,1);assert.ok(health.includes('reconnecting'));stream.close();
});
