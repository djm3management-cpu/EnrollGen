import * as adminReviewApi from '../src/lib/adminReviewApi.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const code=transformSync(readFileSync(new URL('../src/components/callLog/ComplianceUploads.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs',jsxFactory:'element',jsxFragment:'fragment'}).code;
const empty=()=>({admin:true,ix_environment:'TEST',failures:[],missing:[],reconciliation:[],weekly:{available:true,enabled:true,worker_available:true,current_week:'2026-10-26',run:null,results:[]}});
function fixture(){
 const h=hookHarness(),module={exports:{}},requests=[],timers=new Map();let timerId=0,status=200,data=empty(),postStatus=202;
 const auth={getToken:async()=> 'token',user:{id:'admin'},organization:{id:'org-a'}};
 vm.runInNewContext(code,{
  module,exports:module.exports,Date,element:(type,props,...children)=>({type,props:props||{},children}),fragment:'fragment',
  setInterval:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearInterval:id=>timers.delete(id),
  require(name){
   if(name==='react')return h.hooks;
   if(name.endsWith('/adminReviewApi.js'))return adminReviewApi;
   if(name.endsWith('/useAdminReviewAccess.js'))return {useAdminReviewAccess:()=>({identity:`${auth.user?.id||''}:${auth.organization?.id||''}`,canReview:auth.user?.id?.startsWith('admin')===true})};
   if(name.endsWith('/EnrollmentIntake'))return {__esModule:true,default:'enrollment-intake'};
   if(name.endsWith('/AuthContext'))return {useAppAuth:()=>auth};
   if(name.endsWith('/clerkFetch.js'))return {fetchWithClerk:async(_token,url,options)=>{
    requests.push({url,options});
    if(options?.method==='POST'){
     if(postStatus!==202)return Response.json({error:'Conversely uploads are disabled on the worker.'},{status:postStatus});
     data={...data,weekly:{...data.weekly,run:{id:'run',week_start:'2026-10-26',trigger:'manual',requested_at:'2026-10-30T15:00:00Z',status:'pending'},results:[]}};
     return Response.json({accepted:true,run_id:'run'},{status:202});
    }
    return Response.json(data,{status});
   }};
   throw Error('Unexpected import '+name);
  },
 });
 h.mount(()=>module.exports.default());return {h,auth,requests,timers,nodes:()=>walk(h.value),setData:next=>{data=next;},setStatus:next=>{status=next;},setPostStatus:next=>{postStatus=next;}};
}
test('admin run button posts one action, disables while active, polls promptly, and renders last-run outcomes per agent',async()=>{
 const f=fixture();try{
  await f.h.flush();let button=f.nodes().find(n=>n.type==='button'&&n.children.includes('Run Conversely now'));assert.ok(button);assert.equal(button.props.disabled,false);
  await button.props.onClick();await f.h.flush();
  assert.equal(f.requests.filter(r=>r.options?.method==='POST').length,1);assert.deepEqual(JSON.parse(f.requests.find(r=>r.options?.method==='POST').options.body),{action:'run_conversely_now'});
  button=f.nodes().find(n=>n.type==='button'&&n.children.includes('Run Conversely now'));assert.equal(button.props.disabled,true);assert.ok([...f.timers.values()].some(timer=>timer.ms===3000));
  f.setData({...empty(),weekly:{...empty().weekly,run:{id:'run',week_start:'2026-10-26',trigger:'manual',started_at:'2026-10-30T15:00:00Z',status:'complete'},results:[
   {agent_id:'a',agent_name:'Agent A',status:'submitted',reason:'selected',attempts:1},{agent_id:'b',agent_name:'Agent B',status:'skipped',reason:'already_submitted',attempts:0},{agent_id:'c',agent_name:'Agent C',status:'failed',reason:'conversely_http_503',attempts:5},
  ]}});
  [...f.timers.values()][0].fn();await f.h.flush();
  const text=f.nodes().flatMap(n=>n.children.filter(c=>typeof c==='string'||typeof c==='number')).join(' ');
  for(const value of ['Agent A','Agent B','Agent C','submitted','skipped','failed','already submitted','Last run:','2026-10-26'])assert.ok(text.includes(value),value);
  assert.equal(f.nodes().find(n=>n.type==='button'&&n.children.includes('Run Conversely now')).props.disabled,false);
 }finally{f.h.unmount();}
});
test('non-admin responses hide the panel and controls, including after an identity change',async()=>{
 const f=fixture();try{
  f.setStatus(403);await f.h.flush();assert.equal(f.h.value,null);
  const deniedRequests=f.requests.length;f.setStatus(200);[...f.timers.values()][0].fn();await f.h.flush();assert.equal(f.requests.length,deniedRequests,'403 stops further requests for this identity');
  f.auth.user={id:'admin-refreshed'};f.h.render();await f.h.flush();assert.ok(f.nodes().some(n=>n.type==='button'&&n.children.includes('Run Conversely now')));
  f.setStatus(403);f.auth.user={id:'member'};f.h.render();assert.equal(f.h.value,null);await f.h.flush();assert.equal(f.h.value,null);
 }finally{f.h.unmount();}
});
test('disabled/stale workers disable the button and server rejection shows inline without removing the panel',async()=>{
 const f=fixture();try{
  f.setData({...empty(),weekly:{...empty().weekly,enabled:false}});await f.h.flush();assert.equal(f.nodes().find(n=>n.type==='button'&&n.children.includes('Run Conversely now')).props.disabled,true);
  f.setData(empty());[...f.timers.values()][0].fn();await f.h.flush();f.setPostStatus(409);
  await f.nodes().find(n=>n.type==='button'&&n.children.includes('Run Conversely now')).props.onClick();await f.h.flush();assert.ok(f.nodes().some(n=>n.props.role==='alert'));assert.equal(f.h.value.type,'details');
 }finally{f.h.unmount();}
});

