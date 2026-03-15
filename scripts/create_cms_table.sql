-- Run this in Supabase SQL Editor to create the cms_plans_PY2026 table
-- Then use the upload script to populate it

CREATE TABLE IF NOT EXISTS public.cms_plans_PY2026 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Contract Year" text,
  "Contract Category Type" text,
  "US Territory" text,
  "State Territory Abbreviation" text,
  "State Territory Name" text,
  "County Name" text,
  "Contract ID" text,
  "Plan ID" text,
  "Segment ID" text,
  "ContractPlanID" text,
  "ContractPlanSegmentID" text,
  "Sanctioned Plan" text,
  "Parent Organization Name" text,
  "Contract Name" text,
  "Organization Marketing Name" text,
  "Organization Type" text,
  "Plan Name" text,
  "Plan Type" text,
  "Special Needs Plan (SNP) Indicator" text,
  "SNP Type" text,
  "SNP Institutional Type" text,
  "SNP Institutional Category" text,
  "Dual Eligible SNP (D-SNP) Integration Status" text,
  "D-SNP Applicable Integrated Plan (AIP) Identifier" text,
  "Chronic or Disabling Condition SNP (C-SNP) Condition Type" text,
  "Medicare Zero-Dollar Cost Sharing D-SNP Plan" text,
  "Part D Coverage Indicator" text,
  "National PDP" text,
  "Drug Benefit Category" text,
  "Drug Benefit Type" text,
  "Voluntary De Minimis Program Participant" text,
  "Part D Basic Premium At or Below Regional Benchmark" text,
  "Low Income Subsidy (LIS) Auto Enrollment" text,
  "Offers Drug Tier with No Part D Deductible" text,
  "Annual Part D Deductible Amount" text,
  "Part D Basic Premium" text,
  "Part D Supplemental Premium" text,
  "Part D Total Premium" text,
  "Low Income Premium Subsidy (LIPS) Amount" text,
  "Part D LIPS (CMS Pays)" text,
  "Part D Low Income Beneficiary Premium Amount" text,
  "Part D Out-of-Pocket (OOP) Threshold" text,
  "Part C Premium" text,
  "Monthly Consolidated Premium (Part C + D)" text,
  "In-Network Maximum Out-of-Pocket (MOOP) Amount" text,
  "Part C Summary Star Rating" text,
  "Part D Summary Star Rating" text,
  "Overall Star Rating" text,
  "MA Region Code" text,
  "MA Region" text,
  "PDP Region Code" text,
  "PDP Region" text
);

-- Indexes for the queries used by the SEP tool
CREATE INDEX IF NOT EXISTS idx_cms_state ON public.cms_plans_PY2026 ("State Territory Abbreviation");
CREATE INDEX IF NOT EXISTS idx_cms_county ON public.cms_plans_PY2026 ("County Name");
CREATE INDEX IF NOT EXISTS idx_cms_state_county ON public.cms_plans_PY2026 ("State Territory Abbreviation", "County Name");
CREATE INDEX IF NOT EXISTS idx_cms_sanctioned ON public.cms_plans_PY2026 ("Sanctioned Plan");

-- Enable RLS but allow public read
ALTER TABLE public.cms_plans_PY2026 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.cms_plans_PY2026 FOR SELECT USING (true);
