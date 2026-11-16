import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import * as recap from '../src/lib/clientRecap.js';
const element=(type,props,...children)=>({type,props:props||{},children}),nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)],text=x=>nodes(x).flatMap(n=>n.children||[]).filter(v=>typeof v==='string').join(' ');
const source=file=>readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export default function','function').replaceAll('export function','function');
function fixture(name,{file='src/components/enrollment/ClientRecap.jsx',...overrides}={}){
 const h=hookHarness(),getToken=async()=>'synthetic';
 const Component=vm.runInNewContext(transformSync(source(file),{loader:'jsx',jsxFactory:'element',jsxFragment:'fragment',format:'cjs'}).code+`;${name};`,{...h.hooks,...recap,element,fragment:'fragment',useAppAuth:()=>({getToken}),useTenantConfig:()=>({features:{}}),fetchWithClerk:()=>assert.fail('Unexpected API call'),encodeURIComponent,Date,URL,document:{createElement:()=>assert.fail('Unexpected download')},...overrides});
 return {h,Component};
}
const data={can_send:true,admin:false,revision:'one',channels:{sms:{text:'Exact synthetic text',sha256:'text-hash',version:1,reason:null},pdf:{text:'Exact synthetic PDF',sha256:'pdf-hash',version:1,reason:null}},history:[]};
test('feature off renders no interface entry and performs no requests',()=>{const f=fixture('ClientRecap');assert.equal(f.Component({enrollmentId:'one'}),null);});
test('recap action opens exact preview, channel selection clears approval, and only confirmation sends',async()=>{
 const requests=[],f=fixture('RecapPanel',{fetchWithClerk:async(_token,url,options)=>{requests.push({url,options});return Response.json(options?{status:'queued'}:data);}});
 try{
  f.h.mount(()=>f.Component({enrollmentId:'one'}));assert.equal(requests.length,0);nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();assert.ok(text(f.h.value).includes('Exact synthetic PDF'));
  const send=()=>nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Download PDF');assert.equal(send().props.disabled,true);
  nodes(f.h.value).find(n=>n.type==='input').props.onChange({target:{checked:true}});await f.h.flush();assert.equal(send().props.disabled,false);
  nodes(f.h.value).find(n=>n.type==='select').props.onChange({target:{value:'sms'}});await f.h.flush();assert.equal(nodes(f.h.value).find(n=>n.type==='input').props.checked,false);assert.ok(text(f.h.value).includes('Exact synthetic text'));assert.equal(requests.filter(r=>r.options).length,0);
  nodes(f.h.value).find(n=>n.type==='input').props.onChange({target:{checked:true}});await f.h.flush();await nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Send text').props.onClick();await f.h.flush();
  const body=JSON.parse(requests.find(r=>r.options)?.options.body);assert.deepEqual(body,{enrollment_id:'one',action:'send',channel:'sms',approved:true,sha256:'text-hash',revision:'one',resend:false});
 }finally{f.h.unmount();}
});
test('missing permission disables text while PDF approval remains available',async()=>{
 const f=fixture('RecapPanel',{fetchWithClerk:async()=>Response.json({...data,channels:{...data.channels,sms:{...data.channels.sms,reason:'Recorded text opt-in is missing.'}}})});
 try{f.h.mount(()=>f.Component({enrollmentId:'one'}));nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();assert.equal(nodes(f.h.value).find(n=>n.type==='option'&&n.props.value==='sms').props.disabled,true);assert.equal(nodes(f.h.value).find(n=>n.type==='option'&&n.props.value==='pdf').props.disabled,false);assert.ok(text(f.h.value).includes('Recorded text opt-in is missing.'));}finally{f.h.unmount();}
});
test('manager sees status and approving staff with no send, approval or channel controls',async()=>{
 const f=fixture('RecapPanel',{fetchWithClerk:async()=>Response.json({can_send:false,admin:false,history:[{id:'one',channel:'sms',status:'delivered',approved_by:'staff',approved_at:'2026-11-16T00:00:00Z',out_of_date:true}]})});
 try{f.h.mount(()=>f.Component({enrollmentId:'one'}));nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();assert.ok(text(f.h.value).includes('delivered'));assert.ok(text(f.h.value).includes('staff'));assert.ok(text(f.h.value).includes('Out of date'));assert.ok(!nodes(f.h.value).some(n=>['select','input'].includes(n.type)));}finally{f.h.unmount();}
});
test('enrollment revision refreshes history and clears an earlier approval without sending',async()=>{
 const calls=[],f=fixture('RecapPanel',{fetchWithClerk:async(_t,url,options)=>{calls.push(options);return Response.json({...data,revision:String(calls.length),history:calls.length>1?[{id:'one',channel:'pdf',status:'downloaded',approved_by:'staff',approved_at:'2026-11-16T00:00:00Z',out_of_date:true}]:[]});}});let version='one';
 try{f.h.mount(()=>f.Component({enrollmentId:'one',enrollmentRevision:version}));nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();nodes(f.h.value).find(n=>n.type==='input').props.onChange({target:{checked:true}});await f.h.flush();version='two';f.h.render();await f.h.flush();assert.ok(text(f.h.value).includes('Out of date'));assert.equal(nodes(f.h.value).find(n=>n.type==='input').props.checked,false);assert.equal(calls.filter(Boolean).length,0);}finally{f.h.unmount();}
});
test('template editor uses synthetic preview and selectable allowlisted placeholders',async()=>{
 const f=fixture('RecapTemplates',{file:'src/components/enrollment/RecapTemplates.jsx',fetchWithClerk:async()=>Response.json({templates:recap.RECAP_DEFAULTS})});
 try{f.h.mount(()=>f.Component());await f.h.flush();assert.ok(text(f.h.value).includes(recap.RECAP_SAMPLE.firstName));assert.ok(nodes(f.h.value).some(n=>n.type==='button'&&text(n)==='planName'));assert.equal(nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='confirmationNumber').props.disabled,true);nodes(f.h.value).find(n=>n.type==='select').props.onChange({target:{value:'pdf'}});await f.h.flush();assert.ok(text(f.h.value).includes(recap.RECAP_SAMPLE.confirmationNumber));}finally{f.h.unmount();}
});
test('settings entry is admin-only, switch-gated, and new components add no boxes or heavy weights',()=>{
 const settings=readFileSync('src/components/TenantSettings.jsx','utf8');assert.match(settings,/canAdmin&&features.CLIENT_RECAP_ENABLED&&<RecapTemplates/);
 for(const file of ['src/components/enrollment/ClientRecap.jsx','src/components/enrollment/RecapTemplates.jsx'])assert.doesNotMatch(readFileSync(file,'utf8'),/fontWeight:\s*(?:[6-9]00|bold)|border\s*:|boxShadow\s*:/);
});
test('ineligible revision preserves out-of-date history and withholds approval controls',async()=>{
 const f=fixture('RecapPanel',{fetchWithClerk:async()=>Response.json({can_send:false,error:'Missing: effective date.',history:[{id:'one',channel:'pdf',status:'downloaded',approved_by:'staff',approved_at:'2026-11-16T00:00:00Z',out_of_date:true}]},{status:422})});
 try{f.h.mount(()=>f.Component({enrollmentId:'one'}));nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();assert.ok(text(f.h.value).includes('Out of date'));assert.ok(text(f.h.value).includes('Missing: effective date.'));assert.ok(!nodes(f.h.value).some(n=>n.type==='input'));}finally{f.h.unmount();}
});
