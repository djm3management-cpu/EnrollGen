import {RecoveringSttSocket} from '../src/lib/recoveringSttSocket.js';
import { debugLog, warnSttOverlap, logSttUsageFailure } from "../src/lib/debugLog.js";
import { updateLiveTranscript } from '../src/lib/liveTranscript.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Exercise the real hook's event callbacks with browser/React boundaries mocked.
const source=(await readFile(new URL('../src/hooks/useCustomerAudio.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'')
  .replace('export function useCustomerAudio','function useCustomerAudio')
  .replaceAll('import.meta.url',JSON.stringify(import.meta.url));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function recovery(Socket){return class extends RecoveringSttSocket {constructor(url,options){super(url,{...options,Socket,every:()=>0,cancelEvery(){}});}};}
function harness() {
  const states=[];const sockets=[];let stops=0;
  class Socket {
    static OPEN=1;
    constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;sockets.push(this);}
    send(){}
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  const clone={getAudioTracks:()=>[{readyState:'live'}],getTracks:()=>[{stop:()=>stops++}]};
  const context=vm.createContext({ RecoveringSttSocket:recovery(Socket),debugLog, warnSttOverlap, logSttUsageFailure, updateLiveTranscript,
    useState:initial=>{const index=states.length;states.push(initial);return [initial,value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef:current=>({current}),useCallback:fn=>fn,useEffect:()=>{},
    useAppAuth:()=>({getToken:async()=> 'clerk-test'}),
    fetchWithClerk:async()=>({ok:true,status:200,json:async()=>({allowed:true}),text:async()=>JSON.stringify({access_token:'temporary.jwt.token'})}),
    useCallStore:{getState:()=>({startCall(){},endCall(){}})},
    waitForActiveSessionMetadata:async()=>({}),publishAudioLevel:()=>{},
    computeRmsLevel:()=>0,computeWaveformPeaks:()=>[],
    crypto:{randomUUID},WebSocket:Socket,console:{info(){},error(){}},URL,
    Audio:class {play(){return Promise.resolve();}pause(){}},
    window:{AudioContext:class {state='running';createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){}}},
  });
  vm.runInContext(source+'\nglobalThis.hook=useCustomerAudio({callSid:"fixture"});',context);
  return {hook:context.hook,states,sockets,stream:{clone:()=>clone},stops:()=>stops};
}
test('customer capture authenticates temporary JWT with bearer subprotocol',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();
  assert.deepEqual(Array.from(h.sockets[0].protocols),['bearer','temporary.jwt.token']);
});
test('transient connection close keeps capture available for speech-triggered recovery',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();
  assert.equal(h.states[0],true);
  h.sockets[0].onclose({code:1006});
  assert.equal(h.states[0],true);assert.match(h.states[2],/reconnecting/);assert.equal(h.stops(),0);h.hook.stopCapture();
});
test('old connection cannot stop a restarted customer capture',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();const old=h.sockets[0];
  h.hook.stopCapture();await h.hook.startCapture({mediaStream:h.stream});await settle();
  old.onclose({code:1006});old.onerror();
  assert.equal(h.states[0],true);assert.equal(h.states[2],null);h.hook.stopCapture();
});
test('speech-service error is surfaced and releases capture resources',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();
  h.sockets[0].onmessage({data:JSON.stringify({type:'Error'})});
  assert.equal(h.states[0],false);assert.match(h.states[2],/rejected/);
});
test('final customer speech keeps its customer label for the right rail',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();
  h.sockets[0].onmessage({data:JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'Yes, I can hear you.'}]}})});
  assert.equal(h.states[1][0].speaker,'customer');assert.equal(h.states[1][0].isFinal,true);
  assert.equal(h.states[1][0].text,'Yes, I can hear you.');
});

test('customer results replace their interim and never leave stale partial text behind',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});await settle();
  const result=(start,text,is_final)=>h.sockets[0].onmessage({data:JSON.stringify({type:'Results',start,duration:1,is_final,
    speech_final:false,channel:{alternatives:[{transcript:text}]}})});
  result(0,'I would',false);result(0,'I would like',false);result(0,'I would like help.',true);
  assert.equal(h.states[1].length,1);assert.equal(h.states[1][0].isFinal,true);
  result(2,'The newest speech',false);result(0,'I would like help.',true);
  assert.equal(h.states[1].length,2);assert.equal(h.states[1].at(-1).text,'The newest speech');
  result(0,'Stale partial',false);
  assert.equal(h.states[1].length,2);assert.equal(h.states[1].at(-1).text,'The newest speech');
});

