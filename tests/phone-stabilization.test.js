import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {mayShowCallDisposition,phoneHasInProgressCall} from '../src/lib/callDisposition.js';
import {createCallSessionBoundary} from '../src/lib/callSessionBoundary.js';
const SID='CA'+'1'.repeat(32),NEXT='CA'+'2'.repeat(32);
const stripImports=source=>source.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,'');
class Call extends EventEmitter {
 constructor(sid=SID){super();this.parameters={CallSid:sid};this.customParameters=new Map([['twilioCallSid',sid]]);this.phase='open';this.stream={getAudioTracks:()=>[{}]};}
 status(){return this.phase;}
 getRemoteStream(){return this.stream;}
 accept(){this.emit('accept');}
 reject(){this.phase='closed';this.emit('reject');}
 disconnect(){this.phase='closed';this.emit('disconnect');}
}
function phoneFixture(){
 const harness=hookHarness(),devices=[];let token=async()=>'',availability={isHydrated:true,setPhoneReady:()=>{}};
 class Device extends EventEmitter{
  constructor(){super();this.destroyed=0;devices.push(this);}
  register(){this.emit('registered');}
  destroy(){this.destroyed++;}
  connect(){return Promise.resolve(new Call(NEXT));}
 }
 let source=readFileSync(new URL('../src/context/InboundCallContext.jsx',import.meta.url),'utf8');
 source=source.slice(source.indexOf('function paramsFromCall'),source.indexOf('function AuthedInboundCallProvider'));
 source=source.replace('import("@twilio/voice-sdk")','Promise.resolve({Device:globalThis.Device})').replace('return <InboundCallContext.Provider value={value}>{children}</InboundCallContext.Provider>;','return value;');
 const context=vm.createContext({...harness.hooks,Device,console,Date,Map,Set,TELEPHONY_BASE_URL:'https://phone.test',WS_TOKEN_REFRESH_MS:600000,WS_TOKEN_REFRESH_RETRY_MS:30000,
  useAppAuth:()=>({getToken:token}),useTenantConfig:()=>({agents:[],supabaseClient:null}),useAvailability:()=>availability,
  resolveRequestingAgentUuid:()=>null,transcriptionHealthError:()=>'',transcriptionHealthForCall:()=>({}),
  updateTranscriptionHealth:()=>({}),publishSms:()=>{},publishAudioLevel:()=>{},debugLog:()=>{},
  checkOutbound:async()=>({blocked:false}),canonicalOutbound:async()=>({contactId:null,attemptId:'attempt',phoneNumber:'+15555555555'}),
  createAgentPhoneConnection:()=>({setReady(){},start(){},stop(){}}),
  fetch:async()=>({ok:true,json:async()=>({token:'token'})}),
  window:{addEventListener(){},removeEventListener(){},setTimeout:()=>1,clearTimeout(){}},
 });
 vm.runInContext(source+';globalThis.component=InboundCallProviderCore;',context);
 harness.mount(()=>context.component({agentId:'agent',identityReady:true}));
 return {harness,devices,rotate(){token=async()=>'rotated';availability={...availability,isHydrated:false,status:'wrap_up',wrapUpCallSid:SID};harness.render();}};
}

test('real phone provider preserves a live inbound call through auth refresh, availability wrap-up, media errors and stale prior-leg callbacks',async()=>{
 const {harness,devices,rotate}=phoneFixture();try{
 await harness.flush();assert.equal(devices.length,1,harness.value.error);const device=devices[0],first=new Call();device.emit('incoming',first);await harness.flush();
 harness.value.acceptCall();await harness.flush();assert.equal(harness.value.activeCall.call,first);assert.equal(harness.value.remoteStream,first.stream);
 first.emit('error',new Error('Recovering network'));await harness.flush();assert.equal(harness.value.activeCall.call,first);assert.equal(harness.value.hasCallInProgress(),true);
 rotate();await harness.flush();assert.equal(devices.length,1);assert.equal(device.destroyed,0);assert.equal(harness.value.activeCall.call,first);
 first.disconnect();await harness.flush();const second=new Call(NEXT);device.emit('incoming',second);await harness.flush();harness.value.acceptCall();await harness.flush();
 first.emit('cancel');first.emit('error',new Error('Late old call error'));first.emit('disconnect');await harness.flush();
 assert.equal(harness.value.activeCall.call,second);assert.equal(harness.value.remoteStream,second.stream);assert.equal(harness.value.hasCallInProgress(),true);
 }finally{harness.unmount();}
});

