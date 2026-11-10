import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedRecordingPlan,recoveryEstimate,recoverBeforeScoring} from '../netlify/lib/transcriptRecovery.js';
import {complianceCategoryScores,complianceViewModel} from '../src/lib/complianceScore.js';
import {ACTIVE_RULE_CATALOG,ruleMatchesProduct} from '../src/compliance/rules/catalog.js';
const call={id:'call',tenant_id:'tenant',twilio_call_sid:'sid',call_end:'2026-11-09T20:28:04Z',call_duration_seconds:3026,
 transcript_diarized:['agent','customer'].flatMap(speaker=>[{speaker,text:'start',start_ms:0,end_ms:1000},{speaker,text:'end',start_ms:1990000,end_ms:1998119}])};
const attempt={id:'attempt',answered_at:'2026-11-09T19:37:38Z',ended_at:call.call_end};
const recording={id:'recording',call_record_id:call.id,tenant_id:call.tenant_id,parent_call_sid:'sid',attempt_id:attempt.id,provider_status:'completed',recording_source:'DialVerb',recording_channels:2,recording_duration_seconds:3026,provider_created_at:attempt.answered_at,direction:'inbound'};
test('real-call-shaped missing tail retains threshold and costs less than 15 cents',()=>{
 const plan=verifiedRecordingPlan(call,[recording],[attempt]);assert.deepEqual(plan.mapping,['customer','agent']);
 const e=recoveryEstimate(call,plan);assert.equal(e.reason,null);assert.equal(e.coverage.complete,false);assert.equal(e.ranges[0].start_ms,1998119);assert.ok(e.cost>.147&&e.cost<.148);
 assert.equal(verifiedRecordingPlan(call,[recording],[attempt],[{}]),null);
 assert.equal(verifiedRecordingPlan(call,[{...recording,tenant_id:'other'}],[attempt]),null);
 assert.equal(verifiedRecordingPlan(call,[{...recording,recording_source:'Conference'}],[attempt]),null);
 assert.equal(verifiedRecordingPlan(call,[{...recording,provider_created_at:null}],[attempt]),null);
 assert.equal(recoveryEstimate({...call,transcript_diarized:[]},plan).reason,null);
 assert.equal(recoveryEstimate({...call,call_duration_seconds:7200,transcript_diarized:[]},plan).reason,'recovery_cost_cap');
});
function fixture({status='claimed',complete=true}={}){
 const calls=[],fresh={...call,transcript_diarized:complete?['agent','customer'].flatMap(speaker=>[{speaker,text:'start',start_ms:0,end_ms:1000},{speaker,text:'recovered',start_ms:3020000,end_ms:3026000}]):call.transcript_diarized};
 const tables={recording_ingestion:[recording],telephony_call_attempts:[attempt],call_conferences:[],call_records:fresh};
 const db={from(table){const q={select(){return q},eq(){return q},single(){return Promise.resolve({data:tables[table]})},then(a,b){return Promise.resolve({data:tables[table]}).then(a,b)}};return q;},async rpc(name,args){calls.push([name,args]);return {data:name==='claim_automatic_transcript_recovery'?{status,job_id:'job'}:true};}};
 return {db,calls};
}
test('disabled recovery never calls a provider and records an admin alert',async()=>{
 const f=fixture();const r=await recoverBeforeScoring({...f,call,env:{},runGapJob:()=>assert.fail('paid call'),sendAlert:async()=>{}});
 assert.equal(r.incomplete,true);assert.equal(f.calls[0][0],'mark_transcript_recovery_blocked');
});
test('recovery completes before authorizing scoring; still-partial audio never resumes scoring',async()=>{
 for(const complete of [true,false]){const f=fixture({complete});let requests=0;
 const r=await recoverBeforeScoring({...f,call,env:{TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true'},runGapJob:async()=>{requests++;return {ok:true};},sendAlert:async()=>{}});
 assert.equal(requests,1);assert.equal(!!r.recovered,complete);assert.equal(f.calls.some(([n])=>n==='finish_automatic_transcript_recovery'),complete);}
});
test('replays, busy jobs and provider failures do not grant another automatic request',async()=>{
 for(const status of ['blocked','busy']){const f=fixture({status});await recoverBeforeScoring({...f,call,env:{TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true'},runGapJob:()=>assert.fail('paid replay'),sendAlert:async()=>{}});}
 const f=fixture();const r=await recoverBeforeScoring({...f,call,env:{TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true'},runGapJob:async()=>{throw Error('timeout');},sendAlert:async()=>{}});assert.equal(r.reason,'recording_recovery_failed');
});
test('category subtotals use saved points, include N/A and remain stable under filters',()=>{
 const items=['pass','fail','partial','review','na'].map((result,i)=>({category:'opening',result,points_earned:i===0?2:i===2?1:0,points_possible:i<3?2:0}));
 assert.deepEqual(complianceCategoryScores(items).opening,{earned:3,possible:6,pct:50});
 for(const filter of ['all','pass','fail','partial','review','na']){const view=complianceViewModel({items,filter,coverage:{complete:false}});assert.equal(view.groups.opening.length,filter==='all'?5:1);assert.equal(view.categoryScores.opening.pct,50);assert.equal(view.score,null);}
 assert.equal(ACTIVE_RULE_CATALOG.filter(r=>ruleMatchesProduct(r,'MA')).length,135);assert.equal(ACTIVE_RULE_CATALOG.filter(r=>ruleMatchesProduct(r,'ANNUITY')).length,24);
});
test('compliance palette exceeds AA for text, muted text and amber labels in both themes',()=>{
 const lum=hex=>{const c=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const [fg,bg]of [['172033','fbbf24'],['f3f4f6','171717'],['cbd5e1','171717'],['172033','ffffff'],['39465a','ffffff']]){const a=lum(fg),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);}
});

test('a missing channel or late channel start is repaired, not treated as complete',()=>{
 const late={...call,transcript_diarized:[{speaker:'agent',text:'start late',start_ms:1000000,end_ms:1001000},{speaker:'agent',text:'end',start_ms:3020000,end_ms:3026000},{speaker:'customer',text:'hello',start_ms:0,end_ms:1000},{speaker:'customer',text:'end',start_ms:3020000,end_ms:3026000}]};
 const e=recoveryEstimate(late,{mapping:['customer','agent']});assert.equal(e.coverage.complete,false);assert.deepEqual(e.ranges,[{start_ms:0,end_ms:1000000}]);
});

test('recovery download rejects an oversized recording before reading its body',async()=>{
 const {readBoundedRecording,MAX_GAP_RECORDING_BYTES}=await import('../netlify/functions/transcript-gaps-background.js');
 let cancelled=false;
 await assert.rejects(readBoundedRecording({headers:new Headers({'content-length':String(MAX_GAP_RECORDING_BYTES+1)}),body:{cancel:async()=>{cancelled=true;},getReader:()=>assert.fail('Oversized body read')}}),/download cap/);
 assert.equal(cancelled,true);assert.deepEqual([...await readBoundedRecording(new Response(new Uint8Array([1,2,3])))],[1,2,3]);
});

test('durable administrator notifications send only call identifiers and reason codes',async()=>{
 const {sendPendingRecoveryAlerts}=await import('../telephony/src/transcripts.js');
 const alert={call_id:'call',tenant_id:'tenant',reason:'scoring_attempts_exhausted'},sent=[];
 const db={from(){const q={select(){return q},is(){return q},order(){return q},limit:async()=>({data:[alert]})};return q;}};
 await sendPendingRecoveryAlerts({db,scoringUrl:'https://example.test/.netlify/functions/score-call-background',secret:'fixture',transport:async(url,options)=>{sent.push([String(url),JSON.parse(options.body)]);return {ok:true};}});
 assert.deepEqual(sent,[['https://example.test/.netlify/functions/stt-alert',alert]]);
});
