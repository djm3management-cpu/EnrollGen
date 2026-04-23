const SNP_MEDICAID_META = {
  none: {
    bucket: "none",
    label: "None",
    headerLabel: "No Medicaid",
  },
  partial_qmb_only: {
    bucket: "partial_dual",
    label: "Partial (QMB-only)",
    headerLabel: "Partial (QMB-only)",
  },
  partial_slmb_only: {
    bucket: "partial_dual",
    label: "Partial (SLMB-only)",
    headerLabel: "Partial (SLMB-only)",
  },
  partial_qi: {
    bucket: "partial_dual",
    label: "Partial (QI)",
    headerLabel: "Partial (QI)",
  },
  partial_qdwi: {
    bucket: "partial_dual",
    label: "Partial (QDWI)",
    headerLabel: "Partial (QDWI)",
  },
  full_qmb_plus: {
    bucket: "full_dual",
    label: "Full Dual (QMB+)",
    headerLabel: "Full Dual (QMB+)",
  },
  full_slmb_plus: {
    bucket: "full_dual",
    label: "Full Dual (SLMB+)",
    headerLabel: "Full Dual (SLMB+)",
  },
  full_fbde: {
    bucket: "full_dual",
    label: "Full Dual (FBDE)",
    headerLabel: "Full Dual (FBDE)",
  },
};