test('real phone provider retains outbound dialing/live state on recoverable errors; old callbacks cannot clear the next inbound call',async()=>{
 const {harness,devices}=phoneFixture();try{
 await harness.flush();const call=await harness.value.makeCall({phoneNumber:'+15555555555'});await harness.flush();
 call.emit('error',new Error('Recovering media'));await harness.flush();assert.equal(harness.value.dialingCall.call,call);assert.equal(harness.value.hasCallInProgress(),true);
 call.emit('accept');await harness.flush();assert.equal(harness.value.activeCall.call,call);
 call.emit('error',new Error('Recovering network'));await harness.flush();assert.equal(harness.value.activeCall.call,call);
 call.disconnect();await harness.flush();const next=new Call(SID);devices[0].emit('incoming',next);await harness.flush();harness.value.acceptCall();await harness.flush();
 for(const event of ['cancel','reject','disconnect'])call.emit(event);await harness.flush();assert.equal(harness.value.activeCall.call,next);assert.equal(harness.value.hasCallInProgress(),true);
 }finally{harness.unmount();}
});

test('disposition requires a terminal owned leg and no ringing, dialing, live or SDK-reserved call; late SID metadata cannot remount cockpit',()=>{
 const task={ended_at:new Date().toISOString(),agent_leg_sid:SID};assert.equal(mayShowCallDisposition({},false,task),true);
 for(const phone of [{activeCall:{}},{incomingCall:{}},{dialingCall:{}},{hasCallInProgress:()=>true}]){assert.equal(phoneHasInProgressCall(phone),true);assert.equal(mayShowCallDisposition(phone,false,task),false);}
 assert.equal(mayShowCallDisposition({},true,task),false);assert.equal(mayShowCallDisposition({},false,{ended_at:task.ended_at}),false);
 const boundary=createCallSessionBoundary(),call={parameters:{}};const key=boundary({call});call.parameters.CallSid=SID;assert.equal(boundary({call}),key);assert.notEqual(boundary({call:new Call(NEXT)}),key);
});

const task={call_sid:SID,session_id:'session',agent_leg_sid:NEXT,ended_at:'2026-10-20T15:00:00Z',connected_seconds:60};
function boxFixture({seconds=60,deferLookup=false}={}){
 const harness=hookHarness(),requests=[],events=[];let phone={},lookupResolve;
 let source=stripImports(readFileSync(new URL('../src/components/phone/CallDispositionBox.jsx',import.meta.url),'utf8')).replace('export default function','function');
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',jsxFragment:'fragment',format:'cjs'}).code;
 const context=vm.createContext({...harness.hooks,h:(type,props,...children)=>({type,props:props||{},children}),X:'x',ChevronDown:'chevron',fragment:'fragment',
  CALL_OUTCOME_OPTIONS:[],ANCILLARY_PRODUCT_OPTIONS:[],phoneHasInProgressCall,mayShowCallDisposition,
  useAppAuth:()=>({getToken:token}),setActivePostCallMetadata:()=>{},
  fetchWithClerk:async(_token,_url,options)=>{requests.push(options?.method||'GET');if(options?.method==='POST')return{ok:true,json:async()=>({saved:true,session_id:'session',call_outcome:JSON.parse(options.body).call_outcome})};
   if(deferLookup)await new Promise(resolve=>{lookupResolve=resolve;});return{ok:true,json:async()=>({in_progress:false,disposition:{...task,connected_seconds:seconds}})};},
  setInterval:()=>1,clearInterval(){},window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(name,{detail}){this.type=name;this.detail=detail;}},
 });
 function token(){return Promise.resolve('');}
 vm.runInContext(source+';globalThis.component=CallDispositionBox;',context);
 harness.mount(()=>context.component({phone}));
 return{harness,requests,events,beginCall(){phone={activeCall:{call:{}}};harness.render();},resolveLookup(){lookupResolve();}};
}
const find=(tree,predicate)=>!tree||typeof tree!=='object'?null:predicate(tree)?tree:tree.children?.flat(Infinity).map(child=>find(child,predicate)).find(Boolean);

