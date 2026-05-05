let dbCmsKnowledgeEntries = [];

function normalizeKnowledgeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

export function setDbCmsKnowledgeEntries(entries = []) {
  dbCmsKnowledgeEntries = Array.isArray(entries) ? entries : [];
}

const CMS_SOURCES = {
  mmcm_ch2: {
    id: "mmcm_ch2",
    title: "Medicare Communications and Marketing Guidelines, Chapter 2",
    organization: "Centers for Medicare & Medicaid Services",
    url: "https://www.cms.gov/files/document/medicare-communications-and-marketing-guidelines-mcmg.pdf",
  },
  cy2026_mmcm: {
    id: "cy2026_mmcm",
    title: "Contract Year 2026 Medicare Communications and Marketing Guidelines",
    organization: "Centers for Medicare & Medicaid Services",
    url: "https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf",
  },
  ecfr_422_2267: {
    id: "ecfr_422_2267",
    title: "42 CFR 422.2267 Required Content",
    organization: "Electronic Code of Federal Regulations",
    url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422/subpart-V/section-422.2267",
  },
  medicare_joining: {
    id: "medicare_joining",
    title: "Joining a Plan",
    organization: "Medicare.gov",
    url: "https://www.medicare.gov/basics/get-started-with-medicare/get-more-coverage/joining-a-plan",
  },
  medicare_sep: {
    id: "medicare_sep",
    title: "Special Enrollment Periods",
    organization: "Medicare.gov",
    url: "https://www.medicare.gov/basics/get-started-with-medicare/get-more-coverage/joining-a-plan/special-enrollment-periods",
  },
  medicare_oep: {
    id: "medicare_oep",
    title: "Open Enrollment",
    organization: "Medicare.gov",
    url: "https://www.medicare.gov/health-drug-plans/open-enrollment",
  },
};

const SECTION_TOPIC_MAP = {
  "Recording Disclosure": [
    "agent_identity",
    "beneficiary_permission",
  ],
  "TPMO Disclaimer": [
    "tpmo_disclaimer",
    "plan_availability_limits",
    "marketing_conduct",
  ],
  "SNP Disclosure": [
    "dsnp_eligibility",
    "csnp_eligibility",
    "lis_vs_medicaid",
    "sep_matrix",
  ],
  "POA & Scope of Appointment": [
    "scope_of_appointment",
    "beneficiary_permission",
    "product_scope_boundaries",
  ],
  Qualifications: [
    "provider_pharmacy_review",
    "coverage_effects",
    "network_accuracy",
    "enrollment_eligibility",
  ],
  "NEADS Assessment": [
    "provider_pharmacy_review",
    "coverage_effects",
    "network_accuracy",
    "marketing_conduct",
  ],
  "Plan Selection & SOB": [
    "provider_pharmacy_review",
    "benefit_accuracy",
    "network_accuracy",
    "part_b_reduction",
    "marketing_conduct",
  ],
  Enrollment: [
    "enrollment_eligibility",
    "election_periods",
    "sep_matrix",
    "effective_dates",
    "application_confirmation",
  ],
  "Wrap-Up": [
    "application_confirmation",
    "product_scope_boundaries",
    "marketing_conduct",
  ],
};

