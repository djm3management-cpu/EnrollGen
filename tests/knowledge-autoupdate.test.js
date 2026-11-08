import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {hookHarness} from './helpers/hookHarness.js';
import updateHandler,{createUpdateKnowledgeHandler} from '../netlify/functions/update-knowledge.js';
import triggerHandler,{createTriggerKnowledgeUpdateHandler} from '../netlify/functions/trigger-knowledge-update.js';
import {runKnowledgeUpdate,runAllKnowledgeCategoryUpdates} from '../netlify/functions/_knowledgeUpdate.js';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const request=body=>new Request('https://app.test/api/trigger-knowledge-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{category:'compliance_aca'})});
async function withFlag(value,callback){
 const previous=process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;
 if(value===undefined)delete process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;else process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED=value;
 try{return await callback();}finally{if(previous===undefined)delete process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED;else process.env.KNOWLEDGE_AUTO_UPDATE_ENABLED=previous;}
}

test('both real endpoints and shared runners default to disabled without auth, DB, source fetches or AI work',async()=>{
 for(const flag of [undefined,'false','TRUE',' true','1'])await withFlag(flag,async()=>{
  for(const handler of [updateHandler,triggerHandler]){
   const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'disabled'});
  }
  const fail=()=>{throw Error('Disabled work executed');};
  const manual=createTriggerKnowledgeUpdateHandler({authenticate:fail,run:fail});
  const automatic=createUpdateKnowledgeHandler({run:fail,runAll:fail});
  assert.deepEqual(await (await manual(request())).json(),{status:'disabled'});
  assert.deepEqual(await (await automatic(request())).json(),{status:'disabled'});
  assert.deepEqual(await runKnowledgeUpdate({}, {getDb:fail,fetchSources:fail,generateUpdate:fail}),{status:'disabled'});
  assert.deepEqual(await runAllKnowledgeCategoryUpdates(),{status:'disabled'});
 });
});

test('enabled manual trigger requires Clerk authentication and the existing admin check',async()=>withFlag('true',async()=>{
 let runs=0;const run=async()=>{runs++;return {checked:1,results:[{result:'pending_review'}]};};
 const unauthenticated=createTriggerKnowledgeUpdateHandler({authenticate:async()=>({response:Response.json({error:'Unauthorized'},{status:401})}),run});
 assert.equal((await unauthenticated(request())).status,401);
 for(const auth of [{userId:'agent',tokenPayload:{}},{userId:'agent',tokenPayload:{org_role:'org:member'}},{userId:'agent',tokenPayload:{unsafe_metadata:{role:'admin'}}}]){
  const handler=createTriggerKnowledgeUpdateHandler({authenticate:async()=>auth,run});assert.equal((await handler(request())).status,403);
 }
 assert.equal(runs,0);
 const admin=createTriggerKnowledgeUpdateHandler({authenticate:async()=>({userId:'admin',tokenPayload:{org_role:'org:admin'}}),run});
 assert.equal((await admin(new Request('https://app.test/api',{method:'GET'}))).status,405);
 assert.equal((await admin(request({}))).status,400);
 assert.equal((await admin(request())).status,200);assert.equal(runs,1);
 // The production default explicitly refuses local auth bypasses.
 assert.match(read('netlify/functions/trigger-knowledge-update.js'),/requireClerkAuth\(request,\s*\{\s*allowBypass:\s*false\s*\}\)/);
}));

test('enabled secret trigger retains its authentication and never runs on an invalid secret',async()=>withFlag('true',async()=>{
 const previous=process.env.KNOWLEDGE_UPDATE_SECRET;process.env.KNOWLEDGE_UPDATE_SECRET='fixture-secret';let runs=0;
 try{
  const handler=createUpdateKnowledgeHandler({run:async()=>{runs++;return {checked:1};},runAll:async()=>{runs++;return {categories:1};}});
  assert.equal((await handler(request())).status,401);assert.equal(runs,0);
  for(const body of [{category:'compliance_aca'},{}]){
   const req=request(body);req.headers.set('x-knowledge-update-secret','fixture-secret');assert.equal((await handler(req)).status,200);
  }
  assert.equal(runs,2);
 }finally{if(previous===undefined)delete process.env.KNOWLEDGE_UPDATE_SECRET;else process.env.KNOWLEDGE_UPDATE_SECRET=previous;}
}));

