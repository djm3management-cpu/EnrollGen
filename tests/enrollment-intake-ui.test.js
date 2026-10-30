import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import * as domain from '../src/lib/enrollmentIntake.js';
const source=readFileSync(new URL('../src/components/enrollment/EnrollmentIntake.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
const compiled=transformSync(source,{loader:'jsx',jsxFactory:'element',format:'cjs'}).code;
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
function fixture(){
 const h=hookHarness(),requests=[],timers=new Map();let timerId=0,saved=0,closed=0;
 const prefill={...domain.emptyIntake('Mike Shiomos'),firstName:'Jane',lastName:'Doe',dob:'1955-02-28',phone:'2125550101',state:'NY',mbi:'1ab2cd3ef45',prevCarrier:'Original Medicare',newCarrier:'Aetna',planName:'Manual Plan',enrollCode:'AEP',premium:'0',contractId:'H1234',planId:'001',sixtyDayDate:'2027-03-02'};
 const getToken=()=> 'token';
 const component=vm.runInNewContext(compiled+';EnrollmentIntake',{
  ...h.hooks,...domain,Event,encodeURIComponent,
  useAppAuth:()=>({getToken}),useCurrentAgent:()=>({agentUuid:'agent'}),useContactsList:()=>({contacts:[{id:'contact',first_name:'Jane',last_name:'Doe'}]}),contactDisplayName:c=>`${c.first_name} ${c.last_name}`,
  notifyFollowUpsUpdated(){},OpportunityDialog:'dialog',
  setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),
  window:{dispatchEvent(){}},element:(type,props,...children)=>({type,props:props||{},children}),
  fetchWithClerk:async(token,url,options)=>{
   requests.push({url,options});
   return Response.json(options?{saved:true,id:'intake'}:url.includes('&plans=')?{plans:[{id:1,plan_name:'Landscape Plan',contract_id:'H9999',plan_id:'012',segment_id:'2',monthly_premium:25.5}]}:{intakes:[],prefill,contact_id:'contact'});
  },
 });
 h.mount(()=>component({callId:'call',onClose:()=>closed++,onSaved:()=>saved++}));
 const nodes=()=>walk(h.value);
 return {h,requests,timers,nodes,field:key=>nodes().find(n=>n.props.id===`intake-${key}`),counts:()=>({saved,closed})};
}
test('native form prefills, formats as typed, toggles conditional fields and recalculates editable follow-up',async()=>{
 const f=fixture();try{
  await f.h.flush();assert.equal(f.field('firstName').props.value,'Jane');assert.equal(f.field('phone').props.value,'(212) 555-0101');
  assert.equal(f.field('medicaidNum'),undefined);assert.equal(f.field('hraDate'),undefined);
  f.field('medicaid').props.onChange({target:{value:'Yes'}});f.field('hra').props.onChange({target:{value:'Yes'}});await f.h.flush();assert.ok(f.field('medicaidNum'));assert.ok(f.field('hraDate'));
  f.field('phone').props.onChange({target:{value:'3125550199'}});f.field('mbi').props.onChange({target:{value:'1ab2cd3ef45'}});f.field('effectiveDate').props.onChange({target:{value:'2027-01-01'}});await f.h.flush();
  assert.equal(f.field('phone').props.value,'(312) 555-0199');assert.equal(f.field('mbi').props.value,'1AB2-CD3-EF45');assert.equal(f.field('sixtyDayDate').props.value,'2027-03-02');
  f.field('sixtyDayDate').props.onChange({target:{value:'2027-04-01'}});f.field('premium').props.onChange({target:{value:'0'}});await f.h.flush();f.field('premium').props.onBlur();await f.h.flush();assert.equal(f.field('premium').props.value,'$0.00');assert.equal(f.field('sixtyDayDate').props.value,'2027-04-01');
 }finally{f.h.unmount();}
});
test('plan dropdown autofills editable plan fields and failed validation highlights fields before any POST',async()=>{
 const f=fixture();try{
  await f.h.flush();for(const callback of f.timers.values())callback();f.timers.clear();await f.h.flush();
  const picker=f.nodes().find(n=>n.type==='select'&&n.children.flat(Infinity).some(c=>c?.props?.value===1));assert.ok(picker);
  picker.props.onChange({target:{value:'1'}});await f.h.flush();assert.equal(f.field('planName').props.value,'Landscape Plan');assert.equal(f.field('contractId').props.value,'H9999');assert.equal(f.field('planId').props.value,'012');assert.equal(f.field('segmentId').props.value,'2');assert.equal(f.field('premium').props.value,'$25.50');assert.equal(f.field('planName').props.disabled,false);
  f.field('newCarrier').props.onChange({target:{value:'UnitedHealthcare'}});f.field('firstName').props.onChange({target:{value:''}});await f.h.flush();
  await f.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await f.h.flush();assert.equal(f.field('firstName').props['aria-invalid'],true);assert.equal(f.field('sunfireCode').props['aria-invalid'],true);assert.equal(f.requests.filter(r=>r.options).length,0);
  f.field('firstName').props.onChange({target:{value:'Jane'}});f.field('sunfireCode').props.onChange({target:{value:'SF-123'}});await f.h.flush();
  await f.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await f.h.flush();assert.equal(f.requests.filter(r=>r.options).length,1);assert.deepEqual(f.counts(),{saved:1,closed:1});
 }finally{f.h.unmount();}
});