const CMS_TOPIC_LIBRARY = [
  {
    id: "agent_identity",
    title: "Agent identity and permission to continue",
    appliesTo: ["Recording Disclosure", "POA & Scope of Appointment"],
    triggerTerms: [
      "name",
      "licensed",
      "recorded",
      "permission",
      "continue",
      "beneficiary",
      "authorized representative",
    ],
    summary:
      "The agent should clearly identify who they are, explain the purpose of the call, and make sure the beneficiary or authorized decision-maker is the person engaging in the discussion before the call advances.",
    requirements: [
      "Identify the agent and agency clearly before discussing plan options.",
      "Confirm the agent is speaking with the beneficiary or a person authorized to make decisions.",
      "If someone else is making decisions, verify whether the beneficiary is available now or the discussion should be rescheduled.",
    ],
    approvedParaphrases: [
      "This can be satisfied with plain-language identity and permission language as long as the beneficiary understands who is calling and why.",
      "The agent does not need robotic phrasing; clear, direct permission language is acceptable if it covers identity, purpose, and authority to proceed.",
    ],
    redFlags: [
      "The agent starts plan marketing before confirming who is on the line.",
      "The agent treats a family member as decision-maker without checking authority or beneficiary availability.",
    ],
    coachingFocus: [
      "Warn only if the agent is clearly moving into plan discussion without identifying themselves or confirming they can proceed.",
      "If the transcript appears to begin mid-call, avoid assuming this was missed unless the agent later contradicts it.",
    ],
    citations: ["mmcm_ch2"],
  },
  {
    id: "beneficiary_permission",
    title: "Permission and beneficiary-directed discussion",
    appliesTo: ["Recording Disclosure", "POA & Scope of Appointment", "Wrap-Up"],
    triggerTerms: [
      "permission",
      "okay",
      "authorized",
      "guardian",
      "power of attorney",
      "decision",
    ],
    summary:
      "CMS marketing conversations should stay beneficiary-directed and should not continue with an unauthorized third party as if they were the enrollee.",
    requirements: [
      "If the call is for someone else, the agent should establish whether that person is present or whether the call needs to be rescheduled.",
      "The agent should not proceed into plan-specific marketing as if a non-authorized third party can enroll for the beneficiary without that authority being established.",
    ],
    approvedParaphrases: [
      "Simple questions like 'Are you helping them make decisions?' or 'Are they available to join us now?' can satisfy the intent.",
    ],
    redFlags: [
      "The agent continues the enrollment flow with a relative who is not clearly authorized.",
    ],
    coachingFocus: [
      "Flag the authority problem, not the entire section, and suggest a quick authority check or reschedule.",
    ],
    citations: ["mmcm_ch2"],
  },
  {
    id: "tpmo_disclaimer",
    title: "Third-party marketing organization disclaimer",
    appliesTo: ["TPMO Disclaimer"],
    triggerTerms: [
      "tpmo",
      "every plan",
      "organizations",
      "plans",
      "medicare.gov",
      "ship",
      "800",
      "offer every plan",
    ],
    summary:
      "A TPMO must explain that it does not offer every plan in the area, disclose how many organizations and plans it represents, and direct the beneficiary to Medicare.gov, 1-800-MEDICARE, or SHIP for all options.",
    requirements: [
      "The disclaimer should be read before or as plan-specific marketing begins, not after the enrollment conversation is already underway.",
      "The organization count and plan count should reflect the beneficiary's area, so ZIP or service-area context should exist before the count is quoted.",
      "The referral to Medicare.gov, 1-800-MEDICARE, or SHIP is part of the required content and should not be omitted.",
      "The disclaimer should not be undermined by claims that the agency offers every plan or all plans in the area.",
    ],
    approvedParaphrases: [
      "Plain-language versions such as 'We don't represent every plan in your area' are acceptable if the meaning is intact.",
      "The agent can say 'You can compare all options on Medicare.gov, by calling 1-800-MEDICARE, or through SHIP' without matching one exact script.",
    ],
    redFlags: [
      "The agent claims they have every plan, all plans, or the full market.",
      "The agent skips the plan and organization counts but continues into recommendations.",
      "The agent omits the referral to Medicare.gov, 1-800-MEDICARE, or SHIP.",
    ],
    coachingFocus: [
      "This is one of the highest-priority live interventions. If the agent is moving into recommendations without the disclaimer, intervene.",
      "If app state already has ZIP and counts completed, focus the warning on the exact missing line rather than the whole disclaimer.",
    ],
    citations: ["ecfr_422_2267", "cy2026_mmcm", "mmcm_ch2"],
  },
  {
    id: "plan_availability_limits",
    title: "Plan availability and comparison limits",
    appliesTo: ["TPMO Disclaimer", "Plan Selection & SOB", "Wrap-Up"],
    triggerTerms: [
      "best",
      "all plans",
      "every plan",
      "compare",
      "options",
      "recommend",
    ],
    summary:
      "Agents can discuss and recommend plans they are appointed to sell, but they should not imply they represent every available plan or that the beneficiary has seen every possible option unless that is true.",
    requirements: [
      "Recommendations should stay within the represented inventory and should not be framed as the total universe of Medicare options.",
      "When comparing plans, the agent should avoid unsupported superlatives like 'best plan' unless they immediately narrow the statement to the beneficiary's stated priorities.",
    ],
    approvedParaphrases: [
      "Accept language focused on fit, such as 'Based on the doctors, drugs, and costs we reviewed, this looks like a strong fit for you.'",
    ],
    redFlags: [
      "The agent says this is the best plan for everyone or the only good option.",
      "The agent uses the TPMO disclaimer and then immediately contradicts it.",
    ],
    coachingFocus: [
      "Flag unsupported certainty or blanket superiority claims, especially if they conflict with the TPMO disclaimer.",
    ],
    citations: ["ecfr_422_2267", "mmcm_ch2"],
  },
  {
    id: "scope_of_appointment",
    title: "Scope of Appointment boundaries",
    appliesTo: ["POA & Scope of Appointment", "Wrap-Up"],
    triggerTerms: [
      "scope",
      "appointment",
      "products",
      "permission",
      "dental",
      "vision",
      "hospital indemnity",
      "discuss",
    ],
    summary:
      "The discussion should stay within the products the beneficiary agreed to discuss. The agent should explain that answering questions does not obligate enrollment and does not itself enroll the beneficiary.",
    requirements: [
      "The agent should establish which categories of products are in scope before detailed marketing begins.",
      "The agent should state that the conversation does not obligate the beneficiary to enroll and does not itself enroll them.",
      "If optional products will be discussed later, those product categories should be covered by the scope language before they are marketed.",
    ],
    approvedParaphrases: [
      "Any clear plain-language version that covers no obligation, no automatic enrollment, and product categories in scope is generally acceptable.",
    ],
    redFlags: [
      "The agent pivots into dental, vision, hospital indemnity, or other non-MA products without prior permission to discuss them.",
      "The agent implies that continuing the conversation enrolls the beneficiary automatically.",
    ],
    coachingFocus: [
      "If optional products were not clearly in scope, advise the agent to get permission before cross-selling.",
    ],
    citations: ["mmcm_ch2", "cy2026_mmcm"],
  },
  {
    id: "product_scope_boundaries",
    title: "Cross-sell and product separation boundaries",
    appliesTo: ["POA & Scope of Appointment", "Wrap-Up"],
    triggerTerms: [
      "hospital indemnity",
      "dental",
      "vision",
      "ancillary",
      "optional",
      "cross sell",
      "cross-sell",
    ],
    summary:
      "Cross-selling should not blur the Medicare enrollment decision. Optional products should be introduced separately, after the Medicare discussion is clear, and only if they are in scope.",
    requirements: [
      "The Medicare Advantage enrollment should remain distinct from ancillary product marketing.",
      "The agent should not create the impression that an ancillary product is required to enroll in the Medicare plan.",
      "The agent should obtain permission before launching into ancillary product sales content.",
    ],
    approvedParaphrases: [
      "It is acceptable to transition with language such as 'Separately, and only if you'd like, we can review an optional hospital indemnity product.'",
    ],
    redFlags: [
      "Bundling MA enrollment with ancillary products as if they are one package.",
      "Presenting an optional product as required to keep or activate the Medicare plan.",
    ],
    coachingFocus: [
      "Intervene when the agent links optional products to plan eligibility or implies they are mandatory.",
    ],
    citations: ["mmcm_ch2", "cy2026_mmcm"],
  },
  {
    id: "provider_pharmacy_review",
    title: "Pre-enrollment review of doctors, drugs, and pharmacies",
    appliesTo: ["Qualifications", "NEADS Assessment", "Plan Selection & SOB"],
    triggerTerms: [
      "doctor",
      "provider",
      "pharmacy",
      "drug",
      "prescription",
      "formulary",
      "network",
    ],
    summary:
      "CMS marketing guidance expects the beneficiary to receive enough information to make an informed enrollment decision. That includes a practical review of providers, pharmacies, prescriptions, and other major access points that affect plan fit.",
    requirements: [
      "The agent should review doctors, pharmacies, and medications when those items are material to the recommendation.",
      "The agent should not assure coverage or network participation unless it has been checked.",
      "If the agent cannot verify a provider or drug immediately, they should say so and explain how it will be verified.",
    ],
    approvedParaphrases: [
      "The review can be concise if the agent clearly confirms that the beneficiary's key doctors, pharmacies, and drugs were checked or still need verification.",
    ],
    redFlags: [
      "The agent recommends a plan without addressing the beneficiary's stated doctor or drug concerns.",
      "The agent presents provider or drug coverage as certain without verification.",
    ],
    coachingFocus: [
      "Focus warnings on the exact unresolved item, such as a provider check or formulary check, instead of a vague 'do more review' message.",
    ],
    citations: ["mmcm_ch2", "medicare_joining"],
  },
  {
    id: "coverage_effects",
    title: "Impact on current coverage and continuity of care",
    appliesTo: ["Qualifications", "NEADS Assessment", "Enrollment"],
    triggerTerms: [
      "current coverage",
      "replace",
      "lose",
      "medigap",
      "employer",
      "union",
      "tricare",
      "champva",
      "cobra",
    ],
    summary:
      "Before enrollment, the beneficiary should understand whether changing plans could affect existing coverage, current providers, or other benefits. Agents should avoid downplaying those consequences.",
    requirements: [
      "The agent should identify whether the beneficiary has other coverage that could conflict with enrolling into MA or Part D.",
      "The agent should not imply that employer, union, VA, TRICARE, Medicaid, or Medigap effects are trivial if they have not been reviewed.",
      "If switching back to Original Medicare or dropping MA could create gaps, that risk should be acknowledged accurately.",
    ],
    approvedParaphrases: [
      "A short warning such as 'Before we switch this, I need to make sure it will not disrupt your current coverage' can satisfy the intent if followed through.",
    ],
    redFlags: [
      "The agent tells the beneficiary nothing else will change without checking other coverage.",
      "The agent ignores the possibility of losing employer or union coordination, VA drug strategy changes, or Medigap implications.",
    ],
    coachingFocus: [
      "Push the agent to pause and verify collateral coverage effects when they are about to submit the application.",
    ],
    citations: ["medicare_joining", "medicare_oep", "mmcm_ch2"],
  },
  {
    id: "network_accuracy",
    title: "Accuracy around networks, referrals, and authorization",
    appliesTo: ["Qualifications", "NEADS Assessment", "Plan Selection & SOB"],
    triggerTerms: [
      "network",
      "in network",
      "out of network",
      "referral",
      "prior authorization",
      "specialist",
      "provider",
    ],
    summary:
      "Network access, referrals, and prior authorization rules materially affect plan suitability. Agents should present those limitations accurately and should not oversimplify them away.",
    requirements: [
      "If a plan uses a network, the agent should accurately explain whether provider participation was verified or still needs verification.",
      "If referrals or prior authorization are part of the plan rules, the beneficiary should be told in a practical way.",
      "The agent should not state that every doctor will be covered or that network status never changes.",
    ],
    approvedParaphrases: [
      "Simple language such as 'This plan uses a network, so we need to make sure your doctors participate' is fine.",
    ],
    redFlags: [
      "The agent promises network participation without verification.",
      "The agent says referrals or prior authorization do not matter when the plan plainly uses them.",
    ],
    coachingFocus: [
      "Intervene when the agent is giving certainty that the available data does not support.",
    ],
    citations: ["mmcm_ch2"],
  },
  {
    id: "benefit_accuracy",
    title: "Benefit and cost-sharing accuracy",
    appliesTo: ["Plan Selection & SOB", "Enrollment"],
    triggerTerms: [
      "premium",
      "deductible",
      "copay",
      "co-pay",
      "moop",
      "max out of pocket",
      "extra benefits",
      "dental",
      "vision",
      "hearing",
    ],
    summary:
      "The summary of benefits conversation should cover the major financial and access terms accurately enough for an informed choice, including premium, deductible if relevant, cost-sharing, maximum out-of-pocket, network structure, drug coverage, and meaningful limitations.",
    requirements: [
      "The agent should not present supplemental benefits as guaranteed unlimited value if they have caps, conditions, or network limits.",
      "If the agent highlights a $0 premium, they should not obscure other cost-sharing obligations such as MOOP, copays, deductibles, or network restrictions.",
      "Important limitations should be disclosed rather than buried under marketing language.",
    ],
    approvedParaphrases: [
      "The order of the SOB review can vary as long as the material costs and limitations are covered clearly.",
    ],
    redFlags: [
      "The agent sells based on a single attractive benefit while skipping key plan limitations.",
      "The agent uses unrealistic cost assurances such as 'you'll basically pay nothing' without support.",
    ],
    coachingFocus: [
      "If the beneficiary has not heard the major limitation yet, recommend the exact missing item now, such as MOOP or network rules.",
    ],
    citations: ["mmcm_ch2", "cy2026_mmcm"],
  },
  {
    id: "part_b_reduction",
    title: "Part B premium reduction or giveback accuracy",
    appliesTo: ["Plan Selection & SOB"],
    triggerTerms: [
      "part b",
      "giveback",
      "reduction",
      "social security",
      "premium",
      "credit",
    ],
    summary:
      "Part B premium reduction claims should be stated carefully. The agent should avoid implying that the beneficiary will receive cash in hand or that every beneficiary receives the same reduction regardless of premium liability.",
    requirements: [
      "Explain the reduction as a Part B premium offset administered through the beneficiary's premium billing or Social Security withholding, not as free cash.",
      "Avoid guaranteeing the exact timing of the reduction unless that timing is known and carrier-supported.",
      "Make clear that the beneficiary must be paying Part B premium for the reduction to matter.",
    ],
    approvedParaphrases: [
      "Phrases like 'This plan helps reduce what you pay toward your Part B premium' are safer than calling it a cash refund.",
    ],
    redFlags: [
      "The agent calls the reduction cash back with no qualification.",
      "The agent suggests the plan will pay the beneficiary regardless of whether they owe Part B premium.",
    ],
    coachingFocus: [
      "If the agent is overselling the giveback, correct the framing immediately.",
    ],
    citations: ["mmcm_ch2"],
  },
  {
    id: "enrollment_eligibility",
    title: "Basic MA or Part D eligibility and service area rules",
    appliesTo: ["Qualifications", "Enrollment", "SNP Disclosure"],
    triggerTerms: [
      "part a",
      "part b",
      "service area",
      "eligible",
      "citizen",
      "lawfully present",
      "medicare number",
    ],
    summary:
      "To join a Medicare Advantage plan, the person generally needs Part A and Part B and must live in the plan's service area. To join a Part D plan, they need Part A or Part B depending on plan type and must otherwise meet the plan's eligibility requirements.",
    requirements: [
      "Do not proceed as if MA enrollment is valid if Part A, Part B, or service-area status is unresolved.",
      "Have the beneficiary's Medicare information and effective dates before application submission.",
      "If the person is not eligible for the plan type being discussed, the agent should pause and redirect rather than push through the application.",
    ],
    approvedParaphrases: [
      "Short phrasing such as 'I just need to confirm your Medicare parts and service area before we submit anything' is acceptable.",
    ],
    redFlags: [
      "The agent proceeds to submit without confirming core eligibility elements.",
      "The agent treats a service-area mismatch as a minor issue that can be fixed later.",
    ],
    coachingFocus: [
      "Use app state to determine which exact eligibility item is unresolved before warning.",
    ],
    citations: ["medicare_joining", "medicare_sep"],
  },
  {
    id: "election_periods",
    title: "Election period and enrollment window accuracy",
    appliesTo: ["Enrollment", "SNP Disclosure"],
    triggerTerms: [
      "aep",
      "oep",
      "sep",
      "open enrollment",
      "special enrollment",
      "election period",
      "effective date",
    ],
    summary:
      "Enrollment advice is only valid if there is a real election period supporting the change. Agents should identify the correct enrollment period and avoid making up effective dates or SEP rights.",
    requirements: [
      "For AEP, changes are generally submitted October 15 through December 7 with January 1 effect for the following year.",
      "For MA OEP, changes are limited and should not be described as if all beneficiaries can switch at any time.",
      "For SEP use, the triggering event and window should be confirmed before the application is positioned as valid.",
    ],
    approvedParaphrases: [
      "The agent can explain the period in plain terms, but the practical window and effective-date logic must be right.",
    ],
    redFlags: [
      "The agent says the beneficiary can enroll anytime with no election period basis.",
      "The agent invents an SEP without tying it to a life event or coverage change.",
    ],
    coachingFocus: [
      "This is a high-priority intervention if the agent is about to submit under a bad election period.",
    ],
    citations: ["medicare_joining", "medicare_oep", "medicare_sep"],
  },
  {
    id: "sep_matrix",
    title: "Special Enrollment Period scenario matrix",
    appliesTo: ["Enrollment", "SNP Disclosure", "Wrap-Up"],
    triggerTerms: [
      "move",
      "medicaid",
      "lis",
      "extra help",
      "cobra",
      "employer",
      "union",
      "tricare",
      "va",
      "pace",
      "5-star",
      "five star",
      "error",
      "misrepresentation",
      "chronic",
      "institution",
      "jail",
      "released",
    ],
    summary:
      "SEP rights depend on the beneficiary's life event. Common triggers include moving, losing Medicaid or employer coverage, gaining or using LIS/Medicaid monthly flexibility, institutional status, release from incarceration, contract changes, 5-star availability, chronic-condition SNP eligibility, and Medicare-recognized errors or exceptional circumstances.",
    requirements: [
      "The agent should tie the enrollment to a specific trigger, not a vague feeling that an SEP probably exists.",
      "The timing window matters. If the triggering event happened outside the allowed window, the SEP may not be valid.",
      "Some SEP rights are limited to one use, one monthly use, or only certain plan changes.",
    ],
    approvedParaphrases: [
      "A concise explanation is fine if it still identifies the event, what changes are allowed, and how long the right lasts.",
    ],
    redFlags: [
      "The agent uses 'they have Medicaid' as a universal answer for any change without clarifying whether the SEP allows the specific change.",
      "The agent uses a move SEP, loss-of-coverage SEP, or exceptional-circumstances SEP without checking timing.",
    ],
    coachingFocus: [
      "If the app or transcript suggests an SEP, guide the agent to validate the trigger and window instead of guessing.",
    ],
    citations: ["medicare_sep", "medicare_joining"],
  },
  {
    id: "effective_dates",
    title: "Effective-date accuracy",
    appliesTo: ["Enrollment", "Wrap-Up"],
    triggerTerms: [
      "effective",
      "start date",
      "coverage starts",
      "next month",
      "january 1",
      "first of the month",
    ],
    summary:
      "Coverage start dates depend on the enrollment period and when the plan receives the request. Agents should avoid promising effective dates that are not supported by the beneficiary's election period.",
    requirements: [
      "For many MA and Part D enrollments, coverage generally starts the first of the month after the plan receives the request, unless a specific enrollment period provides a different timing rule.",
      "AEP changes are typically effective January 1 of the next year if submitted by December 7.",
      "SEP timing can vary, so the agent should tie the date to the actual SEP used rather than assuming next month automatically.",
    ],
    approvedParaphrases: [
      "Plain language is fine, but the agent should signal when an effective date is expected versus guaranteed.",
    ],
    redFlags: [
      "The agent guarantees a start date that conflicts with the election period.",
      "The agent talks as if the plan is active immediately upon application.",
    ],
    coachingFocus: [
      "If the agent is overpromising the start date, correct it before application submission or wrap-up confirmation.",
    ],
    citations: ["medicare_joining", "medicare_sep", "medicare_oep"],
  },
  {
    id: "application_confirmation",
    title: "Application confirmation and next-steps accuracy",
    appliesTo: ["Enrollment", "Wrap-Up"],
    triggerTerms: [
      "confirmation",
      "application",
      "submitted",
      "tracking",
      "next steps",
      "member id",
      "id card",
    ],
    summary:
      "At the end of the application, the beneficiary should receive an accurate explanation of what was submitted, what happens next, and any confirmation or tracking details the agent actually has.",
    requirements: [
      "Do not claim the beneficiary is fully enrolled before the submission is accepted and processed.",
      "If there is a confirmation or application reference, state it accurately and separate it from any later carrier member ID.",
      "Explain next steps in a grounded way: application review, carrier materials, and when to expect plan documents or a decision.",
    ],
    approvedParaphrases: [
      "The agent can say 'Your application has been submitted' if submission really occurred, but should avoid presenting that as final activation.",
    ],
    redFlags: [
      "The agent says coverage is already active without basis.",
      "The agent invents certainty around approval, member ID timing, or card delivery.",
    ],
    coachingFocus: [
      "Focus on overstatements at wrap-up, especially certainty about activation or ancillary product linkage.",
    ],
    citations: ["medicare_joining", "mmcm_ch2"],
  },
  {
    id: "dsnp_eligibility",
    title: "D-SNP eligibility and integrated D-SNP limits",
    appliesTo: ["SNP Disclosure", "Enrollment"],
    triggerTerms: [
      "dsnp",
      "d-snp",
      "dual",
      "medicaid",
      "full medicaid",
      "integrated",
    ],
    summary:
      "D-SNP enrollment should be presented as dependent on the beneficiary's actual dual-eligible status. Integrated D-SNP monthly SEP rights are tied to full Medicaid and plan availability, not to every D-SNP broadly.",
    requirements: [
      "Do not tell a beneficiary they qualify for a D-SNP unless Medicaid status and plan eligibility are actually supported.",
      "If the conversation relies on integrated D-SNP flexibility, make sure the plan is integrated and available in the area.",
    ],
    approvedParaphrases: [
      "It is acceptable to say the plan is for people who have both Medicare and Medicaid and that eligibility will be confirmed.",
    ],
    redFlags: [
      "The agent treats LIS as if it automatically means D-SNP eligibility.",
      "The agent promises D-SNP enrollment before verifying Medicaid status.",
    ],
    coachingFocus: [
      "Correct overstatements around dual eligibility quickly and specifically.",
    ],
    citations: ["medicare_sep", "mmcm_ch2"],
  },
  {
    id: "csnp_eligibility",
    title: "C-SNP eligibility and chronic-condition verification",
    appliesTo: ["SNP Disclosure", "Enrollment"],
    triggerTerms: [
      "csnp",
      "c-snp",
      "chronic",
      "condition",
      "verification",
      "doctor",
      "physician",
    ],
    summary:
      "C-SNP enrollment depends on the beneficiary having a qualifying chronic condition served by the plan. Agents should not present C-SNP access as unconditional, and post-enrollment condition verification should be explained carefully.",
    requirements: [
      "Confirm the qualifying condition aligns with the C-SNP being discussed.",
      "Set expectations that condition verification is required and that failure to verify can affect enrollment.",
    ],
    approvedParaphrases: [
      "The agent can explain the condition verification in simple language, but should not make it sound optional.",
    ],
    redFlags: [
      "The agent pitches a C-SNP to someone with no qualifying condition review.",
      "The agent minimizes or omits the verification requirement.",
    ],
    coachingFocus: [
      "If the transcript shows a C-SNP recommendation without condition verification context, intervene.",
    ],
    citations: ["medicare_sep", "mmcm_ch2"],
  },
  {
    id: "lis_vs_medicaid",
    title: "LIS / Extra Help versus Medicaid distinction",
    appliesTo: ["SNP Disclosure", "Enrollment"],
    triggerTerms: [
      "lis",
      "extra help",
      "medicaid",
      "dual",
      "full medicaid",
    ],
    summary:
      "Extra Help and Medicaid can create SEP rights, but they are not interchangeable. LIS does not automatically mean the beneficiary is eligible for a D-SNP.",
    requirements: [
      "Do not use LIS as shorthand for full Medicaid unless actual Medicaid status is confirmed.",
      "When using LIS or Medicaid monthly SEP flexibility, be precise about which right supports which plan change.",
    ],
    approvedParaphrases: [
      "A concise distinction such as 'Extra Help may give you drug-plan flexibility, but D-SNP eligibility depends on your Medicaid status' is appropriate.",
    ],
    redFlags: [
      "The agent treats Extra Help and Medicaid as the same program.",
      "The agent uses LIS alone to justify a D-SNP recommendation.",
    ],
    coachingFocus: [
      "This is often a narrow correction. Fix the exact confusion rather than relitigating the whole SEP section.",
    ],
    citations: ["medicare_sep"],
  },
  {
    id: "marketing_conduct",
    title: "General marketing conduct safeguards",
    appliesTo: [
      "TPMO Disclaimer",
      "NEADS Assessment",
      "Plan Selection & SOB",
      "Wrap-Up",
    ],
    triggerTerms: [
      "guarantee",
      "promise",
      "free",
      "best",
      "always",
      "never",
      "must",
      "required",
    ],
    summary:
      "CMS marketing standards favor accurate, balanced, and non-misleading communications. Agents should avoid exaggerated claims, hidden limitations, and pressure tactics.",
    requirements: [
      "Do not use unsupported guarantees or universal claims.",
      "Do not omit material limitations that would change how the beneficiary understands the offer.",
      "Do not pressure the beneficiary by suggesting benefits will vanish immediately unless that is actually true under the enrollment period.",
    ],
    approvedParaphrases: [
      "Confident recommendations are fine if they stay tied to verified facts and the beneficiary's needs.",
    ],
    redFlags: [
      "The agent guarantees savings or approval.",
      "The agent says an optional step is mandatory when it is not.",
    ],
    coachingFocus: [
      "Use this as a catch-all for misleading claims that do not fit a narrower issue tag.",
    ],
    citations: ["mmcm_ch2", "cy2026_mmcm"],
  },
];

