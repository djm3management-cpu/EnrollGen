/**
 * acaComplianceKnowledge.js — ACA On-Exchange Compliance Knowledge Base
 * Section-specific compliance rules, verbatim scripts, and detection patterns
 * for the ACA Marketplace enrollment copilot.
 */

/* ═══════ SECTION KNOWLEDGE ═══════ */

export const ACA_COMPLIANCE_KNOWLEDGE = {
  "Opening & Identity Verification": {
    verbatimScript: [
      "Thank you for calling New Gen Health Solutions, this is [agent name].",
      "I want to let you know that this call is being recorded for quality and compliance purposes. Is that okay with you?",
      "Can I please get your full legal name as it appears on your government ID?",
      "And your date of birth?",
      "What state do you currently reside in?",
    ],
    keyPhrasesToListenFor: [
      "call is being recorded", "recorded for quality", "recorded line",
      "is that okay", "okay if I continue", "do you consent",
      "full legal name", "name as it appears", "government ID",
      "date of birth", "what is your DOB",
      "what state", "state of residence", "where do you live",
      "New Gen Health", "my name is",
      "open enrollment", "special enrollment", "OEP", "SEP",
      "are you currently enrolled", "do you have coverage",
    ],
    requiredElements: [
      "1. Call recording disclosure — must inform caller the call is recorded and obtain verbal consent",
      "2. Agent identification — agent must state their name and company",
      "3. Identity verification — collect full legal name and date of birth",
      "4. State of residence — determines exchange platform and plan availability",
      "5. Enrollment period determination — establish OEP vs SEP and current coverage status",
    ],
    commonMistakes: [
      "Skipping call recording disclosure entirely",
      "Not waiting for verbal consent to record",
      "Forgetting to ask state of residence (affects exchange platform routing)",
      "Not determining enrollment period type (OEP vs SEP) early enough",
      "Not identifying themselves by name and company",
    ],
    redFlags: [
      "Proceeding without recording consent",
      "Claiming to represent the government or Healthcare.gov directly",
      "Collecting SSN or payment info during the opening",
      "Making promises about plan costs before any assessment",
    ],
  },

  "SEP Qualification": {
    verbatimScript: [
      "You mentioned you have a qualifying life event. Can you tell me what event qualifies you for a Special Enrollment Period?",
      "When did this event occur? We need to verify it falls within the 60-day enrollment window.",
    ],
    keyPhrasesToListenFor: [
      "qualifying life event", "qualifying event", "special enrollment",
      "loss of coverage", "lost your coverage", "COBRA", "aging off parent",
      "marriage", "got married", "recently married",
      "birth", "adoption", "new baby",
      "moved", "permanent move", "new zip code", "new county",
      "lost Medicaid", "Medicaid termination", "CHIP",
      "income change", "above Medicaid", "no longer eligible",
      "60-day window", "60 days", "within the window",
      "documentation", "proof of event", "supporting documents",
    ],
    requiredElements: [
      "1. Identify the specific qualifying life event type",
      "2. Confirm the event date falls within the 60-day enrollment window",
      "3. Identify required documentation for the SEP type",
      "4. If SEP window has expired, STOP — do not proceed with enrollment",
      "5. Note urgency if fewer than 7 days remain in the window",
    ],
    commonMistakes: [
      "Not verifying the exact event date against the 60-day window",
      "Accepting vague SEP claims without identifying the specific event type",
      "Proceeding when the 60-day window has clearly expired",
      "Not mentioning documentation requirements",
    ],
    redFlags: [
      "Fabricating or coaching the client to claim a false SEP event",
      "Proceeding with enrollment when the SEP window is expired",
      "Telling the client they don't need documentation",
      "Claiming any reason qualifies as a SEP",
    ],
  },

  "Household & Income Assessment": {
    verbatimScript: [
      "How many people are in your tax household? This includes you, your spouse if filing jointly, and any dependents you claim on your taxes.",
      "What is your estimated total household income for 2026? This is your Modified Adjusted Gross Income, or MAGI.",
    ],
    keyPhrasesToListenFor: [
      "tax household", "household size", "how many people",
      "dependents", "filing jointly", "tax return",
      "household income", "estimated income", "MAGI", "modified adjusted gross",
      "federal poverty level", "FPL", "percent of poverty",
      "subsidy", "APTC", "premium tax credit", "advanced premium tax credit",
      "cost sharing reduction", "CSR", "silver plan",
      "Medicaid", "Medicaid eligible", "expansion state",
      "400 percent", "subsidy cliff", "above 400",
      "no subsidy", "full price",
    ],
    requiredElements: [
      "1. Tax household size — must use IRS definition (filer + spouse if joint + dependents)",
      "2. Estimated 2026 MAGI — needed for FPL% calculation",
      "3. FPL percentage determination — drives subsidy and CSR eligibility",
      "4. Subsidy eligibility disclosure — must clearly communicate whether client qualifies for APTC",
      "5. CSR eligibility notification — if 100-250% FPL, Silver plan CSR advantage must be explained",
      "6. Subsidy cliff warning — if near/above 400% FPL, explain no APTC is available in 2026",
      "7. Medicaid screening — if below 138% FPL in expansion state, refer appropriately",
    ],
    commonMistakes: [
      "Using household size instead of tax household size",
      "Not explaining the difference between MAGI and gross income",
      "Failing to mention the 2026 subsidy cliff (enhanced PTCs expired)",
      "Not explaining CSR benefits for Silver plans to eligible clients",
      "Forgetting to screen for Medicaid eligibility in expansion states",
      "Quoting exact subsidy amounts without using estimate/approximate language",
    ],
    redFlags: [
      "Guaranteeing a specific subsidy amount",
      "Telling client to misrepresent income to qualify for subsidies",
      "Failing to disclose that above 400% FPL means no subsidy in 2026",
      "Claiming the government pays for their plan",
      "Not screening for Medicaid when income clearly indicates eligibility",
    ],
  },

  "Needs Analysis & Plan Preferences": {
    verbatimScript: [
      "Do you have any doctors or specialists you want to keep seeing? I want to make sure they're in the plan's network.",
      "Are you currently taking any prescription medications?",
      "How often do you typically visit the doctor? Would you say you're a low, moderate, or high utilizer of healthcare?",
      "Do you have a monthly budget range in mind for your health insurance premium?",
      "Based on what you've told me, I'm going to look at plans that best fit your needs.",
    ],
    keyPhrasesToListenFor: [
      "doctors", "specialists", "providers", "in network", "network",
      "prescriptions", "medications", "pharmacy", "formulary",
      "how often", "doctor visits", "utilization", "low utilizer", "high utilizer",
      "budget", "monthly premium", "afford", "price range",
      "best fit", "based on your needs", "looking at plans",
      "Bronze", "Silver", "Gold", "Platinum", "metal level",
      "deductible", "out of pocket", "copay", "coinsurance",
      "chronic condition", "ongoing treatment",
    ],
    requiredElements: [
      "1. Provider preferences — document existing doctors/specialists for network check",
      "2. Prescription list — document current medications for formulary check",
      "3. Utilization assessment — understand healthcare usage level",
      "4. Budget range — understand premium affordability constraints",
      "5. Metal level guidance — explain how Bronze/Silver/Gold map to usage and budget",
    ],
    commonMistakes: [
      "Skipping provider documentation and moving straight to plan selection",
      "Not asking about prescriptions before recommending a plan",
      "Pushing a specific metal level without assessing utilization",
      "Recommending Bronze to a CSR-eligible client (they should be on Silver for CSR benefits)",
      "Not explaining how deductible/copay/MOOP differ across metal levels",
    ],
    redFlags: [
      "Recommending a plan without any needs assessment",
      "Claiming a plan covers everything with no out-of-pocket costs",
      "Steering client to a specific plan for commission reasons",
      "Guaranteeing specific providers are in-network without checking",
    ],
  },

  "Plan Presentation & Selection": {
    verbatimScript: [
      "Based on your needs and budget, I'd like to walk you through two to three plans that I think are the best fit.",
      "Let me check that your providers are in this plan's network.",
      "Let me verify that your prescriptions are covered on this plan's formulary.",
      "With your subsidy applied, your estimated monthly premium for this plan would be approximately...",
      "Before we proceed, I want to make sure you understand the plan's benefits, including the deductible, copays, and maximum out-of-pocket.",
    ],
    keyPhrasesToListenFor: [
      "walk you through", "best fit", "two to three plans",
      "network", "in network", "provider directory", "check your doctors",
      "formulary", "drug list", "medications covered", "prescription coverage",
      "premium", "monthly cost", "estimated premium", "approximately",
      "subsidy applied", "after tax credit", "with your APTC",
      "deductible", "copay", "coinsurance", "out-of-pocket maximum", "MOOP",
      "summary of benefits", "plan details",
      "understand the plan", "any questions about",
    ],
    requiredElements: [
      "1. Present 2-3 plan options aligned with needs assessment results",
      "2. Network adequacy check — verify client's providers are in-network",
      "3. Formulary check — verify client's prescriptions are covered",
      "4. Premium disclosure — use estimate/approximate language; never guarantee exact amounts",
      "5. Benefits explanation — deductible, copays, MOOP must be communicated",
      "6. CSR explanation — if Silver + CSR eligible, explain the enhanced benefits",
    ],
    commonMistakes: [
      "Presenting only one plan option without alternatives",
      "Skipping network check for client's existing providers",
      "Skipping formulary check for client's prescriptions",
      "Stating exact premium amounts as guaranteed (must use 'approximately' or 'estimated')",
      "Not explaining CSR benefits to eligible Silver plan clients",
      "Not explaining out-of-pocket maximums",
    ],
    redFlags: [
      "Guaranteeing premium amounts without using estimate language",
      "Claiming a plan is 'the best plan' or using superlative language",
      "Not disclosing deductible or out-of-pocket maximum",
      "Recommending a plan that contradicts the needs assessment",
      "Telling client they don't need to check formulary or network",
    ],
  },

  "Enrollment & Submission": {
    verbatimScript: [
      "Now I'm going to walk you through the application on the exchange platform.",
      "I need your Social Security Number to complete the application. This will only be entered directly into the secure exchange platform.",
      "How much of your premium tax credit would you like to apply each month? You can use all, some, or none.",
      "Your application has been submitted. Your confirmation number is...",
      "Your coverage effective date is [date] and your first premium payment of approximately [amount] is due by [date].",
    ],
    keyPhrasesToListenFor: [
      "application", "exchange platform", "Healthcare.gov", "state exchange",
      "Social Security", "SSN", "secure platform", "directly into",
      "premium tax credit", "APTC", "how much to apply", "all or portion",
      "submitted", "confirmation number", "confirmation",
      "effective date", "coverage begins", "start date",
      "first premium", "payment due", "due date",
      "Get Covered NJ", "PA Pennie", "Pennie",
    ],
    requiredElements: [
      "1. Walk client through the exchange application process",
      "2. SSN handling — must be entered only into the exchange platform, NOT stored in agent systems",
      "3. APTC election — client must choose how much tax credit to apply monthly",
      "4. Submission confirmation — provide confirmation number verbally",
      "5. Effective date communication — state when coverage begins",
      "6. First premium disclosure — amount and due date",
    ],
    commonMistakes: [
      "Collecting SSN verbally and entering it into non-exchange systems",
      "Not letting the client choose their APTC election amount",
      "Forgetting to read back the confirmation number",
      "Not confirming the effective date verbally",
      "Not disclosing first premium amount and due date",
      "Not mentioning the correct exchange platform for the client's state",
    ],
    redFlags: [
      "Storing or writing down the client's SSN outside the exchange platform",
      "Submitting enrollment without client's explicit consent",
      "Selecting APTC amount without client input",
      "Not providing a confirmation number after submission",
      "Making the client believe enrollment is free (first premium must be paid)",
    ],
  },

  "Closing & Follow-Up": {
    verbatimScript: [
      "Let me recap: you're enrolled in [plan name] with a monthly premium of approximately [amount] after your tax credit. Your coverage begins [date].",
      "Your first premium payment is due by [date]. If the first premium is not paid by the due date, your enrollment may be cancelled.",
      "I'd like to schedule a follow-up call in about two weeks to make sure everything is on track with your coverage.",
      "Thank you for choosing New Gen Health Solutions. Do you have any other questions before we end the call?",
    ],
    keyPhrasesToListenFor: [
      "recap", "summary", "enrolled in", "your plan",
      "monthly premium", "after your tax credit", "after subsidy",
      "coverage begins", "effective date", "start date",
      "first premium", "payment due", "due date", "payment deadline",
      "cancelled", "may be cancelled", "enrollment cancelled",
      "follow-up", "follow up call", "two weeks", "check in",
      "any other questions", "anything else", "thank you",
    ],
    requiredElements: [
      "1. Coverage recap — plan name, premium amount, effective date",
      "2. First premium warning — clearly state due date and consequences of non-payment",
      "3. Follow-up scheduling — offer a 2-week follow-up call",
      "4. Final questions — give client opportunity to ask remaining questions",
    ],
    commonMistakes: [
      "Ending the call without recapping the enrollment details",
      "Not warning about first premium payment deadline",
      "Skipping the follow-up scheduling step",
      "Rushing through the closing without checking for questions",
    ],
    redFlags: [
      "Telling client they don't need to pay the first premium",
      "Misstating the effective date or plan details",
      "Not disclosing the premium cancellation risk",
      "Ending the call abruptly without a proper close",
    ],
  },
};

