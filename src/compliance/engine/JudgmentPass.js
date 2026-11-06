import {RULE_CATALOG} from '../rules/catalog.js';
import {ruleApplies,evaluateRules} from '../rules/evaluate.js';
import {sortTranscript} from '../rules/transcript.js';
import {buildJudgmentRequest,legacyAssessment,assertAssessmentWireBudget} from './judgmentRequest.js';
export {JUDGMENT_SYSTEM} from './judgmentRequest.js';
export async function classifyJudgmentOnce({diarized,callContext,callLLM,passId}){
 const call={...callContext,transcript_diarized:sortTranscript(diarized)};
 const evaluated=evaluateRules(call);
 const {system,transcript,response_format,judgment}=buildJudgmentRequest(call);
 if(judgment.length&&Math.ceil((system.length+transcript.length+JSON.stringify(response_format).length)/3.5)>80000)throw Object.assign(new Error('Full transcript exceeds single-pass input bound'),{code:'scoring_incomplete_input_bound'});
 const raw=judgment.length?await callLLM(system,transcript,{response_format,passId}):{detections:[]};
 assertAssessmentWireBudget(raw);
 const parsed=typeof raw==='string'?JSON.parse(raw):raw;
 if(judgment.length&&!parsed.assessment)throw Error('Assessment missing from single judgment response; no retry');
 const detections=evaluated.items.filter(i=>i.decided_by==='Code'&&RULE_CATALOG.find(r=>r.id===i.rule_id)?.bucket==='DETERMINISTIC').map(i=>({intent_code:i.rule_id,detected:i.result==='pass',confidence:1,detection_method:i.result==='review'?'deterministic_review':i.auto_fail_triggered?'deterministic_hard_rule':'deterministic_rule',speaker:'agent',transcript_segment:i.evidence_text||null,segment_start_ms:i.evidence_timestamp_ms??null,segment_end_ms:i.evidence_end_ms??null,sequence_violation:false,anti_pattern_match:false,llm_reasoning:i.missing||'Required statement matched across full transcript',direction_excluded:i.result==='na',hard_cms_violation:false}));
 for(const item of evaluated.items.filter(i=>i.decided_by==='AI'&&i.result==='review'&&ruleApplies(RULE_CATALOG.find(r=>r.id===i.rule_id),call)==null))detections.push({intent_code:item.rule_id,detected:false,confidence:0,detection_method:'judgment_review',transcript_segment:null,segment_start_ms:null,anti_pattern_match:false,llm_reasoning:'Applicability metadata missing; administrator review required'});
 for(const r of parsed.detections||[]){
  if(!judgment.some(j=>j.id===r.intent_code))continue;
  // Exact quote anchoring is required before presenting model evidence.
  const line=call.transcript_diarized.find(l=>r.evidence_text?.trim()&&l.text?.includes(r.evidence_text.trim()));
  detections.push({intent_code:r.intent_code,detected:!!r.detected,confidence:Number(r.confidence)||0,detection_method:line?'judgment_review':'unscored',speaker:line?.speaker||'unknown',transcript_segment:line?r.evidence_text:null,segment_start_ms:line?.start_ms??null,segment_end_ms:line?.end_ms??null,anti_pattern_match:!!line&&!!r.anti_pattern,sequence_violation:false,llm_reasoning:line?r.reasoning:'Manual review required: model evidence could not be anchored to transcript',hard_cms_violation:false});
 }
 return {status:evaluated.status,eligibility:evaluated.eligibility,...legacyAssessment(parsed.assessment),detections,sentiment:parsed.sentiment||{},riskIndicators:parsed.risk_indicators||[],detectedDirection:call.call_direction};
}
