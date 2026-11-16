import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import * as domain from '../src/lib/reshopList.js';
const element=(type,props,...children)=>({type,props:props||{},children});
const nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)];
const text=x=>nodes(x).flatMap(n=>n.children||[]).filter(v=>typeof v==='string').join(' ');
function fixture(name,overrides={}){
 const h=hookHarness(),getToken=async()=>'synthetic';
 const source=readFileSync('src/components/contacts/ReshopList.jsx','utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const Component=vm.runInNewContext(transformSync(source,{loader:'jsx',jsxFactory:'element',jsxFragment:'fragment',format:'cjs'}).code+`;${name};`,{...h.hooks,...domain,element,fragment:'fragment',URLSearchParams,Date,useAppAuth:()=>({getToken}),useTenantConfig:()=>({features:{}}),evidenceRequest:()=>assert.fail('unexpected API'),...overrides});return {h,Component};
}
const row={id:'enrollment',contact_id:'consumer',client:'Synthetic Client',carrier:'Synthetic Carrier',year:2026,coverage:'MA',current:{contract_id:'H0001',plan_id:'001',segment_id:'000'},successors:[],county_confirmed:false,permission:{on_file:true,date:'2026-01-01',expiry:'2030-01-01'},reasons:['terminated'],agent:'Synthetic Agent',review:{outcome:null},group:'needs_review'};
test('off switch mounts no hooks or data requests',()=>{const f=fixture('ReshopList');assert.equal(f.Component({}),null);});
test('workspace renders reason counts, five filters and initially collapsed renewing group',async()=>{
 const requests=[],f=fixture('ReshopWorkspace',{evidenceRequest:async(_token,path)=>{requests.push(path);return {rows:[row,{...row,id:'renewal',group:'renewing',reasons:['renewing']}],total:2,counts:{terminated:1,renewing:1},options:{agents:[{id:'agent',name:'Synthetic Agent'}],carriers:['Synthetic Carrier'],states:['NJ']}};}});
 try{f.h.mount(()=>f.Component({onOpenContact(){}}));await f.h.flush();assert.equal(nodes(f.h.value).filter(n=>n.type==='select').length,5);assert.equal(nodes(f.h.value).find(n=>n.type==='details').props.open,false);assert.ok(text(f.h.value).includes('Plan terminated or not renewed'));
  nodes(f.h.value).find(n=>n.props['aria-label']==='All review states').props.onChange({target:{value:'unreviewed'}});await f.h.flush();assert.ok(requests.at(-1).includes('review=unreviewed'));
  for(const node of nodes(f.h.value))assert.ok(!node.props.style?.fontWeight||node.props.style.fontWeight<=500);
 }finally{f.h.unmount();}
});
test('row opens existing contact path, displays county uncertainty and only sends explicit task/review actions',async()=>{
 const requests=[],opens=[],f=fixture('ReshopRow',{evidenceRequest:async(_token,path,body)=>{requests.push({path,body});return {outcome:body.outcome,use_do_not_call_control:body.outcome==='asked_not_to_be_contacted'};}});
 try{f.h.mount(()=>f.Component({row,onOpenContact:id=>opens.push(id),onChanged(){}}));await f.h.flush();assert.ok(text(f.h.value).includes('County not confirmed'));assert.ok(text(f.h.value).includes('Permission on file'));nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Synthetic Client').props.onClick();assert.deepEqual(opens,['consumer']);assert.equal(requests.length,0);
  await nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Add task').props.onClick();await f.h.flush();assert.equal(requests.at(-1).body.action,'task');
  nodes(f.h.value).find(n=>n.type==='select').props.onChange({target:{value:'asked_not_to_be_contacted'}});await f.h.flush();await nodes(f.h.value).find(n=>n.type==='button'&&text(n)==='Mark reviewed').props.onClick();await f.h.flush();assert.equal(requests.at(-1).body.outcome,'asked_not_to_be_contacted');assert.ok(text(f.h.value).includes('Use contact do-not-call control'));assert.equal(requests.length,2);
 }finally{f.h.unmount();}
});
test('existing PTC flags and dates render without changing or inferring consent',()=>{
 assert.equal(domain.permissionLabel({}), 'Permission not on file');assert.equal(domain.permissionLabel({on_file:true}),'Permission date not recorded');assert.equal(domain.permissionLabel({on_file:true,date:'2030-01-01',expiry:'2031-01-01'},'2026-01-01'),'Permission not yet effective');assert.equal(domain.permissionLabel({on_file:true,date:'2020-01-01',expiry:'2021-01-01'},'2026-01-01'),'Permission expired');
});

test('independent integrations image includes the shared application switch module',()=>{assert.match(readFileSync('integrations/Dockerfile','utf8'),/COPY src\/lib\/reshopList\.js/);});