/* ═══════ SECTION LABELS (gate number → label) ═══════ */

export const ACA_SECTION_LABELS = {
  0: "Opening & Identity Verification",
  1: "SEP Qualification",
  2: "Household & Income Assessment",
  3: "Needs Analysis & Plan Preferences",
  4: "Plan Presentation & Selection",
  5: "Enrollment & Submission",
  6: "Closing & Follow-Up",
};

/* ═══════ LEVEL STYLES — same as MA ═══════ */

export const ACA_LEVEL_STYLE = {
  info:     { icon: "◈", color: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)" },
  remind:   { icon: "◉", color: "var(--text-primary)", bg: "var(--bg-elevated)", border: "var(--border-default)" },
  tip:      { icon: "◆", color: "var(--status-live)", bg: "var(--status-live-bg)", border: "var(--status-live-border)" },
  warn:     { icon: "▲", color: "var(--status-pending)", bg: "var(--status-pending-bg)", border: "var(--status-pending-border)" },
  critical: { icon: "✕", color: "var(--status-offline)", bg: "var(--status-offline-bg)", border: "var(--status-offline-border)" },
};

/* ═══════ TIMING CONSTANTS ═══════ */

export const ACA_COACHING_DEBOUNCE_MS = 6000;
export const ACA_MIN_NEW_CHARS = 80;
export const ACA_MAX_TRANSCRIPT_LENGTH = 15000;
export const ACA_SECTION_SETTLE_MS = 45000;

