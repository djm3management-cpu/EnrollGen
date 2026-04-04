/**
 * medSupComplianceKnowledge.js
 * Medicare Supplement section knowledge for the Med Sup copilot.
 */

export const MEDSUP_COMPLIANCE_KNOWLEDGE = {
  "Recording Disclosure": {
    verbatimScript: [
      "Thank you for calling New Gen Health Solutions, this is [Agent Name]. Who am I speaking with today?",
      "Hi [First Name]. This call may be recorded and monitored for quality and compliance purposes. Is that okay?",
    ],
    keyPhrasesToListenFor: [
      "thank you for calling new gen health solutions",
      "this is",
      "who am i speaking with today",
      "recorded and monitored",
      "quality and compliance purposes",
      "is that okay",
    ],
    requiredElements: [
      "1. Identify the company and agent",
      "2. Disclose that the call may be recorded and monitored",
      "3. Obtain consent to continue",
    ],
    commonMistakes: [
      "Skipping the recording disclosure",
      "Not asking permission to continue",
      "Moving into qualification before consent",
    ],
    redFlags: [
      "Proceeding without recording consent",
      "Implying the caller has no choice without following company process",
    ],
  },

  "TPMO Disclosure": {
    verbatimScript: [
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
    ],
    keyPhrasesToListenFor: [
      "do not offer every plan available",
      "limited to those plans we do offer",
      "Medicare.gov",
      "1-800-MEDICARE",
      "all of your options",
    ],
    requiredElements: [
      "1. Read the TPMO disclosure verbatim",
      "2. State that plan information is limited to plans offered by the agency",
      "3. Reference Medicare.gov or 1-800-MEDICARE",
    ],
    commonMistakes: [
      "Paraphrasing the TPMO disclosure",
      "Skipping Medicare.gov or 1-800-MEDICARE",
      "Rushing through the disclosure so it is unclear",
    ],
    redFlags: [
      "Skipping TPMO entirely",
      "Saying or implying the agency offers every available plan",
    ],
  },

  "Qualification": {
    verbatimScript: [
      "How old are you, and do you have both Medicare Part A and Part B?",
      "What state do you live in?",
      "Are you currently on a Medicare Supplement plan, a Medicare Advantage plan, or Original Medicare only?",
    ],
    keyPhrasesToListenFor: [
      "how old are you",
      "Part A and Part B",
      "what state do you live in",
      "Medicare Supplement plan",
      "Medicare Advantage plan",
      "Original Medicare only",
    ],
    requiredElements: [
      "1. Confirm age",
      "2. Confirm Medicare Part A and Part B",
      "3. Confirm state of residence",
      "4. Confirm current coverage type",
    ],
    commonMistakes: [
      "Quoting before confirming Part A and Part B",
      "Skipping the state question",
      "Not identifying current coverage type",
    ],
    redFlags: [
      "Proceeding as if the caller is Med Sup eligible without confirming Part A and Part B",
      "Giving plan guidance without confirming state",
    ],
  },

  "Discovery": {
    verbatimScript: [
      "What plan letter do you have now, if you know it?",
      "Who is your current carrier?",
      "What are you paying per month?",
      "To check if you can qualify for a lower rate, I need to ask a few health questions. Is that okay?",
      "In the past two years, have you had any hospitalizations, major surgeries, or serious conditions like cancer, heart disease, COPD, or kidney disease?",
    ],
    keyPhrasesToListenFor: [
      "plan letter",
      "current carrier",
      "paying per month",
      "qualify for a lower rate",
      "health questions",
      "hospitalizations",
      "major surgeries",
      "cancer",
      "heart disease",
      "COPD",
      "kidney disease",
    ],
    requiredElements: [
      "1. Ask for current plan letter",
      "2. Ask for current carrier",
      "3. Ask for current monthly premium",
      "4. Ask permission before health questions",
      "5. Ask the listed recent health-history questions",
    ],
    commonMistakes: [
      "Skipping the current premium",
      "Asking health questions before asking permission",
      "Jumping to a quote before gathering discovery details",
    ],
    redFlags: [
      "Guaranteeing qualification before health history is reviewed",
      "Telling the caller to hide or soften health information",
    ],
  },

  "Quote Transition": {
    verbatimScript: [
      "Based on what you told me, I may have an option with the same plan letter at a lower monthly premium.",
      "Right now you have [PLAN LETTER] with [CURRENT CARRIER] at [CURRENT PREMIUM].",
      "I am showing [PLAN LETTER] with [NEW CARRIER] at about [QUOTED PREMIUM].",
      "That is a difference of about [DIFFERENCE] per month, or [ANNUAL SAVINGS] per year.",
      "Same plan letter means the benefits stay the same. The main difference is the carrier and premium.",
    ],
    keyPhrasesToListenFor: [
      "same plan letter",
      "lower monthly premium",
      "current carrier",
      "quoted premium",
      "difference per month",
      "per year",
      "benefits stay the same",
      "carrier and premium",
    ],
    requiredElements: [
      "1. Frame the option as a possible lower-rate match",
      "2. Restate the current plan letter, carrier, and premium",
      "3. Provide the new quoted premium",
      "4. State monthly and annual savings",
      "5. Explain that same plan letter means same benefits",
    ],
    commonMistakes: [
      "Not stating both monthly and annual savings",
      "Failing to explain same plan letter means same standardized benefits",
      "Presenting the quote without comparing against the current premium",
    ],
    redFlags: [
      "Misrepresenting same-letter benefits as different between carriers",
      "Guaranteeing the final premium without carrier review",
    ],
  },

  "Close / Enrollment": {
    verbatimScript: [
      "Would you like to move forward with the application?",
      "I will walk you through it. Do you have your Medicare card with you?",
      "The application will include standard health questions, and [CARRIER] may contact you to verify information.",
      "Your requested effective date would be [DATE].",
    ],
    keyPhrasesToListenFor: [
      "move forward with the application",
      "Medicare card",
      "standard health questions",
      "may contact you to verify information",
      "requested effective date",
    ],
    requiredElements: [
      "1. Ask whether the caller wants to proceed",
      "2. Ask whether they have their Medicare card",
      "3. Disclose that the application includes standard health questions",
      "4. Disclose that the carrier may verify information",
      "5. State the requested effective date",
    ],
    commonMistakes: [
      "Skipping the health-questions disclosure",
      "Not telling the caller the carrier may verify information",
      "Not stating the requested effective date",
    ],
    redFlags: [
      "Guaranteeing approval before underwriting or carrier review",
      "Skipping required health questions during enrollment",
    ],
  },

  "Wrap Up": {
    verbatimScript: [
      "To recap, we reviewed your current coverage, discussed your options, and the next step is [NEXT STEP]. Does that sound right?",
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
      "Thank you for calling New Gen Health Solutions.",
    ],
    keyPhrasesToListenFor: [
      "to recap",
      "reviewed your current coverage",
      "the next step is",
      "does that sound right",
      "do not offer every plan available",
      "Medicare.gov",
      "1-800-MEDICARE",
      "thank you for calling new gen health solutions",
    ],
    requiredElements: [
      "1. Recap what was reviewed",
      "2. State the next step",
      "3. Re-deliver the TPMO disclosure verbatim",
      "4. Thank the caller",
    ],
    commonMistakes: [
      "Skipping the recap",
      "Skipping the closing TPMO disclosure",
      "Not stating the next step",
    ],
    redFlags: [
      "Ending the call without the closing TPMO disclosure",
      "Making final promises about approval or savings that are not confirmed",
    ],
  },
};

