import test from 'node:test';
import assert from 'node:assert/strict';
import {scoringCost,scoringDailyCap,DEEPGRAM_BATCH_PER_MINUTE_USD} from '../src/compliance/shared/scoringConfig.js';
import {RULES_VERSION,RULE_CATALOG,ACTIVE_RULE_CATALOG,RETIRED_RULE_IDS} from '../src/compliance/rules/catalog.js';
import {evaluateRules} from '../src/compliance/rules/evaluate.js';
import {scoreCall} from '../src/compliance/engine/ScoringEngine.js';
import {aggregateVersion} from '../src/compliance/engine/VersionAggregator.js';
import {classifyJudgmentOnce} from '../src/compliance/engine/JudgmentPass.js';
import {legacyAssessment,buildJudgmentRequest,estimateJudgment,assertAssessmentWireBudget} from '../src/compliance/engine/judgmentRequest.js';
import {toResponsesRequest} from '../src/lib/llm/openai.ts';
import {llmRuntime} from '../netlify/functions/_llmTelemetry.js';
const line=(text,start_ms=0,speaker='agent',duration=1000)=>({text,start_ms,end_ms:start_ms+duration,speaker});
const call=lines=>({id:'call',tenant_id:'tenant',product_type:'MA',call_outcome:'enrolled',call_direction:'inbound',call_duration_seconds:1200,transcript_diarized:[...lines,line('I can help you with Medicare',100000),line('Yes',102000,'customer'),line('This plan gives you $50',500000),line('Thank you',1199000)]});
const item=(c,id)=>evaluateRules(c).items.find(i=>i.rule_id===id);
const assessment={a:{r:8,l:7,k:8,n:'Ask for acknowledgment after explaining costs.'},b:{e:7,l:'medium',r:['Cost confusion','Needs follow-up']}};
test('approved cap and cached pricing, including invalid and excessive cached counts',()=>{
 assert.equal(scoringDailyCap(),2000000);assert.equal(scoringDailyCap({SCORING_DAILY_TOKEN_CAP:'9000000'}),2000000);
 assert.equal(scoringDailyCap({SCORING_DAILY_TOKEN_CAP:'100'}),100);assert.throws(()=>scoringDailyCap({SCORING_DAILY_TOKEN_CAP:'no'}));
 assert.equal(scoringCost(1000000,1000000,500000),1.31);assert.equal(scoringCost(1000000,0,2000000),.02);
 assert.equal(DEEPGRAM_BATCH_PER_MINUTE_USD,.0043);
});
test('retired IDs never return to active rubric, while misleading comparisons stay active',()=>{
 assert.equal(RULES_VERSION,'cy2027-full-rubric-5');assert.equal(ACTIVE_RULE_CATALOG.length,159);assert.equal(RULE_CATALOG.length,162);
 for(const id of RETIRED_RULE_IDS)assert.ok(!ACTIVE_RULE_CATALOG.some(r=>r.id===id));
 assert.ok(ACTIVE_RULE_CATALOG.some(r=>r.id==='CONDUCT_004_NO_MISLEADING_LANGUAGE'));
});
for(const id of RETIRED_RULE_IDS)test(`${id}: stale detection and prior admin decision cannot restore denominator`,()=>{
 const t={id:'template-item',intent_id:'intent',intent_code:id,points_possible:9,category:'TEST'};
 const old={id:'old',template_item_id:t.id,result:'fail',decided_by:'Admin',points_possible:9,points_earned:0};
 const scored=scoreCall({templateItems:[t],template:{},detections:[{intent_code:id,detected:false,anti_pattern_match:true,manually_overridden:true}]});
 assert.equal(scored.total_points_possible,0);assert.equal(scored.scorecard_items[0].result,'na');
 const v=aggregateVersion({call:call([]),source:{id:'old-card',template_id:'template'},items:[old],templateItems:[t],intents:[{id:'intent',intent_code:id}]});
 assert.equal(v.items[0].result,'na');assert.equal(v.items[0].points_possible,0);assert.equal(old.result,'fail');
});
test('assessment stays inside one request, uses legacy fields and is static before transcript',async()=>{
 let requests=0;const c=call([line('Unique transcript marker')]);
 const r=await classifyJudgmentOnce({callContext:c,diarized:c.transcript_diarized,passId:'fixture',callLLM:async(system,transcript,options)=>{
  requests++;assert.match(system,/at most 400 output tokens/);assert.doesNotMatch(system,/Unique transcript marker/);assert.match(transcript,/Unique transcript marker/);
  assert.ok(options.response_format.json_schema.schema.properties.assessment);return {detections:[],assessment};
 }});
 assert.equal(requests,1);assert.equal(r.agentAssessment.rapport_score,8);assert.equal(r.beneficiaryRisk.disenrollment_risk,'medium');assert.equal(r.beneficiaryRisk.disenrollment_risk_reason,'Cost confusion; Needs follow-up');
 const req=buildJudgmentRequest(c);assert.ok(req.response_format.json_schema.schema.properties.detections.items.properties.intent_code.enum.every(id=>ACTIVE_RULE_CATALOG.find(r=>r.id===id)?.bucket==='JUDGMENT'));
 assert.ok(estimateJudgment(c).estimated_cost_usd>0);
});
test('maximal valid assessment is 341 ASCII bytes, below hard 400 token bound; invalid output never retries',async()=>{
 const largest={a:{r:10,l:10,k:10,n:'a'.repeat(190)},b:{e:10,l:'medium',r:Array(3).fill('a'.repeat(25))}};
 assert.equal(new TextEncoder().encode(JSON.stringify(largest)).length,341);assert.ok(legacyAssessment(largest));
 for(const bad of [{...assessment,a:{...assessment.a,n:'a'.repeat(191)}},{...assessment,b:{...assessment.b,r:Array(4).fill('reason')}},{...assessment,a:{...assessment.a,n:'quoted " text'}}])assert.throws(()=>legacyAssessment(bad));
 let count=0;await assert.rejects(classifyJudgmentOnce({callContext:call([]),diarized:call([]).transcript_diarized,callLLM:async()=>{count++;return {assessment:{...assessment,a:{...assessment.a,n:'a'.repeat(191)}}};}}));assert.equal(count,1);
});
test('agency-only statements and optional needs checks are restored',()=>{
 for(const id of ['CALL_OPEN_001_RECORDING_ANNOUNCE','ELIG_001_PARTS_AB_CONFIRM','NEEDS_014_TRAVEL_FREQUENCY','PLAN_006_MOOP_STATED'])assert.equal(item(call([]),id).result,'fail');
});
test('scope discussion question needs named product and affirmative reply, not a needs-only question',()=>{
 const c=call([line('We offer Medicare Advantage and prescription drug plans. Would you like to discuss all of these options?'),line('Yes.',1100,'customer')]);
 assert.equal(item(c,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'pass');
 assert.equal(item(call([line('Are you interested in giveback or OTC?'),line('Yes.',1100,'customer')]),'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').result,'fail');
});
test('ledger records discounted cached input; daily-cap denial is returned before provider authorization',async()=>{
 let update,cap;const db={rpc:async(name,args)=>{cap=args.p_daily_cap;return {data:{status:'daily_cap',alert_claimed:false},error:null}},from:()=>({update:row=>{update=row;return {eq(){return this},then(resolve){resolve({error:null})}}},insert:async()=>({error:null})})};
 const runtime=llmRuntime(db,'tenant',null,{pass_id:'pass'});
 await assert.rejects(runtime.authorizeScoringRequest({max_completion_tokens:4096},'fixture','request'),/daily_scoring_token_cap/);assert.ok(cap<=2000000);
 await runtime.telemetry({prompt_tokens:1000000,completion_tokens:1000000,cached_tokens:500000,request_id:'request'});
 assert.equal(update.estimated_cost_usd,1.31);assert.equal(update.cached_input_tokens,500000);
});

test('escaped or padded wire output cannot bypass accepted assessment token bound',()=>{
 assert.doesNotThrow(()=>assertAssessmentWireBudget(JSON.stringify({assessment})));
 const padded='{"assessment":{'+ ' '.repeat(401)+'"a":1}}';assert.throws(()=>assertAssessmentWireBudget(padded),/wire section/);
 assert.throws(()=>assertAssessmentWireBudget('{"assessment":{"a":'),/Incomplete/);
 assert.throws(()=>legacyAssessment({...assessment,extra:1}),/Invalid assessment fields/);
});
test('no applicable judgment rules means zero provider calls and zero estimated cost',async()=>{
 const c={...call([]),call_outcome:'voicemail_left'};let count=0;
 await classifyJudgmentOnce({callContext:c,diarized:c.transcript_diarized,callLLM:async()=>{count++;throw Error('must not request')}});
 assert.equal(count,0);assert.equal(estimateJudgment(c).estimated_cost_usd,0);
});

test('scoring adapter forces low reasoning and 4096 maximum even with an excessive caller allowance',()=>{
 const request=toResponsesRequest({engine:'MA',path:'scoring',system:'Static',messages:[{role:'user',content:'Transcript last'}],max_completion_tokens:99999},'fixture');
 assert.equal(request.reasoning.effort,'low');assert.equal(request.max_output_tokens,4096);
 assert.equal(request.input[0].role,'developer');assert.equal(request.input.at(-1).content,'Transcript last');
});
