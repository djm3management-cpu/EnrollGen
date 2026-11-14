import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const nodes=x=>!x||typeof x!=='object'?[]:[x,...(x.children||[]).flat(Infinity).flatMap(nodes)];
const text=x=>nodes(x).flatMap(n=>n.children||[]).filter(v=>typeof v==='string').join(' ');
const element=(type,props,...children)=>({type,props:props||{},children});

test('Daily Verse navigation is absent by default; preload and direct panel rendering require the same server feature',()=>{
 const app=source('src/App.jsx');
 const tabs=vm.runInNewContext(app.slice(app.indexOf('function getTabsForMode('),app.indexOf('function AppShell('))+';getTabsForMode;');
 for(const mode of ['ma','medsup','aca','u65','ancillary']){
  assert.equal(tabs(mode,{}).some(tab=>tab.id==='verse'),false);
  assert.equal(tabs(mode,{DAILY_VERSE_ENABLED:true}).some(tab=>tab.id==='verse'),true);
 }
 assert.match(app,/if \(panelId === "verse" && features.DAILY_VERSE_ENABLED\)/);
 assert.match(app,/case "verse":\s*if \(!features.DAILY_VERSE_ENABLED\) return null;/);
});

function settings(features){
 const h=hookHarness(),tenant={},getToken=async()=> 'credential';let outbound=0;
 const code=source('src/components/TenantSettings.jsx').replace(/^import .*;\n/gm,'').replace(/^export \{.*\};\n/gm,'').replace('export default function','function');
 const component=vm.runInNewContext(transformSync(code,{loader:'jsx',jsxFactory:'element',format:'cjs'}).code+';TenantSettings;',{
  ...h.hooks,element,Check:'Check',Plus:'Plus',RefreshCcw:'RefreshCcw',Send:'Send',Trash2:'Trash2',
  BillingSettings:'BillingSettings',VendorRoutingSettings:'VendorRoutingSettings',AgentAudioSettings:'AgentAudioSettings',US_STATE_OPTIONS:[],
  useAppAuth:()=>({getToken}),useTenantConfig:()=>({tenant,tenantId:null,features,agents:[],loading:false}),
  useSubscription:()=>({subscription:{plan:'billing_disabled',billing_disabled:true,seat_count:1000000},isInternal:false}),
  fetchWithClerk:async()=>{outbound++;return Response.json({});},
 });
 h.mount(()=>component({currentUser:{publicMetadata:{role:'admin'}}}));
 return {h,get outbound(){return outbound;}};
}

test('disabled Paragon, GHL and Stripe entries never mount or fetch with a signed-in administrator',async()=>{
 const off=settings({});try{
  await off.h.flush();const view=off.h.value;
  assert.doesNotMatch(text(view),/Vendor availability|CRM Integration|Upgrade your plan/);
  assert.equal(nodes(view).some(n=>['VendorRoutingSettings','BillingSettings'].includes(n.type)),false);
  assert.equal(off.outbound,0);
 }finally{off.h.unmount();}
 for(const [flag,component,label] of [['PARAGON_ENABLED','VendorRoutingSettings','Vendor availability'],['STRIPE_BILLING_ENABLED','BillingSettings',null],['GHL_ENABLED',null,'CRM Integration']]){
  const on=settings({[flag]:true});try{await on.h.flush();if(component)assert.ok(nodes(on.h.value).some(n=>n.type===component));if(label)assert.ok(text(on.h.value).includes(label));}finally{on.h.unmount();}
 }
});

test('Paragon callback task filter and queued rows are absent when the feature is off',()=>{
 const h=hookHarness();
 const code=source('src/components/contacts/FollowUpsView.jsx').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const Component=vm.runInNewContext(transformSync(code,{loader:'jsx',jsxFactory:'element',jsxFragment:'fragment',format:'cjs'}).code+';FollowUpsView;',{...h.hooks,element,fragment:'fragment',followUpBucket:()=> 'today'});
 const data={paragonEnabled:false,agentSlug:'fixture',isAdmin:true,rows:[{id:'parked',source:'paragon',agent_id:'fixture',status:'open'}],agents:[],refresh(){}};
 h.mount(()=>Component({data,initialSource:'paragon'}));
 try{assert.doesNotMatch(text(h.value),/PARAGON CALLBACKS/);assert.equal(nodes(h.value).some(n=>n.type?.name==='FollowUpRow'),false);}finally{h.unmount();}
});
