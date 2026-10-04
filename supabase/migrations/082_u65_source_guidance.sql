-- F57: source-grounded U65 guidance. No live application is authorized here.
-- Retire every active U65 override (including tenant copies), preserve history.
-- Product facts remain in the versioned 59-variant application catalog.
BEGIN;

UPDATE public.knowledge_base
SET is_active = false, updated_at = now()
WHERE category = 'compliance_u65' AND is_active;

UPDATE public.script_templates
SET is_active = false, updated_at = now()
WHERE flow_type = 'u65' AND is_active;
-- U65 script and Script Editor now fall back to the source-grounded local screens.

WITH gate_lines AS (
  SELECT key, value AS lines FROM jsonb_each($gates${
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
}$gates$::jsonb)
), source_rules AS (
  SELECT $rules$[
  "Unknown product facts, ACA/MEC status and underwriting lookbacks: verify with carrier.",
  "Use the selected variant’s required statements from the workbook catalog; never transfer rules between products.",
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
]$rules$::jsonb AS rules
), structured AS (
  SELECT gate_lines.key AS label, jsonb_build_object(
    'verbatimScript', lines,
    'keyPhrasesToListenFor', '["verify with carrier", "confirm with carrier", "selected plan", "limits", "network", "OOP"]'::jsonb,
    'requiredElements', lines || rules,
    'commonMistakes', '["Transferring another product’s rules to the selected plan.", "Comparing premiums across coverage groups."]'::jsonb,
    'redFlags', '["Guaranteeing total exposure is capped despite exclusions or limits.", "Treating a network logo as proof of exact-product participation.", "Inventing underwriting lookbacks or ACA/MEC status."]'::jsonb
  ) AS body FROM gate_lines CROSS JOIN source_rules
)
INSERT INTO public.knowledge_base
  (tenant_id, category, key, title, content, metadata, version, is_active, source_urls)
SELECT NULL, 'compliance_u65',
  trim(both '_' from regexp_replace(lower(label), '[^a-z0-9]+', '_', 'g')),
  label, body::text,
  jsonb_build_object('static_key', label, 'structured', body,
    'source_version', 'f57-source-v2',
    'source_files', jsonb_build_array('Plan_comparison_with_Amerus.xlsx',
      'Plan_differences_with_Amerus.docx', 'U65 Plan Map.pdf'),
    'map_reviewed', true, 'map_page_count', 8),
  57, true, ARRAY[]::text[]
FROM structured
ON CONFLICT (category, key, version) WHERE tenant_id IS NULL
DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content,
  metadata = EXCLUDED.metadata, is_active = true,
  source_urls = EXCLUDED.source_urls, updated_at = now();

COMMIT;
