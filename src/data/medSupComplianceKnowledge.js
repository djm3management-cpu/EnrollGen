/**
 * medSupComplianceKnowledge.js — Medicare Supplement Compliance Knowledge Base
 * Section-specific compliance rules, verbatim scripts, and detection patterns
 * for the Med Sup enrollment copilot.
 */

/* ═══════ SECTION KNOWLEDGE ═══════ */

export const MEDSUP_COMPLIANCE_KNOWLEDGE = {
  "Recording Disclosure": {
    verbatimScript: [
      "Thank you for calling New Gen Health Solutions, this is [agent name].",
      "This call may be recorded and monitored for quality and compliance purposes. Is that okay with you?",
    ],
    keyPhrasesToListenFor: [
      "call is being recorded", "recorded for quality", "recorded and monitored",
      "is that okay", "okay if I continue", "do you consent",
      "New Gen Health", "my name is", "who do I have the pleasure",
    ],
    requiredElements: [
      "1. Agent must identify themselves by name and company",
      "2. Call recording disclosure — must inform caller the call is recorded",
      "3. Obtain verbal consent to continue on a recorded line",
    ],
    commonMistakes: [
      "Skipping recording disclosure entirely",
      "Not waiting for verbal consent before continuing",
      "Not identifying themselves by name",
    ],
    redFlags: [
      "Proceeding without recording consent",
      "Claiming to represent Medicare or CMS directly",
    ],
  },

  "TPMO Disclosure": {
    verbatimScript: [
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
    ],
    keyPhrasesToListenFor: [
      "do not offer every plan", "limited to those plans we do offer",
      "Medicare.gov", "1-800-MEDICARE", "all of your options",
      "not every plan available",
    ],
    requiredElements: [
      "1. TPMO disclaimer must be read verbatim — no paraphrasing",
      "2. Must reference Medicare.gov or 1-800-MEDICARE",
      "3. Must state plans are limited to those offered by the agency",
    ],
    commonMistakes: [
      "Paraphrasing instead of reading verbatim",
      "Skipping the Medicare.gov / 1-800-MEDICARE reference",
      "Rushing through too fast for the client to understand",
    ],
    redFlags: [
      "Skipping the TPMO disclaimer entirely",
      "Implying they offer all available plans",
      "Telling client they don't need to check other options",
    ],
  },

  "Qualification": {
    verbatimScript: [
      "How old are you, and are you currently enrolled in both Medicare Part A and Part B?",
      "What state do you live in?",
      "Are you on a Medicare Supplement plan, a Medicare Advantage plan, or just Original Medicare?",
    ],
    keyPhrasesToListenFor: [
      "how old", "age", "date of birth",
      "Part A", "Part B", "enrolled in Medicare",
      "what state", "where do you live", "state of residence",
      "Medicare Supplement", "Medigap", "Medicare Advantage", "Part C",
      "Original Medicare", "current coverage", "what do you have now",
      "turning 65", "already on Medicare",
    ],
    requiredElements: [
      "1. Confirm client age — determines OEP eligibility and rate",
      "2. Confirm both Part A and Part B enrollment — both required for Medigap",
      "3. Determine state of residence — licensing and state-specific rules",
      "4. Identify current coverage type — sets the branch and compliance path",
    ],
    commonMistakes: [
      "Not confirming Part A AND Part B — both are required",
      "Proceeding without confirming agent is licensed in client's state",
      "Not identifying current coverage type before quoting",
    ],
    redFlags: [
      "Enrolling someone who doesn't have both Part A and Part B",
      "Proceeding without knowing client's state",
      "Quoting before qualifying the client",
    ],
  },

  "Branch: Needs Discovery": {
    verbatimScript: [
      "Do you know what plan letter you have? It'll be on your insurance card.",
      "What are you paying per month right now?",
      "To get you an accurate rate I do need to ask a couple of quick health questions. Is that okay?",
    ],
    keyPhrasesToListenFor: [
      "plan letter", "Plan G", "Plan N", "Plan F", "what plan",
      "paying per month", "monthly premium", "current rate", "renewal notice",
      "health questions", "underwriting", "medical history",
      "hospitalized", "surgery", "cancer", "heart disease", "COPD", "kidney",
      "diabetes", "conditions", "medications",
      "rates went up", "too expensive", "shopping around",
      "big bill", "Medicare didn't cover", "unexpected cost",
      "Medicare Advantage", "can't see my doctor", "prior authorization",
      "switch back", "leaving Advantage",
    ],
    requiredElements: [
      "1. Identify the client's reason for calling (rate shopping, bill shock, MA crossover)",
      "2. Determine current plan letter and carrier if applicable",
      "3. Collect current premium for comparison",
      "4. Disclose underwriting requirement if applicable — must be transparent",
      "5. Ask health questions before quoting if underwriting applies",
    ],
    commonMistakes: [
      "Quoting before understanding the client's situation",
      "Not disclosing that underwriting is required outside GI windows",
      "Not collecting current premium for comparison",
      "Jumping to close without understanding the need",
    ],
    redFlags: [
      "Guaranteeing acceptance without completing underwriting",
      "Coaching the client to hide health conditions on the application",
      "Misrepresenting plan benefits or coverage",
      "Comparing Medigap to Medicare Advantage as if they're the same product type",
    ],
  },

  "Close & Enrollment": {
    verbatimScript: [
      "Let's get you set up. I'll start the application and walk you through every question.",
      "Are you in front of your Medicare card?",
      "The application will include standard health questions and you may receive a call or letter from the carrier to confirm your enrollment.",
    ],
    keyPhrasesToListenFor: [
      "get you set up", "start the application", "enroll",
      "Medicare card", "Medicare number", "effective date",
      "health questions", "application questions",
      "carrier confirmation", "confirmation call", "confirmation letter",
      "coverage effective", "start date", "when coverage begins",
      "follow-up", "callback", "think about it", "send information",
    ],
    requiredElements: [
      "1. Read all carrier disclosures exactly as written during application",
      "2. Disclose that carrier may contact client to confirm enrollment",
      "3. Confirm coverage effective date",
      "4. If not enrolling: schedule specific follow-up date and time",
      "5. Collect email and callback number for follow-up",
    ],
    commonMistakes: [
      "Summarizing or skipping carrier-required disclosures",
      "Not confirming coverage effective date",
      "Ending call without scheduling a follow-up if client needs to think",
      "Not logging enrollment recording timestamp",
    ],
    redFlags: [
      "Pressuring the client to enroll immediately",
      "Filling out the application without the client present",
      "Skipping required health questions on the application",
      "Promising coverage before underwriting is complete",
    ],
  },

  "Compliance Wrap-Up": {
    verbatimScript: [
      "Let me do a quick summary of what we covered today.",
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
      "Thank you for calling New Gen Health Solutions. Don't hesitate to call us back with any questions.",
    ],
    keyPhrasesToListenFor: [
      "summary", "recap", "what we covered",
      "do not offer every plan", "limited to those plans",
      "Medicare.gov", "1-800-MEDICARE", "all of your options",
      "thank you for calling", "don't hesitate", "call us back",
      "any questions", "anything else",
    ],
    requiredElements: [
      "1. Recap what was discussed and any next steps",
      "2. Re-deliver TPMO disclaimer verbatim — required at close",
      "3. Thank the client and provide callback information",
    ],
    commonMistakes: [
      "Skipping the closing TPMO re-delivery",
      "Paraphrasing the TPMO instead of reading verbatim",
      "Not recapping the call or next steps",
    ],
    redFlags: [
      "Ending the call without re-delivering TPMO",
      "Making final promises about acceptance or rates not yet confirmed",
    ],
  },
};

