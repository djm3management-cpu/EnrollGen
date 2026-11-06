import {ALL_INTENTS} from '../intents/index.js';
export const RULES_VERSION='cy2027-overhaul-draft-1';
// Topic matching proves a statement occurred, not that quoted plan facts are true.
// Plan accuracy and suitability always remain judgment/evidence review.
const topics={
 RECORDING_ANNOUNCE:/\b(?:call|conversation|line).{0,35}record(?:ed|ing)/i,
 RECORDING_CONSENT:/\b(?:call|conversation|line).{0,35}record(?:ed|ing)/i,
 AGENT_IDENTIFY_NAME:/\b(?:my name is|this is|i am|i'm)\s+[a-z]+/i,
 AGENT_IDENTIFY_AGENCY:/newgen|new gen|new generation|health solutions|our agency|calling from [a-z]+|here at [a-z]+/i,
 AGENT_LICENSED:/licensed.{0,20}(?:agent|sell)|certified.{0,20}agent/i,
 CALL_PURPOSE:/review.{0,40}(?:coverage|options|benefits)|help.{0,30}(?:medicare|coverage)/i,
 INBOUND_GREETING:/thank(?:s| you) for calling/i,
 PARTS_AB_CONFIRM:/part\s*a\b.{0,50}part\s*b\b/i,
 PART_B_PREMIUM:/part\s*b.{0,60}premium/i,
 ZIP_CODE_CONFIRM:/zip\s*(?:code)?/i, COUNTY_CONFIRM:/\bcounty\b/i,
 ELECTION_PERIOD_VERIFY:/annual enrollment|open enrollment|special enrollment|initial enrollment|\b(?:AEP|OEP|SEP|IEP)\b/i,
 SEP_REASON_DOCUMENTED:/special enrollment.{0,100}(?:because|qualif|mov|lost)|qualifying.{0,20}event/i,
 EFFECTIVE_DATE_STATED:/(?:effective|take effect).{0,25}(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
 MEDICAID_STATUS_CHECK:/\bmedicaid\b|dual eligible/i,
 CURRENT_MEDICATIONS:/medications?|prescriptions?/i, CURRENT_PROVIDERS:/doctors?|providers?|specialists?/i,
 PREFERRED_PHARMACY:/\bpharmac(?:y|ies)\b/i, CURRENT_COVERAGE_TYPE:/current.{0,25}(?:coverage|insurance|plan)/i,
 UPCOMING_PROCEDURES:/coming up|upcoming|planned.{0,20}(?:surgery|procedure)/i,
 TRAVEL_FREQUENCY:/\btravel\b/i, DENTAL_VISION_HEARING:/dental|vision|hearing/i,
 TRANSPORTATION_NEEDS:/transportation/i, OTC_BENEFIT_INTEREST:/\botc\b|over.the.counter/i,
 FITNESS_BENEFIT_INTEREST:/fitness|gym|silver.?sneakers/i,
 PLAN_TYPE_EXPLAINED:/\b(?:HMO|PPO)\b.{0,100}(?:network|referral|provider)|(?:network|referral|provider).{0,100}\b(?:HMO|PPO)\b/i,
 PREMIUM_STATED:/premium.{0,35}(?:\$?\d|zero|no cost)/i,
 DEDUCTIBLE_STATED:/deductible.{0,35}(?:\$?\d|zero|no)/i,
 MOOP_STATED:/maximum out.of.pocket|out.of.pocket maximum/i,
 COPAY_STRUCTURE:/co.?pay|co.?insurance/i, NETWORK_TYPE_EXPLAINED:/in.network|out.of.network/i,
 REFERRAL_REQUIREMENTS:/referral/i, DRUG_COVERAGE_OVERVIEW:/part\s*d|prescription.{0,20}coverage/i,
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
 CHECKLIST_REFERENCED:/pre.enrollment checklist/i,
 PREMIUM_CONFIRMED:/premium/i, DEDUCTIBLE_CONFIRMED:/deductible/i, MOOP_CONFIRMED:/maximum out.of.pocket/i,
 PROVIDER_NETWORK_CONFIRMED:/provider|doctor|network/i, PHARMACY_NETWORK_CONFIRMED:/pharmacy/i,
 DRUG_COVERAGE_CONFIRMED:/drug coverage|prescription coverage/i, BENEFITS_UNDERSTOOD:/understand.{0,30}benefits/i,
 COST_SHARING_UNDERSTOOD:/understand.{0,40}(?:cost|copay)/i, DISENROLLMENT_UNDERSTOOD:/disenroll/i,
 PLAN_RULES_ACKNOWLEDGED:/plan rules|network rules/i, SUMMARY_OF_BENEFITS:/summary of benefits/i,
 STAR_RATINGS_PROVIDED:/star.{0,15}rating/i, ENROLLMENT_FORM_EXPLAINED:/enrollment.{0,20}(?:form|application)/i,
 ENROLLMENT_VOLUNTARY:/voluntary|not required to enroll/i,
 VERBAL_CONSENT:/(?:agree|consent|permission|authorize|want).{0,60}(?:enroll|submit|application)/i,
 ENROLLMENT_CONFIRMED:/(?:submitted|completed).{0,30}(?:enrollment|application)|successfully enrolled/i,
 CONFIRMATION_NUMBER:/confirmation.{0,15}(?:number|code)/i,
 EFFECTIVE_DATE_CONFIRMED:/effective.{0,25}(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
 NEXT_STEPS_EXPLAINED:/welcome.{0,15}(?:packet|package)|receive.{0,30}(?:card|mail)/i,
 CANCELLATION_RIGHTS:/right to cancel|cancel.{0,30}(?:enrollment|application)/i,
 CONTACT_INFO_PROVIDED:/my.{0,20}(?:phone|number)|reach (?:me|us)/i,
 CARRIER_CONTACT_PROVIDED:/member services|carrier.{0,20}(?:phone|number)/i,
 BENEFICIARY_QUESTIONS:/(?:any|other).{0,15}questions/i,
};
const retire=new Set(['ELIG_010_ESRD_STATUS_CHECK','CONDUCT_013_NO_COMPARISON_BY_NAME','ENROLL_008_CMS_REVIEW_PERIOD']);
const judgment=/^(?:CONDUCT_|RECORD_|agent_|client_)|(?:ACCURATE|MISLEADING|UNSUBSTANTIATED|MATCHES_NEEDS|SUITABILITY|SCOPE_MATCH|SCOPE_VIOLATION|HEALTH_NEEDS|HEALTH_HISTORY|DETAILS|NAMES_CAPTURED|NAME_CAPTURED|FINANCIAL|SENSITIVITY|SATISFACTION|SUMMARY_STATED|NETWORK_CHECK|FORMULARY|COSTS_QUOTED|SNP_ELIGIBILITY|MULTIPLE_PLANS)/;
export const RULE_CATALOG=ALL_INTENTS.map(intent=>{
 const suffix=intent.intent_code.replace(/^[A-Z]+(?:_[A-Z]+)?_\d+_/, '');
 const special=/TPMO|^SOA_00[134]/.test(intent.intent_code);
 const pattern=topics[suffix];
 const bucket=retire.has(intent.intent_code)?'RETIRE':(special||pattern)&&!judgment.test(intent.intent_code)?'DETERMINISTIC':'JUDGMENT';
 return {...intent,id:intent.intent_code,bucket,pattern,decided_by:bucket==='DETERMINISTIC'?'Code':'AI',
  requiresReply:/CONSENT|^SOA_00[134]|^PECL_/.test(intent.intent_code),
  reviewNote:retire.has(intent.intent_code)?'Retire pending compliance approval: not a blanket CY2027 enrollment requirement.':bucket==='JUDGMENT'?'Requires contextual review; never auto-fail.':'Statement presence only; factual accuracy is separately reviewed.'};
});
