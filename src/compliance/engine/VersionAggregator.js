import {randomUUID} from 'node:crypto';
import {evaluateRules} from '../rules/evaluate.js';
import {RULE_CATALOG,RULES_VERSION} from '../rules/catalog.js';
import {calculateServerGrade} from '../shared/serverGradeScale.js';
export function aggregateVersion({call,source,items,templateItems,intents,decision=null,judgmentDetections=null}){
 const evaluated=evaluateRules(call),byIntent=new Map(intents.map(i=>[i.id,i.intent_code]));
 const rows=templateItems.map(t=>{
  const code=t.intent_code||byIntent.get(t.intent_id),rule=RULE_CATALOG.find(r=>r.id===code),result=evaluated.items.find(i=>i.rule_id===code),prior=items.find(i=>i.template_item_id===t.id);
  let row={...prior,id:randomUUID(),scorecard_id:undefined,template_item_id:t.id,intent_id:t.intent_id,rule_id:code,category:t.category,question_text:t.question_text||rule?.description,display_order:t.display_order||0,points_earned:0,points_possible:Number(t.points_possible)||0,result:'review',decided_by:'Code',auto_fail_triggered:false,is_auto_fail:false,confidence:1};
  if(rule?.bucket==='DETERMINISTIC')row={...row,...result,rule_id:code,notes:result?.missing||null,missing_reason:result?.missing||null,points_earned:result?.result==='pass'?row.points_possible:0};
  else if(!rule||rule.bucket==='RETIRE'||result?.result==='na')row={...row,result:'na',points_possible:0,notes:rule?.reviewNote||result?.missing};
  else row={...row,decided_by:prior?.decided_by==='Admin'?'Admin':'AI',result:prior?.decided_by==='Admin'?prior.result:prior?.result==='pass'?'pass':'review',points_earned:prior?.result==='pass'?row.points_possible:0,notes:prior?.notes||'No saved judgment evidence'};
  if(judgmentDetections && rule?.bucket==='JUDGMENT' && result?.result!=='na'){
   const d=judgmentDetections.find(d=>d.intent_code===code);
   row={...row,decided_by:'AI',result:d?.anti_pattern_match?'review':d?.detected&&d?.transcript_segment?'pass':'review',
    evidence_text:d?.transcript_segment||null,evidence_timestamp_ms:d?.segment_start_ms??null,confidence:d?.confidence||0,
    notes:d?.llm_reasoning||'No reliable judgment evidence',points_earned:d?.detected&&!d?.anti_pattern_match&&d?.transcript_segment?row.points_possible:0};
  }
  if(prior?.decided_by==='Admin'&&!judgmentDetections)row={...row,result:prior.result,decided_by:'Admin',points_earned:prior.points_earned,points_possible:prior.points_possible,notes:prior.notes,evidence_text:prior.evidence_text,evidence_timestamp_ms:prior.evidence_timestamp_ms,auto_fail_triggered:false};
  if(decision&&prior?.id===decision.item_id){
   if(row.result!=='review')throw Error('Only review items can be decided');
   if(decision.decision==='confirm'&&(!row.evidence_text?.trim()||row.evidence_timestamp_ms==null))throw Error('Confirmation requires timestamped quoted evidence');
   row={...row,decided_by:'Admin',result:decision.decision==='confirm'?'fail':'na',points_earned:0,auto_fail_triggered:false,notes:decision.note||null};
  }
  if(!rule||rule.bucket==='RETIRE'||result?.result==='na')row={...row,result:'na',points_earned:0,points_possible:0,decided_by:'Code',auto_fail_triggered:false,notes:result?.missing||rule?.reviewNote};
  if(['review','na'].includes(row.result))row.points_possible=0;
  if(!row.evidence_text?.trim()||row.evidence_timestamp_ms==null||row.decided_by!=='Code')row.auto_fail_triggered=false;
  return row;
 });
 const earned=rows.reduce((s,r)=>s+r.points_earned,0),possible=rows.reduce((s,r)=>s+r.points_possible,0),score=possible?Math.round(earned/possible*10000)/100:null;
 const notApplicable=evaluated.eligibility.status==='na';
 const complete=evaluated.eligibility.status==='eligible'&&rows.length===templateItems.length&&rows.length>0;
 if(!complete)for(const row of rows)row.auto_fail_triggered=false;
 const failed=rows.filter(i=>i.auto_fail_triggered);
 const categories={};for(const r of rows){const c=categories[r.category]??={earned:0,possible:0};c.earned+=r.points_earned;c.possible+=r.points_possible;c.pct=c.possible?Math.round(c.earned/c.possible*100):0;}
 return {rules_version:RULES_VERSION,coverage:evaluated.coverage,eligibility:evaluated.eligibility,stages:evaluated.stages,items:rows,scorecard:{tenant_id:call.tenant_id,call_id:call.id,template_id:source.template_id,supersedes_id:source.id,rules_version:RULES_VERSION,scoring_state:notApplicable?'na':complete?'complete':'incomplete',overall_score:complete?score:null,overall_grade:complete&&score!=null?calculateServerGrade(score,failed.length>0):null,total_points_earned:notApplicable?0:complete?earned:null,total_points_possible:notApplicable?0:complete?possible:null,pass_fail:notApplicable?'N/A':complete&&score!=null?(failed.length||score<85?'FAIL':'PASS'):null,auto_fail_triggered:complete&&failed.length>0,auto_fail_item_ids:complete?failed.map(i=>i.id):[],auto_fail_reasons:complete?failed.map(i=>i.question_text):[],category_scores:categories,risk_level:failed.length?'critical':'low',risk_flags:rows.some(i=>i.result==='review')?['Administrator review required']:[],coaching_notes:[],corrective_actions_needed:failed.length>0,sequence_violations:0}};
}
