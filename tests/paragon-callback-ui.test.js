import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {readCrmLocation} from '../src/lib/crmRoutes.js';
import {followUpBucket} from '../src/lib/followUps.js';
import * as callbacks from '../src/lib/paragonCallbacks.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const element=(type,props,...children)=>({type,props:props||{},children});
const compile=text=>transformSync(text,{loader:'jsx',format:'cjs',jsxFactory:'element',jsxFragment:'fragment'}).code;
function badgeFixture(){
 const h=hookHarness(),module={exports:{}},listeners=new Map();let count=2,error=false;
 const auth={getToken:async()=> 'token',user:{id:'user-a'},organization:{id:'org-a'}};
 vm.runInNewContext(compile(source('../src/components/ParagonCallbackBadge.jsx')),{
  module,exports:module.exports,element,
  window:{setInterval:fn=>{listeners.set('timer',fn);return 1;},clearInterval(){},addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)},
  require(name){
   if(name==='react')return h.hooks;
   if(name.endsWith('/AuthContext'))return {useAppAuth:()=>auth};
   if(name.endsWith('/evidenceApi'))return {evidenceRequest:async(_token,url)=>{assert.equal(url,'paragon-zip-confirm?summary=1');if(error)throw Error('API down');return {count};}};
   if(name.endsWith('/followUps'))return {FOLLOW_UPS_UPDATED:'tasks-updated'};
   if(name.endsWith('/paragonCallbacks'))return callbacks;
   throw Error(`Unexpected import ${name}`);
  },
 });
 h.mount(()=>module.exports.default());return {h,listeners,auth,setCount:value=>{count=value;},setError:value=>{error=value;}};
}
test('dashboard badge shows only positive own counts, links to the filtered CRM task list, and hides on zero/failure',async()=>{
 const f=badgeFixture();try{
  await f.h.flush();assert.equal(f.h.value.type,'a');assert.equal(f.h.value.props.href,'/crm/followups?source=paragon');assert.equal(f.h.value.children.join(''),'2 Paragon callbacks');
  assert.equal(readCrmLocation('https://app.test'+f.h.value.props.href).taskSource,'paragon');
  f.setCount(0);await f.listeners.get('tasks-updated')();await f.h.flush();assert.equal(f.h.value,null);
  f.setCount(75);await f.listeners.get('timer')();await f.h.flush();assert.equal(f.h.value.children.join(''),'75 Paragon callbacks');
  f.auth.user={id:'user-b'};f.h.render();assert.equal(f.h.value,null,'never show a previous user’s count');await f.h.flush();
  f.setError(true);await f.listeners.get('timer')();await f.h.flush();assert.equal(f.h.value,null);
 }finally{f.h.unmount();}
});
test('filtered CRM task list includes all open own Paragon callbacks and row shows caller/state/original link and task actions',async()=>{
 const h=hookHarness(),rowHarness=hookHarness();
 const code=source('../src/components/contacts/FollowUpsView.jsx').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const {FollowUpsView,FollowUpRow}=vm.runInNewContext(compile(code)+';({FollowUpsView,FollowUpRow})',{
  ...h.hooks,element,fragment:'fragment',followUpBucket,
 });
 const task={id:'paragon:task-a',source:'paragon',agent_id:'mark',status:'open',due_at:'2020-01-01',reason:callbacks.PARAGON_CALLBACK_LABEL,caller_name:'Jane Doe',caller_phone:'+15555550123',caller_state:'AZ',inbound_call_id:'original-call'};
 const data={agentSlug:'mark',isAdmin:false,now:new Date(),rows:[task,{...task,id:'other',source:undefined},{...task,id:'peer',agent_id:'dylan'},{...task,id:'completed',status:'completed'}],agents:[{name:'Mark',agent_slug:'mark'}],update:async()=>{}};
 h.mount(()=>FollowUpsView({data,initialSource:'paragon'}));await h.flush();
 try{
  const rows=walk(h.value).filter(node=>node.type===FollowUpRow);assert.equal(rows.length,1);assert.equal(rows[0].props.row.id,task.id);
  // The row uses the same React hook contract; inspect it with a separate component instance.
  const rowCode=code.slice(0,code.indexOf('function FollowUpsView('));
  const Row=vm.runInNewContext(compile(rowCode)+';FollowUpRow',{...rowHarness.hooks,element,fragment:'fragment',encodeURIComponent});
  const updates=[];rowHarness.mount(()=>Row({...rows[0].props,update:async(...args)=>updates.push(args)}));await rowHarness.flush();
  const nodes=walk(rowHarness.value);assert.ok(nodes.some(n=>n.children.includes('Jane Doe')));assert.ok(nodes.some(n=>n.children.includes('+15555550123')&&n.children.includes('AZ')));
  assert.equal(nodes.find(n=>n.type==='a').props.href,'/crm/calls?inbound_call_id=original-call');
  assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('RESCHEDULE')));
  await nodes.find(n=>n.type==='button'&&n.children.includes('MARK COMPLETE')).props.onClick();await rowHarness.flush();assert.equal(updates[0][0],task.id);assert.equal(updates[0][1],'complete');
 }finally{rowHarness.unmount();h.unmount();}
});
test('dashboard has a badge, with no Paragon callback task panel',()=>{
 const dashboard=source('../src/components/AgentDashboard.jsx');assert.ok(dashboard.includes('<ParagonCallbackBadge />'));assert.ok(!dashboard.includes('ParagonCallbackTasks'));
});

