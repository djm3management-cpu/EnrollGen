-- Run after uploading cms_plans_py2027. Supplies the SEP county RPC from
-- current landscape rows; the source has no PY2027 termination crosswalk.
INSERT INTO public.star_ratings_by_county
  (contract_id, plan_name, organization_name, overall_star_rating,
   county_fips, county_name, state_code, plan_year)
SELECT contract_id, max(plan_name), max(carrier), max(overall_star_rating),
  county_fips, max(county_name), max(state_code), 2027
FROM public.cms_plans_py2027
WHERE overall_star_rating IS NOT NULL
GROUP BY contract_id, county_fips
ON CONFLICT (contract_id, county_fips, plan_year) DO UPDATE SET
  overall_star_rating = EXCLUDED.overall_star_rating,
  plan_name = EXCLUDED.plan_name,
  organization_name = EXCLUDED.organization_name,
  updated_at = now();

INSERT INTO public.snp_plans_by_county
  (contract_id, plan_id, plan_name, organization_name, snp_type,
   county_fips, county_name, state_code, plan_year)
SELECT contract_id, plan_id, max(plan_name), max(carrier),
  CASE snp_type
    WHEN 'Dual-Eligible' THEN 'D-SNP'
    WHEN 'Chronic or Disabling Condition' THEN 'C-SNP'
    WHEN 'Institutional' THEN 'I-SNP'
  END,
  county_fips, max(county_name), max(state_code), 2027
FROM public.cms_plans_py2027
WHERE category = 'SNP'
GROUP BY contract_id, plan_id, snp_type, county_fips
ON CONFLICT (contract_id, plan_id, snp_type, county_fips, plan_year)
DO UPDATE SET plan_name = EXCLUDED.plan_name,
  organization_name = EXCLUDED.organization_name, updated_at = now();