test('real enabled updater persists every confidence as pending review, preserves existing rows, and cannot write knowledge_base',async()=>withFlag('true',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(`CREATE TABLE knowledge_base(id text PRIMARY KEY,tenant_id text,category text,key text,title text,content text,metadata jsonb,version int,source_urls text[],is_active boolean,updated_at timestamptz);
   CREATE TABLE knowledge_updates(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,knowledge_base_id text,previous_content text,new_content text,change_summary text,change_source text,confidence_score numeric,status text,reviewed_by text);
   INSERT INTO knowledge_base VALUES('base','tenant','compliance_aca','fixture','Original title','Approved live content','{"approved":true}',7,ARRAY['https://source.invalid/fixture'],true,'2026-01-01');
   INSERT INTO knowledge_updates(knowledge_base_id,previous_content,new_content,change_summary,change_source,confidence_score,status,reviewed_by) VALUES('base','older','existing pending','Keep this row','agentic_auto',0.5,'pending_review',NULL),('base','old','published history','Keep history','agentic_review',0.9,'published','admin');`);
  const db=evidenceDb(pg),beforeBase=(await pg.query('SELECT * FROM knowledge_base ORDER BY id')).rows,beforeQueue=(await pg.query('SELECT * FROM knowledge_updates ORDER BY id')).rows;
  let sourceReads=0,aiCalls=0;
  for(const confidence of [0,0.2,0.59,0.6,0.84,0.85,0.99,1]){
   const run=options=>runKnowledgeUpdate(options,{getDb:()=>db,fetchSources:async()=>{sourceReads++;return 'Fixture source';},generateUpdate:async()=>{aiCalls++;return {changed:true,confidence,summary:'Detected change',updatedContent:`Proposed at ${confidence}`};}});
   const handler=createTriggerKnowledgeUpdateHandler({authenticate:async()=>({userId:'admin',tokenPayload:{org_role:'org:admin'}}),run});
   const response=await handler(request({category:'compliance_aca',key:'fixture'}));assert.equal(response.status,200);
   assert.equal((await response.json()).results[0].result,'pending_review');
  }
  await runKnowledgeUpdate({category:'compliance_aca'},{getDb:()=>db,fetchSources:async()=>'',generateUpdate:async()=>({changed:true,confidence:0.95,summary:'Malformed proposal',raw:'CHANGES_DETECTED\nSummary: review source'})});
  const rows=(await pg.query('SELECT * FROM knowledge_updates ORDER BY id')).rows;
  assert.equal(rows.length,beforeQueue.length+9);assert.deepEqual(rows.slice(0,beforeQueue.length),beforeQueue);
  assert.ok(rows.slice(beforeQueue.length).every(row=>row.status==='pending_review'&&row.reviewed_by===null));
  assert.deepEqual(rows.slice(2,10).map(row=>Number(row.confidence_score)),[0,0.2,0.59,0.6,0.84,0.85,0.99,1]);
  assert.deepEqual((await pg.query('SELECT * FROM knowledge_base ORDER BY id')).rows,beforeBase);
  assert.equal(sourceReads,8);assert.equal(aiCalls,8);
  await runKnowledgeUpdate({},{getDb:()=>db,fetchSources:async()=>'',generateUpdate:async()=>({changed:false})});
  assert.deepEqual((await pg.query('SELECT * FROM knowledge_updates ORDER BY id')).rows,rows);
 }finally{await pg.close();}
}));

test('no knowledge review UI remains anywhere in src; all app routes share the lookup-only component',()=>{
 function inspect(directory){for(const file of readdirSync(directory,{withFileTypes:true})){const path=`${directory}/${file.name}`;if(file.isDirectory())inspect(path);else if(/\.(jsx?|tsx?)$/.test(file.name))assert.doesNotMatch(readFileSync(path,'utf8'),/knowledge_updates|Pending Knowledge Updates|pendingUpdates|knowledgeLastUpdated/,path);}}
 inspect(new URL('../src',import.meta.url).pathname);
 const source=read('src/components/ACAIntelligence.jsx');
 assert.doesNotMatch(source,/useUser|useKnowledge|useTenantConfig|reviewUpdate|diffPreview|reviewButtonStyle|diffBoxStyle/);
 assert.doesNotMatch(read('netlify/functions/update-knowledge.js'),/schedule\s*:/);
 assert.doesNotMatch(read('netlify.toml'),/\[functions\."update-knowledge"\]/);
 assert.match(read('.env.example'),/^KNOWLEDGE_AUTO_UPDATE_ENABLED=false$/m);
});

