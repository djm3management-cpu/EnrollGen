import {RULE_CATALOG as ORIGINAL_MATCHERS} from './originalMatchers.js';
import {CMS_RULE_BASIS,normalizeProduct} from './cmsBasis.js';
import {ORIGINAL_MA_RUBRIC} from './originalRubric.js';
export const RULES_VERSION='cy2027-full-rubric-6';
export const RETIRED_RULE_IDS=new Set(['ELIG_010_ESRD_STATUS_CHECK','CONDUCT_013_NO_COMPARISON_BY_NAME','ENROLL_008_CMS_REVIEW_PERIOD']);
export const RULE_CATALOG=ORIGINAL_MATCHERS.map(intent=>{
 const original=ORIGINAL_MA_RUBRIC[intent.id],basis=CMS_RULE_BASIS[intent.id];
 const bucket=RETIRED_RULE_IDS.has(intent.id)?'RETIRE':basis?(basis.method==='judgment'?'JUDGMENT':'DETERMINISTIC'):intent.bucket;
 const stage=basis?.stage||(/^(?:PECL_|ENROLL_)/.test(intent.id)?'enrollment':/^(?:PLAN_|IMPACT_)/.test(intent.id)?'plan':intent.id.startsWith('SOA_')?'plan':'opening');
 return {...intent,description:basis?`${basis.name}. ${basis.criteria}`:intent.description,intent_name:basis?.name||intent.intent_name,
 points:original?.points_possible??intent.weight,originalPoints:original?.points_possible??intent.weight,
 cmsBasis:basis||null,scriptBasis:basis||null,stage,bucket,decided_by:bucket==='JUDGMENT'?'AI':'Code',reviewOnly:!!basis?.reviewOnly||basis?.method==='judgment',
 requiresReply:basis?['scope','consent','recordingConsent'].includes(basis.method):intent.requiresReply,
 reviewNote:bucket==='RETIRE'?'Previously approved retirement.':basis?'Current CMS criteria; original rubric weight retained.':'Restored agency practice; original wording and points retained.'};
});
export const ACTIVE_RULE_CATALOG=RULE_CATALOG.filter(r=>r.bucket!=='RETIRE');
export function ruleMatchesProduct(rule,product){return normalizeProduct(rule?.product_type)===normalizeProduct(product);}
