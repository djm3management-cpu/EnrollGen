// Explicit reviewed allowlist. A similar keyword in another script is not a basis.
// Lines refer to the unchanged on-disk scripts; inventory tests verify the anchors.
const ma=(line)=>({product:'MA',file:'src/data/maScript2027.js',line});
const ms=(line)=>({product:'MEDSUP',file:'src/context/MedSupScript.js',line});
const u65=(line)=>({product:'U65',file:'src/flows/u65/U65Data.js',line});
const aca=(line)=>({product:'ACA',file:'src/flows/aca/ACAData.js',line});
export const SCRIPT_RULE_BASIS={};
function add(ids,stage,sources,extra={}){for(const id of ids.split(' '))SCRIPT_RULE_BASIS[id]={stage,sources,...extra};}
add('CALL_OPEN_001_RECORDING_ANNOUNCE CALL_OPEN_002_RECORDING_CONSENT','opening',[ma(15),ms(11),aca(13)]);
add('CALL_OPEN_003_RECORDING_DECLINE','opening',[ma(14),aca(19)]);
add('CALL_OPEN_004_AGENT_IDENTIFY_NAME CALL_OPEN_005_AGENT_IDENTIFY_AGENCY','opening',[ma(142),ms(10),aca(12),u65(96)]);
add('CALL_OPEN_006_AGENT_LICENSED','opening',[ma(142),aca(13)]);
add('CALL_OPEN_007_CALL_PURPOSE','opening',[ma(144),aca(13),u65(96)]);
add('CALL_OPEN_008_TPMO_DISCLAIMER_2027 CALL_OPEN_009_TPMO_TIMING_2027 CALL_OPEN_010_TPMO_ORG_COUNT CALL_OPEN_011_TPMO_PLAN_COUNT CALL_OPEN_013_TPMO_RESOURCE_2027','opening',[ma(22),ma(170)],{cmsCore:'TPMO disclosure before benefit discussion, as specified in the approved task'});
add('CALL_OPEN_014_OUTBOUND_PTC_VALID','opening',[ma(149)],{metadataOnly:'ptc_on_file'});
add('CALL_OPEN_015_INBOUND_GREETING','opening',[ma(142),ms(10)]);
add('SOA_001_SOA_REFERENCE SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027 SOA_004_SOA_SCOPE_STATED SOA_005_SOA_SCOPE_MATCH SOA_006_SOA_SCOPE_VIOLATION','opening',[ma(170),ma(171),ma(173)],{cmsCore:'SOA agreement and agreed product scope before plan discussion, as specified in the approved task'});
add('ELIG_001_PARTS_AB_CONFIRM','qualifications',[ma(180),ms(32)]);
add('ELIG_003_SERVICE_AREA_CHECK ELIG_004_ZIP_CODE_CONFIRM ELIG_005_COUNTY_CONFIRM','qualifications',[ma(16)]);
add('ELIG_006_ELECTION_PERIOD_VERIFY','qualifications',[ma(211)]);
add('ELIG_007_SEP_REASON_DOCUMENTED','qualifications',[ma(211),{product:'MA',file:'src/lib/maScriptFlow.js',line:15},aca(38),aca(39)],{condition:'identified_sep'});
add('ELIG_008_EFFECTIVE_DATE_STATED','application',[ma(259),ms(75),aca(174)]);
add('ELIG_009_MEDICAID_STATUS_CHECK','qualifications',[ma(187)]);
add('NEEDS_001_HEALTH_NEEDS_ASKED','needs',[ma(217),ma(231)]);
add('NEEDS_002_HEALTH_HISTORY_ASKED','needs',[ms(47),ms(48)]);
add('NEEDS_003_CURRENT_MEDICATIONS NEEDS_004_MEDICATION_DETAILS','needs',[ma(221),ma(224)]);
add('NEEDS_005_CURRENT_PROVIDERS NEEDS_006_PROVIDER_NAMES_CAPTURED','needs',[ma(217),ma(219)]);
add('NEEDS_007_PREFERRED_PHARMACY NEEDS_008_PHARMACY_NAME_CAPTURED','needs',[ma(227),ma(228)]);
add('NEEDS_011_CURRENT_COVERAGE_TYPE','needs',[ma(217),ms(34)]);
add('NEEDS_012_SATISFACTION_CURRENT NEEDS_014_TRAVEL_FREQUENCY NEEDS_015_DENTAL_VISION_HEARING','needs',[ma(229)]);
add('NEEDS_019_NEEDS_SUMMARY_STATED','needs',[ma(231)]);
add('PLAN_001_PLAN_NAME_STATED PLAN_002_CARRIER_NAME_STATED','plan',[ma(241),ma(259),ms(59),ms(60),aca(145)]);
add('PLAN_003_PLAN_TYPE_EXPLAINED PLAN_008_NETWORK_TYPE_EXPLAINED','plan',[ma(118),ma(119),ma(120)]);
add('PLAN_004_PREMIUM_STATED PLAN_005_DEDUCTIBLE_STATED','plan',[ma(116),ma(134),aca(145)]);
add('PLAN_011_DRUG_TIERS_EXPLAINED PLAN_013_DRUG_COSTS_QUOTED','plan',[ma(116),ma(134)]);
add('PLAN_006_MOOP_STATED','plan',[ma(130)]);
add('PLAN_007_COPAY_STRUCTURE','plan',[ma(119),ma(134),aca(145)]);
add('PLAN_010_DRUG_COVERAGE_OVERVIEW','plan',[ma(130),ma(134)]);
add('PLAN_012_FORMULARY_CHECK_DONE','plan',[ma(223),ma(225),aca(158)],{condition:'prescriptions'});
add('PLAN_014_PROVIDER_NETWORK_CHECK','plan',[ma(115),ma(218),ma(219),aca(157)]);
add('PLAN_015_DENTAL_BENEFITS PLAN_016_VISION_BENEFITS PLAN_017_HEARING_BENEFITS PLAN_018_OTC_BENEFITS PLAN_020_TRANSPORTATION_BENEFITS','plan',[ma(128)],{condition:'selected_benefit'});
add('PLAN_023_PART_B_GIVEBACK','plan',[ma(108),ma(117)],{condition:'selected_benefit'});
add('PLAN_024_SNP_ELIGIBILITY','plan',[ma(109),ma(110)],{condition:'snp'});
add('PLAN_025_BENEFITS_ACCURATE','plan',[ma(115),ma(128)],{limitedTo:'Factual descriptions of the selected EOC/SOB benefits, not generic unsupported accuracy judgments'});
add('PLAN_027_NO_MISLEADING_COMPARISONS PLAN_029_MULTIPLE_PLANS_OFFERED','plan',[ma(246)],{condition:'pdp_comparison',limitedTo:'The scripted PDP/MAPD premium comparison branch only'});
add('PLAN_030_PLAN_MATCHES_NEEDS','plan',[ma(240)]);
add('IMPACT_001_CURRENT_PLAN_DISENROLL','plan',[ma(249),ma(259)]);
add('IMPACT_002_OG_MEDICARE_IMPACT','plan',[ma(241)],{condition:'non_renewing_plan'});
add('IMPACT_004_EMPLOYER_COVERAGE_CHECK','qualifications',[ma(67),ma(69),ma(71)]);
add('IMPACT_005_VA_TRICARE_CHECK','qualifications',[ma(200)]);
add('IMPACT_006_MEDICAID_IMPACT','qualifications',[ma(189)],{condition:'medicaid'});
add('IMPACT_009_VOLUNTARY_DISENROLLMENT','opening',[ma(175)]);
// No PECL_* allowlist: MA lines 115-130/230 are benefit review instructions,
// not PECL acknowledgment wording. Line 137 delegates to an external carrier
// platform whose script is not stored here. Application questions cannot fill it.
add('ENROLL_001_ENROLLMENT_VOLUNTARY','enrollment',[ma(175)]);
add('ENROLL_002_VERBAL_CONSENT','enrollment',[ma(256),ma(259)],{cmsCore:'Enrollment consent before submission, as specified in the approved task'});
add('ENROLL_003_ENROLLMENT_CONFIRMED ENROLL_004_CONFIRMATION_NUMBER','enrollment',[ma(272),aca(174)]);
add('ENROLL_005_EFFECTIVE_DATE_CONFIRMED','enrollment',[ma(259),ms(75),aca(174)]);
add('ENROLL_007_CANCELLATION_RIGHTS','enrollment',[ma(252)]);
add('ENROLL_009_CONTACT_INFO_PROVIDED','enrollment',[ma(17),{product:'MA',file:'src/data/agencyClosing.js',line:1},ms(88)]);
add('ENROLL_011_NO_PRESSURE_TACTICS','enrollment',[ma(257)],{limitedTo:'Respect a not-ready/declined enrollment response; close rather than continue'});
add('ENROLL_013_BENEFICIARY_QUESTIONS','enrollment',[ma(250),ma(251)]);
export const SCRIPT_AUDIT_FILES=['src/data/maScript2027.js','src/data/agencyClosing.js','src/lib/maScriptFlow.js','src/context/MedSupScript.js','src/flows/aca/ACAData.js','src/flows/aca/ACAScript.jsx','src/flows/u65/U65Data.js','src/flows/u65/U65Script.jsx'];
export function normalizeProduct(product){return String(product||'').toUpperCase().replace(/[ _-]/g,'').replace(/^MEDICARESUPPLEMENT$/,'MEDSUP').replace(/^(?:MAPD|MEDICAREADVANTAGE)$/,'MA').replace(/^UNDER65$/,'U65');}
export function ruleHasScriptBasis(id,product){return !!SCRIPT_RULE_BASIS[id]?.sources.some(s=>normalizeProduct(s.product)===normalizeProduct(product));}