// Re-render the real hook so ownership transitions and pending async starts are exercised.
async function costHarness(initial = {}, deferToken = false) {
  const {hookHarness} = await import('./helpers/hookHarness.js');
  const h=hookHarness(), sockets=[], reports=[], warnings=[], processors=[];
  let options={enabled:true,serverTranscriptionActive:false,callSid:'CA'+'1'.repeat(32),...initial}, tokenResolve;
  const tokenReady=deferToken ? new Promise(resolve=>{tokenResolve=resolve;}) : Promise.resolve();
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
    send(data){this.sent.push(data);}
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  let stopped=0;
  const stream={clone:()=>({getAudioTracks:()=>[{}],getTracks:()=>[{stop(){stopped++;}}]})};
  class AudioContext {
    state='running';sampleRate=16000;
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createScriptProcessor(){const p={connect(){},disconnect(){}};processors.push(p);return p;}
    close(){}
  }
  const context=vm.createContext({...h.hooks,RecoveringSttSocket:recovery(Socket),debugLog(){},warnSttOverlap:sid=>warnings.push(sid),logSttUsageFailure(){},
    updateLiveTranscript,crypto:{randomUUID},WebSocket:Socket,URL,window:{AudioContext},
    Audio:class {play(){return Promise.resolve();}pause(){}},
    useAppAuth:()=>({getToken:async()=>''}),
    fetchWithClerk:async(_get,path,init)=>{
      if(path==='/api/stt-usage'){reports.push(JSON.parse(init.body));return {ok:true};}
      if(path.includes('stt-reconnect'))return {ok:true,json:async()=>({allowed:true})};
      await tokenReady;return {ok:true,text:async()=>JSON.stringify({access_token:'token'})};
    },
    useCallStore:{getState:()=>({startCall(){},endCall(){}})},waitForActiveSessionMetadata:async()=>({}),
    publishAudioLevel(){},computeRmsLevel:()=>0,computeWaveformPeaks:()=>[],
  });
  vm.runInContext(source+';globalThis.useHook=useCustomerAudio;',context);
  h.mount(()=>context.useHook(options));
  return {h,sockets,reports,warnings,processors,stream,releaseToken:()=>tokenResolve?.(),stopped:()=>stopped,
    update(next){options={...options,...next};h.render();}};
}
test('browser capture refuses both manual and remote starts when disabled or server-owned',async()=>{
  for(const options of [{enabled:false},{serverTranscriptionActive:true}]){
    const f=await costHarness(options);
    await f.h.value.startCapture({mediaStream:f.stream});
    await f.h.value.startCapture();
    assert.equal(f.sockets.length,0);assert.equal(f.stopped(),0);f.h.unmount();
  }
});
test('server handoff cancels an in-flight browser token grant before socket creation',async()=>{
  const f=await costHarness({},true);
  const pending=f.h.value.startCapture({mediaStream:f.stream});
  f.update({serverTranscriptionActive:true});f.releaseToken();await pending;
  assert.equal(f.sockets.length,0);assert.equal(f.stopped(),1);f.h.unmount();
});
test('conference handoff stops browser capture, warns with SID, and reports actual PCM seconds exactly once',async()=>{
  const f=await costHarness();
  await f.h.value.startCapture({mediaStream:f.stream});await settle();await f.h.flush();
  const ws=f.sockets[0];ws.readyState=1;ws.onopen();await f.h.flush();
  f.processors[0].onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(16000)}});
  assert.equal(ws.sent[0].byteLength,32000);
  f.update({serverTranscriptionActive:true});await f.h.flush();
  f.h.value.stopCapture();ws.onclose({code:1000});await f.h.flush();
  assert.equal(ws.readyState,3);assert.equal(f.h.value.isCapturing,false);
  assert.deepEqual(f.warnings,['CA'+'1'.repeat(32)]);
  assert.equal(f.reports.length,1);assert.equal(f.reports[0].seconds,1);
  assert.equal(f.reports[0].callSid,'CA'+'1'.repeat(32));
  assert.match(f.reports[0].connectionId,/^[0-9a-f-]{36}$/);f.h.unmount();
});

test('fallback PCM continues through a transient disconnect and reconnects on new speech',async()=>{
 const f=await costHarness();
 await f.h.value.startCapture({mediaStream:f.stream});await settle();await f.h.flush();
 const first=f.sockets[0];first.readyState=1;first.onopen();await f.h.flush();
 first.readyState=3;first.onclose({code:1006});await f.h.flush();
 assert.equal(f.h.value.isCapturing,true);assert.match(f.h.value.error,/reconnecting/);
 f.processors[0].onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(16000)}});
 await settle();assert.equal(f.sockets.length,2);
 const second=f.sockets[1];second.readyState=1;second.onopen();await f.h.flush();
 assert.equal(second.sent[0].byteLength,32000);assert.equal(f.h.value.error,'');
 f.h.unmount();assert.equal(f.reports.length,1);assert.equal(f.reports[0].seconds,1);
});

test('terminal recovery buffer limit releases customer capture resources',async()=>{
 const f=await costHarness();
 await f.h.value.startCapture({mediaStream:f.stream});await settle();await f.h.flush();
 const first=f.sockets[0];first.readyState=1;first.onopen();await f.h.flush();
 first.readyState=3;first.onclose({code:1006});
 for(let i=0;i<11;i++)f.processors[0].onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(16000)}});
 await settle();await f.h.flush();
 assert.equal(f.h.value.isCapturing,false);assert.equal(f.stopped(),1);assert.equal(f.reports.length,1);
 f.h.unmount();
});
