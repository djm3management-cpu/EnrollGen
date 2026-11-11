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
test('run now requires inline confirmation and polls the active run',async()=>{
 const f=fixture();try{await f.h.flush();const flow=f.nodes().find(n=>typeof n.type==='function'&&n.type.name==='Flow');const button=walk(flow.props.actions).find(n=>n.type==='button'&&n.children.includes('Run Conversely now'));assert.ok(button);button.props.onClick();f.h.render();const confirm=walk(f.nodes().find(n=>typeof n.type==='function'&&n.type.name==='Flow').props.actions).find(n=>n.type==='button'&&n.children.includes('Confirm'));assert.ok(confirm);await confirm.props.onClick();await f.h.flush();assert.equal(f.requests.filter(r=>r.options?.method==='POST').length,1);assert.ok([...f.timers.values()].some(timer=>timer.ms===3000));assert.ok(f.nodes().some(n=>n.props.role==='dialog'));}finally{f.h.unmount();}
});
test('non-admin agent never sees the section and a server denial hides it',async()=>{
 const f=fixture();try{f.auth.user={id:'member'};f.h.render();await f.h.flush();assert.equal(f.h.value,null);assert.equal(f.requests.length,1);f.auth.user={id:'admin'};f.setStatus(403);f.h.render();await f.h.flush();assert.equal(f.h.value,null);}finally{f.h.unmount();}
});
test('zero exceptions renders one line and no bare table',async()=>{
 const f=fixture();try{await f.h.flush();const text=f.nodes().flatMap(n=>n.children.filter(c=>typeof c==='string')).join(' ');assert.ok(text.includes('0 exceptions · all UHC enrollments have valid SunFire codes'));assert.equal(f.nodes().filter(n=>n.type==='table').length,0);}finally{f.h.unmount();}
});
test('gap day and failed week feed heatmap and history',async()=>{
 const f=fixture();try{const d=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});f.setData({...empty(),reconciliation:[{day:d,enrollments:4,expected_uploads:5,uploaded:2,failed:1,missing_codes:1}],weekly:{...empty().weekly,run:{id:'run',week_start:'2026-10-26',status:'complete',started_at:'2026-10-30T15:00:00Z'},history:[{week_start:'2026-10-26',run:{status:'complete',started_at:'2026-10-30T15:00:00Z'},submitted:1,skipped:0,failed:1,other_skipped:0}],results:[{agent_id:'a',agent_name:'Agent A',status:'failed',reason:'http_503',attempts:5}]}});await f.h.flush();const text=f.nodes().flatMap(n=>n.children.filter(c=>typeof c==='string')).join(' ');assert.ok(text.includes('Agent A'));assert.ok(f.nodes().some(n=>typeof n.props.className==='string'&&n.props.className.includes('cu-history-block bad')));const heatmap=f.nodes().find(n=>typeof n.type==='function'&&n.type.name==='Heatmap');assert.equal(heatmap.props.rows.length,1);}finally{f.h.unmount();}
});