/* ═══════ SECTION LABELS ═══════ */

export const MEDSUP_SECTION_LABELS = {
  1: "Recording Disclosure",
  2: "TPMO Disclosure",
  3: "Qualification",
  4: "Branch: Needs Discovery",
  5: "Objection Handling",
  6: "Close & Enrollment",
  7: "Compliance Wrap-Up",
  8: "Complete",
};

/* ═══════ LEVEL STYLING ═══════ */

export const MEDSUP_LEVEL_STYLE = {
  critical: { color: "#ef4444", icon: "⛔", border: "rgba(239,68,68,0.25)" },
  warn:     { color: "#fbbf24", icon: "⚠️", border: "rgba(251,191,36,0.2)" },
  remind:   { color: "#60a5fa", icon: "📋", border: "rgba(96,165,250,0.15)" },
  tip:      { color: "#4ade80", icon: "✓", border: "rgba(74,222,128,0.15)" },
  info:     { color: "#7a7f8e", icon: "ℹ", border: "rgba(122,127,142,0.12)" },
};

/* ═══════ TIMING CONSTANTS ═══════ */

export const MEDSUP_COACHING_DEBOUNCE_MS = 4000;
export const MEDSUP_MIN_NEW_CHARS = 40;
export const MEDSUP_SECTION_SETTLE_MS = 6000;

export const MEDSUP_COOLDOWN_BY_LEVEL = {
  critical: 30000,
  warn: 25000,
  remind: 35000,
  tip: 45000,
  info: 20000,
};

export const MEDSUP_WARN_CONFIDENCE_FLOOR = 72;
export const MEDSUP_REMIND_CONFIDENCE_FLOOR = 68;
export const MEDSUP_SECTION_CONFIDENCE_OVERRIDES = {};

/* ═══════ HIGH RISK KEYWORDS ═══════ */

export const MEDSUP_HIGH_RISK_KEYWORDS = [
  "guaranteed issue", "underwriting", "health questions",
  "pre-existing", "denied", "decline",
  "replacement", "switching carriers", "cancel",
  "Part A", "Part B", "not enrolled",
  "TPMO", "every plan", "all options",
  "Medicare Advantage", "disenroll",
];
