import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
function fixture(){
 const h=hookHarness(),window=new EventTarget(),document=new EventTarget();let phone={enabled:true};
 const source=readFileSync(new URL('../src/components/phone/PhoneDropdown.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const code=transformSync(source,{loader:'jsx',format:'cjs',jsxFactory:'element'}).code;
 const component=vm.runInNewContext(code+';PhoneDropdown',{...h.hooks,window,document,useInboundCall:()=>phone,element:(type,props,...children)=>({type,props:props||{},children}),Phone:'icon',IncomingCallToast:'incoming',ActiveCallBar:'bar',ActiveCallExpanded:'active',DialerPanel:'dialer',CallDispositionBox:'disposition',OPEN_DIALER_EVENT:'open-dialer'});
 h.mount(()=>component({}));
 const nodes=()=>walk(h.value);
 return {h,window,nodes,phone:value=>{phone={enabled:true,...value};h.render();},panel:()=>nodes().find(node=>node.props.role==='dialog'),box:()=>nodes().find(node=>node.type==='disposition'),trigger:()=>nodes().find(node=>node.props.className?.includes('phone-dd__trigger'))};
}
for(const callKind of ['activeCall','dialingCall','incomingCall'])test(`ending ${callKind} closes an expanded panel, clears dialer prefill, and keeps later dispositions minimized`,async()=>{
 const f=fixture();try{
  const open=new Event('open-dialer');Object.assign(open,{detail:{contact:{id:'contact',phone:'2125550101'}}});f.window.dispatchEvent(open);await f.h.flush();assert.equal(f.panel().props.hidden,false);
  f.phone({[callKind]:{call:{},params:{twilioCallSid:'first'}}});await f.h.flush();assert.equal(f.panel().props.hidden,true);
  f.trigger().props.onClick();await f.h.flush();assert.equal(f.panel().props.hidden,false);
  f.phone({});await f.h.flush();assert.equal(f.panel().props.hidden,true);assert.ok(!f.nodes().some(node=>node.type==='dialer'||node.type==='active'));
  f.box().props.onVisibleChange(true);f.box().props.onCollapsedChange(false);await f.h.flush();assert.equal(f.panel().props.hidden,true);assert.equal(f.box().props.collapsed,true);
  const pill=f.nodes().find(node=>node.props.className==='phone-dd__disposition-pill');assert.ok(pill);pill.props.onClick();await f.h.flush();assert.equal(f.box().props.collapsed,false);assert.equal(f.panel().props.hidden,false);
  assert.equal(f.panel().props.className,'phone-dd__panel phone-dd__panel--disposition');assert.ok(!f.nodes().some(node=>node.props.className==='phone-dd__backdrop'));
  f.box().props.onCollapsedChange(true);await f.h.flush();assert.equal(f.panel().props.hidden,true);
  f.trigger().props.onClick();await f.h.flush();assert.equal(f.panel().props.hidden,false);assert.equal(f.nodes().find(node=>node.type==='dialer').props.initialContact,null);
 }finally{f.h.unmount();}
});
test('an explicitly opened idle dialer survives unrelated updates and a subsequent call still auto-minimizes it',async()=>{
 const f=fixture();try{
  f.trigger().props.onClick();await f.h.flush();assert.equal(f.panel().props.hidden,false);
  f.phone({deviceStatus:'registered'});await f.h.flush();assert.equal(f.panel().props.hidden,false);
  f.phone({activeCall:{call:{},params:{twilioCallSid:'next'}}});await f.h.flush();assert.equal(f.panel().props.hidden,true);assert.ok(f.nodes().some(node=>node.type==='bar'));
 }finally{f.h.unmount();}
});
