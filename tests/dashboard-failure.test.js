import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {evidenceRequest} from '../src/lib/evidenceApi.js';
import * as metrics from '../src/lib/dashboardMetrics.js';
import * as scope from '../src/lib/dashboardScope.js';

const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const element=(type,props,...children)=>({type,props:props||{},children});
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const getToken=async()=> 'test-jwt';
function statusFixture(){
 const h=hookHarness(),listeners=new Map(),module={exports:{}};
 const auth={getToken,user:{id:'agent-a'},organization:{id:'org-a'}};
 vm.runInNewContext(transformSync(source('../src/components/AgentStatusLog.jsx'),{loader:'jsx',format:'cjs',jsxFactory:'element'}).code,{
  module,exports:module.exports,Date,Intl,URLSearchParams,element,
  window:{setInterval:fn=>{listeners.set('timer',fn);return 1;},clearInterval(){},addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)},
  require(name){
   if(name==='react')return {...h.hooks,useId:()=> 'status-log'};
   if(name.endsWith('/AuthContext'))return {useAppAuth:()=>auth};
   if(name.endsWith('/evidenceApi'))return {evidenceRequest};
   throw Error(`Unexpected import: ${name}`);
  },
 });
 h.mount(()=>module.exports.default());return {h,listeners,nodes:()=>walk(h.value)};
}
const history={rows:[{id:'1',agent_name:'Agent A',status:'available',changed_at:'2026-10-29T13:00:00Z'}],agents:[{agent_id:'agent_a',agent_name:'Agent A'}],count:1};
for(const [label,response,error] of [
 ['Vite HTML fallback',()=>new Response('<!doctype html><html>EnrollGen</html>',{headers:{'Content-Type':'text/html'}}),/API returned an invalid response/],
 ['malformed JSON',()=>new Response('{broken',{headers:{'Content-Type':'application/json'}}),/invalid response/],
 ['missing arrays',()=>Response.json({}),/Status history returned an invalid response/],
 ['null payload',()=>Response.json(null),/Status history returned an invalid response/],
 ['null rows',()=>Response.json({...history,rows:null}),/invalid response/],
 ['invalid agent options',()=>Response.json({...history,agents:[null]}),/invalid response/],
 ['invalid timestamp',()=>Response.json({...history,rows:[{...history.rows[0],changed_at:'invalid'}]}),/invalid response/],
 ['failed schema query',()=>Response.json({error:'Status history query failed.'},{status:503}),/Status history query failed/],
 ])test(`status log displays ${label} inline without throwing during render`,async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>response();const f=statusFixture();
 try{
  await f.h.flush();assert.equal(f.h.value.props['aria-busy'],false);
  const alert=f.nodes().find(n=>n.props.role==='alert');assert.ok(alert);assert.match(alert.children.join(''),error);
  assert.ok(f.nodes().some(n=>n.type==='h2'&&n.children.includes('Agent Status Log')));
  assert.ok(f.nodes().some(n=>n.type==='button'&&n.children.includes('Refresh log')&&!n.props.disabled));
 }finally{f.h.unmount();globalThis.fetch=previous;}
});
test('status-log failure retains previously loaded rows and manual retry recovers',async()=>{
 const previous=globalThis.fetch;let fail=false;globalThis.fetch=async()=>fail?Response.json({error:'Query unavailable'},{status:503}):Response.json(history);const f=statusFixture();
 try{
  await f.h.flush();assert.equal(f.nodes().filter(n=>n.props.role==='alert').length,0);
  assert.ok(f.nodes().some(n=>n.type==='time'));
  fail=true;await f.listeners.get('timer')();await f.h.flush();
  assert.ok(f.nodes().find(n=>n.props.role==='alert'));assert.ok(f.nodes().some(n=>n.type==='time'),'keep last successful rows');
  fail=false;f.nodes().find(n=>n.type==='button'&&n.children.includes('Refresh log')).props.onClick();await f.h.flush();
  assert.equal(f.nodes().filter(n=>n.props.role==='alert').length,0);assert.ok(f.nodes().some(n=>n.type==='time'));
 }finally{f.h.unmount();globalThis.fetch=previous;}
});

function dashboardFixture(failedSource){
 const h=hookHarness(),module={exports:{}};
 const tables={enrolled_agents:[],call_records:[],contacts:[]};
 const client={from(table){
  const builder=new Proxy({}, {get(_,method){
   if(method==='then')return (resolve,reject)=>Promise.resolve(table===failedSource?{data:null,error:{message:`${table} query failed`}}:{data:tables[table],error:null}).then(resolve,reject);
   return ()=>builder;
  }});return builder;
 }};
 const roster=[];
 vm.runInNewContext(transformSync(source('../src/hooks/useDashboardData.js'),{loader:'js',format:'cjs'}).code,{
  module,exports:module.exports,Date,
  window:{setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}},
  require(name){
   if(name==='react')return h.hooks;
   if(name.endsWith('/useTenantConfig'))return {useTenantConfig:()=>({supabaseClient:client,tenant:{id:'tenant-a'},agents:roster,loading:false})};
   if(name.endsWith('/AuthContext'))return {useAppAuth:()=>({getToken})};
   if(name.endsWith('/AvailabilityContext'))return {useAvailability:()=>({agentId:'agent_a'})};
   if(name.endsWith('/evidenceSupabase'))return {getEvidenceSupabase:()=>client};
   if(name.endsWith('/dashboardMetrics'))return metrics;
   if(name.endsWith('/dashboardScope'))return scope;
   if(name.endsWith('/callLogApi'))return {loadCallLogPages:async()=>{if(failedSource==='call-log')throw Error('call-log query failed');return [];}};
   throw Error(`Unexpected import: ${name}`);
  },
 });
 h.mount(()=>module.exports.useDashboardData('user-a'));return h;
}
for(const table of ['enrolled_agents','call_records','contacts','call-log'])test(`${table} failure stays in the dashboard's inline error state`,async()=>{
 const data=dashboardFixture(table),view=hookHarness();
 try{
  await data.flush();assert.equal(data.value.loading,false);assert.match(data.value.error,/query failed/);
  const code=source('../src/components/AgentDashboard.jsx').replace(/^import .*;\n/gm,'').replace('export default function','function');
  const Dashboard=vm.runInNewContext(transformSync(code,{loader:'jsx',format:'cjs',jsxFactory:'element',jsxFragment:'fragment'}).code+';AgentDashboard',{
   ...view.hooks,...metrics,useId:()=> 'dashboard',useDashboardData:()=>data.value,element,fragment:'fragment',
   ParagonCallbackBadge:'ParagonCallbackBadge',AgentStatusLog:'AgentStatusLog',callOutcomeLabel:code=>code,
  });
  view.mount(()=>Dashboard({userId:'user-a'}));await view.flush();
  assert.ok(walk(view.value).some(n=>n.props.role==='alert'));
  assert.ok(walk(view.value).some(n=>n.type==='h2'&&n.children.includes('Calls vs Sales')));
  assert.ok(walk(view.value).some(n=>n.type==='AgentStatusLog'));
 }finally{view.unmount();data.unmount();}
});
