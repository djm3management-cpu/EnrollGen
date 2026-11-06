// Offline dry run only: reads the saved audit snapshot, writes local reports.
// No database or provider client is imported. Baseline is an explicit saved file.
import {readFile,writeFile} from 'node:fs/promises';
import {RULE_CATALOG,RULES_VERSION} from '../../src/compliance/rules/catalog.js';
import {evaluateRules,ruleApplies} from '../../src/compliance/rules/evaluate.js';
import {transcriptCoverage,sortTranscript} from '../../src/compliance/rules/transcript.js';
import {buildJudgmentRequest,estimateJudgment} from '../../src/compliance/engine/judgmentRequest.js';
import {classificationFormat} from '../../src/lib/llm/schemas/compliance.js';
import {scoringCost,DEEPGRAM_BATCH_PER_MINUTE_USD} from '../../src/compliance/shared/scoringConfig.js';
const baselinePath=process.argv[2];
if(!baselinePath)throw Error('Pass the saved pre-change matcher report path; this tool is dry-run only.');
const data=JSON.parse(await readFile('/tmp/enrollgen-compliance-audit.json','utf8'));
const before=JSON.parse(await readFile(baselinePath,'utf8'));
const after=JSON.parse(await readFile('docs/compliance-overhaul/matcher-dry-run.json','utf8'));
const coverage=JSON.parse(await readFile('docs/compliance-overhaul/coverage.json','utf8'));
const qualifying=data.calls.filter(c=>transcriptCoverage(c).complete);
const evaluated=new Map(qualifying.map(c=>[c.id,evaluateRules(c)]));
const top=before.map(r=>({...r,applicable:(r.counts.pass||0)+(r.counts.fail||0)+(r.counts.partial||0)})).filter(r=>r.applicable).sort((a,b)=>(b.counts.fail||0)/b.applicable-(a.counts.fail||0)/a.applicable).slice(0,15);
const fmt=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
const related={SOA:/scope|interested.{0,30}discuss|permission.{0,30}discuss/i,ELIG:/open enrollment|special enrollment|qualif/i,NEEDS:/travel|vacation|living elsewhere/i,PLAN:/maximum|out.of.pocket|referral|network/i,IMPACT:/coverage|cancel|replace|enroll/i,PECL:/checklist|deductible|maximum|pharmacy|prescription|understand|benefits/i};
const samples=top.map(r=>{
 const rule=RULE_CATALOG.find(x=>x.id===r.rule_id),pattern=related[r.rule_id.split('_')[0]];
 const candidates=qualifying.filter(c=>ruleApplies(rule,c)===true).map(c=>{
  const agent=sortTranscript(c.transcript_diarized).filter(l=>l.speaker==='agent'),now=evaluated.get(c.id).items.find(x=>x.rule_id===r.rule_id);
  const direct=agent.find(l=>rule.pattern?.test(l.text)),context=agent.find(l=>pattern?.test(l.text));
  return {c,now,agent,quote:now.evidence_text||direct?.text||context?.text||agent[0]?.text||'No agent text',time:now.evidence_timestamp_ms??direct?.start_ms??context?.start_ms??agent[0]?.start_ms??0,rank:(now.result==='pass'?1e7:0)+(now.evidence_text?1e6:direct?5e5:context?1e5:0)+(agent.length>200?1e4:0)+Math.min(c.call_duration_seconds,8000)};
 }).sort((a,b)=>b.rank-a.rank);
 return {rule_id:r.rule_id,name:rule.intent_name,fail:r.counts.fail||0,applicable:r.applicable,after:after.find(x=>x.rule_id===r.rule_id).counts,samples:candidates.slice(0,2).map(x=>({call_id:x.c.id,timestamp:fmt(x.time),excerpt:x.quote.slice(0,650),result_now:x.now.result,classification:x.now.result==='pass'?'WORDING/TIMESTAMP FALSE FAIL, corrected':x.now.evidence_text?'Statement found; acknowledgment/order still missing or late. Not proven to be a wording false fail.':'No required phrase found in stored agent text. Possible real miss; excerpt alone cannot establish absence.',reason:x.now.missing||'Previously rejected equivalent wording or overlapping acknowledgment; now matched.',agent_utterances:x.agent.length})),sample_shortfall:candidates.length<2?'Only one applicable call exists for this rule; a second sample would be fabricated.':null};
});
const summary=['# Matcher false-fail review','',`Dry run only; saved snapshot, ${qualifying.length} endpoint-qualifying calls, ${RULES_VERSION}. No provider calls, SQL queries or production writes.`,
 '',`The denominator excludes N/A and unresolved applicability (REVIEW). ${qualifying.filter(c=>c.call_duration_seconds<120).length} of these calls are under two minutes. Endpoint coverage does not prove complete interior speech or correct channel attribution. A failed matcher is not itself a confirmed compliance violation. The 15 highest failure rates all tie at 100%; source order breaks ties.`,
 '', '| Rule ID | Plain-English name | Before failures / applicable | After failures / applicable |','|---|---|---|---|'];
