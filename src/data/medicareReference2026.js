/**
 * Verified 2026 CMS Medicare cost-sharing amounts and state GI rules.
 * Source: CMS.gov — 2026 Medicare Parts A & B Premiums and Deductibles
 */

export const medicare2026 = {
  partA_deductible: 1736,
  partA_coinsurance_day61_90: 434,
  partA_coinsurance_lifetime_reserve: 868,
  partB_deductible: 283,
  partB_premium: 202.90,
  snf_coinsurance_day21_100: 217,
  hd_plan_deductible: 2950,
  planK_oop_limit: 8000,
  planL_oop_limit: 4000,
  insulin_cap: 35,
  partD_oop_cap: 2100,
  partD_max_deductible: 615,
};

export const stateGIRules = {
  NJ: {
    continuousOE: false,
    birthdayRule: false,
    note: "NJ is not a continuous open enrollment state. Apply the age and Medicare-eligibility branches below; do not infer guaranteed issue from NJ residence alone.",
    branches: {
      age65Plus: {
        minimumAge: 65,
        eligibilityBasis: "Medicare at age 65 or older, including beneficiaries previously eligible due to disability or ESRD",
        openEnrollment: "Standard federal six-month Medigap open enrollment begins with the first month the beneficiary is both age 65 or older and enrolled in Part B. If Part B began before age 65, a new six-month window begins at age 65.",
        guaranteedIssue: "Federal guaranteed-issue triggers also apply; NJ does not provide blanket year-round GI for this age group.",
        underwriting: "Medical underwriting applies outside open enrollment and applicable federal GI windows.",
      },
      disabledAge50To64: {
        minimumAge: 50,
        maximumAge: 64,
        eligibilityBasis: "Medicare due to disability; verify age at first Medicare eligibility for the NJ age-50-through-64 program",
        access: "State-mandated access, with premiums capped at what the carrier charges an age-65 beneficiary for the same policy.",
        openEnrollment: "For Medicare eligibility on or after January 1, 2020: Plan D access during the first twelve months of Part B. The legacy pre-2020 Plan C rule used a six-month Part B window; do not apply twelve months to that legacy rule.",
        underwriting: "Medical underwriting may apply after the first twelve months of Part B for the Plan D path, unless a GI trigger applies. This is not continuous open enrollment.",
      },
      underAge50: {
        minimumAge: 0,
        maximumAge: 49,
        eligibilityBasis: "Medicare due to qualifying disability or kidney failure; verify program eligibility",
        carrier: "Horizon Blue Cross Blue Shield of New Jersey (Horizon BCBSNJ) only",
        plans: "Plan D only for those Medicare-eligible on or after January 1, 2020; Plan C for those Medicare-eligible before 2020.",
        openEnrollment: "For the Plan D path, guaranteed issue applies during the first twelve months of Part B. After that, coverage may be denied unless an applicable GI trigger exists. Verify the applicable legacy window for Plan C; this program is not blanket year-round GI.",
      },
    },
    requiredFacts: ["beneficiary age", "Medicare eligibility basis", "age and date at first Medicare eligibility", "Part B effective date", "applicable federal GI event"],
    missingFacts: "If facts needed to select a branch or window are unknown, tell the agent to verify them before asserting GI or underwriting status.",
    sourceUrls: [
      "https://www.nj.gov/dobi/division_insurance/medsuppunder50/intro.html",
      "https://www.medicare.gov/health-drug-plans/medigap/ready-to-buy/when",
    ],
    verifiedAt: "2026-09-09",
  },
  CT: { continuousOE: true, note: "CT guarantees open enrollment year-round." },
  ME: { continuousOE: true, note: "ME guarantees open enrollment year-round." },
  MA: { continuousOE: true, note: "MA guarantees open enrollment year-round." },
  NY: { continuousOE: true, note: "NY guarantees open enrollment year-round." },
  PA: { continuousOE: false, birthdayRule: false, note: "Federal OEP only — 6 months from Part B at 65." },
  VA: { continuousOE: false, birthdayRule: false, note: "Federal OEP only." },
  GA: { continuousOE: false, birthdayRule: false, note: "Federal OEP only." },
  CA: { birthdayRule: true, note: "Annual 30-day birthday rule window." },
  ID: { birthdayRule: true, note: "Annual birthday rule window." },
  IL: { birthdayRule: true, note: "Annual birthday rule window." },
  LA: { birthdayRule: true, note: "Annual birthday rule window." },
  NV: { birthdayRule: true, note: "Annual birthday rule window." },
  OK: { birthdayRule: true, note: "Annual birthday rule window." },
  OR: { birthdayRule: true, note: "Annual birthday rule window." },
};

// The legacy seeded state_gi_rules record can override the local fallback.
// Keep the reviewed NJ correction authoritative; preserve every other DB entry.
export function resolveMedSupStateGIRules(databaseRules) {
  return { ...(databaseRules || stateGIRules), NJ: stateGIRules.NJ };
}
