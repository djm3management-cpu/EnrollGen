import {SCRIPT_RULE_BASIS} from './scriptBasis.js';
import {ALL_INTENTS} from '../intents/index.js';
export const RULES_VERSION='cy2027-script-stages-3';
// Topic matching proves a statement occurred, not that quoted plan facts are true.
// Plan accuracy and suitability always remain judgment/evidence review.
const topics={
 RECORDING_ANNOUNCE:/\b(?:(?:call|conversation|line).{0,35}record(?:ed|ing)|record(?:ed|ing).{0,20}(?:call|conversation|line))/i,
 RECORDING_CONSENT:/\b(?:(?:call|conversation|line).{0,35}record(?:ed|ing)|record(?:ed|ing).{0,20}(?:call|conversation|line))/i,
 AGENT_IDENTIFY_NAME:/\b(?:my name is|this is|i am|i'm)\s+[a-z]+/i,
 AGENT_IDENTIFY_AGENCY:/newgen|new gen|new generation|health solutions|our agency|calling from [a-z]+|here at [a-z]+/i,
 AGENT_LICENSED:/licensed.{0,20}(?:agent|sell)|certified.{0,20}agent/i,
 CALL_PURPOSE:/review.{0,40}(?:coverage|options|benefits)|help.{0,30}(?:medicare|coverage)/i,
 INBOUND_GREETING:/thank(?:s| you) for calling/i,
 PARTS_AB_CONFIRM:/parts?\s*a\b.{0,30}(?:part\s*)?b\b/i,
 PART_B_PREMIUM:/part\s*b.{0,60}premium/i,
 ZIP_CODE_CONFIRM:/zip\s*(?:code)?/i, COUNTY_CONFIRM:/\bcounty\b/i,
 ELECTION_PERIOD_VERIFY:/annual enrollment|open enrollment|special enrollment|initial enrollment|\b(?:AEP|OEP|SEP|IEP)\b/i,
 SEP_REASON_DOCUMENTED:/special enrollment.{0,100}(?:because|qualif|mov|lost)|qualifying.{0,20}event/i,
 EFFECTIVE_DATE_STATED:/(?:effective|take effect).{0,25}(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
 MEDICAID_STATUS_CHECK:/\bmedicaid\b|dual eligible/i,
 CURRENT_MEDICATIONS:/medications?|prescriptions?/i, CURRENT_PROVIDERS:/doctors?|providers?|specialists?/i,
 PREFERRED_PHARMACY:/\bpharmac(?:y|ies)\b/i, CURRENT_COVERAGE_TYPE:/current.{0,25}(?:coverage|insurance|plan)/i,
 UPCOMING_PROCEDURES:/coming up|upcoming|planned.{0,20}(?:surgery|procedure)/i,
 TRAVEL_FREQUENCY:/(?:do you|will you|are you|how often|how much).{0,50}(?:travel(?:ing|ling)?|vacations?)|(?:travel(?:ing|ling)?|vacations?).{0,50}(?:often|frequen|important to you|living elsewhere|lifestyle)/i, DENTAL_VISION_HEARING:/dental|vision|hearing/i,
 TRANSPORTATION_NEEDS:/transportation/i, OTC_BENEFIT_INTEREST:/\botc\b|over.the.counter/i,
 FITNESS_BENEFIT_INTEREST:/fitness|gym|silver.?sneakers/i,
 PLAN_TYPE_EXPLAINED:/\b(?:HMO|PPO)\b.{0,100}(?:network|referral|provider)|(?:network|referral|provider).{0,100}\b(?:HMO|PPO)\b/i,
 PREMIUM_STATED:/premium.{0,35}(?:\$?\d|zero|no cost)/i,
 DEDUCTIBLE_STATED:/deductible.{0,35}(?:\$?\d|zero|no)/i,
 MOOP_STATED:/(?:max(?:imum)?|annual).{0,12}out[ -]of[ -]pocket|out[ -]of[ -]pocket.{0,12}(?:max(?:imum)?|limit)|\bMOOP\b/i,
 COPAY_STRUCTURE:/co.?pay|co.?insurance/i, NETWORK_TYPE_EXPLAINED:/in.network|out.of.network/i,
 REFERRAL_REQUIREMENTS:/referrals?/i, DRUG_COVERAGE_OVERVIEW:/part\s*d|prescription.{0,20}coverage/i,
 DRUG_TIERS_EXPLAINED:/\btier\b/i, DENTAL_BENEFITS:/dental/i, VISION_BENEFITS:/vision/i, HEARING_BENEFITS:/hearing/i,
 OTC_BENEFITS:/\botc\b|over.the.counter/i, FITNESS_BENEFITS:/fitness|silver.?sneakers|gym/i,
 TRANSPORTATION_BENEFITS:/transportation/i, TELEHEALTH_BENEFITS:/telehealth|virtual visit/i,
 STAR_RATING_MENTIONED:/star.{0,15}rating/i, PART_B_GIVEBACK:/give.?back|part\s*b.{0,20}reduc/i,
 CURRENT_PLAN_DISENROLL:/disenroll|replace.{0,25}(?:current|existing).{0,15}plan/i,
 OG_MEDICARE_IMPACT:/original medicare/i, MEDSUP_LOSS_WARNING:/medigap|medicare supplement/i,
 EMPLOYER_COVERAGE_CHECK:/employer|union coverage|retiree coverage/i, VA_TRICARE_CHECK:/\bVA\b|veteran|tricare/i,
 MEDICAID_IMPACT:/medicaid/i, PART_D_PENALTY_WARNING:/late enrollment penalty/i,
 COVERAGE_GAP_WARNING:/gap.{0,20}coverage|coverage.{0,20}gap/i,
 VOLUNTARY_DISENROLLMENT:/voluntary|not required to enroll/i,
 CHECKLIST_REFERENCED:/pre[ -]?enrollment check[ -]?list/i,
 PREMIUM_CONFIRMED:/premium/i, DEDUCTIBLE_CONFIRMED:/deductible/i, MOOP_CONFIRMED:/maximum out.of.pocket/i,
 PROVIDER_NETWORK_CONFIRMED:/provider|doctor|network/i, PHARMACY_NETWORK_CONFIRMED:/pharmacy/i,
 DRUG_COVERAGE_CONFIRMED:/(?:drug|prescription).{0,15}(?:coverage|benefits)/i, BENEFITS_UNDERSTOOD:/understand.{0,60}benefits|benefits.{0,40}(?:understand|clear)/i,
 COST_SHARING_UNDERSTOOD:/understand.{0,60}(?:cost|co.?pay|co.?insurance|deductible)|(?:cost|co.?pay).{0,40}(?:understand|clear)/i, DISENROLLMENT_UNDERSTOOD:/disenroll/i,
 PLAN_RULES_ACKNOWLEDGED:/plan rules|network rules/i, SUMMARY_OF_BENEFITS:/summary of benefits/i,
 STAR_RATINGS_PROVIDED:/star.{0,15}rating/i, ENROLLMENT_FORM_EXPLAINED:/enrollment.{0,20}(?:form|application)/i,
 ENROLLMENT_VOLUNTARY:/voluntary|not required to enroll/i,
 VERBAL_CONSENT:/(?:(?:agree|consent|authorize|want).{0,60}(?:enroll|submit|application)|permission.{0,25}(?:submit|enroll you))/i,
 ENROLLMENT_CONFIRMED:/(?:submitted|completed).{0,30}(?:enrollment|application)|successfully enrolled/i,
 CONFIRMATION_NUMBER:/confirmation.{0,15}(?:number|code)/i,
 EFFECTIVE_DATE_CONFIRMED:/effective.{0,25}(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
 NEXT_STEPS_EXPLAINED:/welcome.{0,15}(?:packet|package)|receive.{0,30}(?:card|mail)/i,
 CANCELLATION_RIGHTS:/right to cancel|cancel.{0,30}(?:enrollment|application)/i,
 CONTACT_INFO_PROVIDED:/my.{0,20}(?:phone|number)|reach (?:me|us)/i,
 CARRIER_CONTACT_PROVIDED:/member services|carrier.{0,20}(?:phone|number)/i,
 BENEFICIARY_QUESTIONS:/(?:any|other).{0,15}questions/i,
};
export const RETIRED_RULE_IDS=new Set(ALL_INTENTS.filter(i=>!SCRIPT_RULE_BASIS[i.intent_code]).map(i=>i.intent_code));
const judgment=/^(?:CONDUCT_|RECORD_|agent_|client_)|(?:ACCURATE|MISLEADING|UNSUBSTANTIATED|MATCHES_NEEDS|SUITABILITY|SCOPE_MATCH|SCOPE_VIOLATION|HEALTH_NEEDS|HEALTH_HISTORY|DETAILS|NAMES_CAPTURED|NAME_CAPTURED|FINANCIAL|SENSITIVITY|SATISFACTION|SUMMARY_STATED|NETWORK_CHECK|FORMULARY|COSTS_QUOTED|SNP_ELIGIBILITY|MULTIPLE_PLANS)/;
export const RULE_CATALOG=ALL_INTENTS.map(intent=>{
 const suffix=intent.intent_code.replace(/^[A-Z]+(?:_[A-Z]+)?_\d+_/, '');
 const special=/TPMO|^SOA_00[134]/.test(intent.intent_code);
 const pattern=topics[suffix];
 const bucket=RETIRED_RULE_IDS.has(intent.intent_code)?'RETIRE':SCRIPT_RULE_BASIS[intent.intent_code]?.metadataOnly?'DETERMINISTIC':(special||pattern)&&!judgment.test(intent.intent_code)?'DETERMINISTIC':'JUDGMENT';
 const wording=intent.intent_code==='SOA_001_SOA_REFERENCE'?{intent_name:'Scope agreement obtained',description:'Obtain the beneficiary agreement to discuss the scripted product options.'}:intent.intent_code==='NEEDS_014_TRAVEL_FREQUENCY'?{intent_name:'Asks about travel or living elsewhere',description:'Ask whether travel or living elsewhere is part of the beneficiary lifestyle.'}:intent.intent_code==='CONDUCT_011_NO_SAVINGS_CLAIMS'?{intent_name:'No prohibited unrealized-cost savings comparison',description:'Flag only savings comparisons based on the unrealized uninsured/dual-eligible costs prohibited by 42 CFR 422.2263(b)(10).'}:{};
 return {...intent,...wording,id:intent.intent_code,bucket,pattern,scriptBasis:SCRIPT_RULE_BASIS[intent.intent_code]||null,decided_by:bucket==='DETERMINISTIC'?'Code':'AI',
  requiresReply:/CONSENT|^SOA_00[134]|^PECL_/.test(intent.intent_code),
  reviewNote:RETIRED_RULE_IDS.has(intent.intent_code)?'Excluded from the script/CMS allowlist; not graded.':bucket==='JUDGMENT'?'Requires contextual review; never auto-fail.':'Statement presence only; factual accuracy is separately reviewed.'};
});

export const ACTIVE_RULE_CATALOG=RULE_CATALOG.filter(r=>r.bucket!=='RETIRE');