export const ACA_COOLDOWN_BY_LEVEL = {
  critical: 0,
  warn: 15000,
  remind: 45000,
  tip: 60000,
  silent: 4000,
  info: 4000,
};

/* ═══════ CONFIDENCE THRESHOLDS ═══════ */

export const ACA_WARN_CONFIDENCE_FLOOR = 85;
export const ACA_REMIND_CONFIDENCE_FLOOR = 75;

export const ACA_SECTION_CONFIDENCE_OVERRIDES = {
  "Opening & Identity Verification": { warn: 75, remind: 65 },
  "SEP Qualification": { warn: 78, remind: 68 },
  "Household & Income Assessment": { warn: 80, remind: 70 },
  "Needs Analysis & Plan Preferences": { warn: 85, remind: 75 },
  "Plan Presentation & Selection": { warn: 82, remind: 72 },
  "Enrollment & Submission": { warn: 80, remind: 70 },
  "Closing & Follow-Up": { warn: 88, remind: 80 },
};

/* ═══════ HIGH-RISK KEYWORDS — always bypass suppression ═══════ */

export const ACA_HIGH_RISK_KEYWORDS = [
  "mislead", "guarantee", "best plan", "no cost", "free",
  "government plan", "government pays", "obama care is free",
  "don't need to pay", "no premium", "zero premium",
  "fake sep", "lie about", "misrepresent income",
  "pressure", "threat", "illegal",
  "guaranteed issue", "no income required",
  "subsidy for everyone", "everyone qualifies",
];