for(const r of samples){const n=(r.after.pass||0)+(r.after.fail||0)+(r.after.partial||0);summary.push(`| ${r.rule_id} | ${r.name} | ${r.fail}/${r.applicable} | ${r.after.fail||0}/${n} |`);}
for(const r of samples){summary.push('',`## ${r.rule_id}: ${r.name}`);for(const [i,s]of r.samples.entries())summary.push('',`${i+1}. Call ${s.call_id}, ${s.timestamp}; ${s.classification}`,`> ${s.excerpt.replaceAll('\n',' ')}`,`Reason: ${s.reason} Current result: ${s.result_now}.`);if(r.sample_shortfall)summary.push('',r.sample_shortfall);}
summary.push('','## Fixes applied','',
 '- Match both “call is recorded” and “on a recorded line.”',
 '- Match shared “Parts A and B,” travel-question inflections, max/maximum/MOOP and out-of-pocket spelling variants. A travel benefit pitch alone is not a needs question.',
 '- Accept the actual product-specific scope discussion question only with beneficiary affirmation; needs-only questions remain excluded.',
 '- Search repeated statement attempts for a completed acknowledgment. Allow at most 500 milliseconds of channel overlap at the end of a statement. Never skip a first explicit refusal to use a later yes.',
 '- Separate recording permission from enrollment consent. Keep deadline checks on the full transcript.',
 '- Accept check list/checklist, prescription drug benefits, and reversed benefit/cost acknowledgment wording. Keep customer acknowledgment mandatory.',
 '', 'No passing result was manufactured for absent referral, coverage-gap or checklist text, missing SEP support, or missing beneficiary acknowledgment. Broadly accepting a later generic yes for every PECL topic remains unsafe without a verified checklist boundary and explicit bundled acknowledgment. Those cases remain visible failures/review candidates, not AUTO-FAILs.');
await writeFile('docs/compliance-overhaul/matcher-false-fail-review.md',summary.join('\n')+'\n',{mode:0o600});
await writeFile('docs/compliance-overhaul/matcher-false-fail-review.json',JSON.stringify(samples,null,2),{mode:0o600});
const oldSystem='Review the supplied full chronological call. Evaluate ONLY the supplied judgment rule IDs. Raise review flags, never final violations or auto-fails. An affirmative concern requires an exact transcript quote, confidence, and an explanation. Absence of a statement does not establish misconduct. Use the structured schema. Do not evaluate deterministic disclosures or applicability. Do not invent plan facts or treat unsupported accuracy as a proven violation.';
const costs=data.calls.map(call=>{
 const request=buildJudgmentRequest(call),oldRules=RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT'&&ruleApplies(r,call)===true);
 const beforeStatic=Math.ceil((oldSystem.length+1+oldRules.map(r=>`${r.id}: ${r.description}`).join('\n').length+JSON.stringify(classificationFormat).length)/3.5);
 const input=beforeStatic+Math.ceil(request.transcript.length/3.5),now=estimateJudgment(call);
 return {call_id:call.id,duration_seconds:call.call_duration_seconds,before_input:input,before_max_output:4096,before_cost:scoringCost(input,4096),after:now,coverage_complete:transcriptCoverage(call).complete};
});
const eligible=coverage.filter(c=>c.estimated_fill_cost_usd!=null);
const trigger=coverage.find(c=>c.call_id==='9e5f7473-e4dc-4325-8bad-763a7300d04e');
const improved=after.map(r=>({rule_id:r.rule_id,before:before.find(b=>b.rule_id===r.rule_id)?.counts,after:r.counts})).filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
const totals={mode:'DRY RUN - no SQL, providers or production writes',rules_version:RULES_VERSION,qualifying:qualifying.length,eligible_incomplete:eligible.length,gap_timeline_minutes:eligible.reduce((s,c)=>s+c.missingMinutes,0),gap_channel_minutes:eligible.reduce((s,c)=>s+c.estimated_channel_minutes,0),gap_cost_usd:eligible.reduce((s,c)=>s+c.estimated_fill_cost_usd,0),batch_rate:DEEPGRAM_BATCH_PER_MINUTE_USD,excluded_unknown_duration:coverage.filter(c=>!c.durationMs).length,excluded_duration_anomalies:coverage.filter(c=>c.durationNeedsVerification).length,trigger_gap_minutes:trigger.missingMinutes,trigger_gap_cost_usd:trigger.estimated_fill_cost_usd,changed_rule_counts:improved,cost_examples:costs.filter(c=>['9e5f7473-e4dc-4325-8bad-763a7300d04e','d7031a75-6c83-438f-9c82-075b7fac62dc'].includes(c.call_id)),estimated_input_increases:costs.filter(c=>c.after.estimated_input_tokens>c.before_input).length};
await writeFile('docs/compliance-overhaul/approved-costs.json',JSON.stringify({...totals,per_call:costs},null,2),{mode:0o600});
console.log(JSON.stringify(totals,null,2));