export const SNP_MEDICAID_OPTIONS = [
  { value: "", label: "Select Medicaid status" },
  ...Object.entries(SNP_MEDICAID_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export function getSnpMedicaidMeta(value) {
  return SNP_MEDICAID_META[value] || null;
}

export function getSnpMedicaidBucket(value) {
  return getSnpMedicaidMeta(value)?.bucket || "";
}

export function getSnpMedicaidHeaderLabel(value) {
  return getSnpMedicaidMeta(value)?.headerLabel || "";
}

export const SNP_CHRONIC_OPTIONS = [
  { value: "", label: "Select chronic condition" },
  { value: "none", label: "None" },
  { value: "diabetes", label: "Diabetes" },
  { value: "chf", label: "CHF" },
  { value: "cardiovascular", label: "Cardiovascular" },
  { value: "multiple", label: "Multiple" },
];

export const SNP_PRIORITY_OPTIONS = [
  { value: "", label: "Select member priority" },
  { value: "otc", label: "OTC" },
  { value: "drug_costs", label: "Drug Costs" },
  { value: "giveback", label: "Giveback" },
  { value: "provider_continuity", label: "Provider Continuity" },
];

export const SNP_CARRIER_LABELS = {
  uhc: "UnitedHealthcare",
  aetna: "Aetna",
  humana: "Humana",
  bcbs: "Blue Cross Blue Shield",
  cigna: "Cigna",
  wellcare: "Wellcare",
  molina: "Molina",
  devoted: "Devoted Health",
  alignment: "Alignment Health",
  kaiser: "Kaiser Permanente",
  mutual: "Mutual of Omaha",
};

export const SNP_CURRENT_CARRIER_OPTIONS = [
  { value: "", label: "Current carrier (optional)" },
  ...Object.entries(SNP_CARRIER_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

// County-level EAE rows should be loaded from Supabase once the official CMS 2026
// integrated D-SNP file has been imported. The widget treats this as optional data.
export const DEFAULT_DSNP_EAE_LOOKUP = [];

export const DEFAULT_CSNP_CARRIER_VERIFICATION = [
  {
    carrier: "uhc",
    carrier_name: "UnitedHealthcare",
    verification_method:
      "UnitedHealthcare starts verification after the application is processed and reaches the treating provider directly for the chronic condition form.",
    verification_timeline: "60 days after effective date",
    failed_verification_consequence:
      "If the qualifying condition is not verified within 60 days, CMS requires disenrollment from the C-SNP.",
    qualifying_conditions: ["Diabetes", "CHF", "Cardiovascular"],
    reference_notes:
      "Provider can return the form by phone, email, or fax once the verification request is issued.",
    reference_url:
      "https://www.uhcprovider.com/content/provider/en/resource-library/news/2025/complete-verification-c-snp-patients.html",
  },
  {
    carrier: "humana",
    carrier_name: "Humana",
    verification_method:
      "Humana requires the member's doctor to verify the qualifying chronic condition after enrollment.",
    verification_timeline: "60 days from first day of coverage",
    failed_verification_consequence:
      "The member must be verified within 60 days to stay enrolled in the C-SNP.",
    qualifying_conditions: ["Diabetes", "CHF", "Cardiovascular"],
    reference_notes:
      "Humana's public C-SNP page lists diabetes, cardiovascular disease, chronic heart failure, chronic lung disease, and kidney disease among the qualifying conditions.",
    reference_url:
      "https://www.humana.com/medicare/medicare-advantage-plans/humana-special-needs/c-snp",
  },
  {
    carrier: "wellcare",
    carrier_name: "Wellcare",
    verification_method:
      "Wellcare collects the member's condition and provider details during enrollment and verifies the condition with the doctor after enrollment.",
    verification_timeline: "30 days of enrollment",
    failed_verification_consequence:
      "If Wellcare cannot verify the condition, CMS requires disenrollment from the C-SNP.",
    qualifying_conditions: ["Diabetes", "CHF", "Cardiovascular"],
    reference_notes:
      "Wellcare instructs members to tell the plan which provider can verify the qualifying condition.",
    reference_url:
      "https://www.wellcare.com/-/media/PDFs/NA/Member/Medicare/NA_Care_Chronic-Condition-Special-Needs_CSNP-Plans_2023_R.ashx",
  },
];

export const SNP_ROUTING_RULE_SUMMARIES = [
  {
    rule_key: "none_no_chronic",
    medicaid_status: "none",
    chronic_condition_bucket: "none",
    primary_route: "STANDARD MA / MED SUP",
    fallback_route: [],
    status: "clear",
    rule_summary:
      "No Medicaid and no qualifying chronic condition routes to conventional MA or Med Supp shopping.",
    disclosure_points: [],
    sep_paths: [
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
      "ICEP when first eligible for MA",
    ],
  },
  {
    rule_key: "none_with_chronic",
    medicaid_status: "none",
    chronic_condition_bucket: "chronic",
    primary_route: "C-SNP",
    fallback_route: ["STANDARD MA / MED SUP"],
    status: "clear",
    rule_summary:
      "No Medicaid plus a qualifying chronic condition routes to C-SNP first, then conventional MA if no county C-SNP exists.",
    disclosure_points: [
      "This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.",
    ],
    sep_paths: [
      "Chronic Condition SEP (year-round when the diagnosis qualifies)",
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
      "ICEP when first eligible for MA",
    ],
  },
  {
    rule_key: "full_dual_no_chronic",
    medicaid_status: "full_dual",
    chronic_condition_bucket: "none",
    primary_route: "D-SNP",
    fallback_route: ["STANDARD MA WITH GIVEBACK"],
    status: "conditional",
    rule_summary:
      "Full dual without a qualifying chronic condition routes to D-SNP first, but alignment and integrated-plan checks may push the member to a standard MA fallback.",
    disclosure_points: [
      "Your continued enrollment depends on maintaining your Medicaid eligibility. If you lose Medicaid, you will enter a grace period and may be disenrolled.",
      "This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.",
    ],
    sep_paths: [
      "Integrated Care SEP (full duals joining an integrated D-SNP)",
      "Dual/LIS SEP for dual-eligible members",
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
    ],
  },
  {
    rule_key: "full_dual_with_chronic",
    medicaid_status: "full_dual",
    chronic_condition_bucket: "chronic",
    primary_route: "C-SNP",
    fallback_route: ["D-SNP", "STANDARD MA WITH GIVEBACK"],
    status: "clear",
    rule_summary:
      "Full dual plus a qualifying chronic condition routes to C-SNP first because it avoids Medicaid alignment friction, then D-SNP, then standard MA fallback.",
    disclosure_points: [
      "This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.",
      "Your continued enrollment depends on maintaining your Medicaid eligibility. If you lose Medicaid, you will enter a grace period and may be disenrolled.",
      "This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.",
    ],
    sep_paths: [
      "Chronic Condition SEP (year-round when the diagnosis qualifies)",
      "Integrated Care SEP (full duals joining an integrated D-SNP)",
      "Dual/LIS SEP for dual-eligible members",
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
    ],
  },
  {
    rule_key: "partial_dual_no_chronic",
    medicaid_status: "partial_dual",
    chronic_condition_bucket: "none",
    primary_route: "STANDARD MA WITH GIVEBACK",
    fallback_route: [],
    status: "clear",
    rule_summary:
      "Partial dual status skips D-SNP and routes straight to standard MA with giveback positioning.",
    disclosure_points: [
      "This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.",
    ],
    sep_paths: [
      "Dual/LIS SEP when Medicaid or Extra Help applies",
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
      "ICEP when first eligible for MA",
    ],
  },
  {
    rule_key: "partial_dual_with_chronic",
    medicaid_status: "partial_dual",
    chronic_condition_bucket: "chronic",
    primary_route: "C-SNP",
    fallback_route: ["STANDARD MA WITH GIVEBACK"],
    status: "clear",
    rule_summary:
      "Partial dual with a qualifying chronic condition routes to C-SNP first and standard MA fallback second.",
    disclosure_points: [
      "This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.",
      "This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.",
    ],
    sep_paths: [
      "Chronic Condition SEP (year-round when the diagnosis qualifies)",
      "Dual/LIS SEP when Medicaid or Extra Help applies",
      "AEP (October 15-December 7)",
      "MA OEP (January 1-March 31 for existing MA members)",
      "ICEP when first eligible for MA",
    ],
  },
];
