import {RULES_VERSION} from '../src/compliance/rules/catalog.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createComplianceReviewHandler} from '../netlify/functions/compliance-review.js';
const callId='00000000-0000-4000-8000-000000000001';
function fixture({admin=true,itemError=false,enabled=false}={}){
 const writes=[],reads=[];const tables={tenants:[{id:'tenant',clerk_org_id:'org'}],enrolled_agents:[{id:'agent',name:'Demo',clerk_user_id:'user',tenant_id:'tenant',is_active:true}],call_records:[{id:callId,tenant_id:'tenant',agent_id:'agent',agent_name:'Demo',call_end:'2026-11-09T20:00:00Z',call_duration_seconds:200,transcript_diarized:[{speaker:'agent',text:'last',start_ms:198000,end_ms:200000}],compliance_scorecard_id:'card'}],compliance_scorecards:[{id:'card',call_id:callId,tenant_id:'tenant'}],scorecard_items:[{id:'item',scorecard_id:'card'}]};
 const db={from(table){const q={in(){return q},eq(k,v){reads.push([table,k,v]);return q},select(){return q},order(){return q},limit(){return q},single(){return done(true)},maybeSingle(){return done(true)},then(a,b){return done(false).then(a,b)},insert(){writes.push(table);return q},update(){writes.push(table);return q}};function done(single){return Promise.resolve({data:single?tables[table]?.[0]||null:tables[table]||[],error:itemError&&table==='scorecard_items'?{message:'policy failed'}:null})}return q},rpc(){throw Error('Unexpected mutation RPC')}};
 const handler=createComplianceReviewHandler({getDb:()=>db,authenticate:async()=>({userId:'user',orgId:'org',tokenPayload:{org_role:admin?'org:admin':'org:member'}}),transport:async()=>{throw Error('No provider or dispatch allowed')},env:{SCORING_ENABLED:enabled?'true':'false',COMPLIANCE_RULES_VERSION:RULES_VERSION,TRANSCRIPT_GAP_FILL_ENABLED:'false'}});
 return {handler,writes,reads};
}
test('header access loads items with protected tenant scope and surfaces item read errors',async()=>{
 const good=fixture(),response=await good.handler(new Request(`https://example.test?call_id=${callId}`));assert.equal(response.status,200);assert.equal((await response.json()).items.length,1);assert.ok(good.reads.some(([t,k,v])=>t==='call_records'&&k==='tenant_id'&&v==='tenant'));assert.deepEqual(good.writes,[]);
 const bad=fixture({itemError:true});assert.equal((await bad.handler(new Request(`https://example.test?call_id=${callId}`))).status,503);
});
test('non-admin decisions are rejected and paid switches reject before any dispatch',async()=>{
 const user=fixture({admin:false});const req=action=>new Request('https://example.test',{method:'POST',body:JSON.stringify({call_id:callId,action})});assert.equal((await user.handler(req('review'))).status,403);assert.deepEqual(user.writes,[]);
 const admin=fixture();assert.equal((await admin.handler(req('rescore'))).status,409);assert.equal((await admin.handler(req('fill'))).status,409);assert.deepEqual(admin.writes,[]);
});

test('manual rescore of a short call is blocked as N/A before claiming or dispatching any pass',async()=>{
 const f=fixture({enabled:true});const response=await f.handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({call_id:callId,action:'rescore',confirm:true,approved_cost_usd:100,request_id:'00000000-0000-4000-8000-000000000002'})}));
 assert.equal(response.status,409);assert.match(JSON.stringify(await response.json()),/N\/A/);assert.deepEqual(f.writes,[]);
});