export const MEDSUP_SECTION_LABELS = {
  1: "Recording Disclosure",
  2: "TPMO Disclosure",
  3: "Qualification",
  4: "Discovery",
  5: "Quote Transition",
  6: "Close / Enrollment",
  7: "Wrap Up",
  8: "Complete",
};

export const MEDSUP_LEVEL_STYLE = {
  critical: { color: "#ef4444", icon: "⛔", border: "rgba(239,68,68,0.25)" },
  warn: { color: "#fbbf24", icon: "⚠️", border: "rgba(251,191,36,0.2)" },
  remind: { color: "#60a5fa", icon: "📋", border: "rgba(96,165,250,0.15)" },
  tip: { color: "#4ade80", icon: "✓", border: "rgba(74,222,128,0.15)" },
  info: { color: "#7a7f8e", icon: "ℹ", border: "rgba(122,127,142,0.12)" },
};

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

export const MEDSUP_HIGH_RISK_KEYWORDS = [
  "guaranteed issue",
  "underwriting",
  "health questions",
  "pre-existing",
  "denied",
  "decline",
  "replacement",
  "switching carriers",
  "cancel",
  "Part A",
  "Part B",
  "not enrolled",
  "TPMO",
  "every plan",
  "all options",
  "Medicare Advantage",
  "disenroll",
];
