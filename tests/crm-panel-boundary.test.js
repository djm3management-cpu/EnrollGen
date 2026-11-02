import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Component } from 'react';
import { hookHarness } from './helpers/hookHarness.js';
import { agentInitials, filterOpportunities } from '../src/lib/opportunities.js';
import { callOutcomeLabel } from '../src/lib/postCallPipeline.js';
const h=(type,props,...children)=>({type,props:props||{},children});
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)];
function load(path, exportName, bindings={}) {
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const module={exports:{}};
  vm.runInNewContext(transformSync(source,{loader:'jsx',format:'cjs',jsxFactory:'h',jsxFragment:'Fragment'}).code,{
    h,Fragment:'fragment',module,exports:module.exports,require(name){return bindings[name]||{};},
  });return module.exports[exportName];
}
const logs=[];
const Boundary=load('src/components/CrmPanelBoundary.jsx','default',{'react':{Component},'../lib/debugLog.js':{debugLog:event=>logs.push(event)}});
function instance(props){const boundary=new Boundary(props);boundary.setState=patch=>{boundary.state={...boundary.state,...patch};};return boundary;}

test('CRM boundary isolates a failed record, preserves siblings and offers Retry without rendering record/error details',()=>{
  const sibling=h('notes',null,'Notes remain available');
  const panel=instance({label:'Call recording and transcript',resetKey:'voicemail',children:h('transcript',null,'Ready')});
  assert.equal(panel.render().type,'transcript');
  panel.state={...panel.state,...Boundary.getDerivedStateFromError(new Error('Private caller data'))};panel.componentDidCatch();
  const tree=h('workspace',null,panel.render(),sibling);
  assert.ok(nodes(tree).some(node=>node.props.role==='alert'));
  assert.ok(nodes(tree).some(node=>node.type==='notes'));
  assert.ok(!JSON.stringify(tree).includes('Private caller data'));
  assert.equal(logs.at(-1),'[CRM] Sub-panel render failed');
  nodes(tree).find(node=>node.type==='button').props.onClick();
  assert.equal(panel.render().type,'transcript');
});

test('changing the selected record clears only that boundary failure',()=>{
  const panel=instance({label:'Call details',resetKey:'one',children:'one'});
  panel.state={...panel.state,...Boundary.getDerivedStateFromError()};
  assert.equal(Boundary.getDerivedStateFromProps(panel.props,panel.state),null);
  panel.props={...panel.props,resetKey:'two',children:'two'};
  panel.state={...panel.state,...Boundary.getDerivedStateFromProps(panel.props,panel.state)};
  assert.equal(panel.render(),'two');
});

test('each CRM workspace has its own boundary while navigation remains outside',()=>{
  const source=readFileSync(new URL('../src/components/contacts/ContactsTab.jsx',import.meta.url),'utf8');
  const routeSource=source.slice(source.indexOf('export default function ContactsTab(')).replace('export default function','function');
  for(const view of ['calls','contacts','opportunities','followups']){
    const hooks=hookHarness();
    const Tab=vm.runInNewContext(transformSync(routeSource,{loader:'jsx',format:'cjs',jsxFactory:'h'}).code+';ContactsTab',{
      ...hooks.hooks,h,CrmPanelBoundary:Boundary,Suspense:'suspense',ContactsWorkspace:'contacts',CallLogTab:'calls',OpportunitiesView:'opportunities',FollowUpsView:'followups',
      Phone:'phone',UsersRound:'users',BriefcaseBusiness:'briefcase',CalendarClock:'calendar',
      useFollowUps:()=>({rows:[],agentSlug:null}),readCrmLocation:()=>({view}),navigateCrm(){},CRM_NAVIGATION_EVENT:'navigate',window:new EventTarget(),
    });
    try{
      hooks.mount(()=>Tab({}));
      const tree=nodes(hooks.value),labels=tree.filter(node=>node.type===Boundary).map(node=>node.props.label);
      assert.ok(labels.includes('Contacts'));assert.ok(labels.includes({calls:'Calls',contacts:'Contacts',opportunities:'Opportunities',followups:'Follow-ups'}[view]));
      const navigation=tree.find(node=>node.props['aria-label']==='CRM workspace');
      assert.equal(nodes(navigation).filter(node=>node.type==='button').length,4);
      assert.equal(nodes(navigation).some(node=>node.type===Boundary),false);
    }finally{hooks.unmount();}
  }
});

test('nullable opportunity names/agents and call dispositions remain displayable and searchable',()=>{
  assert.equal(agentInitials(null),'—');assert.equal(agentInitials({name:null}),'—');
  const row={id:'opportunity',contact_name:null,assigned_agent_id:null,carrier:null,notes:null};
  assert.deepEqual(filterOpportunities([row],{search:null}),[row]);
  assert.deepEqual(filterOpportunities([row],{search:'caller'}),[]);
  const CallStatus=load('src/components/callLog/CallRowParts.jsx','CallStatusOutcome',{'../../lib/postCallPipeline':{callOutcomeLabel}});
  for(const value of [null,undefined,''])assert.ok(JSON.stringify(CallStatus({disposition:value,outcome:value})).includes('Unknown'));
  const ContactOpportunities=load('src/components/opportunities/ContactOpportunities.jsx','default',{
    react:{useState:initial=>[initial,()=>{}]},'../../hooks/useOpportunities':{useOpportunities:()=>({rows:[row],stages:[]})},
    '../../lib/opportunities':{money:()=>'$0'},'./OpportunityDrawer':{StageBadge:'badge'},
  });
  assert.doesNotThrow(()=>ContactOpportunities({contactId:null}));
});

test('a failed call row renders a valid table row without removing its healthy neighbor',()=>{
  const panel=instance({label:'Call record',resetKey:'broken',tableColumns:10,children:h('row')});
  panel.state={...panel.state,...Boundary.getDerivedStateFromError()};
  const fallback=panel.render(),healthy=h('tr',null,h('td',null,'Healthy call'));
  assert.equal(fallback.type,'tr');assert.equal(fallback.children[0].type,'td');assert.equal(fallback.children[0].props.colSpan,10);
  const table=h('tbody',null,fallback,healthy);
  assert.ok(nodes(table).some(node=>node.props.role==='alert'));
  assert.ok(nodes(table).some(node=>node.children.includes('Healthy call')));
});
