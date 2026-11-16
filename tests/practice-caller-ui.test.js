import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {DIFFICULTIES} from '../src/lib/practiceCaller.js';
const element=(type,props,...children)=>({type,props:props||{},children});
const nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)];
const text=x=>nodes(x).flatMap(n=>n.children||[]).filter(v=>typeof v==='string').join(' ');
function fixture(name,overrides={},voice=false){
 const h=hookHarness(),getToken=async()=> 'fixture';let source=readFileSync('src/components/'+(voice?'PracticeVoice':'PracticeCaller')+'.jsx','utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const Component=vm.runInNewContext(transformSync(source,{loader:'jsx',jsxFactory:'element',jsxFragment:'fragment',format:'cjs'}).code+`;${name};`,{...h.hooks,element,fragment:'fragment',lazy:()=>()=>assert.fail('voice must not mount'),Suspense:'suspense',useAppAuth:()=>({getToken,user:{id:'own'},organization:{id:'org'}}),useTenantConfig:()=>({features:{}}),useSessionLock:()=>({locked:false}),evidenceRequest:()=>assert.fail('unexpected API'),DIFFICULTIES,URLSearchParams,Date,setTimeout,clearTimeout,...overrides});return {h,Component};
}
const data={authority:'agent',own_agent_id:'own',scenarios:[{id:'price',title:'Price objection',product:'MA'}],sessions:[],summaries:[]};
const session={id:'session',agent_id:'own',scenario_id:'price',difficulty:'hard',status:'active',turn_limit:60,turn_count:1,expires_at:new Date(Date.now()+1800000).toISOString(),transcript:[{speaker:'agent',text:'May we review your options?',start_ms:0},{speaker:'customer',text:'Yes, I would like to understand them.',start_ms:1000}],collected:[]};
test('off switch mounts no view or voice hooks',()=>{const f=fixture('PracticeCaller');assert.equal(f.Component(),null);});
test('session lock removes practice content',()=>{const f=fixture('PracticeCaller',{useTenantConfig:()=>({features:{PRACTICE_CALLER_ENABLED:true}}),useSessionLock:()=>({locked:true})});assert.equal(f.Component(),null);});
test('view starts selected scenario and difficulty, sends only text, displays live speaker labels and ends',async()=>{
 const requests=[],f=fixture('PracticeView',{evidenceRequest:async(_token,path,body)=>{requests.push({path,body});return body?{session:{...session,status:body.action==='end'?'completed':'active'}}:data;}});
 try{f.h.mount(()=>f.Component({voice:false}));await f.h.flush();nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Start').props.onClick();await f.h.flush();assert.equal(requests.at(-1).body.action,'start');assert.ok(text(f.h.value).includes('Client'));assert.ok(text(f.h.value).includes('Agent'));assert.ok(!text(f.h.value).includes('Speak'));
  nodes(f.h.value).find(n=>n.type==='textarea').props.onChange({target:{value:'I would like to clarify your priorities.'}});await f.h.flush();nodes(f.h.value).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await f.h.flush();assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).body)),{action:'turn',id:'session',text:'I would like to clarify your priorities.'});
  nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='End').props.onClick();await f.h.flush();assert.ok(text(f.h.value).includes('Try again'));
 }finally{f.h.unmount();}
});
test('opening a saved session is one endpoint request and try again uses that same scenario',async()=>{
 const requests=[],saved={...session,status:'completed',result:{score:80,scorecard:{pass_fail:'pass',scorecard_items:[{result:'fail',question_text:'Scope',evidence_timestamp_ms:1000,evidence_text:'Moment'}]},coaching:{did_well:'The agent listened.',objections:[]}}};
 const f=fixture('PracticeView',{evidenceRequest:async(_t,path,body)=>{requests.push({path,body});return path.includes('?id=')?{session:saved}:body?{session}: {...data,sessions:[saved]};}});
 try{f.h.mount(()=>f.Component({voice:false}));await f.h.flush();nodes(f.h.value).find(n=>n.type==='button'&&text(n).includes('Price objection')).props.onClick();await f.h.flush();assert.equal(requests.filter(r=>r.path.includes('?id=')).length,1);assert.ok(text(f.h.value).includes('Moment'));assert.ok(text(f.h.value).includes('The agent listened.'));nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Try again').props.onClick();await f.h.flush();assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).body)),{action:'start',scenario_id:'price',difficulty:'hard'});}finally{f.h.unmount();}
});
test('voice off has no speech import or execution path in the rendered view',async()=>{
 const f=fixture('PracticeView',{evidenceRequest:async(_t,_p,b)=>b?{session}:data});try{f.h.mount(()=>f.Component({voice:false}));await f.h.flush();nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Start').props.onClick();await f.h.flush();assert.ok(!nodes(f.h.value).some(n=>n.type==='suspense'));}finally{f.h.unmount();}
});
test('voice reuses recognition as draft text and browser synthesis only, stopping on hide and cleanup',async()=>{
 const spoken=[],stops=[],listeners=new Map();let options;
 const f=fixture('PracticeVoice',{useSpeechRecognition:input=>{options=input;return {stop:()=>stops.push(1),start:()=>{},listening:false,supportsRecognition:true};},window:{speechSynthesis:{cancel:()=>{},speak:value=>spoken.push(value.text)}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},document:{hidden:false,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)}},true);const drafts=[];let reply={speaker:'customer',text:'First reply.'};
 try{f.h.mount(()=>f.Component({onText:value=>drafts.push(value),reply,disabled:false}));await f.h.flush();options.onNewFinal('A spoken draft.');assert.deepEqual(drafts,['A spoken draft.']);nodes(f.h.value).find(n=>n.type==='input').props.onChange({target:{checked:true}});await f.h.flush();reply={speaker:'customer',text:'Another reply.'};f.h.render();await f.h.flush();assert.deepEqual(spoken,['Another reply.']);assert.ok(stops.length);}finally{f.h.unmount();assert.equal(listeners.size,0);}
});
