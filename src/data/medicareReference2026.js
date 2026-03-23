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
  NJ: { continuousOE: true, note: "NJ guarantees open enrollment year-round. No medical underwriting." },
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
