import {RULE_CATALOG,RULES_VERSION} from './catalog.js';
import {ruleHasCmsBasis} from './cmsBasis.js';
import {detectCallStages,scoringEligibility,isEnrolled} from './callStages.js';
import {sortTranscript,evidence} from './transcript.js';
import {acknowledgmentAfter} from './acknowledgment.js';
const scope=/(?:permission.{0,50}(?:discuss|review)|may (?:we|i).{0,40}discuss|would you like to discuss.{0,80}(?:options|plans?|these|medicare advantage|prescription drug)|brief overview.{0,120}would that be (?:ok|okay))/i;
const product=/medicare advantage|prescription drug|part d|medicare supplement|medigap|stand.alone (?:dental|vision)/i;
const consent=/(?:agree|consent|authorize|want|like|ready).{0,55}(?:to )?enroll|proceed with.{0,20}(?:enrollment|application)/i;
const recording=/(?:(?:call|conversation|enrollment).{0,45}record(?:ed|ing)|record(?:ed|ing).{0,25}(?:call|conversation|enrollment|line))/i;
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
export function ruleApplies(rule,call,stages=detectCallStages(call)){
 if(!rule||!ruleHasCmsBasis(rule.id,call.product_type)||scoringEligibility(call,stages).status!=='eligible')return false;
 if(!stages[rule.cmsBasis.stage])return false;
 if(rule.cmsBasis.stage==='enrollment'&&!isEnrolled(call))return false;
 if(rule.cmsBasis.condition==='tpmo_sharing')return call.metadata?.tpmo_sharing===true;
 return true;
}
export const TOPIC_PATTERNS={
 providers:/(?:doctor|specialist|provider|physician).{0,100}(?:in.network|out.of.network|network|accepts? (?:this|the|your) plan)|(?:in.network|out.of.network|network).{0,100}(?:doctor|specialist|provider|physician)/i,
 pharmacy:/pharmac(?:y|ies)(?:(?!\b(?:doctor|provider|specialist)\b).){0,100}(?:network|preferred|standard|participat)|(?:network|preferred|standard).{0,70}pharmac(?:y|ies)/i,
 drugs:/(?:medications?|prescriptions?|drugs?).{0,100}(?:cover(?:ed|age)?|formulary|cost|co.?pay|tier)|(?:cover(?:ed|age)?|formulary|cost|co.?pay).{0,80}(?:medications?|prescriptions?|drugs?)/i,
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
 const reply=(line,method)=>{
  const normal=acknowledgmentAfter(line,lines,{pecl:true});if(normal)return normal;
  const first=lines.find(l=>l.speaker==='customer'&&l.start_ms>=Math.max(line.start_ms,line.end_ms-500)&&l.end_ms>=line.end_ms&&l.text?.trim());
  if(!first||/\b(?:no|not|don't|decline|refuse)\b/i.test(first.text))return null;
  if(method==='scope'&&product.test(first.text))return first;
  if(method==='consent'&&/i (?:want|would like) to enroll|i authorize.{0,30}(?:enrollment|submission)|enroll me|let(?:'s| us) (?:enroll|submit)/i.test(first.text))return first;
  return null;
 };
 const items=RULE_CATALOG.map(rule=>{
  const base={rule_id:rule.id,category:rule.category,question_text:rule.description,decided_by:rule.decided_by,rules_version:RULES_VERSION,auto_fail_triggered:false};
  const out=(result,line,missing=null,extra={})=>({...base,...evidence(line),result,missing,...extra});
  if(!ruleApplies(rule,call,stages))return out('na',null,rule.bucket==='RETIRE'?rule.reviewNote:eligibility.reason||'CMS requirement not applicable at the reached stage');
  const basis=rule.cmsBasis;
  if(basis.method==='judgment')return out('review',null,'Only anchored prohibited-conduct findings may be reviewed; no automatic deduction');
  if(basis.method==='metadata'){
   const value=call.metadata?.[basis.metadataOnly];
   return out(typeof value==='boolean'?(value?'pass':'fail'):'review',null,value===true?null:`Verified metadata unavailable: ${basis.metadataOnly}`);
  }
  let candidates=[],line=null,deadline=null,missing='CMS-required topic/statement not found';
  if(basis.method==='tpmo'){line=stages.tpmo.disclaimer;deadline=firstBenefit;}
  else if(basis.method==='scope'){
   candidates=matchAgentStatements(agent,scope,{windowMs:90000,maxLines:80}).filter(l=>product.test(l.text));
   line=candidates.find(l=>reply(l,basis.method))||null;deadline=firstBenefit;
  }else if(basis.method==='recordingConsent'){
   candidates=matchAgentStatements(agent,recording);line=candidates.find(l=>reply(l,basis.method))||null;deadline=submission;
  }else if(basis.method==='consent'){
   candidates=matchAgentStatements(agent,consent,{windowMs:90000,maxLines:80}).filter(l=>namedPlan(l.text,call));
   line=candidates.find(l=>reply(l,basis.method))||null;deadline=submission;
   missing='Named-plan enrollment request and clear beneficiary affirmative agreement not found';
  }else{
   deadline=submission;
   const pattern=basis.method==='impact'?/(?:enroll|join|new (?:plan|coverage)).{0,140}(?:replace|disenroll|\bends?\b.{0,35}(?:current|existing|other|plan|coverage))|(?:replace|disenroll).{0,100}(?:current|existing|coverage|plan)|when.{0,60}(?:coverage|plan).{0,35}begins?.{0,130}(?:get|receive).{0,40}(?:medical|prescription|health care).{0,50}from/i:TOPIC_PATTERNS[basis.topic];
   const usable=agent.filter(l=>!applicationOnly.test(l.text.trim()));
   candidates=matchAgentStatements(usable,pattern);
   line=candidates.find(l=>!deadline||l.end_ms<=deadline.start_ms)||candidates[0]||null;
  }
  if(!line)return out('fail',null,missing);
  if(['scope','consent','recordingConsent'].includes(basis.method)){
   const acknowledgment=reply(line,basis.method);line={...line,text:`${line.text} / Customer: ${acknowledgment.text}`,end_ms:acknowledgment.end_ms};
  }
  if(['topic','impact','consent','recordingConsent'].includes(basis.method)&&!deadline)return out('review',line,'Submission timestamp unavailable; before-submission ordering cannot be verified');
  const late=deadline&&line.end_ms>deadline.start_ms;
  const sameLineTpmo=basis.method==='tpmo'&&stages.tpmo.beforeBenefits;
  const failed=late&&!sameLineTpmo;
  const hard=failed&&line.start_ms>deadline.start_ms&&['tpmo','scope','consent'].includes(basis.method);
  return out(failed?'fail':'pass',line,failed?'Required event occurred after its CMS deadline':null,{auto_fail_triggered:!!hard,trigger_evidence:deadline?evidence(deadline):null});
 });
 return {rules_version:RULES_VERSION,coverage,eligibility,status:eligibility.status==='na'?'N/A':eligibility.status==='incomplete'?'SCORING INCOMPLETE':'evaluated',items,
  stages:{opening:stages.opening,plan:stages.plan,enrollment:stages.enrollment,identifiedSep:stages.identifiedSep},timeline:{tpmo:stages.tpmo.disclaimer,firstBenefit,soa:items.find(i=>i.rule_id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027')?.evidence_timestamp_ms!=null?{start_ms:items.find(i=>i.rule_id==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027').evidence_timestamp_ms}:null,enrollment:submission}};
}
