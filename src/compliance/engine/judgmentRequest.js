import {detectCallStages} from '../rules/callStages.js';
import {ruleHasScriptBasis} from '../rules/scriptBasis.js';
import {RULE_CATALOG} from '../rules/catalog.js';
import {ruleApplies} from '../rules/evaluate.js';
import {sortTranscript} from '../rules/transcript.js';
import {classificationFormat} from '../../lib/llm/schemas/compliance.js';
import {redactPHI} from './PHIRedactor.js';
import {scoringCost,JUDGMENT_MAX_OUTPUT_TOKENS} from '../shared/scoringConfig.js';
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const score={type:'integer',minimum:1,maximum:10};
// ASCII without JSON escapes makes serialized bytes an upper bound on BPE tokens.
const short=maxLength=>({type:'string',maxLength,pattern:"^[A-Za-z0-9 .,;:!?()/'-]*$"});
export const ASSESSMENT_SCHEMA=object({a:object({r:score,l:score,k:score,n:short(190)}),b:object({e:score,l:{type:'string',enum:['low','medium','high']},r:{type:'array',maxItems:3,items:short(25)}})});
const judgmentIds=RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT').map(r=>r.id);
const base=classificationFormat.json_schema.schema;
export const judgmentFormat={type:'json_schema',json_schema:{name:'judgment_and_assessment',strict:true,schema:object({...base.properties,
 detections:{...base.properties.detections,items:object(Object.fromEntries(Object.entries(base.properties.detections.items.properties).filter(([k])=>!['applicable','hard_cms_violation','anti_pattern_detail','sequence_position'].includes(k)).map(([k,v])=>[k,k==='intent_code'?{type:'string',enum:judgmentIds}:v])))},assessment:ASSESSMENT_SCHEMA})}};
export const JUDGMENT_SYSTEM=`Review the supplied full chronological call. Evaluate ONLY the supplied judgment rule IDs. Raise review flags, never final violations or auto-fails. An affirmative concern requires an exact transcript quote, confidence, and an explanation. Absence of a statement does not establish misconduct. Do not evaluate deterministic disclosures or applicability. Do not invent plan facts. Return compact structured JSON. Reserve at most 400 output tokens for assessment within the total 4096, leaving at most 3696 for findings. Assessment a: r=rapport, l=listening, k=product knowledge (1-10); n=assessment/coaching summary, at most 120 words and 190 ASCII characters. Assessment b: e=engagement (1-10); l=beneficiary risk low/medium/high; r=at most 3 reasons, at most 25 ASCII characters each. Do not repeat the transcript or speculate. Offering a separate future review in the approved closing is not cross-selling or a scope violation.`;
export function buildJudgmentRequest(call){
 const stages=detectCallStages(call);
 const judgment=RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT'&&ruleApplies(r,call,stages)===true);
 // Product rules and schema form a stable prefix; transcript remains last.
 const productRules=RULE_CATALOG.filter(r=>r.bucket==='JUDGMENT'&&ruleHasScriptBasis(r.id,call.product_type));
 const system=JUDGMENT_SYSTEM+'\n'+productRules.map(r=>`${r.id}: ${r.description}${r.scriptBasis?.limitedTo?' Scope: '+r.scriptBasis.limitedTo:''}`).join('\n')+'\nApplicable IDs: '+judgment.map(r=>r.id).join(',');
 const transcript=redactPHI(sortTranscript(call.transcript_diarized).map(l=>`[${l.start_ms}-${l.end_ms}] ${l.speaker}: ${l.text}`).join('\n')).redacted;
 const response_format=structuredClone(judgmentFormat);
 response_format.json_schema.schema.properties.detections.items.properties.intent_code.enum=productRules.map(r=>r.id);
 return {system,transcript,response_format,judgment};
}
export function estimateJudgment(call){
 const request=buildJudgmentRequest(call);
 if(!request.judgment.length)return {estimated_input_tokens:0,estimated_static_tokens:0,estimated_transcript_tokens:0,maximum_output_tokens:0,estimated_cost_usd:0,cached_prefix_cost_usd:0,cache_note:'No applicable judgment rules; no provider request.'};
 const staticTokens=Math.ceil((request.system.length+JSON.stringify(request.response_format).length)/3.5);
 const transcriptTokens=Math.ceil(request.transcript.length/3.5);
 const input=staticTokens+transcriptTokens;
 return {estimated_input_tokens:input,estimated_static_tokens:staticTokens,estimated_transcript_tokens:transcriptTokens,maximum_output_tokens:JUDGMENT_MAX_OUTPUT_TOKENS,
  estimated_cost_usd:scoringCost(input,JUDGMENT_MAX_OUTPUT_TOKENS),cached_prefix_cost_usd:scoringCost(input,JUDGMENT_MAX_OUTPUT_TOKENS,staticTokens),cache_note:'Cold estimate used for confirmation; caching is not guaranteed. Character estimates are not tokenizer measurements.'};
}
export function legacyAssessment(value){
 if(value==null)return {agentAssessment:null,beneficiaryRisk:null};
 const keys=(v,expected)=>v&&Object.keys(v).sort().join(',')===expected.slice().sort().join(',');
 if(!keys(value,['a','b'])||!keys(value.a,['r','l','k','n'])||!keys(value.b,['e','l','r']))throw Error('Invalid assessment fields; no retry');
 const validScore=n=>Number.isInteger(n)&&n>=1&&n<=10;
 const validText=(s,n)=>typeof s==='string'&&s.length<=n&&/^[A-Za-z0-9 .,;:!?()/'-]*$/.test(s);
 if(!validScore(value.a?.r)||!validScore(value.a?.l)||!validScore(value.a?.k)||!validScore(value.b?.e)||!validText(value.a?.n,190)||!['low','medium','high'].includes(value.b?.l)||!Array.isArray(value.b?.r)||value.b.r.length>3||value.b.r.some(s=>!validText(s,25))||new TextEncoder().encode(JSON.stringify(value)).length>400||value.a.n.split(/\s+/).filter(Boolean).length>120)throw Error('Assessment exceeds schema or 400-token section bound; no retry');
 return {agentAssessment:{rapport_score:value.a.r,rapport_notes:value.a.n,listening_score:value.a.l,listening_notes:'',product_knowledge_score:value.a.k,product_knowledge_notes:'',missed_opportunities:[],audit_risk_flags:[],top_coaching_priority:value.a.n},beneficiaryRisk:{engagement_score:value.b.e,confusion_indicators:[],competing_plan_mentioned:null,disenrollment_risk:value.b.l,disenrollment_risk_reason:value.b.r.join('; '),recommended_followup_days:null}};
}

// Enforce the raw emitted section too, including whitespace and JSON escapes.
// Providers expose a whole-response cap only, not a separate JSON-property cap.
export function assertAssessmentWireBudget(raw){
 if(typeof raw!=='string')return;
 const key=raw.match(/"assessment"\s*:\s*/);
 if(!key)return;
 const start=key.index+key[0].length;
 let quoted=false,escaped=false,depth=0;
 for(let i=start;i<raw.length;i++){
  const ch=raw[i];
  if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
  if(ch==='"'){quoted=true;continue;}
  if(ch==='{'||ch==='[')depth++;
  if(ch==='}'||ch===']'){
   depth--;
   if(depth===0){if(new TextEncoder().encode(raw.slice(start,i+1)).length>400)throw Error('Assessment wire section exceeds 400-byte token bound; no retry');return;}
  }
 }
 throw Error('Incomplete assessment section; no retry');
}