const SEP_SCENARIOS = [
  {
    id: "sep_move",
    title: "Move outside service area or qualifying move",
    triggerTerms: ["move", "moved", "address", "service area", "relocate"],
    window: "Begins with the move, or one month before if the plan is told in advance, and continues for 2 full months after the move.",
    allowedChanges: [
      "Join or switch MA or Part D",
      "Return to Original Medicare if MA is dropped",
    ],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_institution",
    title: "Lives in or recently left an institution",
    triggerTerms: ["nursing home", "institution", "rehab", "facility", "discharge"],
    window: "Ongoing while institutionalized and for 2 full months after leaving.",
    allowedChanges: [
      "Join, switch, or drop MA or Part D",
      "Return to Original Medicare",
    ],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_release",
    title: "Released from incarceration",
    triggerTerms: ["jail", "prison", "incarcerated", "released"],
    window: "2 full calendar months after release, assuming Medicare entitlement conditions are met.",
    allowedChanges: ["Join MA or Part D"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_lost_medicaid",
    title: "Lost Medicaid eligibility",
    triggerTerms: ["lost medicaid", "medicaid ended", "no longer medicaid"],
    window: "3 full months from the loss date or notice date, whichever is later.",
    allowedChanges: [
      "Join or switch MA or Part D",
      "Return to Original Medicare",
      "Drop Part D",
    ],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_lost_employer",
    title: "Lost employer, union, or COBRA coverage",
    triggerTerms: ["employer", "union", "cobra", "coverage ended", "retired"],
    window: "2 full months after the month the coverage ended.",
    allowedChanges: ["Join MA or Part D"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_creditable_loss",
    title: "Lost creditable drug coverage",
    triggerTerms: ["creditable", "drug coverage", "tricare", "va", "no longer creditable"],
    window: "2 full months after losing the coverage or receiving notice it is no longer creditable, whichever is later.",
    allowedChanges: ["Join MA-PD or stand-alone Part D"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_employer_opportunity",
    title: "Opportunity to join employer or union coverage",
    triggerTerms: ["join employer", "union coverage", "open enrollment at work"],
    window: "Whenever the employer or union allows enrollment.",
    allowedChanges: ["Drop current MA or Part D to take the employer or union plan"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_va_tricare",
    title: "Has or is taking other creditable drug coverage like VA or TRICARE",
    triggerTerms: ["va", "tricare", "creditable", "other drug coverage"],
    window: "Anytime for the plan-change rights described by Medicare.",
    allowedChanges: [
      "Drop MA-PD or Part D",
      "Switch from MA-PD to MA-only where appropriate",
    ],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_contract_change",
    title: "Plan sanction, termination, takeover, or non-renewal",
    triggerTerms: ["sanction", "terminated", "non-renewed", "taken over", "contract ended"],
    window: "Varies by event; some begin before contract end, some run through 1 to 2 months after, and non-renewals run from December 8 through the last day of February.",
    allowedChanges: ["Switch plans", "Return to Original Medicare where applicable"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_lis_monthly",
    title: "Has Medicaid or Extra Help monthly flexibility",
    triggerTerms: ["extra help", "lis", "medicaid", "monthly"],
    window: "Once per calendar month, effective the first day of the following month, subject to Medicare's listed limitations.",
    allowedChanges: [
      "Switch Part D",
      "Drop MA-PD and return to Original Medicare with a stand-alone Part D",
    ],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_integrated_dsnp",
    title: "Integrated D-SNP monthly SEP for full Medicaid",
    triggerTerms: ["integrated dsnp", "full medicaid", "dual", "d-snp"],
    window: "Once per calendar month when the beneficiary qualifies and an integrated D-SNP is available.",
    allowedChanges: ["Join or switch to an integrated D-SNP"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_5_star",
    title: "5-star SEP",
    triggerTerms: ["5-star", "five star", "star rating"],
    window: "One time between December 8 and November 30.",
    allowedChanges: ["Switch to a 5-star MA, Cost, or Part D plan available in the area"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_low_performing",
    title: "Low-performing plan SEP",
    triggerTerms: ["low performing", "under 3 stars", "three years"],
    window: "Any time while enrolled in the low-performing plan.",
    allowedChanges: ["Switch MA or Part D"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_csnp",
    title: "Chronic-condition SEP",
    triggerTerms: ["chronic", "condition", "csnp", "c-snp"],
    window: "Any time a qualifying C-SNP is available for the person's condition; the SEP ends once they enroll.",
    allowedChanges: ["Join a qualifying C-SNP"],
    sourceId: "medicare_sep",
  },
  {
    id: "sep_error",
    title: "Federal error, misrepresentation, or exceptional-circumstances SEP",
    triggerTerms: ["error", "misrepresentation", "bad information", "network change", "disaster", "exceptional"],
    window: "Often 2 months after notice or on a case-by-case basis depending on the event.",
    allowedChanges: [
      "Join or switch MA or Part D",
      "Return to Original Medicare",
      "Drop Part D where allowed",
    ],
    sourceId: "medicare_sep",
  },
];

function tokenize(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function sectionToTopicIds(sectionLabel) {
  return SECTION_TOPIC_MAP[sectionLabel] || [];
}

function inferContextTerms({ sectionLabel, question, copilotContext }) {
  const terms = new Set(tokenize(sectionLabel));
  tokenize(question).forEach((term) => terms.add(term));

  const transcriptTerms = tokenize(
    copilotContext?.transcriptWindows?.currentWindow || ""
  );
  transcriptTerms.slice(-120).forEach((term) => terms.add(term));

  const metadataValues = Object.values(copilotContext?.callMetadata || {})
    .flatMap((value) =>
      value && typeof value === "object" ? Object.values(value) : [value]
    )
    .filter(Boolean)
    .join(" ");
  tokenize(metadataValues).forEach((term) => terms.add(term));

  const issueTerms = (copilotContext?.recentInterventions || [])
    .flatMap((entry) => tokenize(entry.issueTag || entry.text))
    .slice(-40);
  issueTerms.forEach((term) => terms.add(term));

  return terms;
}

function scoreTopic(topic, sectionLabel, contextTerms) {
  let score = 0;

  if (topic.appliesTo.includes(sectionLabel)) score += 6;
  if (sectionToTopicIds(sectionLabel).includes(topic.id)) score += 8;

  topic.triggerTerms.forEach((term) => {
    if (contextTerms.has(term.toLowerCase())) score += 2;
  });

  return score;
}

function selectTopics(sectionLabel, contextTerms, maxTopics = 6) {
  const scored = CMS_TOPIC_LIBRARY.map((topic) => ({
    topic,
    score: scoreTopic(topic, sectionLabel, contextTerms),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const forced = new Set(sectionToTopicIds(sectionLabel));

  CMS_TOPIC_LIBRARY.forEach((topic) => {
    if (forced.has(topic.id)) selected.push(topic);
  });

  scored.forEach(({ topic }) => {
    if (!selected.find((entry) => entry.id === topic.id) && selected.length < maxTopics) {
      selected.push(topic);
    }
  });

  return selected.slice(0, maxTopics);
}

function selectSepScenarios(contextTerms, maxItems = 5) {
  return SEP_SCENARIOS.map((scenario) => ({
    scenario,
    score: scenario.triggerTerms.reduce(
      (sum, term) => sum + (contextTerms.has(term.toLowerCase()) ? 2 : 0),
      0
    ),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item) => item.scenario);
}

function collectSourceIds(topics, scenarios) {
  const ids = new Set();
  topics.forEach((topic) => topic.citations.forEach((id) => ids.add(id)));
  scenarios.forEach((scenario) => ids.add(scenario.sourceId));
  return Array.from(ids)
    .map((id) => CMS_SOURCES[id])
    .filter(Boolean);
}

function formatTopic(topic) {
  return [
    `- ${topic.title}: ${topic.summary}`,
    `  Requirements: ${topic.requirements.join(" | ")}`,
    `  Acceptable phrasing guidance: ${topic.approvedParaphrases.join(" | ")}`,
    `  Red flags: ${topic.redFlags.join(" | ")}`,
    `  Coaching emphasis: ${topic.coachingFocus.join(" | ")}`,
  ].join("\n");
}

function formatScenario(scenario) {
  return `- ${scenario.title}: ${scenario.window} Allowed changes: ${scenario.allowedChanges.join(
    "; "
  )}.`;
}

function formatSources(sources) {
  return sources
    .map((source) => `- ${source.title} (${source.organization}): ${source.url}`)
    .join("\n");
}

function selectDbKnowledgeEntries(sectionLabel, question = "", maxEntries = 4) {
  const sectionNeedle = normalizeKnowledgeText(sectionLabel);
  const questionNeedle = normalizeKnowledgeText(question);
  const terms = questionNeedle.split(/\s+/).filter((term) => term.length > 4);

  return dbCmsKnowledgeEntries
    .map((entry) => {
      const title = normalizeKnowledgeText(entry.title || entry.metadata?.static_key || entry.key);
      const content = normalizeKnowledgeText(entry.content);
      let score = 0;
      if (sectionNeedle && title.includes(sectionNeedle)) score += 8;
      if (sectionNeedle && content.includes(sectionNeedle)) score += 4;
      for (const term of terms) {
        if (title.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries)
    .map((item) => item.entry);
}

function formatDbKnowledgeEntries(entries) {
  if (!entries.length) return "";
  return [
    "DATABASE KNOWLEDGE BASE ENTRIES:",
    ...entries.map((entry) => [
      `- ${entry.title || entry.key}`,
      `  ${String(entry.content || "").replace(/\s+/g, " ").slice(0, 900)}`,
      entry.source_urls?.length ? `  Sources: ${entry.source_urls.join(", ")}` : null,
      entry.last_verified_at ? `  Last verified: ${entry.last_verified_at}` : null,
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

export function getCmsKnowledgeForSection(sectionLabel, copilotContext) {
  const contextTerms = inferContextTerms({
    sectionLabel,
    question: "",
    copilotContext,
  });
  const topics = selectTopics(sectionLabel, contextTerms, 7);
  const scenarios =
    sectionLabel === "Enrollment" || sectionLabel === "SNP Disclosure"
      ? selectSepScenarios(contextTerms, 6)
      : [];
  const sources = collectSourceIds(topics, scenarios);
  const dbEntries = selectDbKnowledgeEntries(sectionLabel);
  const dbPromptBlock = formatDbKnowledgeEntries(dbEntries);

  return {
    topics,
    scenarios,
    sources,
    dbEntries,
    promptBlock: [
      "════════════════════════════════════════════════════════",
      "CMS / MEDICARE RETRIEVED GUIDANCE",
      "════════════════════════════════════════════════════════",
      "Use this as authoritative grounding. Prefer these rules over vague generalizations. If transcript and app state conflict, identify the smallest concrete compliance risk.",
      "",
      "RETRIEVED TOPICS:",
      topics.map(formatTopic).join("\n\n"),
      scenarios.length ? "" : null,
      scenarios.length ? "RELEVANT SEP SCENARIOS:" : null,
      scenarios.length ? scenarios.map(formatScenario).join("\n") : null,
      dbPromptBlock ? "" : null,
      dbPromptBlock || null,
      "",
      "AUTHORITATIVE SOURCES:",
      formatSources(sources),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function getCmsKnowledgeForQuestion(sectionLabel, question, copilotContext) {
  const contextTerms = inferContextTerms({
    sectionLabel,
    question,
    copilotContext,
  });
  const topics = selectTopics(sectionLabel, contextTerms, 8);
  const scenarios = selectSepScenarios(contextTerms, 6);
  const sources = collectSourceIds(topics, scenarios);
  const dbEntries = selectDbKnowledgeEntries(sectionLabel, question);
  const dbPromptBlock = formatDbKnowledgeEntries(dbEntries);

  return {
    topics,
    scenarios,
    sources,
    dbEntries,
    promptBlock: [
      "RETRIEVED CMS / MEDICARE GUIDANCE FOR THIS QUESTION:",
      topics.map(formatTopic).join("\n\n"),
      scenarios.length ? "" : null,
      scenarios.length ? "MATCHING SEP RULES:" : null,
      scenarios.length ? scenarios.map(formatScenario).join("\n") : null,
      dbPromptBlock ? "" : null,
      dbPromptBlock || null,
      "",
      "SOURCES:",
      formatSources(sources),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function getCmsKnowledgeSourceIndex() {
  return Object.values(CMS_SOURCES);
}
