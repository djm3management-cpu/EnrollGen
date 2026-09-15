import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Exercise the real hook's event callbacks with browser/React boundaries mocked.
const source=(await readFile(new URL('../src/hooks/useCustomerAudio.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'')
  .replace('export function useCustomerAudio','function useCustomerAudio')
  .replaceAll('import.meta.url',JSON.stringify(import.meta.url));
function harness() {
  const states=[];const sockets=[];let stops=0;
  class Socket {
    static OPEN=1;
    constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;sockets.push(this);}
    send(){}
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  const clone={getAudioTracks:()=>[{readyState:'live'}],getTracks:()=>[{stop:()=>stops++}]};
  const context=vm.createContext({
    useState:initial=>{const index=states.length;states.push(initial);return [initial,value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef:current=>({current}),useCallback:fn=>fn,useEffect:()=>{},
    useAppAuth:()=>({getToken:async()=> 'clerk-test'}),
    fetchWithClerk:async()=>({ok:true,status:200,text:async()=>JSON.stringify({access_token:'temporary.jwt.token'})}),
    useCallStore:{getState:()=>({startCall(){},endCall(){}})},
    waitForActiveSessionMetadata:async()=>({}),publishAudioLevel:()=>{},
    computeRmsLevel:()=>0,computeWaveformPeaks:()=>[],
    WebSocket:Socket,console:{info(){},error(){}},URL,
    Audio:class {play(){return Promise.resolve();}pause(){}},
    window:{AudioContext:class {state='running';createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){}}},
  });
  vm.runInContext(source+'\nglobalThis.hook=useCustomerAudio();',context);
  return {hook:context.hook,states,sockets,stream:{clone:()=>clone},stops:()=>stops};
}
test('customer capture authenticates temporary JWT with bearer subprotocol',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});
  assert.deepEqual(Array.from(h.sockets[0].protocols),['bearer','temporary.jwt.token']);
});
test('connection close clears capturing despite pre-start React state in closure',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});
  assert.equal(h.states[0],true);
  h.sockets[0].onclose({code:1006});
  assert.equal(h.states[0],false);assert.match(h.states[2],/1006/);assert.equal(h.stops(),1);
});
test('old connection cannot stop a restarted customer capture',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});const old=h.sockets[0];
  h.hook.stopCapture();await h.hook.startCapture({mediaStream:h.stream});
  old.onclose({code:1006});old.onerror();
  assert.equal(h.states[0],true);assert.equal(h.states[2],null);
});
test('speech-service error is surfaced and releases capture resources',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});
  h.sockets[0].onmessage({data:JSON.stringify({type:'Error'})});
  assert.equal(h.states[0],false);assert.match(h.states[2],/rejected/);
});
test('final customer speech keeps its customer label for the right rail',async()=>{
  const h=harness();await h.hook.startCapture({mediaStream:h.stream});
  h.sockets[0].onmessage({data:JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'Yes, I can hear you.'}]}})});
  assert.equal(h.states[1][0].speaker,'customer');assert.equal(h.states[1][0].isFinal,true);
  assert.equal(h.states[1][0].text,'Yes, I can hear you.');
});