test('CRM task hook merges regular tasks and callbacks, dispatches correct actions, and preserves regular tasks on callback failure',async()=>{
 const h=hookHarness(),module={exports:{}},updates=[],listeners=new Map();let callbackFailure=false;
 const callback={id:'paragon:abc',source:'paragon',agent_id:'mark',due_at:'2026-10-29',status:'open'};
 const client={from(){const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[{id:'regular',agent_id:'mark',due_at:'2026-10-30',status:'open'}]})};return q;}};
 const getToken=async()=> 'token';
 vm.runInNewContext(compile(source('../src/hooks/useFollowUps.js')),{
  module,exports:module.exports,Date,
  setInterval:()=>1,clearInterval(){},window:{addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)},
  require(name){
   if(name==='react')return h.hooks;
   if(name.endsWith('/AuthContext'))return {useAppAuth:()=>({getToken})};
   if(name.endsWith('/useTenantConfig'))return {useTenantConfig:()=>({tenantId:'tenant',supabaseClient:client,agents:[],loading:false})};
   if(name.endsWith('/useCurrentAgent'))return {useCurrentAgent:()=>({agentUuid:'id',agentSlug:'mark'})};
   if(name.endsWith('/paragonCallbacks'))return {loadParagonCallbacks:async()=>{if(callbackFailure)throw Error('Callbacks unavailable');return [callback];},updateParagonCallback:async(...args)=>updates.push(['paragon',...args])};
   if(name.endsWith('/followUps'))return {FOLLOW_UPS_UPDATED:'tasks-updated',notifyFollowUpsUpdated(){},updateFollowUp:async(...args)=>updates.push(['regular',...args])};
   throw Error(`Unexpected import ${name}`);
  },
 });
 h.mount(()=>module.exports.useFollowUps());
 try{
  await h.flush();assert.deepEqual(Array.from(h.value.rows,row=>row.id),['paragon:abc','regular']);
  await h.value.update('paragon:abc','complete');assert.equal(updates[0][0],'paragon');assert.equal(updates[0][2],'paragon:abc');
  await h.value.update('regular','complete');assert.equal(updates[1][0],'regular');
  callbackFailure=true;await h.value.refresh();await h.flush();assert.deepEqual(Array.from(h.value.rows,row=>row.id),['regular']);assert.match(h.value.error,/Callbacks unavailable/);
 }finally{h.unmount();}
});

test('callback task loader pages past 500 and actions keep Paragon IDs separate from regular task IDs',async()=>{
 const previous=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  if(options.method==='POST')return Response.json({saved:true});
  const offset=Number(new URL(url,'https://app.test').searchParams.get('offset'));
  return Response.json({tasks:Array.from({length:offset?1:500},(_,index)=>({id:String(offset+index),assigned_agent_id:'mark',created_at:'2026-10-29T10:00:00Z'}))});
 };
 try{
  const rows=await callbacks.loadParagonCallbacks(async()=> 'token');assert.equal(rows.length,501);assert.equal(rows[500].id,'paragon:500');assert.equal(rows[0].reason,'Paragon callback: out-of-state');
  assert.ok(requests[1].url.includes('offset=500'));
  await callbacks.updateParagonCallback(async()=> 'token','paragon:task-id','complete');assert.equal(JSON.parse(requests[2].options.body).task_id,'task-id');
  await callbacks.updateParagonCallback(async()=> 'token','paragon:task-id','reschedule','2026-11-02T14:00:00Z');assert.equal(JSON.parse(requests[3].options.body).due_at,'2026-11-02T14:00:00.000Z');
  assert.throws(()=>callbacks.updateParagonCallback(async()=> 'token','paragon:task-id','reschedule','invalid'),/valid due date/);
 }finally{globalThis.fetch=previous;}
});
