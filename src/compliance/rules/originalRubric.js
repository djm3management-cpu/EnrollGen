// Original active MA template 00000000-0000-0000-0000-000000000115, 138 items / 255 points. No call data.
export const ORIGINAL_MA_RUBRIC={
  "NEEDS_005_CURRENT_PROVIDERS": {
    "question_text": "Agent asks about the beneficiary current healthcare providers, including primary care physician and specialists.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 2,
    "display_order": 21
  },
  "NEEDS_004_MEDICATION_DETAILS": {
    "question_text": "Agent captures specific medication names and dosages to check formulary coverage.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 20
  },
  "CALL_OPEN_007_CALL_PURPOSE": {
    "question_text": "Agent must clearly state the purpose of the call so the beneficiary understands why they are being contacted.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 6
  },
  "PECL_007_DRUG_COVERAGE_CONFIRMED": {
    "question_text": "Agent confirms that the beneficiary understands how their prescription drugs are covered under the plan formulary and any applicable tier copays or restrictions.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 71
  },
  "IMPACT_004_EMPLOYER_COVERAGE_CHECK": {
    "question_text": "Agent asks whether the beneficiary has any employer or union group health coverage that could be affected by enrolling in a Medicare Advantage plan.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 2,
    "display_order": 59
  },
  "PLAN_001_PLAN_NAME_STATED": {
    "question_text": "Agent clearly states the full official name of the plan being presented.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 32
  },
  "CONDUCT_007_PATIENCE_WITH_QUESTIONS": {
    "question_text": "Agent demonstrates patience when the beneficiary asks questions, needs information repeated, or takes time to process information.",
    "category": "SALES_CONDUCT",
    "points_possible": 1,
    "display_order": 907
  },
  "PLAN_006_MOOP_STATED": {
    "question_text": "Agent states the plan maximum out-of-pocket (MOOP) limit, which is the most the beneficiary would pay in a year.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 37
  },
  "CONDUCT_014_BENEFICIARY_CONFUSION": {
    "question_text": "System detects signs that the beneficiary is confused, uncertain, or does not understand what is being presented, including hesitation, conflicting responses, or expressions of confusion.",
    "category": "SALES_CONDUCT",
    "points_possible": 2,
    "display_order": 914
  },
  "CALL_OPEN_011_TPMO_PLAN_COUNT": {
    "question_text": "The TPMO disclaimer must include the number of plans the agent can offer in the beneficiary area.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 7
  },
  "PECL_010_DISENROLLMENT_UNDERSTOOD": {
    "question_text": "Agent confirms that the beneficiary understands the effect of enrolling in this plan on their current coverage, including disenrollment from their existing plan.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 3,
    "display_order": 74
  },
  "PLAN_029_MULTIPLE_PLANS_OFFERED": {
    "question_text": "Agent presents more than one plan option to the beneficiary so they can make an informed comparison.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 32
  },
  "IMPACT_009_VOLUNTARY_DISENROLLMENT": {
    "question_text": "Agent confirms that the beneficiary decision to enroll and disenroll from their current plan is entirely voluntary and that they are under no obligation to proceed.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 3,
    "display_order": 64
  },
  "PLAN_025_BENEFITS_ACCURATE": {
    "question_text": "All benefits described by the agent must accurately reflect the actual plan Summary of Benefits. No embellishment or misrepresentation.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 3,
    "display_order": 901
  },
  "ELIG_001_PARTS_AB_CONFIRM": {
    "question_text": "Agent must confirm that the beneficiary is enrolled in both Medicare Part A and Part B, as this is a requirement for Medicare Advantage enrollment.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 2,
    "display_order": 11
  },
  "ENROLL_008_CMS_REVIEW_PERIOD": {
    "question_text": "Agent mentions that the enrollment is subject to CMS review and that the carrier will confirm once the enrollment is approved.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 87
  },
  "PLAN_023_PART_B_GIVEBACK": {
    "question_text": "Agent explains the Part B premium reduction (giveback) benefit if the plan offers one.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 54
  },
  "PLAN_019_FITNESS_BENEFITS": {
    "question_text": "Agent explains the fitness or gym membership benefit included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 50
  },
  "IMPACT_006_MEDICAID_IMPACT": {
    "question_text": "Agent explains how enrolling in a Medicare Advantage plan may interact with or affect any Medicaid benefits the beneficiary currently receives.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 2,
    "display_order": 61
  },
  "CALL_OPEN_001_RECORDING_ANNOUNCE": {
    "question_text": "Agent must clearly inform the beneficiary that the call is being recorded before any substantive discussion begins.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 1
  },
  "CONDUCT_001_NO_CROSS_SELLING": {
    "question_text": "Agent does not cross-sell non-health-related insurance products such as annuities, life insurance, or financial products during a Medicare Advantage enrollment call.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 901
  },
  "IMPACT_001_CURRENT_PLAN_DISENROLL": {
    "question_text": "Agent clearly explains that enrolling in the new Medicare Advantage plan will cause the beneficiary to be disenrolled from their current plan.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 2,
    "display_order": 56
  },
  "RECORD_005_DATA_SHARING_CONSENT": {
    "question_text": "Evaluate only when beneficiary personal data is shared with another TPMO for later contact. Require prior express written consent identifying the receiving TPMO. Live warm transfers during the current call, ordinary carrier enrollment submissions, and calls with no such sharing do not trigger this flag. Do not infer a missing written consent from silence; uncertain applicability is unscored.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 3,
    "display_order": 905
  },
  "RECORD_006_PHI_HANDLING_COMPLIANT": {
    "question_text": "Agent handles protected health information (PHI) appropriately throughout the call, only collecting what is necessary for the enrollment process and not disclosing PHI unnecessarily.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 2,
    "display_order": 906
  },
  "CALL_OPEN_002_RECORDING_CONSENT": {
    "question_text": "Beneficiary must verbally consent to the call being recorded before the enrollment discussion can continue.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 2
  },
  "PLAN_030_PLAN_MATCHES_NEEDS": {
    "question_text": "Agent connects the plan benefits back to the specific needs the beneficiary expressed during the needs assessment.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 905
  },
  "ELIG_010_ESRD_STATUS_CHECK": {
    "question_text": "Agent asks whether the beneficiary has End-Stage Renal Disease, which affects eligibility for certain Medicare Advantage plans.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 17
  },
  "PLAN_007_COPAY_STRUCTURE": {
    "question_text": "Agent explains the copay structure for common services like PCP visits, specialist visits, urgent care, and ER.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 38
  },
  "PECL_013_STAR_RATINGS_PROVIDED": {
    "question_text": "Agent provides the plan CMS Star Rating so the beneficiary can understand the plan quality score.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 77
  },
  "PLAN_004_PREMIUM_STATED": {
    "question_text": "Agent clearly states the monthly premium for the plan, including if it is zero dollars.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 35
  },
  "NEEDS_012_SATISFACTION_CURRENT": {
    "question_text": "Agent asks how satisfied the beneficiary is with their current coverage and what they would change.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 24
  },
  "PECL_002_PREMIUM_CONFIRMED": {
    "question_text": "Agent confirms the plan monthly premium and the beneficiary acknowledges understanding the premium obligation.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 66
  },
  "PLAN_028_NO_UNSUBSTANTIATED_CLAIMS": {
    "question_text": "Claims, including superlatives such as best or number one, must be accurate and supportable by applicable plan documents or reliable data. Superlatives are allowed when supportable; neither a superlative alone nor unavailable supporting documents proves a violation.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 3,
    "display_order": 904
  },
  "PECL_003_DEDUCTIBLE_CONFIRMED": {
    "question_text": "Agent confirms the plan deductible amounts, including medical and drug deductibles, and the beneficiary acknowledges understanding.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 67
  },
  "PLAN_016_VISION_BENEFITS": {
    "question_text": "Agent explains the vision coverage included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 47
  },
  "NEEDS_019_NEEDS_SUMMARY_STATED": {
    "question_text": "Agent summarizes the beneficiary stated needs and priorities back to them to confirm understanding before moving to plan presentation.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 31
  },
  "NEEDS_010_PREMIUM_SENSITIVITY": {
    "question_text": "Agent determines how sensitive the beneficiary is to monthly premium costs versus out-of-pocket costs.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 23
  },
  "CONDUCT_003_NO_CHERRY_PICKING": {
    "question_text": "Agent does not discriminate against beneficiaries based on health status, pre-existing conditions, or disability. Agent does not discourage enrollment based on the beneficiary health conditions.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 903
  },
  "NEEDS_002_HEALTH_HISTORY_ASKED": {
    "question_text": "Agent asks about the beneficiary health history and any ongoing conditions they manage.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 2,
    "display_order": 19
  },
  "CONDUCT_002_NO_STEERING": {
    "question_text": "Agent does not steer the beneficiary toward a specific plan based on agent compensation or preference rather than the beneficiary actual needs.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 902
  },
  "ELIG_004_ZIP_CODE_CONFIRM": {
    "question_text": "Agent confirms the beneficiary zip code for accurate plan lookup.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 13
  },
  "CALL_OPEN_003_RECORDING_DECLINE": {
    "question_text": "If the beneficiary declines the recording, the agent must end the call and cannot proceed with an enrollment discussion.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 2
  },
  "PECL_009_COST_SHARING_UNDERSTOOD": {
    "question_text": "Agent confirms that the beneficiary understands their cost-sharing obligations including copays, coinsurance, and how costs may vary by service type and provider network status.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 73
  },
  "IMPACT_002_OG_MEDICARE_IMPACT": {
    "question_text": "Agent explains how enrolling in a Medicare Advantage plan affects the beneficiary Original Medicare (Parts A and B) coverage and how claims will be processed.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 2,
    "display_order": 57
  },
  "ELIG_009_MEDICAID_STATUS_CHECK": {
    "question_text": "Agent asks whether the beneficiary receives Medicaid or has dual-eligible status, which affects plan options and benefits.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 16
  },
  "ELIG_006_ELECTION_PERIOD_VERIFY": {
    "question_text": "Agent identifies which election period the beneficiary is eligible to enroll under (AEP, OEP, IEP, SEP, etc.).",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 2,
    "display_order": 14
  },
  "IMPACT_003_MEDSUP_LOSS_WARNING": {
    "question_text": "Agent warns the beneficiary that if they currently have a Medigap or Medicare Supplement policy, they may not be able to get it back with the same benefits and premium if they drop it to enroll in a Medicare Advantage plan.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 3,
    "display_order": 58
  },
  "PECL_006_PHARMACY_NETWORK_CONFIRMED": {
    "question_text": "Agent confirms that the beneficiary understands they should use in-network pharmacies and has verified their preferred pharmacy participates in the plan.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 70
  },
  "CALL_OPEN_010_TPMO_ORG_COUNT": {
    "question_text": "The TPMO disclaimer must include the number of organizations (carriers) the agent represents.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 7
  },
  "CONDUCT_013_NO_COMPARISON_BY_NAME": {
    "question_text": "Agent does not negatively compare plans by naming competing carriers or disparaging other companies without the beneficiary requesting such a comparison.",
    "category": "SALES_CONDUCT",
    "points_possible": 2,
    "display_order": 913
  },
  "NEEDS_001_HEALTH_NEEDS_ASKED": {
    "question_text": "Agent asks an open-ended question about the beneficiary general healthcare needs and priorities.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 2,
    "display_order": 18
  },
  "NEEDS_009_FINANCIAL_CONCERNS": {
    "question_text": "Agent asks about the beneficiary financial situation or budget constraints related to healthcare costs.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 23
  },
  "SOA_002_SOA_DATE_CONFIRM": {
    "question_text": "Agent confirms the date the Scope of Appointment was signed by the beneficiary.",
    "category": "SOA_VERIFICATION",
    "points_possible": 2,
    "display_order": 9
  },
  "PLAN_024_SNP_ELIGIBILITY": {
    "question_text": "If presenting a Special Needs Plan, the agent confirms the beneficiary meets the SNP eligibility criteria (D-SNP, C-SNP, or I-SNP).",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 55
  },
  "RECORD_001_FULL_CALL_RECORDED": {
    "question_text": "The entire enrollment call is recorded from beginning to end without the recording being stopped and restarted at any point.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 3,
    "display_order": 901
  },
  "NEEDS_003_CURRENT_MEDICATIONS": {
    "question_text": "Agent asks what prescription medications the beneficiary currently takes.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 2,
    "display_order": 20
  },
  "CALL_OPEN_005_AGENT_IDENTIFY_AGENCY": {
    "question_text": "Agent must identify the agency or organization they represent so the beneficiary knows who is contacting them.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 4
  },
  "CONDUCT_015_AGENT_CLARIFIES_CONFUSION": {
    "question_text": "When the beneficiary expresses or exhibits confusion, the agent takes appropriate action to clarify the information, re-explain concepts, or offer to revisit topics.",
    "category": "SALES_CONDUCT",
    "points_possible": 2,
    "display_order": 915
  },
  "ENROLL_003_ENROLLMENT_CONFIRMED": {
    "question_text": "Agent confirms to the beneficiary that the enrollment application has been successfully submitted to the carrier.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 2,
    "display_order": 82
  },
  "NEEDS_006_PROVIDER_NAMES_CAPTURED": {
    "question_text": "Agent captures the names of the beneficiary current providers to check network participation.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 21
  },
  "RECORD_003_AUDIO_QUALITY_ADEQUATE": {
    "question_text": "The audio quality of the recording is sufficient for a compliance reviewer to hear and understand both parties clearly throughout the call.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 2,
    "display_order": 903
  },
  "CALL_OPEN_006_AGENT_LICENSED": {
    "question_text": "Agent confirms that they are a licensed and certified insurance agent authorized to discuss Medicare plans.",
    "category": "CALL_OPENING",
    "points_possible": 1,
    "display_order": 5
  },
  "CONDUCT_006_PROFESSIONAL_TONE": {
    "question_text": "Agent maintains a professional, respectful, and courteous tone throughout the entire call, treating the beneficiary with dignity.",
    "category": "SALES_CONDUCT",
    "points_possible": 1,
    "display_order": 906
  },
  "CONDUCT_004_NO_MISLEADING_LANGUAGE": {
    "question_text": "Agent does not use misleading, deceptive, or confusing language that could cause the beneficiary to misunderstand plan benefits, costs, or enrollment terms.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 904
  },
  "PECL_004_MOOP_CONFIRMED": {
    "question_text": "Agent confirms the plan maximum out-of-pocket (MOOP) limit and the beneficiary acknowledges understanding this is the most they would pay in a year.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 68
  },
  "PLAN_009_REFERRAL_REQUIREMENTS": {
    "question_text": "Agent explains whether the plan requires referrals to see specialists.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 40
  },
  "PLAN_015_DENTAL_BENEFITS": {
    "question_text": "Agent explains the dental coverage included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 46
  },
  "ENROLL_002_VERBAL_CONSENT": {
    "question_text": "Agent obtains a clear, affirmative verbal consent from the beneficiary to proceed with the enrollment application submission.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 3,
    "display_order": 81
  },
  "ENROLL_012_NO_INCENTIVES_OFFERED": {
    "question_text": "Agent does not offer any gifts, incentives, cash, or other inducements to encourage the beneficiary to enroll in the plan.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 3,
    "display_order": 902
  },
  "PECL_005_PROVIDER_NETWORK_CONFIRMED": {
    "question_text": "Agent confirms that the beneficiary understands they must generally use in-network providers and has verified their doctors are in the plan network.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 69
  },
  "CONDUCT_011_NO_SAVINGS_CLAIMS": {
    "question_text": "Agent does not make unsubstantiated or exaggerated claims about how much money the beneficiary will save by enrolling in the plan.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 911
  },
  "ENROLL_013_BENEFICIARY_QUESTIONS": {
    "question_text": "Agent asks the beneficiary if they have any remaining questions before ending the call, ensuring the beneficiary has an opportunity to seek clarification.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 90
  },
  "ENROLL_001_ENROLLMENT_VOLUNTARY": {
    "question_text": "Agent explicitly confirms that the enrollment decision is voluntary and the beneficiary is not being pressured or obligated to enroll.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 3,
    "display_order": 80
  },
  "CALL_OPEN_009_TPMO_TIMING_2027": {
    "question_text": "Complete the TPMO disclaimer before any benefit discussion. Elapsed call time alone does not determine compliance.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 7
  },
  "PLAN_027_NO_MISLEADING_COMPARISONS": {
    "question_text": "Agent must not make misleading or unfair comparisons between plans or between MA and Original Medicare.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 3,
    "display_order": 903
  },
  "NEEDS_007_PREFERRED_PHARMACY": {
    "question_text": "Agent asks which pharmacy the beneficiary currently uses or prefers.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 22
  },
  "PLAN_010_DRUG_COVERAGE_OVERVIEW": {
    "question_text": "Agent provides an overview of the plan prescription drug coverage, including that it is an MAPD plan with built-in Part D.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 41
  },
  "PECL_008_BENEFITS_UNDERSTOOD": {
    "question_text": "Agent confirms that the beneficiary understands the overall benefits of the plan as presented, including what is covered and how the plan works.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 72
  },
  "PECL_001_CHECKLIST_REFERENCED": {
    "question_text": "Agent references the Pre-Enrollment Checklist (PECL) and begins walking through the required items with the beneficiary.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 65
  },
  "PLAN_008_NETWORK_TYPE_EXPLAINED": {
    "question_text": "Agent clearly explains the network restrictions of the plan, including what happens if the beneficiary goes out of network.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 39
  },
  "ELIG_007_SEP_REASON_DOCUMENTED": {
    "question_text": "If the beneficiary is enrolling during a Special Enrollment Period, the agent documents the qualifying reason.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 2,
    "display_order": 14
  },
  "PLAN_021_TELEHEALTH_BENEFITS": {
    "question_text": "Agent explains the telehealth or virtual visit benefit included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 52
  },
  "PLAN_018_OTC_BENEFITS": {
    "question_text": "Agent explains the over-the-counter benefit allowance included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 49
  },
  "ELIG_003_SERVICE_AREA_CHECK": {
    "question_text": "Agent verifies that the beneficiary lives within the service area of the plans being discussed.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 2,
    "display_order": 13
  },
  "SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027": {
    "question_text": "Obtain and document beneficiary agreement to the authorized health product scope before discussing specific plans or benefits. Same-call recorded verbal SOA is allowed for telephone appointments, including scheduled outbound calls. No advance waiting period or exception is required. A scope request without beneficiary agreement does not satisfy this rule.",
    "category": "SOA_VERIFICATION",
    "points_possible": 3,
    "display_order": 0
  },
  "PECL_011_PLAN_RULES_ACKNOWLEDGED": {
    "question_text": "Agent confirms that the beneficiary understands the plan rules, including referral requirements, prior authorizations, and any restrictions on services.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 75
  },
  "CALL_OPEN_014_OUTBOUND_PTC_VALID": {
    "question_text": "For outbound calls, the agent must confirm that a valid Permission to Contact (PTC) is on file before proceeding with the enrollment discussion.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 0
  },
  "NEEDS_008_PHARMACY_NAME_CAPTURED": {
    "question_text": "Agent captures the specific pharmacy name and location the beneficiary prefers.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 22
  },
  "RECORD_007_MBI_NOT_REQUESTED_EARLY": {
    "question_text": "Agent does not request the beneficiary Medicare Beneficiary Identifier (MBI), Social Security number, or other sensitive identifiers until the enrollment portion of the call. These should only be collected when actually needed for the enrollment form.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 3,
    "display_order": 907
  },
  "ENROLL_010_CARRIER_CONTACT_PROVIDED": {
    "question_text": "Agent provides the beneficiary with the carrier member services phone number so they can contact the plan directly with questions or issues.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 89
  },
  "ELIG_002_PART_B_PREMIUM": {
    "question_text": "Agent informs the beneficiary that they must continue paying their Part B premium even when enrolled in a Medicare Advantage plan.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 12
  },
  "ENROLL_004_CONFIRMATION_NUMBER": {
    "question_text": "Agent provides the beneficiary with a confirmation number or reference number for their enrollment application.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 2,
    "display_order": 83
  },
  "CONDUCT_005_NO_SCOPE_CREEP": {
    "question_text": "Agent stays within the product types authorized by the Scope of Appointment and does not discuss plans or products not included in the SOA.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 905
  },
  "IMPACT_008_COVERAGE_GAP_WARNING": {
    "question_text": "Agent explains any potential gap in coverage during the transition between the current plan and the new plan effective date.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 2,
    "display_order": 63
  },
  "NEEDS_018_FITNESS_BENEFIT_INTEREST": {
    "question_text": "Agent asks whether the beneficiary would be interested in a fitness or gym membership benefit.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 30
  },
  "NEEDS_014_TRAVEL_FREQUENCY": {
    "question_text": "Agent asks about how often the beneficiary travels, which affects network considerations for HMO versus PPO plans.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 26
  },
  "ELIG_011_NO_PII_FOR_OPTIONS": {
    "question_text": "Agent must not ask for the Medicare Beneficiary Identifier or Social Security Number just to present plan options. PII is only needed at enrollment.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 3,
    "display_order": 901
  },
  "CONDUCT_009_ACCURATE_INFORMATION": {
    "question_text": "Agent provides only accurate and truthful information about plan benefits, costs, network, and enrollment terms. No fabricated or unverified claims.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 909
  },
  "ELIG_005_COUNTY_CONFIRM": {
    "question_text": "Agent confirms the beneficiary county, as plan availability and benefits can differ by county within the same zip code.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 13
  },
  "CALL_OPEN_013_TPMO_RESOURCE_2027": {
    "question_text": "The TPMO disclaimer must refer to Medicare.gov OR 1-800-MEDICARE for information on all options; either alone earns full credit. SHIP is not required and a SHIP-only referral does not satisfy this rule.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 7
  },
  "NEEDS_016_TRANSPORTATION_NEEDS": {
    "question_text": "Agent asks whether the beneficiary has transportation challenges getting to medical appointments.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 28
  },
  "ENROLL_009_CONTACT_INFO_PROVIDED": {
    "question_text": "Agent provides the beneficiary with contact information for the agent or agency in case they have follow-up questions.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 88
  },
  "ENROLL_006_NEXT_STEPS_EXPLAINED": {
    "question_text": "Agent explains what the beneficiary should expect to happen after the enrollment is submitted, including what materials they will receive and any actions they may need to take.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 85
  },
  "NEEDS_017_OTC_BENEFIT_INTEREST": {
    "question_text": "Agent asks whether the beneficiary would be interested in an over-the-counter benefit for purchasing health items.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 29
  },
  "CONDUCT_012_CARRIER_NAMES": {
    "question_text": "Agent always uses the carrier or plan sponsor name when referencing or discussing a specific plan, rather than using generic terms.",
    "category": "SALES_CONDUCT",
    "points_possible": 1,
    "display_order": 912
  },
  "PLAN_003_PLAN_TYPE_EXPLAINED": {
    "question_text": "Agent explains the plan type and what it means for the beneficiary in terms of network flexibility.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 34
  },
  "CALL_OPEN_008_TPMO_DISCLAIMER_2027": {
    "question_text": "Deliver the applicable approved 2027 TPMO disclaimer with actual organization and plan/product counts for the area and Medicare.gov OR 1-800-MEDICARE for all options. SHIP and stating TPMO affiliation are not required.",
    "category": "CALL_OPENING",
    "points_possible": 3,
    "display_order": 7
  },
  "ENROLL_005_EFFECTIVE_DATE_CONFIRMED": {
    "question_text": "Agent clearly states the effective date of the new plan so the beneficiary knows when their coverage will begin.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 2,
    "display_order": 84
  },
  "PLAN_012_FORMULARY_CHECK_DONE": {
    "question_text": "Agent checks whether the beneficiary specific medications are on the plan formulary and reports the findings.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 43
  },
  "ENROLL_007_CANCELLATION_RIGHTS": {
    "question_text": "Agent informs the beneficiary of their right to cancel or disenroll from the plan and the timeframe in which they can do so.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 1,
    "display_order": 86
  },
  "SOA_001_SOA_REFERENCE": {
    "question_text": "Agent must reference the Scope of Appointment form that is on file and confirm the beneficiary completed it.",
    "category": "SOA_VERIFICATION",
    "points_possible": 3,
    "display_order": 8
  },
  "PLAN_005_DEDUCTIBLE_STATED": {
    "question_text": "Agent states the plan deductible, including medical and drug deductibles.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 36
  },
  "RECORD_004_SPEAKER_IDENTIFIABLE": {
    "question_text": "Both the agent and the beneficiary can be clearly identified and distinguished in the recording, either through separate audio channels or clearly distinguishable voices.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 2,
    "display_order": 904
  },
  "SOA_005_SOA_SCOPE_MATCH": {
    "question_text": "Throughout the call, all products discussed must fall within the scope authorized by the SOA.",
    "category": "SOA_VERIFICATION",
    "points_possible": 3,
    "display_order": 901
  },
  "PLAN_020_TRANSPORTATION_BENEFITS": {
    "question_text": "Agent explains the transportation benefit included in the plan for rides to medical appointments.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 51
  },
  "PLAN_011_DRUG_TIERS_EXPLAINED": {
    "question_text": "Agent explains the drug tier system and what each tier means for costs.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 42
  },
  "CALL_OPEN_004_AGENT_IDENTIFY_NAME": {
    "question_text": "Agent must clearly state their full name so the beneficiary knows who they are speaking with.",
    "category": "CALL_OPENING",
    "points_possible": 2,
    "display_order": 3
  },
  "ENROLL_011_NO_PRESSURE_TACTICS": {
    "question_text": "Agent does not use any pressure tactics, urgency language, or coercive techniques to push the beneficiary toward enrollment.",
    "category": "ENROLLMENT_CLOSING",
    "points_possible": 3,
    "display_order": 901
  },
  "RECORD_002_NO_RECORDING_GAPS": {
    "question_text": "The call recording does not contain any gaps, pauses in recording, or segments where the recording was stopped and restarted.",
    "category": "CALL_RECORDING_COMPLIANCE",
    "points_possible": 2,
    "display_order": 902
  },
  "CONDUCT_010_NO_GUARANTEES": {
    "question_text": "Agent does not guarantee specific coverage outcomes, approval of services, or that benefits will remain unchanged in future plan years.",
    "category": "SALES_CONDUCT",
    "points_possible": 3,
    "display_order": 910
  },
  "IMPACT_005_VA_TRICARE_CHECK": {
    "question_text": "Agent asks whether the beneficiary receives benefits through Veterans Affairs or TRICARE and explains potential interaction with Medicare Advantage enrollment.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 1,
    "display_order": 60
  },
  "PLAN_014_PROVIDER_NETWORK_CHECK": {
    "question_text": "Agent verifies whether the beneficiary current providers participate in the plan network.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 2,
    "display_order": 45
  },
  "NEEDS_015_DENTAL_VISION_HEARING": {
    "question_text": "Agent asks about the beneficiary needs for dental, vision, and hearing care, which are supplemental benefits in MA plans.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 27
  },
  "PECL_015_ENROLLMENT_FORM_EXPLAINED": {
    "question_text": "Agent explains the enrollment form, what information is needed, and how the enrollment process will be completed.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 1,
    "display_order": 79
  },
  "CALL_OPEN_015_INBOUND_GREETING": {
    "question_text": "For inbound calls, the agent provides a professional greeting that includes their name and the organization name.",
    "category": "CALL_OPENING",
    "points_possible": 1,
    "display_order": 1
  },
  "PECL_012_SUMMARY_OF_BENEFITS": {
    "question_text": "Agent references the Summary of Benefits document and confirms the beneficiary has received or will receive it for their review.",
    "category": "PRE_ENROLLMENT_CHECKLIST",
    "points_possible": 2,
    "display_order": 76
  },
  "CONDUCT_008_NO_RUSHING": {
    "question_text": "Agent does not rush the beneficiary through the call, the enrollment process, or any required disclosures. The beneficiary is given adequate time to process and respond.",
    "category": "SALES_CONDUCT",
    "points_possible": 2,
    "display_order": 908
  },
  "SOA_004_SOA_SCOPE_STATED": {
    "question_text": "Agent clearly states what product types the SOA authorizes them to discuss (e.g., MA, MAPD, PDP).",
    "category": "SOA_VERIFICATION",
    "points_possible": 2,
    "display_order": 10
  },
  "ELIG_008_EFFECTIVE_DATE_STATED": {
    "question_text": "Agent clearly states when the new plan coverage would become effective.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 2,
    "display_order": 15
  },
  "NEEDS_013_UPCOMING_PROCEDURES": {
    "question_text": "Agent asks whether the beneficiary has any upcoming procedures, surgeries, or planned medical treatments.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 1,
    "display_order": 25
  },
  "PLAN_002_CARRIER_NAME_STATED": {
    "question_text": "Agent clearly identifies the insurance carrier or company that offers the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 3,
    "display_order": 33
  },
  "PLAN_022_STAR_RATING_MENTIONED": {
    "question_text": "Agent mentions the plan CMS star rating and explains what it means.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 53
  },
  "PLAN_017_HEARING_BENEFITS": {
    "question_text": "Agent explains the hearing coverage included in the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 48
  },
  "PLAN_013_DRUG_COSTS_QUOTED": {
    "question_text": "Agent provides specific cost estimates for the beneficiary medications on the plan.",
    "category": "PLAN_PRESENTATION",
    "points_possible": 1,
    "display_order": 44
  },
  "NEEDS_011_CURRENT_COVERAGE_TYPE": {
    "question_text": "Agent asks what type of Medicare coverage the beneficiary currently has.",
    "category": "NEEDS_ASSESSMENT",
    "points_possible": 2,
    "display_order": 24
  },
  "ELIG_012_ZIP_ONLY_FOR_PLANS": {
    "question_text": "Agent communicates that only a zip code is needed to look up available plan options, reinforcing that PII is not required for browsing.",
    "category": "ELIGIBILITY_VERIFICATION",
    "points_possible": 1,
    "display_order": 902
  },
  "SOA_006_SOA_SCOPE_VIOLATION": {
    "question_text": "Detects when the agent discusses product types that fall outside the authorized Scope of Appointment. This is a violation.",
    "category": "SOA_VERIFICATION",
    "points_possible": 3,
    "display_order": 902
  },
  "IMPACT_007_PART_D_PENALTY_WARNING": {
    "question_text": "Agent explains the Part D late enrollment penalty and how it may apply if the beneficiary goes without creditable drug coverage.",
    "category": "IMPACT_ON_CURRENT_COVERAGE",
    "points_possible": 1,
    "display_order": 62
  }
};