test('IX attention and duplicate errors render and missing/invalid codes open the native intake',async()=>{
 const f=fixture();try{
  f.setData({...empty(),missing:[{call_id:'call-a',agent_name:'Agent A',call_start:'2026-10-30T15:00:00Z'}],failures:[
   {id:'a',provider:'UHC IX',call_id:'call-a',status:'needs_attention',last_error:'invalid_sunfire_code',provider_message:'Enrollment code unknown',attempts:1},
   {id:'b',provider:'UHC IX',call_id:'call-b',status:'duplicate_on_sunfire',last_error:'duplicate_on_sunfire',attempts:1},
  ]});await f.h.flush();
  const text=f.nodes().flatMap(n=>n.children.filter(c=>typeof c==='string')).join(' ');
  for(const value of ['needs_attention','invalid_sunfire_code','Enrollment code unknown','duplicate_on_sunfire'])assert.ok(text.includes(value));
  f.nodes().find(n=>n.type==='button'&&n.children.includes('Edit enrollment / SunFire code')).props.onClick();f.h.render();
  const intake=f.nodes().find(n=>n.type==='enrollment-intake');assert.ok(intake);assert.equal(intake.props.callId,'call-a');
  intake.props.onSaved();await f.h.flush();assert.ok(!f.nodes().some(n=>n.type==='enrollment-intake'));
  assert.ok(!f.requests.some(r=>r.options?.method==='PATCH'));
 }finally{f.h.unmount();}
});


test('IX environment is visible, filters request the selected type, and Retry is limited to admins with unfinalized failures',async()=>{
 const f=fixture();try{
  const rows=[
   {id:'test-failure',provider:'UHC IX',call_id:'test-call',status:'needs_attention',last_error:'upload_url_expired',attempts:1,is_test_enrollment:true},
   {id:'real-failure',provider:'UHC IX',call_id:'real-call',status:'failed',last_error:'ix_http_400',attempts:5,is_test_enrollment:false},
   {id:'finalized',provider:'UHC IX',status:'failed',attempts:1,finalized_at:'2026-10-30T15:00:00Z'},
   {id:'duplicate',provider:'UHC IX',status:'duplicate_on_sunfire',attempts:1},
  ];
  f.setData({...empty(),failures:rows});await f.h.flush();
  assert.ok(f.nodes().some(n=>n.type==='summary'&&n.children.includes('TEST')));
  assert.equal(f.nodes().filter(n=>n.type==='button'&&n.children.includes('Retry')).length,2);
  await f.nodes().find(n=>n.type==='button'&&n.children.includes('Retry')).props.onClick();await f.h.flush();
  assert.deepEqual(JSON.parse(f.requests.find(r=>r.options?.method==='POST').options.body),{action:'retry_ix_upload',id:'test-failure'});
  f.nodes().find(n=>n.type==='select').props.onChange({target:{value:'test'}});await f.h.flush();
  assert.ok(f.requests.some(r=>r.url.endsWith('enrollment_type=test')));
  assert.equal(f.nodes().filter(n=>n.type==='button'&&n.children.includes('Retry')).length,1);
  f.setData({...empty(),admin:false,failures:rows});[...f.timers.values()][0].fn();await f.h.flush();
  assert.equal(f.nodes().filter(n=>n.type==='button'&&n.children.includes('Retry')).length,0);
  f.setData({...empty(),ix_environment:'PRODUCTION',failures:rows});[...f.timers.values()][0].fn();await f.h.flush();
  assert.ok(f.nodes().some(n=>n.type==='summary'&&n.children.includes('PRODUCTION')));
 }finally{f.h.unmount();}
});