test('X collapses the actual dialer box without saving or dismissing; reopen and save closes only its session',async()=>{
 const {harness,requests,events}=boxFixture();try{
 await harness.flush();find(harness.value,node=>node.props['aria-label']==='Collapse disposition').props.onClick();await harness.flush();
 assert.equal(requests.filter(x=>x==='POST').length,0);assert.ok(find(harness.value,node=>node.type==='button'&&node.children.includes('Disposition pending ')));
 find(harness.value,node=>node.type==='button').props.onClick();await harness.flush();
 find(harness.value,node=>node.type==='select').props.onChange({target:{value:'callback_scheduled'}});await harness.flush();
 find(harness.value,node=>node.type==='button'&&node.children.includes('Save disposition')).props.onClick();await harness.flush();
 assert.equal(requests.filter(x=>x==='POST').length,1);assert.equal(events[0].detail.session_id,'session');assert.equal(harness.value,null);
 }finally{harness.unmount();}
});

test('late disposition lookup during a new live call cannot show a box or auto-dispose that call',async()=>{
 const {harness,requests,beginCall,resolveLookup}=boxFixture({seconds:14,deferLookup:true});try{
 beginCall();resolveLookup();await harness.flush();assert.equal(harness.value,null);assert.equal(requests.filter(x=>x==='POST').length,0);
 }finally{harness.unmount();}
});

test('actual dialer box auto-disposes a connected call under 15 seconds exactly once',async()=>{
 const {harness,requests,events}=boxFixture({seconds:14});try{await harness.flush();assert.equal(requests.filter(x=>x==='POST').length,1);assert.equal(events[0].detail.call_outcome,'short_call_hangup');assert.equal(harness.value,null);}finally{harness.unmount();}
});

test('idle lock consults the immediate SDK call guard, never accrues call time, and stays hidden if a new call arrives while locked',async()=>{
 const harness=hookHarness();let now=0,live=true,check;
 const phone={hasCallInProgress:()=>live};
 let source=stripImports(readFileSync(new URL('../src/context/SessionLockContext.jsx',import.meta.url),'utf8')).replace(/^export /gm,'');
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',jsxFragment:'fragment',format:'cjs'}).code;
 const context=vm.createContext({...harness.hooks,createContext:()=>({Provider:'provider'}),useContext:()=>{},useInboundCall:()=>phone,
  phoneHasInProgressCall,h:(type,props,...children)=>({type,props,children}),isAuthDisabled:()=>false,Date:{now:()=>now},
  setInterval:fn=>{check=fn;return 1;},clearInterval(){},window:{addEventListener(){},removeEventListener(){}},
 });
 vm.runInContext(source+';globalThis.component=AuthedSessionLockProvider;',context);
 harness.mount(()=>context.component({children:null}));try{
 now=61*60*1000;check();await harness.flush();assert.equal(harness.value.props.value.locked,false);
 live=false;now+=15000;check();await harness.flush();assert.equal(harness.value.props.value.locked,false);
 now+=61*60*1000;check();await harness.flush();assert.equal(harness.value.props.value.locked,true);
 live=true;harness.render();assert.equal(harness.value.props.value.locked,false);
 }finally{harness.unmount();}
});
