// CMS overrides for the full original rubric. Agency practice remains independently gradeable.
const regulation=(section,summary)=>({kind:'cms',product:'MA',reference:`42 CFR ${section}`,url:`https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422/subpart-${section.startsWith('422.22')?'V':'B'}/section-${section.split('(')[0]}`,summary});
const guidance=(reference,summary)=>({kind:'cms',product:'MA',reference,url:'https://www.cms.gov/files/document/cy-2027-c-d-enrollment-disenrollment-guidance.pdf-0',summary});
export const CMS_RULE_BASIS={};
function add(id,name,stage,method,sources,extra={}){CMS_RULE_BASIS[id]={name,stage,method,sources,...extra};}
add('CALL_OPEN_009_TPMO_TIMING_2027','Complete TPMO disclaimer before benefits','plan','tpmo',[regulation('422.2267(e)(41)(i)-(ii)','Applicable multi-organization TPMO must give the complete disclaimer verbally before benefit discussion.')]);
add('SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','Agreed product scope before specific plans','plan','scope',[regulation('422.2264(c)(3)(i),(iii)','Obtain and record beneficiary agreement to the product scope before the personal marketing discussion.')]);
for(const [id,name,topic]of [
 ['PECL_005_PROVIDER_NETWORK_CONFIRMED','Current provider network discussion','providers'],
 ['PECL_006_PHARMACY_NETWORK_CONFIRMED','Current pharmacy network discussion','pharmacy'],
 ['PECL_007_DRUG_COVERAGE_CONFIRMED','Prescription coverage and costs discussion','drugs'],
 ['PECL_009_COST_SHARING_UNDERSTOOD','Health care service costs discussion','services'],
 ['PECL_002_PREMIUM_CONFIRMED','Premium discussion','premiums'],
 ['PECL_008_BENEFITS_UNDERSTOOD','Plan benefits discussion','benefits'],
 ['NEEDS_001_HEALTH_NEEDS_ASKED','Specific health care needs discussion','needs'],
])add(id,name,'enrollment','topic',[regulation('422.2274(c)(12)','Required beneficiary topics must be discussed before enrollment.')],{topic});
add('IMPACT_001_CURRENT_PLAN_DISENROLL','Effect on current coverage before enrollment','enrollment','impact',[{...guidance('CMS enrollment guidance Appendix 2 / model enrollment acknowledgments','Enrollment mechanisms must include the required acknowledgments about replacement of current MA coverage.'),url:'https://www.cms.gov/files/document/cy-2027-ma-appendices-exhibits.pdf'},regulation('422.60(c)','CMS-approved enrollment mechanism requirements apply.')]);
add('ENROLL_002_VERBAL_CONSENT','Affirmative consent to enroll in the named plan','enrollment','consent',[guidance('CMS enrollment guidance §40.1.4','Telephonic applicants must verbally attest to their intent to enroll; the approved mechanism identifies the selected plan.')]);
add('CALL_OPEN_002_RECORDING_CONSENT','Consent to record the telephonic enrollment','enrollment','recordingConsent',[guidance('CMS enrollment guidance §40.1.4','The telephonic applicant must agree to recording.')]);
add('RECORD_001_FULL_CALL_RECORDED','Complete marketing/sales recording retained','opening','metadata',[regulation('422.2274(g)(2)(ii)','Entire marketing/sales recording retention is required; transcripts cannot prove this.')],{metadataOnly:'full_call_recorded'});
add('RECORD_005_DATA_SHARING_CONSENT','Written consent for identified inter-TPMO sharing','opening','metadata',[regulation('422.2274(g)(4)','Identified inter-TPMO marketing/enrollment data sharing requires prior express written consent.')],{condition:'tpmo_sharing',metadataOnly:'tpmo_sharing_written_consent'});
add('CONDUCT_004_NO_MISLEADING_LANGUAGE','Materially misleading statements','opening','judgment',[regulation('422.2262','Materially inaccurate or misleading MA communications are prohibited.'),regulation('422.2263(b)(5),(10)','Comparisons must be supportable; specified unrealized-cost savings comparisons are prohibited.')],{limitedTo:'Supported material misrepresentation, including misleading comparisons; absence of facts alone is not misconduct.'});
add('ENROLL_011_NO_PRESSURE_TACTICS','High-pressure conduct','opening','judgment',[regulation('422.2262','Review coercive or misleading marketing conduct.'),{kind:'cms',product:'MA',reference:'CMS-4212-F, 91 FR 17453, educational-event safeguards discussion',url:'https://www.govinfo.gov/content/pkg/FR-2026-04-06/html/2026-06600.htm',summary:'CMS reiterates enforcement against high-pressure interactions that confuse vulnerable beneficiaries.'}],{limitedTo:'Coercive or confusing pressure; this is an interpretive review flag, not a standalone automatic violation or a generic tone score.'});
add('ENROLL_012_NO_INCENTIVES_OFFERED','Prohibited enrollment inducements','opening','judgment',[regulation('422.2263(b)(1)-(2)','Cash/rebates and enrollment-contingent gifts are prohibited; nominal unconditional gifts differ.')],{limitedTo:'Do not flag ordinary covered benefits or lawful unconditional nominal gifts.'});
add('CONDUCT_002_NO_STEERING','Incentive-driven steering','opening','judgment',[regulation('422.2274(c)(13)','Contract incentives may not inhibit objective assessment/recommendation of beneficiary fit.')],{limitedTo:'Evidence of incentive-driven bias, not merely recommending a particular plan. Contract/incentive facts may require administrator verification.'});
add('CONDUCT_003_NO_CHERRY_PICKING','Discriminatory health/income targeting','opening','judgment',[regulation('422.2262(a)(1)(ii)-(iv)','Discriminatory targeting is prohibited, subject to the statutory SNP exceptions.')],{limitedTo:'Legitimate needs questions and SNP eligibility checks are not discrimination.'});
add('CONDUCT_001_NO_CROSS_SELLING','Non-health marketing during MA sales','opening','judgment',[regulation('422.2263(b)(4)','Non-health product cross-selling is prohibited during MA sales activity.'),regulation('422.2264(c)(3)(iii)(C)','Non-health product marketing during the MA sales appointment is prohibited.')],{limitedTo:'An actual non-health product pitch. Offering a separate future review in the approved closing is not cross-selling.'});
add('SOA_006_SOA_SCOPE_VIOLATION','Marketing beyond agreed health-product scope','plan','judgment',[regulation('422.2264(c)(3)(iii)(A)-(B)','Marketing health products outside the agreed scope requires a separate agreement.')],{limitedTo:'An actual health-product pitch beyond the agreed scope, not an offer of a separate future appointment.'});
// Component rules retain their original separate weights, as requested.
const alias=(id,source,name,extra={})=>{CMS_RULE_BASIS[id]={...CMS_RULE_BASIS[source],name,...extra};};
for(const [id,name,method] of [
 ['CALL_OPEN_008_TPMO_DISCLAIMER_2027','Complete CY2027 TPMO disclaimer','tpmoText'],
 ['CALL_OPEN_010_TPMO_ORG_COUNT','TPMO organization count','tpmoOrg'],
 ['CALL_OPEN_011_TPMO_PLAN_COUNT','TPMO plan or product count','tpmoPlans'],
 ['CALL_OPEN_013_TPMO_RESOURCE_2027','TPMO Medicare resource and all-options clause','tpmoResource'],
])alias(id,'CALL_OPEN_009_TPMO_TIMING_2027',name,{method});
for(const id of ['SOA_001_SOA_REFERENCE','SOA_004_SOA_SCOPE_STATED'])alias(id,'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','Beneficiary agreement to named product scope before plans');
for(const id of ['SOA_005_SOA_SCOPE_MATCH','CONDUCT_005_NO_SCOPE_CREEP'])alias(id,'SOA_006_SOA_SCOPE_VIOLATION','Marketing within the agreed health-product scope');
alias('PECL_010_DISENROLLMENT_UNDERSTOOD','IMPACT_001_CURRENT_PLAN_DISENROLL','Effect of enrollment on current coverage before submission');
for(const [id,topic,name]of [
 ['PLAN_004_PREMIUM_STATED','premiums','Plan premium discussion'],['PLAN_007_COPAY_STRUCTURE','services','Health care service costs discussion'],
 ['PLAN_010_DRUG_COVERAGE_OVERVIEW','drugs','Prescription coverage and costs discussion'],['PLAN_014_PROVIDER_NETWORK_CHECK','providers','Current providers network discussion'],
])alias(id,'PECL_005_PROVIDER_NETWORK_CONFIRMED',name,{stage:'plan',topic});
for(const id of ['PLAN_025_BENEFITS_ACCURATE','PLAN_027_NO_MISLEADING_COMPARISONS','PLAN_028_NO_UNSUBSTANTIATED_CLAIMS','CONDUCT_009_ACCURATE_INFORMATION','CONDUCT_010_NO_GUARANTEES','CONDUCT_011_NO_SAVINGS_CLAIMS'])alias(id,'CONDUCT_004_NO_MISLEADING_LANGUAGE',{
 PLAN_025_BENEFITS_ACCURATE:'Accurate plan benefit statements',PLAN_027_NO_MISLEADING_COMPARISONS:'Supportable and non-misleading plan comparisons',PLAN_028_NO_UNSUBSTANTIATED_CLAIMS:'Supported marketing claims',CONDUCT_009_ACCURATE_INFORMATION:'Accurate material information',CONDUCT_010_NO_GUARANTEES:'No misleading unsupported guarantees',CONDUCT_011_NO_SAVINGS_CLAIMS:'No misleading savings comparisons'
}[id],{stage:id.startsWith('PLAN_')?'plan':'opening'});
// A refusal applies only when it was actually expressed; absence is N/A.
alias('CALL_OPEN_003_RECORDING_DECLINE','CALL_OPEN_002_RECORDING_CONSENT','Do not continue a telephonic enrollment after recording refusal',{method:'recordingRefusal'});
const criteria={
 tpmo:'Complete the applicable TPMO disclaimer within a coherent 90-second passage before the first benefit discussion, not within the first minute. Include not every plan, organization and plan/product counts, Medicare.gov or 1-800-MEDICARE and all-options/help-with-plan-choices language. No SHIP requirement.',
 tpmoText:'Give the complete applicable disclaimer before benefits, with non-exhaustive availability, both counts, Medicare resource and all-options clause; no SHIP requirement.',
 tpmoOrg:'State the represented organization/carrier/company count in the disclosure before benefits.',
 tpmoPlans:'State the available plan/product count in the disclosure before benefits.',
 tpmoResource:'Provide Medicare.gov or 1-800-MEDICARE and information on all options or help with plan choices before benefits.',
 scope:'Obtain recorded beneficiary agreement to the named health-product types before specific-plan discussion. Same-call verbal agreement is valid; no 48-hour wait.',
 topic:'Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.',
 impact:'Explain the effect of this enrollment on current MA coverage during plan presentation or enrollment, before submission; acknowledge replacement/disenrollment where applicable.',
 consent:'Obtain clear affirmative verbal intent to enroll before submission. Identify the selected plan anywhere in the enrollment section, linked to the assent. A name/DOB signature request followed by “And I agree” is valid.',
 recordingConsent:'Obtain the telephonic applicant’s affirmative agreement to recording before completing the enrollment request.',
 recordingRefusal:'Do not complete telephonic enrollment without recording agreement after an explicit recording refusal.',
 metadata:'Require verified stored recording/consent metadata; absence of transcript text alone does not prove compliance or a violation.',
 judgment:'AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.',
};
for(const basis of Object.values(CMS_RULE_BASIS))basis.criteria=criteria[basis.method];
export function normalizeProduct(product){return String(product||'').toUpperCase().replace(/[ _-]/g,'').replace(/^(?:MAPD|MEDICAREADVANTAGE)$/,'MA').replace(/^MEDICARESUPPLEMENT$/,'MEDSUP').replace(/^UNDER65$/,'U65');}
export function ruleHasCmsBasis(id,product){return !!CMS_RULE_BASIS[id]?.sources.some(s=>normalizeProduct(s.product)===normalizeProduct(product));}
export const WORDING_REFERENCE={file:'docs/MULTIPLAN_2113SMS_SalesScript2027_M   FINAL (1).pdf',date:'2026-08-03',pages:{tpmo:3,scope:5,topics:12,enrollment:16},authority:'Phrase matching only; CMS determines grading'};
