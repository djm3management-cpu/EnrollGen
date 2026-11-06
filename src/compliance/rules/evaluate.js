import {detectCallStages,scoringEligibility,isEnrolled} from './callStages.js';
import {ruleHasScriptBasis,SCRIPT_RULE_BASIS} from './scriptBasis.js';
import {acknowledgmentAfter,beforeSubmission} from './acknowledgment.js';
import {RULE_CATALOG,RULES_VERSION} from './catalog.js';
import {sortTranscript,evidence,transcriptCoverage} from './transcript.js';
const scope=/scope of appointment|permission.{0,40}discuss|may (?:we|i).{0,30}(?:discuss|review)|would you like to discuss.{0,65}(?:all of these options|medicare advantage|prescription)|brief overview.{0,120}would that be (?:ok|okay)/i;
export function matchAgentStatements(agent,pattern){
 if(!pattern)return [];
 const matches=[];
 for(let i=0;i<agent.length;i++){
  const passage=[];
  for(let j=i;j<agent.length&&j<i+12;j++){
   if(agent[j].end_ms-agent[i].start_ms>30000)break;
   passage.push(agent[j]);
   const text=passage.map(p=>p.text).join(' ');
   if(pattern.test(text)){matches.push({...agent[i],text,end_ms:agent[j].end_ms,segment_ids:passage.map(p=>p.id||p.segmentId).filter(Boolean)});break;}
  }
 }
 return matches.sort((a,b)=>a.end_ms-b.end_ms||b.start_ms-a.start_ms);
}
export function matchAgentStatement(agent,pattern){
 return matchAgentStatements(agent,pattern)[0]||null;
}
export function ruleApplies(rule,call,stages=detectCallStages(call)){
 if(!rule||rule.bucket==='RETIRE'||!ruleHasScriptBasis(rule.id,call.product_type))return false;
 if(scoringEligibility(call,stages).status!=='eligible')return false;
 const basis=SCRIPT_RULE_BASIS[rule.id];
 if(!stages[basis.stage])return false;
 if(rule.subcategory==='OUTBOUND'&&call.call_direction!=='outbound')return false;
 if(rule.subcategory==='INBOUND'&&call.call_direction!=='inbound')return false;
 if(/^(?:PECL_|ENROLL_)/.test(rule.id)&&!isEnrolled(call))return false;
 if(basis.condition==='identified_sep')return stages.identifiedSep;
 if(basis.condition==='prescriptions')return typeof call.metadata?.has_prescriptions==='boolean'?call.metadata.has_prescriptions:null;
 if(basis.condition==='plan_comparison')return stages.comparison||call.metadata?.plan_comparison===true;
 if(basis.condition==='tpmo_sharing')return call.metadata?.tpmo_sharing===true;
 if(basis.condition==='pdp_comparison')return call.metadata?.pdp_mapd_comparison===true;
 if(basis.condition==='non_renewing_plan')return call.metadata?.non_renewing_plan===true;
 if(basis.condition==='outbound_callback')return call.call_direction==='outbound'&&call.metadata?.inbound_callback_received===true;
 const extra={PLAN_015_DENTAL_BENEFITS:'dental',PLAN_016_VISION_BENEFITS:'vision',PLAN_017_HEARING_BENEFITS:'hearing',PLAN_018_OTC_BENEFITS:'otc',PLAN_020_TRANSPORTATION_BENEFITS:'transportation',PLAN_023_PART_B_GIVEBACK:'giveback'}[rule.id];
 if(extra){const benefits=call.metadata?.plan_benefits;if(!Array.isArray(benefits))return null;return benefits.includes(extra);}
 if(basis.condition==='medicaid')return typeof call.medicaid==='boolean'?call.medicaid:null;
 if(basis.condition==='snp')return call.metadata?.plan_type?/SNP/i.test(call.metadata.plan_type):null;
 return true;
}
export function evaluateRules(call){
 const stages=detectCallStages(call),eligibility=scoringEligibility(call,stages);
 const coverage=transcriptCoverage(call),lines=sortTranscript(call.transcript_diarized);
 const agent=lines.filter(x=>x.speaker==='agent');
 const tpmo=stages.tpmo;
 const presentation=tpmo.firstBenefit;
 const enrollment=stages.submission;
 const consent=matchAgentStatement(agent,RULE_CATALOG.find(r=>r.id==='ENROLL_002_VERBAL_CONSENT').pattern);
 const replyAfter=(line,rule)=>acknowledgmentAfter(line,lines,{pecl:rule.id.startsWith('PECL_')});
 const items=RULE_CATALOG.map(rule=>{
  const base={rule_id:rule.id,category:rule.category,question_text:rule.description,decided_by:rule.decided_by,rules_version:RULES_VERSION,auto_fail_triggered:false};
  const applies=ruleApplies(rule,call,stages);
  if(rule.bucket==='RETIRE'||applies===false)return {...base,result:'na',missing:rule.bucket==='RETIRE'?rule.reviewNote:'Not applicable to call metadata'};
  if(applies===null)return {...base,result:'review',missing:'Conditional script-path metadata missing'};
  if(rule.bucket==='JUDGMENT')return {...base,result:'review',missing:'Stored judgment evidence requires review'};
  if(rule.scriptBasis?.metadataOnly){
   const value=call[rule.scriptBasis.metadataOnly]??call.metadata?.[rule.scriptBasis.metadataOnly];
   return {...base,result:typeof value==='boolean'?(value?'pass':'fail'):'review',missing:value===true?null:`Required metadata evidence not verified: ${rule.scriptBasis.metadataOnly}`};
  }
  const candidates=matchAgentStatements(agent,/^SOA_00[134]/.test(rule.id)?scope:rule.pattern);
  let line=candidates[0]||null, ordered=true;
  if(/TPMO/.test(rule.id))line=tpmo.disclaimer;
  if(rule.requiresReply&&!/TPMO/.test(rule.id))line=candidates.find(candidate=>replyAfter(candidate,rule))||line;
  if(rule.id==='SOA_004_SOA_SCOPE_STATED'&&line&&!/medicare advantage|prescription drug|part d|medicare supplement|stand.alone (?:dental|vision)/i.test(line.text))line=null;
  if(line&&(!Number.isFinite(line.start_ms)||!Number.isFinite(line.end_ms)))return {...base,result:'review',missing:'Statement has no reliable timestamp'};
  if(rule.requiresReply&&line){const reply=replyAfter(line,rule);if(!reply)return {...base,...evidence(line),result:'fail',missing:rule.id.startsWith('PECL_')?'Beneficiary acknowledgment not found within 30 seconds or next customer turn':'Beneficiary affirmative reply not found within 20 seconds'};line={...line,text:`${line.text} / Customer: ${reply.text}`,end_ms:reply.end_ms};}
  let trigger=null;
  if(rule.id==='CALL_OPEN_001_RECORDING_ANNOUNCE'){trigger=presentation;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(rule.id==='CALL_OPEN_009_TPMO_TIMING_2027'){ordered=tpmo.beforeBenefits;trigger=presentation;}
  if(rule.id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027'){trigger=presentation;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(/^PECL_/.test(rule.id)){trigger=enrollment;ordered=!!line&&beforeSubmission(line,trigger);}
  if(rule.id==='ENROLL_002_VERBAL_CONSENT'){trigger=enrollment;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(line&&ordered===null)return {...base,...evidence(line),result:'review',missing:'Application submission timestamp unavailable'};
  const result=line&&ordered?'pass':'fail';
  // Absence and ambiguous ordering cannot manufacture an auto-fail quote.
  const autoFail=coverage.complete&&result==='fail'&&line&&trigger&&line.start_ms>trigger.start_ms&&['CALL_OPEN_001_RECORDING_ANNOUNCE','CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','ENROLL_002_VERBAL_CONSENT'].includes(rule.id);
  return {...base,...evidence(line),result,auto_fail_triggered:Boolean(autoFail),missing:!line?'Required statement not found':!ordered?'Required event occurred after its prerequisite deadline':null,
   trigger_evidence:trigger?evidence(trigger):null};
 });
 return {rules_version:RULES_VERSION,coverage,eligibility,stages:{opening:stages.opening,qualifications:stages.qualifications,needs:stages.needs,plan:stages.plan,application:stages.application,enrollment:stages.enrollment,identifiedSep:stages.identifiedSep},status:eligibility.status==='na'?'N/A':eligibility.status==='incomplete'?'SCORING INCOMPLETE':'evaluated',items,
  timeline:{recording:agent.find(x=>/call.{0,35}recorded/i.test(x.text)),tpmo:tpmo.disclaimer,firstBenefit:presentation,soa:agent.find(x=>scope.test(x.text)),needsAssessment:agent.find(x=>/what.{0,30}(?:needs|goals|important)|looking for|do you (?:take|see|have)/i.test(x.text)),planPresentation:presentation,pecl:agent.find(x=>/pre.enrollment checklist/i.test(x.text)),consent,enrollment}};
}