// CMS-only exceptions to the script allowlist, checked against primary eCFR
// text current through 2026-11-04. These are narrowly scoped obligations.
const cms=(section,summary)=>({kind:'cms',product:'MA',reference:`42 CFR ${section}`,url:`https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422/subpart-V/section-${section.split('(')[0]}`,summary});
add('CONDUCT_001_NO_CROSS_SELLING','opening',[cms('422.2263(b)(4)','Non-health product marketing during MA sales activity is prohibited.')],{limitedTo:'An actual non-health product pitch; offering a separate future review in the approved closing is not cross-selling.'});
add('CONDUCT_003_NO_CHERRY_PICKING','opening',[cms('422.2262(a)(1)(ii)-(iv)','Discriminatory income/health targeting is prohibited, with the stated SNP exceptions.')],{limitedTo:'Discriminatory targeting or refusal, not optional needs questions or legitimate SNP qualification.'});
add('CONDUCT_004_NO_MISLEADING_LANGUAGE','opening',[cms('422.2262','Materially inaccurate, misleading or confusing MA communications are prohibited.')],{limitedTo:'An evidenced materially misleading statement; missing facts or beneficiary confusion alone do not establish misconduct.'});
add('CONDUCT_011_NO_SAVINGS_CLAIMS','plan',[cms('422.2263(b)(10)','Savings claims based on specified unrealized uninsured/dual-eligible costs are prohibited.')],{condition:'plan_comparison',limitedTo:'Only the forbidden unrealized-cost savings comparison, not accurate supported savings.'});
add('ENROLL_012_NO_INCENTIVES_OFFERED','enrollment',[cms('422.2263(b)(1)-(2)','Cash/rebates and enrollment-contingent gifts are prohibited; permitted nominal unconditional gifts are distinct.')],{limitedTo:'An enrollment inducement, not a covered plan benefit or permitted unconditional nominal gift.'});
add('RECORD_001_FULL_CALL_RECORDED','opening',[cms('422.2274(g)(2)(ii)','Marketing and sales calls must be recorded and retained in their entirety.')],{metadataOnly:'full_call_recorded'});
add('RECORD_002_NO_RECORDING_GAPS','opening',[cms('422.2274(g)(2)(ii)','Entire-call recording obligation; transcript endpoints do not establish audio completeness.')],{metadataOnly:'recording_gaps_absent'});
add('RECORD_005_DATA_SHARING_CONSENT','opening',[cms('422.2274(g)(4)','Inter-TPMO sharing for marketing/enrollment requires prior express written beneficiary consent.')],{condition:'tpmo_sharing',metadataOnly:'tpmo_sharing_written_consent'});
SCRIPT_RULE_BASIS.PLAN_027_NO_MISLEADING_COMPARISONS={stage:'plan',condition:'plan_comparison',sources:[ma(246),cms('422.2263(b)(5)','Plan comparisons must be accurate, non-misleading and supportable.')],limitedTo:'An actual plan comparison, not a blanket ban on naming carriers.'};
