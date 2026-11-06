// Offline only. This script intentionally has no write-capable database client.
import {readFile,writeFile} from 'node:fs/promises';
import {RULE_CATALOG} from '../../src/compliance/rules/catalog.js';
import {aggregateVersion} from '../../src/compliance/engine/VersionAggregator.js';
import {evaluateRules} from '../../src/compliance/rules/evaluate.js';
import {transcriptCoverage} from '../../src/compliance/rules/transcript.js';
const data=JSON.parse(await readFile(process.argv[2]||'/tmp/enrollgen-compliance-audit.json','utf8'));
const dir='docs/compliance-overhaul';
function auditAgent(c){
 const assigned=[...new Set(data.attempts.filter(a=>a.call_record_id===c.id&&a.tenant_id===c.tenant_id).map(a=>a.agent_id))];
 const owner=data.agents.find(a=>a.id===c.agent_id&&a.tenant_id===c.tenant_id);
 const subject=(data.availability_agent_subjects||[]).find(r=>r.tenant_id===c.tenant_id&&r.is_active&&(assigned.length===1?r.agent_slug===assigned[0]:r.clerk_user_id===owner?.clerk_user_id));
 const member=subject?data.agents.find(a=>a.clerk_user_id===subject.clerk_user_id&&a.tenant_id===c.tenant_id):owner;
 const name=member?.name&&member.name!=='Agent'?member.name:subject?.agent_slug?.split('_').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ');
 return {name:assigned.length>1?null:name,basis:assigned.length===1?'verified attempt and protected subject':assigned.length>1?'ambiguous assignments':'protected enrolled membership',ownership_mismatch:!!subject&&owner?.clerk_user_id!==subject.clerk_user_id};
}

