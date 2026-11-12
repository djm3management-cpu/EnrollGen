// Workbook and supplied Word document; product-specific facts come from u65Guidance.
export const U65_GATE_GUIDANCE = {
  "Open & Qualify": [
    "Confirm the household needs and actual current coverage.",
    "DE, MD, FL agents; target higher earners priced out of unsubsidized ACA.",
    "Eligibility, availability, rating basis and ACA/MEC status: verify with carrier."
  ],
  "Discovery": [
    "Ask about current costs, provider needs, prescriptions and budget.",
    "Never compare premiums across workbook coverage groups.",
    "No age-based ACA prices or subsidy threshold is established by these sources: verify with carrier."
  ],
  "Health & Confirm": [
    "Underwriting lookbacks: verify with carrier. Use the current carrier application.",
    "Do not infer acceptance, decline or a pregnancy eligibility outcome from benefit summaries.",
    "Do not coach the client to hide conditions."
  ],
  "Present, Select, Add-on": [
    "Select the exact workbook variant. Use its required agent statements.",
    "Review plan type, exact network, deductible/OOP scope, hard limits, Rx, maternity and waiting periods.",
    "Unknown: verify with carrier. Conflicting: confirm with carrier; never select a disputed number.",
    "Enroll Prime is the CURRENT agent portal.",
    "Network participation must be checked per provider; maps are examples, not a census."
  ],
  "Enroll & Close": [
    "Confirm current effective-date documents, disclosures and carrier application.",
    "Approval, premium, fees and effective date: verify with carrier.",
    "Never promise an OOP maximum covers excluded services, charges above caps or balance bills."
  ]
};
export const U65_SOURCE_RULES = [
  "Unknown product facts, ACA/MEC status and underwriting lookbacks: verify with carrier.",
  "Use the selected variant\u2019s required statements from the workbook catalog; never transfer rules between products.",
  "Never compare premiums across major medical, HSA, limited copay, MEC/preventive and fixed indemnity groups.",
  "MedAccess Basic/Pro: state inpatient day limits and maternity rules. BMI MVP/DVP: state inpatient day/surgery caps and no OON.",
  "Vault Bronze/Silver: cancer excluded. Vault Bronze/Silver/Elite Plus: 140% of Medicare facility reference pricing; hospitals can refuse and balance bill outside OOP.",
  "Life-X VL: unlimited exposure past visit caps. Bloom: fixed indemnity, NOT major medical, scheduled amounts only; member may owe the balance; 6-month pre-ex limitation.",
  "Everest newborn 365 days and cancer/CI 30 days; Life-X initial 90-day elective exclusion where stated; MedMax elective surgery excluded.",
  "Ultimate EPO: underlying SBC deductible $9,000 individual / $18,000 family; $1,500/$3,500 gap headlines are never the deductible.",
  "MedPerformance 5000 OON %, MedAccess Pro Rx footnote, Ultimate PPO coinsurance and Vault schedules: confirm with carrier; never select a disputed number.",
  "First Health terminated Cleveland Clinic including Weston/Martin/Indian River FL effective 7/1/2025; recheck before quoting those facilities.",
  "PHCS Extended/limited-benefit networks are not full PHCS PPO; UW Medicine does not take PHCS; verify exact network selector.",
  "Verify participation per provider and exact product; maps are examples, not a census.",
  "Hospital participation lists do not confirm the exact third-party plan, employer group, clinician, service or appointment. Sales eligibility is separate from provider access. No state access ranking or guaranteed facility participation is established."
];
export const U65_COMPLIANCE_KNOWLEDGE = Object.fromEntries(
  Object.entries(U65_GATE_GUIDANCE).map(([key, lines]) => [key, {
    verbatimScript: lines,
    keyPhrasesToListenFor: ["verify with carrier", "confirm with carrier", "selected plan", "limits", "network", "OOP"],
    requiredElements: [...lines, ...U65_SOURCE_RULES],
    commonMistakes: ["Transferring another product\u2019s rules to the selected plan.", "Comparing premiums across coverage groups."],
    redFlags: ["Guaranteeing total exposure is capped despite exclusions or limits.", "Treating a network logo as proof of exact-product participation.", "Inventing underwriting lookbacks or ACA/MEC status."],
  }])
);

export const U65_GATE_LABELS = {
  "0": "Open & Qualify",
  "1": "Discovery",
  "2": "Health & Confirm",
  "3": "Present, Select, Add-on",
  "4": "Enroll & Close"
};

/* ═══════ LEVEL STYLING ═══════ */

export const U65_LEVEL_STYLE = {
  critical: { color: "var(--status-offline)", icon: "⛔", border: "var(--status-offline-border)" },
  warn:     { color: "var(--status-pending)", icon: "⚠️", border: "var(--status-pending-border)" },
  remind:   { color: "var(--info)", icon: "📋", border: "var(--info-border)" },
  tip:      { color: "var(--status-live)", icon: "✓", border: "var(--status-live-border)" },
  info:     { color: "var(--text-muted)", icon: "ℹ", border: "var(--border-default)" },
};

/* ═══════ TIMING CONSTANTS ═══════ */

export const U65_COACHING_DEBOUNCE_MS = 4000;
export const U65_MIN_NEW_CHARS = 40;
export const U65_SECTION_SETTLE_MS = 6000;

export const U65_COOLDOWN_BY_LEVEL = {
  critical: 30000,
  warn: 25000,
  remind: 35000,
  tip: 45000,
  info: 20000,
};

export const U65_WARN_CONFIDENCE_FLOOR = 70;
export const U65_REMIND_CONFIDENCE_FLOOR = 65;
export const U65_SECTION_CONFIDENCE_OVERRIDES = {
  3: { warn: 60, remind: 55 }, // Product Presentation gate — lower floors for product disclosures
};

/* ═══════ HIGH RISK KEYWORDS ═══════ */

export const U65_HIGH_RISK_KEYWORDS = [
  "not mec", "not minimum essential", "not aca",
  "not a substitute", "not major medical",
  "pre-existing", "waiting period", "12 month exclusion",
  "underwriting", "guaranteed", "approved", "accepted",
  "fixed benefit", "indemnity", "set amounts",
  "won't cover", "doesn't cover", "coverage limit",
  "Enroll Prime", "AFI", "MedAccess", "MedMax", "Bloom", "Vault", "Life-X", "Everest", "Amerus",
  "subsidy", "marketplace", "ACA",
  "misrepresentation", "claims denied",
  "coaching", "minimize conditions",
];
