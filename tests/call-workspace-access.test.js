import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stripImports=source=>source.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,'').replace(/^export default /gm,'').replace(/^export /gm,'');
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)];

test('a connected publisher call with no ZIP renders controls directly after the caller and timer',()=>{
 const harness=hookHarness(),actions=[];
 const phone={activeCall:{params:{paragon:'true',callerPhone:'+15555550123'}},toggleMute:()=>actions.push('mute'),toggleHold:()=>actions.push('hold'),hangUp:()=>actions.push('end')};
 const icons=Object.fromEntries(['ArrowLeftRight','Grid3x3','Mic','MicOff','MessageSquarePlus','Pause','PhoneOff','Play','StickyNote','Users'].map(name=>[name,name]));
 const context=vm.createContext({...harness.hooks,...icons,h:(type,props,...children)=>({type,props:props||{},children}),useInboundCall:()=>phone,useCallDuration:()=>90000,formatTime:()=> '1:30',ConferenceControls:'conference'});
 vm.runInContext(transformSync(stripImports(read('src/components/phone/ActiveCallExpanded.jsx')),{loader:'jsx',jsxFactory:'h',format:'cjs'}).code+';globalThis.Component=ActiveCallExpanded;',context);
 harness.mount(()=>context.Component({}));
 try{
  const children=harness.value.children.flat(Infinity).filter(Boolean);
  assert.equal(children[0].props.className,'phone-expanded__header');assert.equal(children[1].props.className,'phone-expanded__grid');
  assert.equal(nodes(harness.value).some(n=>n.type==='input'),false);
  const button=label=>nodes(harness.value).find(n=>n.type==='button'&&n.children.flat(Infinity).includes(label));
  button('MUTE').props.onClick();button('HOLD').props.onClick();button('END CALL').props.onClick();assert.deepEqual(actions,['mute','hold','end']);
 }finally{harness.unmount();}
});

function lookup(initialZip='',onResidenceLookup){
 const harness=hookHarness();let options={initialZip,onResidenceLookup};
 const context=vm.createContext({...harness.hooks,debugLog:()=>{},getStateFromZip:()=>'',
  fetchLiveFemaDisasters:async()=>({disasters:[],fetchedAt:'fixture',apiFailed:false}),fetchBulletins:async()=>[],fetchLiveNews:async()=>[],fetchBulletinStatus:async()=>({feeds:[]}),
  window:{setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},
 });
 const normalize=read('src/components/SEPResultsPanel.jsx').match(/export function normalizeSepZip\([\s\S]*?\n}/)[0].replace('export ','');
 vm.runInContext(normalize+'\n'+stripImports(read('src/hooks/useSEPLookup.js'))+';globalThis.lookup=useSEPLookup;',context);
 harness.mount(()=>context.lookup(options));
 return {harness,setContactZip(zip){options={...options,initialZip:zip};harness.render();}};
}
test('the plan tool uses an existing contact ZIP and remains editable',async()=>{
 const {harness}=lookup('07001');
 try{await harness.flush();assert.equal(harness.value.zip,'07001');harness.value.setZip('33101');await harness.flush();assert.equal(harness.value.zip,'33101');}finally{harness.unmount();}
});
test('late contact ZIP hydration prefills an empty tool without replacing an agent-entered search',async()=>{
 for(const typed of ['', '33101']){
  const fixture=lookup();
  try{await fixture.harness.flush();assert.equal(fixture.harness.value.zip,'');if(typed)fixture.harness.value.setZip(typed);await fixture.harness.flush();fixture.setContactZip('07001');await fixture.harness.flush();assert.equal(fixture.harness.value.zip,typed||'07001');}finally{fixture.harness.unmount();}
 }
});

test('untouched contact/vendor prefill never becomes SEP residence evidence; only agent entry can publish it',async()=>{
 const sent=[],fixture=lookup('07001',value=>sent.push(value));
 try{
  await fixture.harness.flush();fixture.harness.value.reportResidenceLookup({zip:'07001',state:'NJ'});assert.equal(sent.length,0);
  fixture.harness.value.setZip('33101');await fixture.harness.flush();fixture.harness.value.reportResidenceLookup({zip:'07001',state:'NJ'});assert.equal(sent.length,0);
  fixture.harness.value.reportResidenceLookup({zip:'33101',state:'FL'});assert.equal(sent.length,1);assert.equal(sent[0].entry,'agent_typed');
 }finally{fixture.harness.unmount();}
});

test('residence outbox renders nothing and unavailable browser storage cannot block the workspace',async()=>{
 const harness=hookHarness(),window={get localStorage(){throw new Error('storage unavailable');}};
 const context=vm.createContext({...harness.hooks,window,useAppAuth:()=>({user:{id:'agent'},getToken:async()=>''}),residenceScope:()=> 'agent:org',createResidenceOutbox:()=>{throw new Error('must not reach');}});
 vm.runInContext(stripImports(read('src/components/ParagonResidenceOutbox.jsx'))+';globalThis.Component=ParagonResidenceOutbox;',context);
 try{harness.mount(()=>context.Component());await harness.flush();assert.equal(harness.value,null);}finally{harness.unmount();}
});
test('ordinary agent cannot see residence admin review and its request never blocks call UI',async()=>{
 const harness=hookHarness(),getToken=async()=>'';
 const context=vm.createContext({...harness.hooks,useAppAuth:()=>({getToken}),fetchWithClerk:async()=>new Response('{}',{status:403}),setInterval:()=>1,clearInterval(){},h:(type,props,...children)=>({type,props,children})});
 vm.runInContext(transformSync(stripImports(read('src/components/callLog/ParagonResidenceReview.jsx')),{loader:'jsx',jsxFactory:'h',format:'cjs'}).code+';globalThis.Component=ParagonResidenceReview;',context);
 try{harness.mount(()=>context.Component());assert.equal(harness.value,null);await harness.flush();assert.equal(harness.value,null);}finally{harness.unmount();}
});
