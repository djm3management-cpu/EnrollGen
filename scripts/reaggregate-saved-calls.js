/** Zero-model re-aggregation of saved results. No LLM client, key or API import.
 * Snapshot and preview: node --env-file=.env.local scripts/reaggregate-saved-calls.js --since=ISO --until=ISO --output=/tmp/run
 * Apply the reviewed snapshot: repeat the same command with --apply.
 * Rule interpretation is preserved; only merge and auto-fail weighting change.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSupabaseClient as createClient,supabaseSecretKey} from '../integrations/supabase.js';
import {scoreCall} from '../src/compliance/engine/ScoringEngine.js';
import {aggregateSavedDetections, detectionsFromSavedItems} from '../src/compliance/engine/SavedResultAggregator.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return[k,v.length?v.join('='):true];}));
const until=args.until||new Date().toISOString(),since=args.since||new Date(new Date(until)-30*86400000).toISOString();
const output=path.resolve(args.output||'/tmp/enrollgen-merge-weighting');
const policy='merge-weighting-2026-10-19';
const db=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,supabaseSecretKey());
const checked=async q=>{const {data,error}=await q;if(error)throw error;return data;};
async function all(make){const rows=[];for(let from=0;;from+=500){const page=await checked(make().range(from,from+499));rows.push(...page);if(page.length<500)return rows;}}
await fs.mkdir(output,{recursive:true,mode:0o700});
const read=async file=>JSON.parse(await fs.readFile(path.join(output,file),'utf8'));
const write=(file,data)=>fs.writeFile(path.join(output,file),JSON.stringify(data,null,2),{mode:0o600});
let baseline;
try{baseline=await read('baseline.json');if(baseline.since!==since||baseline.until!==until)throw new Error('Output directory belongs to a different interval');}
catch(error){
 if(error.code!=='ENOENT')throw error;
 const calls=await all(()=>{let q=db.from('call_records').select('*').gte('call_start',since).lt('call_start',until).order('call_start').order('id');if(args.tenant)q=q.eq('tenant_id',args.tenant);return q;});
 const ids=calls.map(c=>c.id);
 const cards=ids.length?await all(()=>db.from('compliance_scorecards').select('*').in('call_id',ids).order('created_at').order('id')):[];
 const jobs=ids.length?await all(()=>db.from('scoring_jobs').select('*').in('call_id',ids).order('id')):[];
 const segments=jobs.length?await all(()=>db.from('scoring_segment_progress').select('*').in('job_id',jobs.map(j=>j.id)).order('job_id').order('segment_index')):[];
 const detections=ids.length?await all(()=>db.from('intent_detections').select('*').in('call_id',ids).order('id')):[];
 const items=cards.length?await all(()=>db.from('scorecard_items').select('*').in('scorecard_id',cards.map(c=>c.id)).order('id')):[];
 const templates=await checked(db.from('scoring_templates').select('*,scoring_template_items(*,compliance_intents(intent_code))').in('id',[...new Set(cards.map(c=>c.template_id))]));
 baseline={since,until,calls,cards,jobs,segments,detections,items,templates};await write('baseline.json',baseline);
}
const names=new Map(baseline.calls.filter(c=>c.agent_name&&c.agent_name!=='Agent').map(c=>[c.agent_id,c.agent_name]));
const prepared=[],results=[];
for(const call of baseline.calls){
 const card=baseline.cards.find(c=>c.id===call.compliance_scorecard_id)||baseline.cards.filter(c=>c.call_id===call.id).at(-1);
 const row={callId:call.id,agentId:call.agent_id,agent:names.get(call.agent_id)||call.agent_name,date:call.call_start,
  minutes:Math.round((call.call_duration_seconds||0)/6)/10,oldScore:card&&card.overall_grade!=='N/A'?Number(card.overall_score):null,newScore:null,
  oldGrade:card?.overall_grade||'unscored',grade:'N/A',status:'no saved scorecard',deductions:[],autoFailReasons:[]};
 if(!card){results.push(row);continue;}
 if(card.overall_grade==='N/A'||card.pass_fail==='N/A'||card.pass_fail==='INSUFFICIENT'){row.status='existing N/A retained';results.push(row);continue;}
 const template=baseline.templates.find(t=>t.id===card.template_id);
 const oldItems=baseline.items.filter(i=>i.scorecard_id===card.id);
 const job=baseline.jobs.find(j=>j.scorecard_id===card.id);
 const segments=baseline.segments.filter(s=>s.job_id===job?.id);
 const linked=new Set(oldItems.map(i=>i.detection_id).filter(Boolean));
 const savedDetections=baseline.detections.filter(d=>job?d.scoring_job_id===job.id:linked.has(d.id));
 const saved=savedDetections.length?savedDetections:detectionsFromSavedItems(oldItems,template?.scoring_template_items||[]);
 if(!saved.length&&!segments.length){row.status='no saved items, detections or segments; original score unchanged';results.push(row);continue;}
 if(card.reviewed||saved.some(d=>d.manually_overridden)){row.newScore=row.oldScore;row.grade=card.overall_grade;row.status='human review retained';results.push(row);continue;}
 const detections=aggregateSavedDetections({detections:saved,segments});
 const score=scoreCall({detections,templateItems:template.scoring_template_items.map(i=>({...i,intent_code:i.compliance_intents?.intent_code})),template,preserveRuleText:true});
 row.newScore=score.overall_grade==='N/A'?null:score.overall_score;row.grade=score.overall_grade;row.autoFail=score.auto_fail_triggered;
 row.status=`re-aggregated ${segments.length} saved segments / ${saved.length} ${savedDetections.length?'detections':'saved items'}`;
 row.evaluated=score.scorecard_items.filter(i=>i.result!=='na').length;row.totalRules=score.scorecard_items.length;
 row.autoFailReasons=score.scorecard_items.filter(i=>i.auto_fail_triggered).map(i=>i.intent_code);
 row.deductions=score.scorecard_items.filter(i=>['fail','partial'].includes(i.result)).map(i=>({rule:i.intent_code,points:i.points_possible-i.points_earned,reason:i.notes||i.question_text,evidence:i.evidence_text,autoFail:i.auto_fail_triggered}));
 results.push(row);prepared.push({call,card,template,detections,score});
}
const avg=v=>v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null;
const agents=[...new Set(results.map(r=>r.agentId))].map(id=>{const rows=results.filter(r=>r.agentId===id),paired=rows.filter(r=>r.oldScore!==null&&r.newScore!==null);return{agent:rows[0].agent,calls:rows.length,paired:paired.length,before:avg(paired.map(r=>r.oldScore)),after:avg(paired.map(r=>r.newScore)),naOrUnavailable:rows.filter(r=>r.newScore===null).length};});
const cell=v=>String(v??'N/A').replaceAll('|','/').replaceAll('\n',' ');
const lines=['# Saved-result re-aggregation','',`${since} through ${until} (exclusive). ${results.length} calls. OpenAI requests: 0. Tokens: 0.`,
 '', 'Only merge and auto-fail weighting were changed. Original rule interpretations, labels, direction decisions and evidence were retained. Context rules 2–5 were not applied to these historical calls.',
 '', 'Averages compare the same calls with numeric scores before and after. Existing N/A calls and unavailable evidence are excluded; they are never counted as zero.',
 '', '| Agent | Calls inspected | Paired scored calls | Before | After | N/A or unavailable |','|---|---:|---:|---:|---:|---:|',
 ...agents.map(a=>`| ${[a.agent,a.calls,a.paired,a.before,a.after,a.naOrUnavailable].map(cell).join(' | ')} |`),
 '', '## Calls below 70',''];
const low=results.filter(r=>r.newScore!==null&&r.newScore<70);
const unavailableLow=results.filter(r=>r.newScore===null&&r.oldScore!==null&&r.oldScore<70&&r.status.includes('unchanged'));
if(!low.length)lines.push('None.');
for(const r of low){lines.push(`- ${r.agent}, ${r.date}, ${r.callId}: ${r.newScore} (${r.minutes} min)`);for(const d of r.deductions)lines.push(`  - ${d.rule}: -${d.points} points. ${cell(d.reason)} Evidence: ${cell(d.evidence)}${d.autoFail?' [AUTO-FAIL]':''}`);}
for(const r of unavailableLow)lines.push(`- ${r.agent}, ${r.date}, ${r.callId}: original stored score ${r.oldScore} remains unchanged. No saved items, detections or segment results exist; specific deductions cannot be recovered without new classification.`);
lines.push('','## All calls','','Minutes are stored session duration. The reference call transcript ends at 107.7 minutes; its stored session duration is 122.1 minutes.','','| Agent | Date (UTC) | Call ID | Session minutes | Before | After | Grade | Evaluated | Status |','|---|---|---|---:|---:|---:|---|---:|---|',
 ...results.map(r=>`| ${[r.agent,r.date,r.callId,r.minutes,r.oldScore,r.newScore,r.grade,r.evaluated===undefined?'N/A':`${r.evaluated}/${r.totalRules}`,r.status].map(cell).join(' | ')} |`),
 '', '## Remaining auto-fails from original findings','');
for(const r of results.filter(r=>r.autoFail))lines.push(`- ${r.agent}, ${r.date}, ${r.callId}: ${r.autoFailReasons.join(', ')}. Original evidence interpretation retained.`);
await write('results.json',results);await write('agents.json',agents);
await fs.writeFile(path.join(output,'report.md'),lines.join('\n')+'\n',{mode:0o600});
console.table(agents);console.log(`${prepared.length} scorecards can be re-aggregated; ${low.length} calls below 70. Report: ${output}/report.md`);
if(!args.apply)process.exit(0);
// A fresh template identity preserves every original result and uses the existing
// atomic persistence RPC for each re-aggregated card, item and evidence set.
const templateMap=new Map();
for(const source of [...new Map(prepared.map(p=>[p.template.id,p.template])).values()]){
 const name=`${source.template_name} [${policy}]`;
 let target=(await checked(db.from('scoring_templates').select('*').eq('template_name',name))).at(0);
 if(!target){const {id,created_at,updated_at,scoring_template_items,...base}=source;void id;void created_at;void updated_at;void scoring_template_items;
  target=(await checked(db.from('scoring_templates').insert({...base,id:randomUUID(),template_name:name,version:source.version+1,is_active:false}).select())).at(0);}
 const present=await checked(db.from('scoring_template_items').select('intent_id').eq('template_id',target.id));
 const missing=source.scoring_template_items.filter(i=>!present.some(p=>p.intent_id===i.intent_id));
 if(missing.length)await checked(db.from('scoring_template_items').insert(missing.map(i=>{const {id,compliance_intents,...base}=i;void id;void compliance_intents;return{...base,template_id:target.id};})));
 target.items=await checked(db.from('scoring_template_items').select('*,compliance_intents(intent_code)').eq('template_id',target.id));templateMap.set(source.id,target);
}
for(const p of prepared){
 const live=await checked(db.from('call_records').select('*').eq('id',p.call.id).single());
 if(JSON.stringify([live.transcript_raw,live.transcript_diarized,live.call_duration_seconds])!==JSON.stringify([p.call.transcript_raw,p.call.transcript_diarized,p.call.call_duration_seconds]))throw new Error(`Transcript changed: ${p.call.id}`);
 const target=templateMap.get(p.template.id);
 const job=await checked(db.rpc('begin_scoring_job',{p_call_id:p.call.id,p_template_id:target.id,p_transcript:{raw:p.call.transcript_raw??null,diarized:p.call.transcript_diarized??null,duration:p.call.call_duration_seconds??null}}));
 if(job.status==='complete')continue;if(job.status!=='claimed')throw new Error(`Job ${p.call.id}: ${job.status}`);
 try{
  const detections=p.detections.map(d=>({...d,id:randomUUID()}));
  const result=scoreCall({detections,templateItems:target.items.map(i=>({...i,intent_code:i.compliance_intents?.intent_code})),template:target,preserveRuleText:true});
  const {scorecard_items,corrective_bucket,...scorecard}=result;
  const actions=result.corrective_actions_needed?[{severity:result.risk_level,category:corrective_bucket,bucket:corrective_bucket,title:`Saved-result re-aggregation ${result.overall_score}%`,description:result.coaching_notes.join('\n'),intent_codes:scorecard_items.filter(i=>i.result==='fail').map(i=>i.intent_code),evidence:scorecard_items.filter(i=>i.result==='fail').map(i=>({text:i.evidence_text,reason:i.notes}))}]:[];
  const saved=await checked(db.rpc('persist_scoring_result',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_result:{scorecard:{...scorecard,sentiment_summary:p.card.sentiment_summary||{}},items:scorecard_items,detections,actions,redactions:[],isShortCall:false}}));
  const row=results.find(r=>r.callId===p.call.id);row.scorecardId=saved.scorecard.id;
  await write('results.json',results);console.log(`Re-aggregated ${p.call.id}: ${result.overall_score} ${result.overall_grade}`);
 }catch(error){await checked(db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:error.message||String(error)}));throw error;}
}
// Retain superseded automatic actions as audit history. Assigned/human-owned
// actions are left for their reviewer rather than silently closed.
const changedCalls=new Set(prepared.map(p=>p.call.id));
const supersededCards=baseline.cards.filter(c=>changedCalls.has(c.call_id)&&!c.reviewed).map(c=>c.id);
if(supersededCards.length)await checked(db.from('corrective_actions').update({status:'superseded',
 resolution_notes:`Replaced by saved-result re-aggregation (${policy}); original score and evidence retained.`,
 updated_at:new Date().toISOString()}).in('scorecard_id',supersededCards).eq('status','open').is('assigned_to',null));
await write('applied.json',{at:new Date().toISOString(),policy,scorecards:prepared.length,openaiRequests:0,tokens:0});
