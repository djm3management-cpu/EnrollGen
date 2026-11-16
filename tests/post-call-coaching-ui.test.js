import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {OBJECTION_CATEGORIES} from '../src/lib/postCallCoaching.js';
const source=readFileSync('src/components/callDetail/PostCallCoaching.jsx','utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
const element=(type,props,...children)=>({type,props:props||{},children});
const nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)];
const text=x=>nodes(x).flatMap(n=>n.children||[]).filter(v=>typeof v==='string').join(' ');
const note={id:'note',call_id:'call',agent_id:'agent',status:'generated',generated_at:'2026-11-15T12:00:00Z',objections:[{category:'price',start_ms:1000,end_ms:3000,description:'The consumer asked about cost.',agent_response:'The agent acknowledged the concern.',stronger_answer:'Let us check the approved documents together.'}],did_well:'The agent listened.'};
function fixture(name,overrides={}){
 const h=hookHarness(),getToken=async()=> 'fixture';
 const Component=vm.runInNewContext(transformSync(source,{loader:'jsx',jsxFactory:'element',jsxFragment:'fragment',format:'cjs'}).code+`;${name};`,{
  ...h.hooks,element,fragment:'fragment',useAppAuth:()=>({getToken}),useTenantConfig:()=>({features:{}}),evidenceRequest:()=>assert.fail('unexpected API'),getEvidenceSupabase:()=>assert.fail('unexpected evidence read'),RecordingCell:'recording-cell',OBJECTION_CATEGORIES,formatCallDateTime:v=>v,URLSearchParams,redactSensitiveText:v=>v,...overrides,
 });return {h,Component,getToken};
}
test('disabled coaching mounts no view, hooks, notes or outbound requests',()=>{
 const f=fixture('PostCallCoaching');assert.equal(f.Component({callId:'call'}),null);
});
test('manager view requests filtered pages, shows category counts and appends the next page',async()=>{
 const requests=[],f=fixture('CoachingView',{evidenceRequest:async(_token,path)=>{requests.push(path);const next=path.includes('cursor=');return {notes:[{...note,id:next?'next':'first'}],agents:[{id:'agent',name:'Synthetic'}],authority:'manager',counts:{price:2},next:next?null:'opaque'};}});
 try{
  f.h.mount(()=>f.Component({callId:null}));await f.h.flush();assert.ok(text(f.h.value).includes('price'));assert.ok(text(f.h.value).includes('Period'));assert.equal(nodes(f.h.value).filter(n=>n.type?.name==='CoachingNote').length,1);
  nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Load more').props.onClick();await f.h.flush();assert.equal(nodes(f.h.value).filter(n=>n.type?.name==='CoachingNote').length,2);assert.ok(requests.at(-1).includes('cursor=opaque'));
  nodes(f.h.value).find(n=>n.type==='select'&&n.props.value==='').props.onChange({target:{value:'price'}});await f.h.flush();assert.ok(requests.at(-1).includes('category=price'));assert.ok(!requests.at(-1).includes('cursor='));
 }finally{f.h.unmount();}
});
test('owner review action posts to the existing feature endpoint; peer review is absent',async()=>{
 const requests=[],f=fixture('CoachingNote',{evidenceRequest:async(...args)=>requests.push(args)});let refreshed=0;
 try{f.h.mount(()=>f.Component({note,authority:'agent',ownAgentId:'agent',onChange:()=>{refreshed++;}}));nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Mark as reviewed').props.onClick();await f.h.flush();assert.deepEqual(JSON.parse(JSON.stringify(requests[0][2])),{action:'review',call_id:'call'});assert.equal(refreshed,1);}finally{f.h.unmount();}
 const peer=fixture('CoachingNote');peer.h.mount(()=>peer.Component({note,authority:'manager',ownAgentId:'peer',onChange(){}}));try{assert.ok(!text(peer.h.value).includes('Mark as reviewed'));assert.ok(nodes(peer.h.value).some(n=>n.type==='recording-cell'));}finally{peer.h.unmount();}
});
test('transcript moment reads the audited call transport and selects its actual timed utterance',async()=>{
 const calls=[],f=fixture('TranscriptMoment',{getEvidenceSupabase:()=>({from:table=>({select:projection=>({eq:(key,value)=>({maybeSingle:async()=>{calls.push({table,projection,key,value});return {data:{transcript_diarized:[{start_ms:1000,end_ms:3000,speaker:'customer',text:'Synthetic objection'},{start_ms:9000,end_ms:10000,text:'Outside the moment'}]}};}})})})})});
 try{f.h.mount(()=>f.Component({note,objection:note.objections[0]}));nodes(f.h.value).find(n=>n.type==='button').props.onClick();await f.h.flush();assert.equal(calls[0].table,'call_records');assert.equal(calls[0].value,'call');assert.ok(text(f.h.value).includes('Synthetic objection'));assert.ok(!text(f.h.value).includes('Outside the moment'));}finally{f.h.unmount();}
});