test('ACA lookup still searches SBE and FFE plans and never queries knowledge for admins or agents',async()=>{
 const source=read('src/components/ACAIntelligence.jsx').replace(/^import .*;\n/gm,'').replace('export default function','function');
 const code=transformSync(source,{loader:'jsx',jsxFactory:'element',format:'cjs'}).code;
 const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
 for(const zip of ['08001','10001']){
  const h=hookHarness(),queries=[];
  const supabase={from(table){const query={table,filters:[]};queries.push(query);const chain={select(){return chain;},eq(...args){query.filters.push(['eq',...args]);return chain;},not(...args){query.filters.push(['not',...args]);return chain;},ilike(...args){query.filters.push(['ilike',...args]);return chain;},then(resolve){return Promise.resolve({data:[{metal_level:'Silver',plan_marketing_name:'Fixture Plan',plan_type:'PPO',issuer_name:'Carrier',issuer_id:'issuer',premium_adult_individual_age_27:'$100',medical_deductible_individual_standard:'$500',medical_maximum_out_of_pocket_individual_standard:'$2000',tehb_ded_inn_tier_1_individual:'$500',tehb_inn_tier_1_individual_moop:'$2000'}],error:null}).then(resolve);}};return chain;}};
  const component=vm.runInNewContext(code+';ACAIntelligence',{...h.hooks,React:{Fragment:'fragment'},element:(type,props,...children)=>({type,props:props||{},children}),supabase,getStateFromZip:value=>value==='08001'?'NJ':'NY',getCountyFromZip:()=>zip==='10001'?'New York':'Salem',debugLog(){}});
  try{
   h.mount(()=>component());await h.flush();assert.equal(queries.length,0);
   walk(h.value).find(node=>node.type==='input').props.onChange({target:{value:zip}});await h.flush();
   await walk(h.value).find(node=>node.type==='button').props.onClick();await h.flush();
   assert.equal(queries.length,1);assert.equal(queries[0].table,zip==='08001'?'sbe_plans_nj_2025':'qhp_landscape_2026');
   if(zip==='10001'){assert.ok(queries[0].filters.some(([op,key,value])=>op==='eq'&&key==='state_code'&&value==='NY'));assert.ok(queries[0].filters.some(([op,key,value])=>op==='ilike'&&key==='county_name'&&value==='New York'));}
   assert.ok(walk(h.value).some(node=>node.props.label==='TOTAL PLANS'&&node.props.value===1));
  }finally{h.unmount();}
 }
});

test('the unchanged knowledge hook still reads approved DB knowledge for all engines and Carrier Ref',async()=>{
 const {findKnowledgeEntry,mergeKnowledgeEntries}=await import('../src/lib/knowledgeBase.js');
 const source=read('src/hooks/useKnowledge.js').replace(/^import .*;\n/gm,'').replace('export function useKnowledge','function useKnowledge');
 for(const category of ['compliance_ma','compliance_aca','compliance_medsup','medicare_reference','compliance_u65','state_carrier_data']){
  const h=hookHarness(),queries=[];
  const row={id:'fixture',tenant_id:null,category,key:'fixture',title:'Approved entry',content:'Approved DB content',metadata:{},version:7,is_active:true};
  const supabaseClient={from(table){const query={table,filters:[]};queries.push(query);const chain={select(){return chain;},eq(...args){query.filters.push(args);return chain;},order(){return chain;},then(resolve){return Promise.resolve({data:[row],error:null}).then(resolve);}};return chain;}};
  const hook=vm.runInNewContext(source+';useKnowledge',{...h.hooks,useTenantConfig:()=>({tenantId:'tenant',supabaseClient,loading:false}),findKnowledgeEntry,mergeKnowledgeEntries});
  try{
   h.mount(()=>hook(category));await h.flush();assert.equal(h.value.loading,false);assert.equal(h.value.error,'');assert.equal(h.value.entries[0].content,'Approved DB content');
   assert.equal(queries.length,1);assert.equal(queries[0].table,'knowledge_base');assert.ok(queries[0].filters.some(([key,value])=>key==='category'&&value===category));assert.ok(queries[0].filters.some(([key,value])=>key==='is_active'&&value===true));
  }finally{h.unmount();}
 }
});