const coverage=data.calls.map(c=>({call_id:c.id,agent:auditAgent(c).name||c.agent_name,stored_agent:c.agent_name,agent_basis:auditAgent(c).basis,talk_seconds:c.call_duration_seconds,...transcriptCoverage(c)}));
const incomplete=coverage.filter(x=>!x.complete);
const rate=Number(process.env.DEEPGRAM_BATCH_PER_MINUTE_USD)||null;
await writeFile(`${dir}/coverage.json`,JSON.stringify(incomplete.map(c=>({...c,estimated_fill_cost_usd:rate===null||c.durationNeedsVerification||!c.durationMs?null:c.missingMinutes*2*rate,estimated_channel_minutes:c.durationNeedsVerification||!c.durationMs?null:c.missingMinutes*2,pricing:rate===null?'UNCONFIGURED: use contracted rate':'configured contracted rate'})),null,2));
const names=(data.historicalCalls||data.calls).map(c=>{const identity=auditAgent(c);const protectedName=identity.name;const contact=data.contacts.find(x=>x.id===c.contact_id&&x.tenant_id===c.tenant_id);return {call_id:c.id,old_agent:c.agent_name,new_agent:protectedName||null,agent_basis:identity.basis,ownership_mismatch:identity.ownership_mismatch,consumer_requires_decryption:!!contact?.pii_encrypted?.first_name&&!contact?.first_name,old_consumer:c.beneficiary_name,new_consumer:contact?.name||[contact?.first_name,contact?.last_name].filter(Boolean).join(' ')||null};}).filter(x=>(x.old_agent==='Agent'&&x.new_agent&&x.new_agent!=='Agent')||(!x.old_consumer&&x.new_consumer));
await writeFile(`${dir}/names-dry-run.json`,JSON.stringify(names,null,2));
const results=data.calls.map(c=>({call:c,result:evaluateRules(c)}));
const cardIds=new Set(data.cards.map(c=>c.id));
const relevant=data.items.filter(i=>cardIds.has(i.scorecard_id));
const inventory=RULE_CATALOG.map(r=>{const intent=data.intents.find(x=>x.intent_code===r.id);const templateItems=data.templateItems.filter(x=>x.intent_id===intent?.id&&data.templates.some(t=>t.id===x.template_id));const items=relevant.filter(i=>i.intent_id===intent?.id);return {id:r.id,database_intent_id:intent?.id,category:r.category,description:r.description,bucket:r.bucket,decision:r.decided_by,source_auto_fail:r.auto_fail,effective_auto_fail:r.bucket==='DETERMINISTIC'&&['CALL_OPEN_001_RECORDING_ANNOUNCE','CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','ENROLL_002_VERBAL_CONSENT'].includes(r.id),product:r.product_type,direction:r.subcategory||'both',points:templateItems.map(x=>x.points_possible),counts:items.reduce((a,x)=>(a[x.result]=(a[x.result]||0)+1,a),{}),cms_reference:r.cms_reference,review_note:r.reviewNote};});
await writeFile(`${dir}/rubric-inventory.json`,JSON.stringify(inventory,null,2));
const report=RULE_CATALOG.filter(x=>x.bucket==='DETERMINISTIC').map(rule=>{const rows=results.filter(x=>x.result.coverage.complete).map(x=>({call_id:x.call.id,item:x.result.items.find(i=>i.rule_id===rule.id)}));return {rule_id:rule.id,counts:rows.reduce((a,x)=>(a[x.item.result]=(a[x.item.result]||0)+1,a),{}),sample_failures:rows.filter(x=>x.item.result==='fail').slice(0,3).map(x=>({...x,excerpt: data.calls.find(c=>c.id===x.call_id).transcript_diarized.filter(l=>l.speaker==='agent').map(l=>({...l,relevance:(rule.description.toLowerCase().match(/[a-z]{5,}/g)||[]).reduce((score,w)=>score+(l.text.toLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.relevance-a.relevance).slice(0,3).map(l=>({text:l.text,start_ms:l.start_ms})),note:'Nearest lexical context, not proof of absence; inspect full transcript.'}))};});
await writeFile(`${dir}/matcher-dry-run.json`,JSON.stringify(report,null,2));
const reevaluation=(data.historicalCards||data.cards).map(card=>{
 const call=(data.historicalCalls||data.calls).find(c=>c.id===card.call_id);
 if(!call)return {call_id:card.call_id,scorecard_id:card.id,status:'NO_CALL_SNAPSHOT',old_score:card.overall_score,new_score:null};
 const oldItems=data.items.filter(i=>i.scorecard_id===card.id),templateItems=data.templateItems.filter(t=>t.template_id===card.template_id);
 if(!templateItems.length)return {call_id:card.call_id,scorecard_id:card.id,status:'NO_TEMPLATE_SNAPSHOT',old_score:card.overall_score,new_score:null};
 const proposed=aggregateVersion({call,source:card,items:oldItems,templateItems,intents:data.intents});
 const changed=proposed.items.filter(n=>{const old=oldItems.find(o=>o.template_item_id===n.template_item_id);return !old||old.result!==n.result||old.points_earned!==n.points_earned||old.auto_fail_triggered!==n.auto_fail_triggered;}).map(n=>({rule_id:n.rule_id,old_result:oldItems.find(o=>o.template_item_id===n.template_item_id)?.result||'missing',new_result:n.result,missing:n.missing_reason,auto_fail:n.auto_fail_triggered}));
 return {call_id:card.call_id,scorecard_id:card.id,old_score:card.overall_score,old_result:card.pass_fail,old_auto_fail:card.auto_fail_triggered,new_status:proposed.scorecard.scoring_state,new_score:proposed.scorecard.overall_score,new_result:proposed.scorecard.pass_fail,new_auto_fail:proposed.scorecard.auto_fail_triggered,coverage:proposed.coverage,new_deterministic_results:proposed.items.filter(i=>i.decided_by==='Code'),changed,warning:'Draft rubric, current transcript snapshot; not approved for live replacement'};
});
await writeFile(`${dir}/reevaluation-dry-run.json`,JSON.stringify(reevaluation,null,2));
const scripts=['src/data/maScript2027.js','src/components/ScriptFlow.jsx','src/lib/maScriptFlow.js','src/context/ScriptContext.jsx','src/context/MedSupScript.js','src/flows/aca/ACAScript.jsx','src/flows/aca/ACAData.js','src/flows/u65/U65Script.jsx','src/flows/u65/U65Data.js'];
const texts=await Promise.all(scripts.map(async path=>({path,text:await readFile(path,'utf8')})));
const mapping=RULE_CATALOG.map(r=>({id:r.id,matches:texts.flatMap(({path,text})=>text.split('\n').flatMap((line,index)=>r.pattern?.test(line)?[{path,line:index+1,excerpt:line.trim().slice(0,500)}]:[])),status:'Candidate matches; requires semantic and legal verification, not a certified required-statement mapping'}));
await writeFile(`${dir}/script-mapping.json`,JSON.stringify(mapping,null,2));
console.log(JSON.stringify({mode:'DRY RUN - zero production writes',calls:coverage.length,incomplete:incomplete.length,complete:coverage.length-incomplete.length,buckets:inventory.reduce((a,r)=>(a[r.bucket]=(a[r.bucket]||0)+1,a),{}),name_candidates:names.length,scorecards:reevaluation.length,deterministic_rules:report.length,fill_minutes:incomplete.filter(c=>!c.durationNeedsVerification).reduce((s,c)=>s+c.missingMinutes,0),duration_verification:incomplete.filter(c=>c.durationNeedsVerification).length,unknown_duration:incomplete.filter(c=>!c.durationMs).length,contracted_batch_rate:rate},null,2));
