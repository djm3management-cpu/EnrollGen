// CMS-only successor to the superseded script-policy fixture suite.
import test from 'node:test';import assert from 'node:assert/strict';
import {scoringEligibility,detectCallStages} from '../src/compliance/rules/callStages.js';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {generateScorecard} from '../src/compliance/engine/ScorecardGenerator.js';
import {complianceViewModel} from '../src/lib/complianceScore.js';
const l=(text,start_ms=0,speaker='agent')=>({text,start_ms,end_ms:start_ms+1000,speaker});
const base=()=>({id:'call',tenant_id:'tenant',product_type:'MA',call_outcome:'interested_needs_info',call_duration_seconds:900,transcript_diarized:[l('Medicare'),l('Yes',2000,'customer'),l('Goodbye',899000),l('Fixture close',899000,'customer')]});
test('exactly 15 minutes is eligible; null duration remains incomplete',()=>{assert.equal(scoringEligibility(base()).status,'eligible');assert.equal(scoringEligibility({...base(),call_duration_seconds:null}).status,'incomplete');});
test('opening without a plan discussion never grades plan-deadline rules',()=>{const e=evaluateRules(base());for(const id of ['CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027'])assert.equal(e.items.find(i=>i.rule_id===id).result,'na');});
test('application flags and pending disposition never enable pre-enrollment topic grading',()=>{const c={...base(),call_outcome:'enrolled_pending_verification',enrollment_completed:true,metadata:{enrollment_started:true}};assert.equal(evaluateRules(c).items.find(i=>i.rule_id==='PECL_005_PROVIDER_NETWORK_CONFIRMED').result,'na');});
test('AEP/OEP detection suppresses stale SEP metadata',()=>{for(const period of ['AEP','OEP'])assert.equal(detectCallStages({...base(),election_period:period,sep:'moving'}).identifiedSep,false);});
test('N/A never displays as an incomplete or numeric score',()=>{const view=complianceViewModel({scorecard:{scoring_state:'na',pass_fail:'N/A',overall_score:null},items:[],coverage:{complete:false}});assert.equal(view.status,'N/A');assert.equal(view.incomplete,false);assert.equal(view.score,null);});
test('generator records N/A before touching a job, template or paid pass',async()=>{const writes=[];const db={rpc:async(name)=>{writes.push(name);return {data:'na',error:null}},from(){throw Error('Forbidden')}};const r=await generateScorecard({supabase:db,callRecord:{...base(),call_duration_seconds:100},callLLM:async()=>{throw Error('Forbidden')}});assert.equal(r.notApplicable,true);assert.deepEqual(writes,['mark_compliance_not_applicable']);});
