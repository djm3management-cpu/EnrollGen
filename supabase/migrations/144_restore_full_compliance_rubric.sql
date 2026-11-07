-- Apply after 142 with scoring disabled; skip abandoned 143. Reads the preserved original template, not the active successor.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.mark_compliance_not_applicable(p_call_id uuid,p_tenant_id uuid,p_reason text,p_rules_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; prior compliance_scorecards; selected_template uuid; card_id uuid;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF p_rules_version<>'cy2027-full-rubric-5' OR p_reason NOT IN ('Excluded call outcome','Talk time below 15 minutes','No connected product conversation reached','No original rubric for this product') THEN RAISE EXCEPTION 'Unrecognized N/A policy'; END IF;
 IF EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id AND status IN ('reserved','running')) THEN RAISE EXCEPTION 'Scoring in progress'; END IF;
 SELECT * INTO prior FROM compliance_scorecards WHERE id=c.compliance_scorecard_id AND tenant_id=c.tenant_id;
 IF prior.scoring_state='na' AND prior.rules_version=p_rules_version THEN RETURN prior.id; END IF;
 selected_template:=prior.template_id;
 IF selected_template IS NULL THEN SELECT id INTO selected_template FROM scoring_templates WHERE product_type=c.product_type AND is_active ORDER BY version DESC LIMIT 1; END IF;
 IF selected_template IS NULL THEN RAISE EXCEPTION 'No product template available for N/A header'; END IF;
 INSERT INTO compliance_scorecards(call_id,tenant_id,template_id,overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,
 auto_fail_triggered,auto_fail_reasons,category_scores,risk_level,risk_flags,corrective_actions_needed,rules_version,scoring_state,supersedes_id,tokens_used,estimated_cost_usd,request_attempts)
 VALUES(c.id,c.tenant_id,selected_template,NULL,NULL,0,0,'N/A',false,'{}','{}','low',ARRAY[p_reason],false,p_rules_version,'na',prior.id,0,0,0) RETURNING id INTO card_id;
 UPDATE call_records SET compliance_scorecard_id=card_id,metadata=coalesce(metadata,'{}')||jsonb_build_object('scoring_status','na','scoring_error',p_reason),compliance_status='na' WHERE id=c.id;
 RETURN card_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_compliance_not_applicable(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_compliance_not_applicable(uuid,uuid,text,text) TO service_role;
DO $$
DECLARE original scoring_templates; replacement uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT original FROM scoring_templates WHERE id='00000000-0000-0000-0000-000000000115';
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=original.id)<>138 OR (SELECT sum(points_possible) FROM scoring_template_items WHERE template_id=original.id)<>255 THEN RAISE EXCEPTION 'Original 138-item/255-point template not present; stop and inspect'; END IF;
 PERFORM 1 FROM scoring_templates WHERE product_type='MA' AND is_active FOR UPDATE;
 INSERT INTO scoring_templates(id,template_name,product_type,carrier_name,version,is_active,total_possible_points,passing_threshold,auto_fail_threshold,categories,policy_version)
 VALUES(replacement,'NGHS full CY2027 rubric v7','MA',original.carrier_name,(SELECT max(version)+1 FROM scoring_templates WHERE product_type='MA'),false,251,original.passing_threshold,original.auto_fail_threshold,original.categories,original.policy_version);
 WITH labels(code,label) AS (VALUES
('CALL_OPEN_001_RECORDING_ANNOUNCE','Agent must clearly inform the beneficiary that the call is being recorded before any substantive discussion begins.'),
('CALL_OPEN_002_RECORDING_CONSENT','Consent to record the telephonic enrollment. Obtain the telephonic applicant’s affirmative agreement to recording before completing the enrollment request.'),
('CALL_OPEN_003_RECORDING_DECLINE','Do not continue a telephonic enrollment after recording refusal. Do not complete telephonic enrollment without recording agreement after an explicit recording refusal.'),
('CALL_OPEN_004_AGENT_IDENTIFY_NAME','Agent must clearly state their full name so the beneficiary knows who they are speaking with.'),
('CALL_OPEN_005_AGENT_IDENTIFY_AGENCY','Agent must identify the agency or organization they represent so the beneficiary knows who is contacting them.'),
('CALL_OPEN_006_AGENT_LICENSED','Agent confirms that they are a licensed and certified insurance agent authorized to discuss Medicare plans.'),
('CALL_OPEN_007_CALL_PURPOSE','Agent must clearly state the purpose of the call so the beneficiary understands why they are being contacted.'),
('CALL_OPEN_008_TPMO_DISCLAIMER_2027','Complete CY2027 TPMO disclaimer. Give the complete applicable disclaimer before benefits, with non-exhaustive availability, both counts, Medicare resource and all-options clause; no SHIP requirement.'),
('CALL_OPEN_009_TPMO_TIMING_2027','Complete TPMO disclaimer before benefits. Complete the applicable TPMO disclaimer within a coherent 90-second passage before the first benefit discussion, not within the first minute. Include not every plan, organization and plan/product counts, Medicare.gov or 1-800-MEDICARE and all-options/help-with-plan-choices language. No SHIP requirement.'),
('CALL_OPEN_010_TPMO_ORG_COUNT','TPMO organization count. State the represented organization/carrier/company count in the disclosure before benefits.'),
('CALL_OPEN_011_TPMO_PLAN_COUNT','TPMO plan or product count. State the available plan/product count in the disclosure before benefits.'),
('CALL_OPEN_013_TPMO_RESOURCE_2027','TPMO Medicare resource and all-options clause. Provide Medicare.gov or 1-800-MEDICARE and information on all options or help with plan choices before benefits.'),
('CALL_OPEN_014_OUTBOUND_PTC_VALID','For outbound calls, the agent must confirm that a valid Permission to Contact (PTC) is on file before proceeding with the enrollment discussion.'),
('CALL_OPEN_015_INBOUND_GREETING','For inbound calls, the agent provides a professional greeting that includes their name and the organization name.'),
('SOA_001_SOA_REFERENCE','Beneficiary agreement to named product scope before plans. Obtain recorded beneficiary agreement to the named health-product types before specific-plan discussion. Same-call verbal agreement is valid; no 48-hour wait.'),
('SOA_002_SOA_DATE_CONFIRM','Agent confirms the date the Scope of Appointment was signed by the beneficiary.'),
('SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','Agreed product scope before specific plans. Obtain recorded beneficiary agreement to the named health-product types before specific-plan discussion. Same-call verbal agreement is valid; no 48-hour wait.'),
('SOA_004_SOA_SCOPE_STATED','Beneficiary agreement to named product scope before plans. Obtain recorded beneficiary agreement to the named health-product types before specific-plan discussion. Same-call verbal agreement is valid; no 48-hour wait.'),
('SOA_005_SOA_SCOPE_MATCH','Marketing within the agreed health-product scope. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('SOA_006_SOA_SCOPE_VIOLATION','Marketing beyond agreed health-product scope. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('ELIG_001_PARTS_AB_CONFIRM','Agent must confirm that the beneficiary is enrolled in both Medicare Part A and Part B, as this is a requirement for Medicare Advantage enrollment.'),
('ELIG_002_PART_B_PREMIUM','Agent informs the beneficiary that they must continue paying their Part B premium even when enrolled in a Medicare Advantage plan.'),
('ELIG_003_SERVICE_AREA_CHECK','Agent verifies that the beneficiary lives within the service area of the plans being discussed.'),
('ELIG_004_ZIP_CODE_CONFIRM','Agent confirms the beneficiary zip code for accurate plan lookup.'),
('ELIG_005_COUNTY_CONFIRM','Agent confirms the beneficiary county, as plan availability and benefits can differ by county within the same zip code.'),
('ELIG_006_ELECTION_PERIOD_VERIFY','Agent identifies which election period the beneficiary is eligible to enroll under (AEP, OEP, IEP, SEP, etc.).'),
('ELIG_007_SEP_REASON_DOCUMENTED','If the beneficiary is enrolling during a Special Enrollment Period, the agent documents the qualifying reason.'),
('ELIG_008_EFFECTIVE_DATE_STATED','Agent clearly states when the new plan coverage would become effective.'),
('ELIG_009_MEDICAID_STATUS_CHECK','Agent asks whether the beneficiary receives Medicaid or has dual-eligible status, which affects plan options and benefits.'),
('ELIG_011_NO_PII_FOR_OPTIONS','MBI/SSN collection is allowed to look up eligibility, Medicare records or current coverage, or for enrollment. Flag only a request with no lookup or enrollment purpose; use surrounding call context.'),
('ELIG_012_ZIP_ONLY_FOR_PLANS','Agent communicates that only a zip code is needed to look up available plan options, reinforcing that PII is not required for browsing.'),
('NEEDS_001_HEALTH_NEEDS_ASKED','Specific health care needs discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('NEEDS_002_HEALTH_HISTORY_ASKED','Agent asks about the beneficiary health history and any ongoing conditions they manage.'),
('NEEDS_003_CURRENT_MEDICATIONS','Agent asks what prescription medications the beneficiary currently takes.'),
('NEEDS_004_MEDICATION_DETAILS','Agent captures specific medication names and dosages to check formulary coverage.'),
('NEEDS_005_CURRENT_PROVIDERS','Agent asks about the beneficiary current healthcare providers, including primary care physician and specialists.'),
('NEEDS_006_PROVIDER_NAMES_CAPTURED','Agent captures the names of the beneficiary current providers to check network participation.'),
('NEEDS_007_PREFERRED_PHARMACY','Agent asks which pharmacy the beneficiary currently uses or prefers.'),
('NEEDS_008_PHARMACY_NAME_CAPTURED','Agent captures the specific pharmacy name and location the beneficiary prefers.'),
('NEEDS_009_FINANCIAL_CONCERNS','Agent asks about the beneficiary financial situation or budget constraints related to healthcare costs.'),
('NEEDS_010_PREMIUM_SENSITIVITY','Agent determines how sensitive the beneficiary is to monthly premium costs versus out-of-pocket costs.'),
('NEEDS_011_CURRENT_COVERAGE_TYPE','Agent asks what type of Medicare coverage the beneficiary currently has.'),
('NEEDS_012_SATISFACTION_CURRENT','Agent asks how satisfied the beneficiary is with their current coverage and what they would change.'),
('NEEDS_013_UPCOMING_PROCEDURES','Agent asks whether the beneficiary has any upcoming procedures, surgeries, or planned medical treatments.'),
('NEEDS_014_TRAVEL_FREQUENCY','Agent asks about how often the beneficiary travels, which affects network considerations for HMO versus PPO plans.'),
('NEEDS_015_DENTAL_VISION_HEARING','Agent asks about the beneficiary needs for dental, vision, and hearing care, which are supplemental benefits in MA plans.'),
('NEEDS_016_TRANSPORTATION_NEEDS','Agent asks whether the beneficiary has transportation challenges getting to medical appointments.'),
('NEEDS_017_OTC_BENEFIT_INTEREST','Agent asks whether the beneficiary would be interested in an over-the-counter benefit for purchasing health items.'),
('NEEDS_018_FITNESS_BENEFIT_INTEREST','Agent asks whether the beneficiary would be interested in a fitness or gym membership benefit.'),
('NEEDS_019_NEEDS_SUMMARY_STATED','Agent summarizes the beneficiary stated needs and priorities back to them to confirm understanding before moving to plan presentation.'),
('PLAN_001_PLAN_NAME_STATED','Agent clearly states the full official name of the plan being presented.'),
('PLAN_002_CARRIER_NAME_STATED','Agent clearly identifies the insurance carrier or company that offers the plan.'),
('PLAN_003_PLAN_TYPE_EXPLAINED','Agent explains the plan type and what it means for the beneficiary in terms of network flexibility.'),
('PLAN_004_PREMIUM_STATED','Plan premium discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PLAN_005_DEDUCTIBLE_STATED','Agent states the plan deductible, including medical and drug deductibles.'),
('PLAN_006_MOOP_STATED','Agent states the plan maximum out-of-pocket (MOOP) limit, which is the most the beneficiary would pay in a year.'),
('PLAN_007_COPAY_STRUCTURE','Health care service costs discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PLAN_008_NETWORK_TYPE_EXPLAINED','Agent clearly explains the network restrictions of the plan, including what happens if the beneficiary goes out of network.'),
('PLAN_009_REFERRAL_REQUIREMENTS','Agent explains whether the plan requires referrals to see specialists.'),
('PLAN_010_DRUG_COVERAGE_OVERVIEW','Prescription coverage and costs discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PLAN_011_DRUG_TIERS_EXPLAINED','Agent explains the drug tier system and what each tier means for costs.'),
('PLAN_012_FORMULARY_CHECK_DONE','Agent checks whether the beneficiary specific medications are on the plan formulary and reports the findings.'),
('PLAN_013_DRUG_COSTS_QUOTED','Agent provides specific cost estimates for the beneficiary medications on the plan.'),
('PLAN_014_PROVIDER_NETWORK_CHECK','Current providers network discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PLAN_015_DENTAL_BENEFITS','Agent explains the dental coverage included in the plan.'),
('PLAN_016_VISION_BENEFITS','Agent explains the vision coverage included in the plan.'),
('PLAN_017_HEARING_BENEFITS','Agent explains the hearing coverage included in the plan.'),
('PLAN_018_OTC_BENEFITS','Agent explains the over-the-counter benefit allowance included in the plan.'),
('PLAN_019_FITNESS_BENEFITS','Agent explains the fitness or gym membership benefit included in the plan.'),
('PLAN_020_TRANSPORTATION_BENEFITS','Agent explains the transportation benefit included in the plan for rides to medical appointments.'),
('PLAN_021_TELEHEALTH_BENEFITS','Agent explains the telehealth or virtual visit benefit included in the plan.'),
('PLAN_022_STAR_RATING_MENTIONED','Agent mentions the plan CMS star rating and explains what it means.'),
('PLAN_023_PART_B_GIVEBACK','Agent explains the Part B premium reduction (giveback) benefit if the plan offers one.'),
('PLAN_024_SNP_ELIGIBILITY','If presenting a Special Needs Plan, the agent confirms the beneficiary meets the SNP eligibility criteria (D-SNP, C-SNP, or I-SNP).'),
('PLAN_025_BENEFITS_ACCURATE','Accurate plan benefit statements. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('PLAN_027_NO_MISLEADING_COMPARISONS','Supportable and non-misleading plan comparisons. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('PLAN_028_NO_UNSUBSTANTIATED_CLAIMS','Supported marketing claims. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('PLAN_029_MULTIPLE_PLANS_OFFERED','Agent presents more than one plan option to the beneficiary so they can make an informed comparison.'),
('PLAN_030_PLAN_MATCHES_NEEDS','Agent connects the plan benefits back to the specific needs the beneficiary expressed during the needs assessment.'),
('IMPACT_001_CURRENT_PLAN_DISENROLL','Effect on current coverage before enrollment. Explain the effect of this enrollment on current MA coverage during plan presentation or enrollment, before submission; acknowledge replacement/disenrollment where applicable.'),
('IMPACT_002_OG_MEDICARE_IMPACT','Agent explains how enrolling in a Medicare Advantage plan affects the beneficiary Original Medicare (Parts A and B) coverage and how claims will be processed.'),
('IMPACT_003_MEDSUP_LOSS_WARNING','Agent warns the beneficiary that if they currently have a Medigap or Medicare Supplement policy, they may not be able to get it back with the same benefits and premium if they drop it to enroll in a Medicare Advantage plan.'),
('IMPACT_004_EMPLOYER_COVERAGE_CHECK','Agent asks whether the beneficiary has any employer or union group health coverage that could be affected by enrolling in a Medicare Advantage plan.'),
('IMPACT_005_VA_TRICARE_CHECK','Agent asks whether the beneficiary receives benefits through Veterans Affairs or TRICARE and explains potential interaction with Medicare Advantage enrollment.'),
('IMPACT_006_MEDICAID_IMPACT','Agent explains how enrolling in a Medicare Advantage plan may interact with or affect any Medicaid benefits the beneficiary currently receives.'),
('IMPACT_007_PART_D_PENALTY_WARNING','Agent explains the Part D late enrollment penalty and how it may apply if the beneficiary goes without creditable drug coverage.'),
('IMPACT_008_COVERAGE_GAP_WARNING','Agent explains any potential gap in coverage during the transition between the current plan and the new plan effective date.'),
('IMPACT_009_VOLUNTARY_DISENROLLMENT','Agent confirms that the beneficiary decision to enroll and disenroll from their current plan is entirely voluntary and that they are under no obligation to proceed.'),
('PECL_001_CHECKLIST_REFERENCED','Agent references the Pre-Enrollment Checklist (PECL) and begins walking through the required items with the beneficiary.'),
('PECL_002_PREMIUM_CONFIRMED','Premium discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_003_DEDUCTIBLE_CONFIRMED','Agent confirms the plan deductible amounts, including medical and drug deductibles, and the beneficiary acknowledges understanding.'),
('PECL_004_MOOP_CONFIRMED','Agent confirms the plan maximum out-of-pocket (MOOP) limit and the beneficiary acknowledges understanding this is the most they would pay in a year.'),
('PECL_005_PROVIDER_NETWORK_CONFIRMED','Current provider network discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_006_PHARMACY_NETWORK_CONFIRMED','Current pharmacy network discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_007_DRUG_COVERAGE_CONFIRMED','Prescription coverage and costs discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_008_BENEFITS_UNDERSTOOD','Plan benefits discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_009_COST_SHARING_UNDERSTOOD','Health care service costs discussion. Discuss the beneficiary-relevant topic during plan presentation or enrollment and before application submission. Match meaning, not exact checklist wording; no separate affirmative is required. Intake-only questions do not satisfy a coverage/network/cost topic.'),
('PECL_010_DISENROLLMENT_UNDERSTOOD','Effect of enrollment on current coverage before submission. Explain the effect of this enrollment on current MA coverage during plan presentation or enrollment, before submission; acknowledge replacement/disenrollment where applicable.'),
('PECL_011_PLAN_RULES_ACKNOWLEDGED','Agent confirms that the beneficiary understands the plan rules, including referral requirements, prior authorizations, and any restrictions on services.'),
('PECL_012_SUMMARY_OF_BENEFITS','Agent references the Summary of Benefits document and confirms the beneficiary has received or will receive it for their review.'),
('PECL_013_STAR_RATINGS_PROVIDED','Agent provides the plan CMS Star Rating so the beneficiary can understand the plan quality score.'),
('PECL_015_ENROLLMENT_FORM_EXPLAINED','Agent explains the enrollment form, what information is needed, and how the enrollment process will be completed.'),
('ENROLL_001_ENROLLMENT_VOLUNTARY','Agent explicitly confirms that the enrollment decision is voluntary and the beneficiary is not being pressured or obligated to enroll.'),
('ENROLL_002_VERBAL_CONSENT','Affirmative consent to enroll in the named plan. Obtain clear affirmative verbal intent to enroll before submission. Identify the selected plan anywhere in the enrollment section, linked to the assent. A name/DOB signature request followed by “And I agree” is valid.'),
('ENROLL_003_ENROLLMENT_CONFIRMED','Agent confirms to the beneficiary that the enrollment application has been successfully submitted to the carrier.'),
('ENROLL_004_CONFIRMATION_NUMBER','Agent provides the beneficiary with a confirmation number or reference number for their enrollment application.'),
('ENROLL_005_EFFECTIVE_DATE_CONFIRMED','Agent clearly states the effective date of the new plan so the beneficiary knows when their coverage will begin.'),
('ENROLL_006_NEXT_STEPS_EXPLAINED','Agent explains what the beneficiary should expect to happen after the enrollment is submitted, including what materials they will receive and any actions they may need to take.'),
('ENROLL_007_CANCELLATION_RIGHTS','Agent informs the beneficiary of their right to cancel or disenroll from the plan and the timeframe in which they can do so.'),
('ENROLL_009_CONTACT_INFO_PROVIDED','Agent provides the beneficiary with contact information for the agent or agency in case they have follow-up questions.'),
('ENROLL_010_CARRIER_CONTACT_PROVIDED','Agent provides the beneficiary with the carrier member services phone number so they can contact the plan directly with questions or issues.'),
('ENROLL_011_NO_PRESSURE_TACTICS','High-pressure conduct. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('ENROLL_012_NO_INCENTIVES_OFFERED','Prohibited enrollment inducements. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('ENROLL_013_BENEFICIARY_QUESTIONS','Agent asks the beneficiary if they have any remaining questions before ending the call, ensuring the beneficiary has an opportunity to seek clarification.'),
('CONDUCT_001_NO_CROSS_SELLING','Non-health marketing during MA sales. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_002_NO_STEERING','Incentive-driven steering. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_003_NO_CHERRY_PICKING','Discriminatory health/income targeting. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_004_NO_MISLEADING_LANGUAGE','Materially misleading statements. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_005_NO_SCOPE_CREEP','Marketing within the agreed health-product scope. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_006_PROFESSIONAL_TONE','Agent maintains a professional, respectful, and courteous tone throughout the entire call, treating the beneficiary with dignity.'),
('CONDUCT_007_PATIENCE_WITH_QUESTIONS','Agent demonstrates patience when the beneficiary asks questions, needs information repeated, or takes time to process information.'),
('CONDUCT_008_NO_RUSHING','Agent does not rush the beneficiary through the call, the enrollment process, or any required disclosures. The beneficiary is given adequate time to process and respond.'),
('CONDUCT_009_ACCURATE_INFORMATION','Accurate material information. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_010_NO_GUARANTEES','No misleading unsupported guarantees. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_011_NO_SAVINGS_CLAIMS','No misleading savings comparisons. AI may raise a timestamped, quoted REVIEW finding only. No automatic deduction or AUTO-FAIL. Administrator confirmation is required.'),
('CONDUCT_012_CARRIER_NAMES','Agent always uses the carrier or plan sponsor name when referencing or discussing a specific plan, rather than using generic terms.'),
('CONDUCT_014_BENEFICIARY_CONFUSION','System detects signs that the beneficiary is confused, uncertain, or does not understand what is being presented, including hesitation, conflicting responses, or expressions of confusion.'),
('CONDUCT_015_AGENT_CLARIFIES_CONFUSION','When the beneficiary expresses or exhibits confusion, the agent takes appropriate action to clarify the information, re-explain concepts, or offer to revisit topics.'),
('RECORD_001_FULL_CALL_RECORDED','Complete marketing/sales recording retained. Require verified stored recording/consent metadata; absence of transcript text alone does not prove compliance or a violation.'),
('RECORD_002_NO_RECORDING_GAPS','The call recording does not contain any gaps, pauses in recording, or segments where the recording was stopped and restarted.'),
('RECORD_003_AUDIO_QUALITY_ADEQUATE','The audio quality of the recording is sufficient for a compliance reviewer to hear and understand both parties clearly throughout the call.'),
('RECORD_004_SPEAKER_IDENTIFIABLE','Both the agent and the beneficiary can be clearly identified and distinguished in the recording, either through separate audio channels or clearly distinguishable voices.'),
('RECORD_005_DATA_SHARING_CONSENT','Written consent for identified inter-TPMO sharing. Require verified stored recording/consent metadata; absence of transcript text alone does not prove compliance or a violation.'),
('RECORD_006_PHI_HANDLING_COMPLIANT','Agent handles protected health information (PHI) appropriately throughout the call, only collecting what is necessary for the enrollment process and not disclosing PHI unnecessarily.'),
('RECORD_007_MBI_NOT_REQUESTED_EARLY','MBI/SSN may be requested for eligibility or current-coverage lookup, Medicare records retrieval or enrollment. Flag only collection with no supported lookup or enrollment purpose, not merely collection before enrollment.')
) INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,is_critical,display_order,notes)
 SELECT replacement,t.intent_id,l.label,t.category,t.points_possible,false,t.is_critical,t.display_order,'cy2027-full-rubric-5; original weights; CMS overrides in cmsBasis.js' FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id JOIN labels l ON l.code=i.intent_code WHERE t.template_id=original.id;
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=replacement)<>135 OR (SELECT sum(points_possible) FROM scoring_template_items WHERE template_id=replacement)<>251 THEN RAISE EXCEPTION 'Restored template mismatch'; END IF;
 UPDATE scoring_templates SET categories=(SELECT jsonb_object_agg(c.key,jsonb_set(c.value,'{max_points}',to_jsonb(coalesce((SELECT sum(t.points_possible) FROM scoring_template_items t WHERE t.template_id=replacement AND t.category=c.key),0)))) FROM jsonb_each(original.categories)c) WHERE id=replacement;
 UPDATE scoring_templates SET is_active=false WHERE product_type='MA' AND is_active;
 UPDATE scoring_templates SET is_active=true WHERE id=replacement;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
