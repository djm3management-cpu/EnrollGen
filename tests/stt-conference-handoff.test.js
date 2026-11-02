import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { hookHarness } from './helpers/hookHarness.js';
const source=readFileSync(new URL('../src/hooks/useConferenceCall.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace("(import.meta.env.VITE_TELEPHONY_BASE_URL || '')","''").replace('export function','function');
test('conference upgrade reserves server transcription before checkpoint/network and releases on success or failure',async()=>{
  for(const failed of [false,true]){
    const h=hookHarness();let release;
    const checkpoint=new Promise(resolve=>{release=resolve;});
    const context=vm.createContext({...h.hooks,window:{setInterval:()=>1,clearInterval(){}},
      flushConferenceCheckpoint:()=>checkpoint,
      fetchWithClerk:async(_get,url)=>({ok:!(failed&&url.endsWith('action')),json:async()=>({enabled:true,conference:url.endsWith('action')?{callId:'conference'}:null,error:'failed'})}),
    });
    vm.runInContext(source+';globalThis.useHook=useConferenceCall;',context);
    const args={getToken:async()=>'',activeCall:{params:{direction:'outbound',twilioCallSid:'CA'+'1'.repeat(32)}}};
    h.mount(()=>context.useHook(args));await h.flush();
    const pending=h.value.run({action:'dial',mode:'add'});await h.flush();
    assert.equal(h.value.serverTranscriptionStarting,true);assert.equal(h.value.conference,null);
    release();if(failed)await assert.rejects(pending,/failed/);else await pending;
    await h.flush();assert.equal(h.value.serverTranscriptionStarting,false);
    assert.equal(Boolean(h.value.conference),!failed);h.unmount();
  }
});
