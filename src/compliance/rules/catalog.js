import {ALL_INTENTS} from '../intents/index.js';
import {CMS_RULE_BASIS} from './cmsBasis.js';
export const RULES_VERSION='cy2027-cms-only-4';
export const RETIRED_RULE_IDS=new Set(ALL_INTENTS.filter(i=>!CMS_RULE_BASIS[i.intent_code]).map(i=>i.intent_code));
export const RULE_CATALOG=ALL_INTENTS.map(intent=>{
 const basis=CMS_RULE_BASIS[intent.intent_code],bucket=!basis?'RETIRE':basis.method==='judgment'?'JUDGMENT':'DETERMINISTIC';
 return {...intent,id:intent.intent_code,intent_name:basis?.name||intent.intent_name,description:basis?.name||intent.description,
  cmsBasis:basis||null,scriptBasis:basis||null,points:basis?.points??0,bucket,decided_by:bucket==='JUDGMENT'?'AI':'Code',
  requiresReply:['scope','consent','recordingConsent'].includes(basis?.method),
  reviewNote:!basis?'Excluded: no distinct verified CMS call requirement, or consolidated into a cited rule. Agency wording alone is not gradeable.':basis.method==='judgment'?'AI REVIEW only; administrator confirmation required.':'CMS requirement evaluated by code.'};
});
export const ACTIVE_RULE_CATALOG=RULE_CATALOG.filter(r=>r.bucket!=='RETIRE');
