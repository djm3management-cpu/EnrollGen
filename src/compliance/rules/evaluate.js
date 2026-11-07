import {RULE_CATALOG,RULES_VERSION,ruleMatchesProduct} from './catalog.js';
import {hasTpmoOrgCount,hasTpmoPlanCount,hasMedicareResource} from '../shared/tpmo2027.js';
import {detectCallStages,scoringEligibility,isEnrolled} from './callStages.js';
import {sortTranscript,evidence} from './transcript.js';
import {callConditions} from './conditions.js';
import {acknowledgmentAfter} from './acknowledgment.js';
// Section 3 only. Section 2.1's self/POA question is never scope agreement.
const scope=/would you like to discuss.{0,140}(?:options|plans|these)|(?:interested in|hearing about).{0,70}(?:all|certain|advantage).{0,65}(?:options|plans)|brief overview[\s\S]{0,280}would that be (?:ok|okay)|may (?:we|i) discuss|permission.{0,50}(?:discuss|review)/i;
const poa=/for yourself|for somebody else|for someone else|on behalf of yourself|health ?care decisions|power of attorney/i;
const product=/medicare advantage|prescription drug|part d|medicare supplement|medigap|stand.alone (?:dental|vision)/i;
const consent=/(?:do you|would you|you (?:must|need to)|please).{0,35}(?:agree|consent|authorize|want|like).{0,35}(?:enroll|submit)|(?:your )?permission.{0,25}(?:submit|enroll)|would you like to complete your enrollment/i;
const recording=/(?:(?:call|conversation|enrollment).{0,45}record(?:ed|ing)?|record(?:ed|ing)?.{0,25}(?:call|conversation|enrollment|line))/i;
export function matchAgentStatements(agent,pattern,{windowMs=30000,maxLines=40}={}){
 if(!pattern)return [];
 const matches=[];
 for(let i=0;i<agent.length;i++)for(let j=i;j<agent.length&&j<i+maxLines;j++){
  if(j>i&&agent[j].end_ms-agent[i].start_ms>windowMs)break;
  const passage=agent.slice(i,j+1),text=passage.map(l=>l.text).join(' ');
  if(pattern.test(text)){matches.push({...agent[i],text,end_ms:agent[j].end_ms,segment_ids:passage.map(l=>l.id||l.segmentId).filter(Boolean)});break;}
 }
 return matches.sort((a,b)=>a.end_ms-b.end_ms||b.start_ms-a.start_ms);
}
export const matchAgentStatement=(agent,pattern,options)=>matchAgentStatements(agent,pattern,options)[0]||null;
function recordingRefusal(stages){
 for(const l of stages.lines.filter(l=>l.speaker==='customer')){
  const explicit=/\b(?:no|refuse|decline|do not|don't)\b.{0,40}(?:record|consent)|(?:record|consent).{0,40}\b(?:no|refuse|decline)\b/i.test(l.text);
  const previous=stages.agent.filter(a=>a.end_ms<=l.start_ms+500&&recording.test(a.text)).at(-1);
  if(explicit||previous&&l.start_ms-previous.end_ms<=30000&&/^(?:no|nope|i (?:don't|do not) agree)\b/i.test(l.text.trim()))return l;
 }
 return null;
}
export function ruleApplies(rule,call,stages=detectCallStages(call)){
 if(!rule||rule.bucket==='RETIRE'||!ruleMatchesProduct(rule,call.product_type)||scoringEligibility(call,stages).status!=='eligible')return false;
 if(!stages[rule.stage])return false;
 if(rule.stage==='enrollment'&&!isEnrolled(call))return false;
 if(rule.subcategory==='OUTBOUND'&&call.call_direction!=='outbound'||rule.subcategory==='INBOUND'&&call.call_direction!=='inbound')return false;
 if(/SEP_?REASON/.test(rule.id)&&!stages.identifiedSep)return false;
 const conditions=stages.conditions??=callConditions(call,stages);
 if(rule.id==='IMPACT_003_MEDSUP_LOSS_WARNING'&&!conditions.medigap)return false;
 if(rule.id==='IMPACT_008_COVERAGE_GAP_WARNING'&&!conditions.gap)return false;
 if(rule.id==='IMPACT_002_OG_MEDICARE_IMPACT'&&!conditions.original&&!conditions.maSwitch)return false;
 if(rule.id==='IMPACT_004_EMPLOYER_COVERAGE_CHECK'&&!stages.enrollment)return false;
 if(rule.id==='IMPACT_006_MEDICAID_IMPACT'&&call.medicaid!==true)return false;
 const extra={PLAN_015_DENTAL_BENEFITS:'dental',PLAN_016_VISION_BENEFITS:'vision',PLAN_017_HEARING_BENEFITS:'hearing',PLAN_018_OTC_BENEFITS:'otc',PLAN_019_FITNESS_BENEFITS:'fitness',PLAN_020_TRANSPORTATION_BENEFITS:'transportation',PLAN_021_TELEHEALTH_BENEFITS:'telehealth',PLAN_023_PART_B_GIVEBACK:'giveback'}[rule.id];
 if(extra&&!call.metadata?.plan_benefits?.includes(extra)&&!stages.agent.some(l=>l.start_ms>=(stages.firstBenefit?.start_ms??Infinity)&&new RegExp(extra==='otc'?'otc|over.the.counter':extra==='giveback'?'give.?back|part b.{0,25}reduc':extra,'i').test(l.text)))return false;
 if(rule.id==='PLAN_024_SNP_ELIGIBILITY'&&!/SNP/i.test(String(call.metadata?.plan_type||call.plan_name||'')))return false;
 if(rule.cmsBasis?.condition==='tpmo_sharing')return call.metadata?.tpmo_sharing===true;
 if(rule.cmsBasis?.method==='recordingRefusal')return !!recordingRefusal(stages);
 return true;
}
export function evidenceWithinStage(rule,call,timestamp,stages=detectCallStages(call)){
 if(!Number.isFinite(timestamp))return false;
 if(rule.stage==='plan'||rule.stage==='enrollment'){
  if(['IMPACT_009_VOLUNTARY_DISENROLLMENT','ENROLL_001_ENROLLMENT_VOLUNTARY'].includes(rule.id))return true;
  const lower=rule.id.startsWith('ENROLL_')&&!rule.reviewOnly?stages.applicationEvent?.start_ms:stages.firstBenefit?.start_ms;
  if(lower==null||timestamp<lower)return false;
 }
 return true;
}
export const TOPIC_PATTERNS={
 providers:/(?:doctor|specialist|provider|physician).{0,100}(?:in.network|out.of.network|network|accepts? (?:this|the|your) plan)|(?:in.network|out.of.network|network).{0,100}(?:doctor|specialist|provider|physician)/i,
 pharmacy:/pharmac(?:y|ies)(?:(?!\b(?:doctor|provider|specialist)\b).){0,100}(?:network|preferred|standard|participat)|(?:network|preferred|standard).{0,70}pharmac(?:y|ies)/i,
 drugs:/(?:(?:tier (?:one|two|1|2)(?: and (?:two|2))?).{0,40}(?:\$|dollars|co.?pay|zero)|drug deductible.{0,35}(?:\$|dollars|zero)|(?=[\s\S]*(?:medications?|prescriptions?|drugs?))(?=[\s\S]*(?:cover(?:ed|age)?|formulary))(?=[\s\S]*(?:cost|co.?pay|tier|\$\s*\d|dollars?))[\s\S]+)/i,
 services:/(?:doctor|specialist|hospital|office visit|health care|medical service).{0,70}(?:cost|co.?pay|co.?insurance|\$|dollars|pay)|(?:cost|co.?pay|co.?insurance|\$\d).{0,60}(?:office visit|hospital|medical service)/i,
 premiums:/premium.{0,65}(?:\$?\d|zero|no (?:monthly |plan )?premium|dollars|[a-z]+ dollars)|(?:\$\s*\d|zero|no|\d+ dollars).{0,40}premium/i,
 benefits:/(?:this|your|the|selected) plan.{0,75}(?:covers?\b|includes?\b|provides?\b|gives?\b|benefit\b)|(?:dental|vision|hearing|otc|over.the.counter|transportation).{0,70}(?:allowance|cover|benefit|\$|dollars)|benefits?.{0,40}(?:included|coverage|plan)/i,
 needs:/durable medical equipment|\bDME\b|physical therapy|\bPT\b|oxygen|dialysis|home health|(?:specific|other|any).{0,35}(?:health ?care|medical) needs|(?:surgery|diabetes|treatment).{0,50}(?:need|care|require|condition)/i,
};
const applicationOnly=/\b(?:will|do) you have any other (?:prescription )?drug coverage\b/i;
export function matchTopic(agent,topic){return matchAgentStatement(agent.filter(l=>!applicationOnly.test(l.text.trim())),TOPIC_PATTERNS[topic]);}
function namedPlan(text,call){
 const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(call.plan_name&&normalize(text).includes(normalize(call.plan_name)))return true;
 return /\bH\d{4}\s*[- ]\s*\d{3}\b/i.test(text)||/\b(?:humana|aetna|united ?healthcare|wellcare|cigna|anthem|devoted|alignment)\b.{0,100}\b(?:HMO|PPO|PFFS|MAPD|PDP|choice|gold|value|secure|complete|saver)\b/i.test(text);
}
export function evaluateRules(call){
 const stages=detectCallStages(call),eligibility=scoringEligibility(call,stages),coverage=eligibility.coverage;
 const lines=sortTranscript(call.transcript_diarized),agent=lines.filter(l=>l.speaker==='agent'),submission=stages.submission,firstBenefit=stages.firstBenefit;
 const presentationAgent=firstBenefit?agent.filter(l=>l.start_ms>=firstBenefit.start_ms):[];
 const enrollmentAgent=agent.filter(l=>l.start_ms>=(stages.applicationEvent?.start_ms??Infinity)&&(!submission||l.start_ms<=submission.start_ms));
 const reply=(line,method)=>{
  const normal=acknowledgmentAfter(line,lines,{pecl:true,overlapMs:method==='scope'?1500:500});if(normal)return normal;
  const first=lines.find(l=>l.speaker==='customer'&&l.start_ms>=Math.max(line.start_ms,line.end_ms-500)&&l.end_ms>=line.end_ms&&l.text?.trim());
  if(!first||/\b(?:no|not|don't|decline|refuse)\b/i.test(first.text))return null;
  if(method==='scope'&&product.test(first.text))return first;
  if(method==='consent'&&/i (?:want|would like) to enroll|i authorize.{0,30}(?:enrollment|submission)|enroll me|let(?:'s| us) (?:enroll|submit)/i.test(first.text))return first;
  return null;
 };
 const items=RULE_CATALOG.map(rule=>{
  const base={rule_id:rule.id,category:rule.category,question_text:rule.description,decided_by:rule.decided_by,rules_version:RULES_VERSION,auto_fail_triggered:false};
  const out=(result,line,missing=null,extra={})=>({...base,...evidence(line),result,missing,...extra});
  if(!ruleApplies(rule,call,stages))return out('na',null,rule.bucket==='RETIRE'?rule.reviewNote:eligibility.reason||'Rule not applicable at the reached stage');
  const basis=rule.cmsBasis||{method:rule.bucket==='JUDGMENT'?'judgment':'agency'};
  if(basis.method==='judgment')return out('review',null,'Only anchored prohibited-conduct findings may be reviewed; no automatic deduction');
  if(basis.method==='metadata'){
   const value=call.metadata?.[basis.metadataOnly];
   return out(typeof value==='boolean'?(value?'pass':'fail'):'review',null,value===true?null:`Verified metadata unavailable: ${basis.metadataOnly}`);
  }
  let candidates=[],line=null,deadline=null,missing=rule.cmsBasis?'CMS-required topic/statement not found':'Agency-required statement not found';
  if(basis.method.startsWith('tpmo')){
   line=stages.tpmo.disclaimer;
   const predicate={tpmoOrg:hasTpmoOrgCount,tpmoPlans:hasTpmoPlanCount,tpmoResource:t=>hasMedicareResource(t)&&/all (?:of )?(?:your )?options|help with plan choices/i.test(t)}[basis.method];
   if(predicate)line=matchAgentStatements(agent,{test:predicate},{windowMs:90000,maxLines:80})[0]||null;
   deadline=firstBenefit;
  }else if(basis.method==='agency'){
   const voluntary=['IMPACT_009_VOLUNTARY_DISENROLLMENT','ENROLL_001_ENROLLMENT_VOLUNTARY'].includes(rule.id);
   if(voluntary){line=matchAgentStatement(agent,/voluntary|not required to enroll|(?:does not|doesn't|doesn’t) obligate you to (?:enroll|do so)/i);}
   else if(/^(?:ELIG_008_EFFECTIVE_DATE_STATED|ENROLL_005_EFFECTIVE_DATE_CONFIRMED)$/.test(rule.id)){
    line=matchAgentStatement(agent,/(?:effective|good to go|starts?|(?:coverage|plan).{0,20}(?:would |will )?begin).{0,45}(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i);
   }else if(rule.id==='NEEDS_011_CURRENT_COVERAGE_TYPE'){
    candidates=matchAgentStatements(agent,/which plan you(?:'re| are) with|who are you with now|what plan do you have|current.{0,25}(?:coverage|insurance|plan)/i);
    line=candidates.find(l=>lines.some(c=>c.speaker==='customer'&&c.start_ms>=l.end_ms-1500&&c.start_ms<=l.end_ms+30000&&/humana|aetna|united|devoted|anthem|medicare|wellcare|cigna|health|plan|supplement/i.test(c.text)))||null;
   }else if(rule.id==='PLAN_003_PLAN_TYPE_EXPLAINED'){
    const type=matchAgentStatement(presentationAgent,/\b(?:HMO|PPO)\b/i);
    const network=type?matchAgentStatement(agent.filter(l=>l.start_ms>=type.start_ms),/in.network|out.of.network|nonnetwork|noncontracted|referral/i):null;
    if(type&&network)line={...type,text:`${type.text} / Network at ${network.start_ms}ms: ${network.text}`,end_ms:network.end_ms};
   }else if(rule.id==='IMPACT_002_OG_MEDICARE_IMPACT'){
    line=matchAgentStatement(presentationAgent,/original medicare|(?:coverage|plan).{0,35}begins?[\s\S]{0,140}(?:get|receive) all (?:of )?your medical and prescription (?:drug )?benefits/i);
   }else{

   const usable=rule.stage==='plan'||rule.stage==='enrollment'?presentationAgent:agent;
   let pattern=rule.pattern;
   if(rule.id==='PLAN_001_PLAN_NAME_STATED')pattern={test:t=>namedPlan(t,call)};
   if(rule.id==='PLAN_002_CARRIER_NAME_STATED')pattern=/humana|aetna|united ?healthcare|wellcare|cigna|anthem|devoted|alignment/i;
   candidates=matchAgentStatements(usable,pattern);line=candidates.find(l=>!rule.requiresReply||reply(l,'agency'))||null;
   }
   if(rule.stage==='enrollment'&&rule.id.startsWith('PECL_'))deadline=submission;
  }else if(basis.method==='recordingRefusal'){
   const refusal=recordingRefusal(stages),resolved=matchAgentStatements(agent.filter(l=>l.start_ms>refusal.end_ms),recording).find(l=>reply(l,'recordingConsent')&&(!submission||reply(l,'recordingConsent').end_ms<=submission.start_ms));
   return resolved?out('pass',resolved):out('fail',refusal,'Enrollment proceeded without recording agreement after refusal');
  }
  else if(basis.method==='scope'){
   candidates=matchAgentStatements(agent.filter(l=>!poa.test(l.text)),scope,{windowMs:120000,maxLines:100}).filter(l=>product.test(l.text)).map(candidate=>{
    if(candidate.text.includes('?'))return candidate;
    let complete={...candidate};
    for(const next of agent.filter(l=>l.start_ms>=candidate.end_ms&&l.end_ms<=candidate.end_ms+30000&&!poa.test(l.text))){
     complete={...complete,text:`${complete.text} ${next.text}`,end_ms:next.end_ms};
     if(next.text.includes('?'))return complete;
    }
    return candidate;
   });
   line=candidates.find(l=>reply(l,basis.method))||null;deadline=firstBenefit;
  }else if(basis.method==='recordingConsent'){
   const refusal=recordingRefusal(stages);candidates=matchAgentStatements(agent.filter(l=>!refusal||l.start_ms>refusal.end_ms),recording);line=candidates.find(l=>reply(l,basis.method))||null;deadline=submission;
  }else if(basis.method==='consent'){
   const planContext=matchAgentStatement(enrollmentAgent,{test:t=>namedPlan(t,call)},{windowMs:90000,maxLines:80});
   const signature=/please state.{0,65}(?:name|date of birth).{0,90}(?:agree|consent)/i;
   candidates=[...matchAgentStatements(enrollmentAgent,signature,{windowMs:90000,maxLines:80}),...matchAgentStatements(enrollmentAgent,consent,{windowMs:90000,maxLines:80})].filter(()=>!!planContext);
   line=candidates.find(l=>reply(l,basis.method))||null;deadline=submission;
   missing='Named-plan enrollment request and clear beneficiary affirmative agreement not found';
  }else{
   deadline=submission;
   const pattern=basis.method==='impact'?/(?:enroll|join|new (?:plan|coverage)).{0,140}(?:replace|disenroll|\bends?\b.{0,35}(?:current|existing|other|plan|coverage))|(?:replace|disenroll).{0,100}(?:current|existing|coverage|plan)|when.{0,60}(?:coverage|plan).{0,35}begins?.{0,130}(?:get|receive).{0,40}(?:medical|prescription|health care).{0,50}from/i:TOPIC_PATTERNS[basis.topic];
   const usable=presentationAgent.filter(l=>!applicationOnly.test(l.text.trim()));
   candidates=matchAgentStatements(usable,pattern);
   line=candidates.find(l=>!deadline||l.end_ms<=deadline.start_ms)||candidates[0]||null;
  }
  if(!line)return out('fail',null,missing);
  if(['scope','consent','recordingConsent'].includes(basis.method)||basis.method==='agency'&&rule.requiresReply&&rule.id!=='NEEDS_011_CURRENT_COVERAGE_TYPE'){
   const acknowledgment=reply(line,basis.method);line={...line,text:`${line.text} / Customer: ${acknowledgment.text}`,end_ms:acknowledgment.end_ms};
  }
  if((['topic','impact','consent','recordingConsent'].includes(basis.method)||basis.method==='agency'&&rule.id.startsWith('PECL_'))&&!deadline)return out('review',line,'Submission timestamp unavailable; before-submission ordering cannot be verified');
  if(basis.method==='consent'){const plan=matchAgentStatement(enrollmentAgent,{test:t=>namedPlan(t,call)},{windowMs:90000,maxLines:80});if(plan)line={...line,text:`${line.text} / Plan identified at ${plan.start_ms}ms: ${plan.text}`};}
  const late=deadline&&line.end_ms>deadline.start_ms;
  const sameLineTpmo=basis.method.startsWith('tpmo')&&stages.tpmo.beforeBenefits;
  const failed=late&&!sameLineTpmo;
  const hard=failed&&line.start_ms>deadline.start_ms&&['tpmo','scope','consent'].includes(basis.method);
  return out(failed?'fail':'pass',line,failed?'Required event occurred after its CMS deadline':null,{auto_fail_triggered:!!hard,trigger_evidence:deadline?evidence(deadline):null});
 });
 return {rules_version:RULES_VERSION,coverage,eligibility,status:eligibility.status==='na'?'N/A':eligibility.status==='incomplete'?'SCORING INCOMPLETE':'evaluated',items,
  stages:{opening:stages.opening,plan:stages.plan,enrollment:stages.enrollment,identifiedSep:stages.identifiedSep},timeline:{tpmo:stages.tpmo.disclaimer,firstBenefit,soa:items.find(i=>i.rule_id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027')?.evidence_timestamp_ms!=null?{start_ms:items.find(i=>i.rule_id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').evidence_timestamp_ms}:null,enrollment:submission}};
}
