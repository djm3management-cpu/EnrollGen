import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {complianceViewModel,complianceItemStatus} from '../src/lib/complianceScore.js';
import {ACTIVE_RULE_CATALOG,ruleMatchesProduct} from '../src/compliance/rules/catalog.js';
const h=(type,props,...children)=>({type,props:props||{},children});
const nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)];
const text=x=>x==null||typeof x==='boolean'?'':typeof x!=='object'?String(x):(x.children||[]).flat(Infinity).map(text).join(' ');
function component(file,name,bindings){const source=readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default /gm,'').replace(/^export /gm,'');const context=vm.createContext({h,Fragment:'fragment',...bindings});vm.runInContext(transformSync(source,{loader:'jsx',jsxFactory:'h',jsxFragment:'Fragment',format:'cjs'}).code+`;globalThis.component=${name}`,context);return context.component;}
test('review renders category bands, stable points, all filters and clickable evidence including zero',async()=>{
 const hooks=hookHarness(),getToken=async()=>'';
 const items=['pass','fail','partial','review','na'].map((result,n)=>({id:String(n),category:'CALL_OPENING',intent_code:`RULE_${n}`,question_text:result,result,points_earned:n===0?2:n===2?1:0,points_possible:n<3?2:0,evidence_text:'Fixture',evidence_timestamp_ms:0}));
 const data={call:{call_duration_seconds:3026,metadata:{}},items,versions:[],coverage:{complete:false,ratio:.66,endMs:1998000,durationMs:3026000},admin:false};
 const Modal=component('../src/components/callDetail/ComplianceReviewModal.jsx','ComplianceReviewModal',{...hooks.hooks,useAppAuth:()=>({getToken}),URLSearchParams,fetch:async()=>({ok:true,json:async()=>data}),complianceViewModel,complianceItemStatus,scoringFailureMessage:()=>null,evaluateRules:()=>({timeline:{}}),redactSensitiveText:v=>v,CallTranscriptPlayer:'player',formatCallDateTime:()=>''});
 hooks.mount(()=>Modal({callRecordId:'call',onClose(){}}));await hooks.flush();
 assert.equal(nodes(hooks.value).filter(n=>n.type==='tbody')[0].children[0].length,5);
 assert.match(text(hooks.value),/3\s*\/\s*6\s*·\s*50.0%\s*· provisional/);assert.match(text(hooks.value),/not final/);
 const filters=nodes(hooks.value).find(n=>n.props.className==='compliance-overhaul-filters');
 nodes(filters).find(n=>n.type==='button'&&text(n)==='fail').props.onClick();hooks.render();
 assert.equal(nodes(hooks.value).find(n=>n.type==='tbody').children[0].length,1);assert.match(text(hooks.value),/3\s*\/\s*6\s*·\s*50.0%/);
 nodes(hooks.value).find(n=>n.props.className==='compliance-time-link').props.onClick();hooks.render();
 assert.equal(nodes(hooks.value).find(n=>n.type==='player').props.seekRequest.seconds,0);
 assert.ok(nodes(hooks.value).some(n=>n.props.className==='compliance-summary-tiles'));
 hooks.unmount();
});
test('reference catalog counts follow selected product and contain no dead sort controls',()=>{
 const hooks=hookHarness();const Accordion=component('../src/components/ComplianceIntentAccordion.jsx','ComplianceIntentAccordion',{...hooks.hooks,ACTIVE_RULE_CATALOG,ruleMatchesProduct,ChevronDown:'chevron'});
 hooks.mount(()=>Accordion({product:'MA'}));assert.match(text(hooks.value),/135\s+FLAGS/);
 nodes(hooks.value).find(n=>n.type==='button').props.onClick();hooks.render();
 assert.equal(nodes(hooks.value).filter(n=>n.props.className==='ops-terminal-tabs').length,0);
 nodes(hooks.value).find(n=>n.type==='select').props.onChange({target:{value:'ANNUITY'}});hooks.render();assert.match(text(hooks.value),/24\s+FLAGS/);assert.doesNotMatch(text(hooks.value),/152/);hooks.unmount();
});
