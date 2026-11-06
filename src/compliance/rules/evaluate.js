import {isComplianceSale} from '../../lib/saleCompliance.js';
import {RULE_CATALOG,RULES_VERSION} from './catalog.js';
import {sortTranscript,evidence,transcriptCoverage} from './transcript.js';
import {evaluateTpmo2027} from '../shared/tpmo2027.js';
const affirmative=/\b(?:yes|yeah|yep|correct|i (?:agree|consent|understand|do)|okay|ok|absolutely)\b/i;
const negative=/\b(?:no|not|don't|do not|disagree|unsure)\b/i;
const scope=/scope of appointment|permission.{0,40}discuss|may (?:we|i).{0,30}(?:discuss|review)|(?:are you interested in|would you like to).{0,20}discuss(?:ing)?.{0,65}(?:medicare|advantage|prescription|part d)/i;
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
export function ruleApplies(rule,call){
 const product=String(call.product_type||'').toUpperCase();

 if(!product)return null;
 if(rule.product_type && String(rule.product_type).toUpperCase()!==product)return false;
 if(['no_answer','wrong_number','test_call','voicemail_left'].includes(call.call_outcome))return false;
 if(rule.subcategory==='OUTBOUND'&&call.call_direction!=='outbound')return false;
 if(rule.subcategory==='INBOUND'&&call.call_direction!=='inbound')return false;
 const sale=isComplianceSale(call.call_outcome)||call.enrollment_completed===true||call.metadata?.enrollment_started===true;
 if(/^(?:PECL_|ENROLL_)/.test(rule.id)&&!sale)return call.call_outcome?false:null;
 if(rule.id==='ELIG_007_SEP_REASON_DOCUMENTED')return call.election_period?/SEP|special/i.test(call.election_period):null;
 const extra={PLAN_015_DENTAL_BENEFITS:'dental',PLAN_016_VISION_BENEFITS:'vision',PLAN_017_HEARING_BENEFITS:'hearing',PLAN_018_OTC_BENEFITS:'otc',PLAN_019_FITNESS_BENEFITS:'fitness',PLAN_020_TRANSPORTATION_BENEFITS:'transportation',PLAN_021_TELEHEALTH_BENEFITS:'telehealth',PLAN_023_PART_B_GIVEBACK:'giveback'}[rule.id];
 if(extra){const benefits=call.metadata?.plan_benefits;if(!Array.isArray(benefits))return null;return benefits.includes(extra);}
 if(rule.id==='IMPACT_003_MEDSUP_LOSS_WARNING')return call.metadata?.prior_coverage_type?/med.?sup|medigap/i.test(call.metadata.prior_coverage_type):null;
 if(rule.id==='IMPACT_006_MEDICAID_IMPACT')return typeof call.medicaid==='boolean'?call.medicaid:null;
 if(rule.id==='PLAN_024_SNP_ELIGIBILITY')return call.metadata?.plan_type?/SNP/i.test(call.metadata.plan_type):null;

 return true;
}
export function evaluateRules(call){
 const coverage=transcriptCoverage(call),lines=sortTranscript(call.transcript_diarized);
 const agent=lines.filter(x=>x.speaker==='agent');
 const tpmo=evaluateTpmo2027(lines,call);
 const presentation=tpmo.firstBenefit;
 const enrollment=agent.find(x=>/submitted.{0,30}(?:application|enrollment)|successfully enrolled/i.test(x.text));
 const consent=matchAgentStatement(agent,RULE_CATALOG.find(r=>r.id==='ENROLL_002_VERBAL_CONSENT').pattern);
 const replyAfter=(line)=>{
  const reply=lines.find(x=>x.speaker==='customer'&&x.text?.trim()&&x.start_ms>=Math.max(line.start_ms,(line.end_ms??line.start_ms)-500)&&x.end_ms>=(line.end_ms??line.start_ms)&&x.start_ms-(line.end_ms??line.start_ms)<=20000);
  return reply&&affirmative.test(reply.text)&&!negative.test(reply.text)?reply:null;
 };
 const items=RULE_CATALOG.map(rule=>{
  const base={rule_id:rule.id,category:rule.category,question_text:rule.description,decided_by:rule.decided_by,rules_version:RULES_VERSION,auto_fail_triggered:false};
  const applies=ruleApplies(rule,call);
  if(rule.bucket==='RETIRE'||applies===false)return {...base,result:'na',missing:rule.bucket==='RETIRE'?rule.reviewNote:'Not applicable to call metadata'};
  if(applies===null)return {...base,result:'review',missing:'Product metadata missing'};
  if(rule.bucket==='JUDGMENT')return {...base,result:'review',missing:'Stored judgment evidence requires review'};
  const candidates=matchAgentStatements(agent,/^SOA_00[134]/.test(rule.id)?scope:rule.pattern);
  let line=candidates[0]||null, ordered=true;
  if(/TPMO/.test(rule.id))line=tpmo.disclaimer;
  if(rule.requiresReply&&!/TPMO/.test(rule.id))line=candidates.find(candidate=>replyAfter(candidate))||line;
  if(line&&(!Number.isFinite(line.start_ms)||!Number.isFinite(line.end_ms)))return {...base,result:'review',missing:'Statement has no reliable timestamp'};
  if(rule.requiresReply&&line){const reply=replyAfter(line);if(!reply)return {...base,...evidence(line),result:'fail',missing:'Beneficiary affirmative reply not found within 20 seconds'};line={...line,text:`${line.text} / Customer: ${reply.text}`,end_ms:reply.end_ms};}
  let trigger=null;
  if(rule.id==='CALL_OPEN_001_RECORDING_ANNOUNCE'){trigger=presentation;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(rule.id==='CALL_OPEN_009_TPMO_TIMING_2027'){ordered=tpmo.beforeBenefits;trigger=presentation;}
  if(rule.id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027'){trigger=presentation;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(/^PECL_/.test(rule.id)){trigger=consent||enrollment;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  if(rule.id==='ENROLL_002_VERBAL_CONSENT'){trigger=enrollment;ordered=!!line&&(!trigger||line.end_ms<=trigger.start_ms);}
  const result=line&&ordered?'pass':'fail';
  // Absence and ambiguous ordering cannot manufacture an auto-fail quote.
  const autoFail=coverage.complete&&result==='fail'&&line&&trigger&&line.start_ms>trigger.start_ms&&['CALL_OPEN_001_RECORDING_ANNOUNCE','CALL_OPEN_009_TPMO_TIMING_2027','SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','ENROLL_002_VERBAL_CONSENT'].includes(rule.id);
  return {...base,...evidence(line),result,auto_fail_triggered:Boolean(autoFail),missing:!line?'Required statement not found':!ordered?'Required event occurred after its prerequisite deadline':null,
   trigger_evidence:trigger?evidence(trigger):null};
 });
 return {rules_version:RULES_VERSION,coverage,status:coverage.complete?'evaluated':'SCORING INCOMPLETE',items,
  timeline:{recording:agent.find(x=>/call.{0,35}recorded/i.test(x.text)),tpmo:tpmo.disclaimer,firstBenefit:presentation,soa:agent.find(x=>scope.test(x.text)),needsAssessment:agent.find(x=>/what.{0,30}(?:needs|goals|important)|looking for|do you (?:take|see|have)/i.test(x.text)),planPresentation:presentation,pecl:agent.find(x=>/pre.enrollment checklist/i.test(x.text)),consent,enrollment}};
}
