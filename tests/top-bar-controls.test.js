import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {AVAILABILITY_OPTIONS, availabilityLabel, requiresPhoneReady} from '../src/lib/availabilityStatus.js';

const find=(tree,predicate)=>!tree||typeof tree!=='object'?null:predicate(tree)?tree:tree.children?.flat(Infinity).map(child=>find(child,predicate)).find(Boolean)||null;
function fixture(file,component,extra){
 const harness=hookHarness(),document=new EventTarget();
 let source=readFileSync(new URL('../src/components/'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm,'').replace('export default function','function').replace(/^export default .*;$/gm,'');
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',format:'cjs'}).code;
 const context=vm.createContext({...harness.hooks,document,window:new EventTarget(),memo:fn=>fn,
  AVAILABILITY_OPTIONS,availabilityLabel,requiresPhoneReady,
  h:(type,props,...children)=>({type,props:props||{},children}),...extra});
 vm.runInContext(source+`;globalThis.component=${component};`,context);
 harness.mount(()=>context.component({}));
 return {harness,document};
}

test('clicking the name opens Sign Out; outside click and Escape close without signing out',async()=>{
 let signedOut=0;
 const {harness,document}=fixture('ProfileMenu.jsx','ProfileMenu',{
  useAppAuth:()=>({identityLoaded:true,user:{fullName:'Test Agent'}}),
  useClerk:()=>({signOut:()=>signedOut++}),callContinuity:{getSnapshot:()=>false},
 });
 try{
  assert.equal(find(harness.value,node=>node.props.role==='menuitem'),null);
  const trigger=()=>find(harness.value,node=>node.props['aria-haspopup']==='menu');
  trigger().props.onClick();await harness.flush();
  assert.equal(signedOut,0);assert.equal(find(harness.value,node=>node.props.role==='menuitem').children[0],'Sign Out');
  document.dispatchEvent(new Event('pointerdown'));await harness.flush();
  assert.equal(find(harness.value,node=>node.props.role==='menuitem'),null);
  trigger().props.onClick();await harness.flush();
  const escape=new Event('keydown');Object.assign(escape,{key:'Escape'});document.dispatchEvent(escape);await harness.flush();
  assert.equal(find(harness.value,node=>node.props.role==='menuitem'),null);assert.equal(signedOut,0);
  trigger().props.onClick();await harness.flush();
  find(harness.value,node=>node.props.role==='menuitem').props.onClick();await harness.flush();
  assert.equal(signedOut,1);
 }finally{harness.unmount();}
});

test('Sign Out is disabled during a call and rechecks the immediate call guard before signing out',async()=>{
 let signedOut=0,callProtected=true,sdkActive=false;
 const {harness}=fixture('ProfileMenu.jsx','ProfileMenu',{
  useAppAuth:()=>({identityLoaded:true,callProtected,user:{firstName:'Test'}}),
  useClerk:()=>({signOut:()=>signedOut++}),callContinuity:{getSnapshot:()=>sdkActive},
 });
 try{
  find(harness.value,node=>node.props['aria-haspopup']==='menu').props.onClick();await harness.flush();
  let item=find(harness.value,node=>node.props.role==='menuitem');assert.equal(item.props.disabled,true);item.props.onClick();assert.equal(signedOut,0);
  callProtected=false;harness.render();item=find(harness.value,node=>node.props.role==='menuitem');assert.equal(item.props.disabled,false);
  sdkActive=true;item.props.onClick();assert.equal(signedOut,0,'a call arriving before React renders still blocks sign out');
 }finally{harness.unmount();}
});

test('pending disposition collapses fully on X, outside click or Escape; phone icon reopens it',async()=>{
 const {harness,document}=fixture('phone/PhoneDropdown.jsx','PhoneDropdown',{
  useInboundCall:()=>({enabled:true}),OPEN_DIALER_EVENT:'open-dialer',Phone:'icon',IncomingCallToast:'toast',
  ActiveCallBar:'bar',ActiveCallExpanded:'live',DialerPanel:'dialer',CallDispositionBox:'disposition',
 });
 const box=()=>find(harness.value,node=>node.type==='disposition');
 const panel=()=>find(harness.value,node=>node.props.role==='dialog');
 const trigger=()=>find(harness.value,node=>node.props.className?.includes('phone-dd__trigger'));
 try{
  assert.equal(panel().props.hidden,true);
  box().props.onVisibleChange(true);await harness.flush();assert.equal(panel().props.hidden,false);
  trigger().props.onClick();await harness.flush();assert.equal(panel().props.hidden,true,'phone icon also closes the automatically opened panel');
  trigger().props.onClick();await harness.flush();assert.equal(panel().props.hidden,false);
  box().props.onCollapsedChange(true);await harness.flush();assert.equal(panel().props.hidden,true);
  assert.match(trigger().props['aria-label'],/disposition pending/);
  trigger().props.onClick();await harness.flush();assert.equal(panel().props.hidden,false);assert.equal(box().props.collapsed,false);
  document.dispatchEvent(new Event('pointerdown'));await harness.flush();assert.equal(panel().props.hidden,true);
  trigger().props.onClick();await harness.flush();
  const escape=new Event('keydown');Object.assign(escape,{key:'Escape'});document.dispatchEvent(escape);await harness.flush();assert.equal(panel().props.hidden,true);
 }finally{harness.unmount();}
});

test('Available and Offline remain selectable with a legacy wrap-up status',async()=>{
 const selected=[];
 const {harness}=fixture('AvailabilityStrip.jsx','AvailabilityStrip',{
  useAvailability:()=>({agentId:'test',canAuthenticate:true,identityLoaded:true,isHydrated:true,status:'wrap_up',changeStatus:value=>selected.push(value)}),
 });
 try{
  for(const label of ['AVAILABLE','OFFLINE']){
   find(harness.value,node=>node.props['aria-haspopup']==='menu').props.onClick();await harness.flush();
   const option=find(harness.value,node=>node.props.role==='menuitemradio'&&find(node,child=>child.type==='span'&&child.children.includes(label)));
   assert.equal(option.props.disabled,false);option.props.onClick();await harness.flush();
  }
  assert.deepEqual(selected,['available','offline']);
 }finally{harness.unmount();}
});

test('Callbacks Only is selectable in the dropdown and displays its confirmed status and connection wait',async()=>{
 const selected=[];
 const availability={agentId:'test',canAuthenticate:true,identityLoaded:true,isHydrated:true,status:'offline',changeStatus:value=>selected.push(value)};
 const {harness}=fixture('AvailabilityStrip.jsx','AvailabilityStrip',{useAvailability:()=>availability});
 try{
  find(harness.value,node=>node.props['aria-haspopup']==='menu').props.onClick();await harness.flush();
  const option=find(harness.value,node=>node.props.role==='menuitemradio'&&find(node,child=>child.type==='span'&&child.children.includes('CALLBACKS ONLY')));
  assert.equal(option.props.disabled,false);
  option.props.onClick();await harness.flush();
  assert.deepEqual(selected,['callbacks_only']);
  assert.equal(find(harness.value,node=>node.props.role==='menu'),null);
  availability.pendingStatus='callbacks_only';harness.render();
  assert.match(find(harness.value,node=>node.props['aria-haspopup']==='menu').props['aria-label'],/CALLBACKS ONLY — CONNECTING/);
  availability.pendingStatus=null;availability.status='callbacks_only';harness.render();
  assert.match(find(harness.value,node=>node.props['aria-haspopup']==='menu').props['aria-label'],/CALLBACKS ONLY\. Change status/);
  assert.equal(find(harness.value,node=>node.props.className==='availability-strip__dot').props.style.background,'var(--status-pending)');
 }finally{harness.unmount();}
});

test('cockpit availability buttons include Callbacks Only and keep the selection in sync',()=>{
 const selected=[];
 const {harness}=fixture('AgentAvailabilityToggle.jsx','AgentAvailabilityToggle',{
  useAvailability:()=>({agentId:'test',canAuthenticate:true,identityLoaded:true,isHydrated:true,status:'callbacks_only',changeStatus:value=>selected.push(value)}),
  isAuthDisabled:()=>false,
 });
 try{
  const option=find(harness.value,node=>node.type==='button'&&node.children.includes('CALLBACKS ONLY'));
  assert.equal(option.props['aria-pressed'],true);
  assert.equal(option.props.disabled,false);
  option.props.onClick();assert.deepEqual(selected,['callbacks_only']);
 }finally{harness.unmount();}
});
