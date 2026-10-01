-- CMS CY2027 county landscape. No other plan year can enter this table.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.cms_plans_py2027 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_year integer NOT NULL DEFAULT 2027 CHECK (plan_year = 2027),
  category text NOT NULL CHECK (category IN ('MA', 'MA-PD', 'PDP', 'SNP')),
  state_code text NOT NULL,
  county_name text NOT NULL,
  county_fips text NOT NULL,
  carrier text NOT NULL,
  contract_id text NOT NULL,
  plan_id text NOT NULL,
  segment_id text NOT NULL,
  contract_plan_segment_id text NOT NULL,
  plan_name text NOT NULL,
  plan_type text,
  snp_type text,
  dsnp_integration_status text,
  dsnp_aip_identifier text,
  part_d_coverage boolean,
  part_c_premium numeric,
  part_d_premium numeric,
  monthly_premium numeric,
  part_d_deductible numeric,
  in_network_moop numeric,
  overall_star_rating numeric,
  part_c_star_rating numeric,
  part_d_star_rating numeric,
  source_file text NOT NULL,
  UNIQUE (state_code, county_fips, contract_plan_segment_id)
);
CREATE INDEX IF NOT EXISTS cms_plans_py2027_area_idx ON public.cms_plans_py2027 (state_code, county_name);
CREATE INDEX IF NOT EXISTS cms_plans_py2027_contract_idx ON public.cms_plans_py2027 (contract_id, plan_id);
ALTER TABLE public.cms_plans_py2027 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cms_plans_py2027_read ON public.cms_plans_py2027;
CREATE POLICY cms_plans_py2027_read ON public.cms_plans_py2027 FOR SELECT TO anon, authenticated USING (plan_year = 2027);
GRANT SELECT ON public.cms_plans_py2027 TO anon, authenticated;

CREATE OR REPLACE VIEW public."cms_plans_PY2027" WITH (security_invoker = true) AS
SELECT plan_year::text AS "Contract Year", category AS "Contract Category Type",
  state_code AS "State Territory Abbreviation", county_name AS "County Name",
  county_fips AS "County FIPS", carrier AS "Organization Marketing Name",
  carrier AS "Parent Organization Name", carrier AS "Contract Name",
  contract_id AS "Contract ID", plan_id AS "Plan ID", segment_id AS "Segment ID",
  contract_id || '_' || plan_id AS "ContractPlanID",
  contract_plan_segment_id AS "ContractPlanSegmentID",
  'No'::text AS "Sanctioned Plan", plan_name AS "Plan Name", plan_type AS "Plan Type",
  snp_type AS "SNP Type", part_d_coverage AS "Part D Coverage Indicator",
  dsnp_integration_status AS "Dual Eligible SNP (D-SNP) Integration Status",
  dsnp_aip_identifier AS "D-SNP Applicable Integrated Plan (AIP) Identifier",
  part_c_premium::text AS "Part C Premium", part_d_premium::text AS "Part D Total Premium",
  monthly_premium::text AS "Monthly Consolidated Premium (Part C + D)",
  part_d_deductible::text AS "Annual Part D Deductible Amount",
  in_network_moop::text AS "In-Network Maximum Out-of-Pocket (MOOP) Amount",
  overall_star_rating::text AS "Overall Star Rating",
  part_c_star_rating::text AS "Part C Summary Star Rating",
  part_d_star_rating::text AS "Part D Summary Star Rating"
FROM public.cms_plans_py2027 WHERE plan_year = 2027;
GRANT SELECT ON public."cms_plans_PY2027" TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cms_plan_embeddings_py2027 (
  plan_id bigint PRIMARY KEY REFERENCES public.cms_plans_py2027(id) ON DELETE CASCADE,
  plan_year integer NOT NULL DEFAULT 2027 CHECK (plan_year = 2027),
  content text NOT NULL,
  embedding vector(1536) NOT NULL
);
ALTER TABLE public.cms_plan_embeddings_py2027 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cms_plan_embeddings_py2027_read ON public.cms_plan_embeddings_py2027;
CREATE POLICY cms_plan_embeddings_py2027_read ON public.cms_plan_embeddings_py2027 FOR SELECT TO anon, authenticated USING (plan_year = 2027);
GRANT SELECT ON public.cms_plan_embeddings_py2027 TO anon, authenticated;

-- Remove the previous Medicare plan year from every known year-keyed plan table.
-- ACA QHP tables and transcript embeddings are separate data domains.
DROP TABLE IF EXISTS public."cms_plans_PY2026";
DROP TABLE IF EXISTS public.cms_plans_py2026;
DO $$
BEGIN
  IF to_regclass('public.snp_plans_by_county') IS NOT NULL THEN
    DELETE FROM public.snp_plans_by_county WHERE plan_year IS DISTINCT FROM 2027;
    ALTER TABLE public.snp_plans_by_county ALTER COLUMN plan_year SET DEFAULT 2027;
    ALTER TABLE public.snp_plans_by_county ALTER COLUMN plan_year SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snp_plans_py2027_only') THEN
      ALTER TABLE public.snp_plans_by_county ADD CONSTRAINT snp_plans_py2027_only CHECK (plan_year = 2027);
    END IF;
  END IF;
  IF to_regclass('public.star_ratings_by_county') IS NOT NULL THEN
    DELETE FROM public.star_ratings_by_county WHERE plan_year IS DISTINCT FROM 2027;
    ALTER TABLE public.star_ratings_by_county ALTER COLUMN plan_year SET DEFAULT 2027;
    ALTER TABLE public.star_ratings_by_county ALTER COLUMN plan_year SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_ratings_py2027_only') THEN
      ALTER TABLE public.star_ratings_by_county ADD CONSTRAINT star_ratings_py2027_only CHECK (plan_year = 2027);
    END IF;
  END IF;
  IF to_regclass('public.plan_terminations') IS NOT NULL THEN
    DELETE FROM public.plan_terminations WHERE plan_year IS DISTINCT FROM 2027;
    ALTER TABLE public.plan_terminations ALTER COLUMN plan_year SET DEFAULT 2027;
    ALTER TABLE public.plan_terminations ALTER COLUMN plan_year SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_terminations_py2027_only') THEN
      ALTER TABLE public.plan_terminations ADD CONSTRAINT plan_terminations_py2027_only CHECK (plan_year = 2027);
    END IF;
  END IF;
  IF to_regclass('public.dsnp_eae_lookup') IS NOT NULL THEN
    DELETE FROM public.dsnp_eae_lookup;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.match_cms_plans_py2027(query_embedding vector(1536), match_count integer DEFAULT 10)
RETURNS TABLE (plan_id bigint, content text, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT e.plan_id, e.content, 1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.cms_plan_embeddings_py2027 e
  JOIN public.cms_plans_py2027 p ON p.id = e.plan_id
  WHERE e.plan_year = 2027 AND p.plan_year = 2027
  ORDER BY e.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.match_cms_plans_py2027_area(
  query_embedding vector(1536), p_state text, p_county text, match_count integer DEFAULT 5)
RETURNS TABLE (plan_id bigint, content text, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT e.plan_id, e.content, 1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.cms_plan_embeddings_py2027 e
  JOIN public.cms_plans_py2027 p ON p.id = e.plan_id
  WHERE e.plan_year = 2027 AND p.plan_year = 2027
    AND p.state_code = p_state AND p.county_name = p_county
  ORDER BY e.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 10);
$$;

-- Replace the SEP RPC so it cannot read PY2026 support rows.
CREATE OR REPLACE FUNCTION public.get_available_seps(input_zip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  county_info JSONB;
  five_star JSONB;
  disasters JSONB;
  csnp JSONB;
  dsnp JSONB;
  isnp JSONB;
  terminations JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'county_fips', county_fips,
    'county_name', county_name,
    'state_code', state_code,
    'state_name', state_name,
    'residential_ratio', residential_ratio
  ) ORDER BY residential_ratio DESC NULLS LAST)
  INTO county_info
  FROM public.zip_county_crosswalk
  WHERE zip = input_zip;

  IF county_info IS NULL THEN
    RETURN jsonb_build_object(
      'zip', input_zip,
      'error', 'ZIP code not found in crosswalk',
      'seps', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'sep_type', '5-Star Special Enrollment Period',
    'cfr_reference', '42 CFR Sec. 422.62(b)(15)',
    'available', COUNT(sr.id) > 0,
    'period', 'Year-round (continuous)',
    'evidence', CASE
      WHEN COUNT(sr.id) > 0 THEN COUNT(sr.id)::TEXT || ' five-star rated plan(s) available'
      ELSE 'No five-star plans in this area'
    END,
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sr.contract_id,
      'plan_name', sr.plan_name,
      'organization', sr.organization_name,
      'stars', sr.overall_star_rating
    )) FILTER (WHERE sr.id IS NOT NULL), '[]'::jsonb)
  )
  INTO five_star
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.star_ratings_by_county sr
    ON sr.county_fips = zc.county_fips
    AND sr.overall_star_rating >= 5.0
    AND sr.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Disaster / Emergency SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(18)(ii); CMS HPMS memo',
    'available', COUNT(fd.id) > 0,
    'period', 'Duration of disaster declaration + 2 months',
    'evidence', CASE
      WHEN COUNT(fd.id) > 0 THEN COUNT(fd.id)::TEXT || ' active disaster declaration(s) identified'
      ELSE 'No active disaster declarations in this area'
    END,
    'disasters', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'disaster_number', fd.disaster_number,
      'title', fd.declaration_title,
      'type', fd.incident_type,
      'declared', fd.declaration_date,
      'sep_ends', fd.sep_end_date
    )) FILTER (WHERE fd.id IS NOT NULL), '[]'::jsonb)
  )
  INTO disasters
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.fema_disasters fd
    ON fd.county_fips = zc.county_fips
    AND fd.ia_designated = TRUE
    AND fd.sep_end_date >= CURRENT_DATE
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Chronic Condition SNP (C-SNP) SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(4)',
    'available', COUNT(sp.id) > 0,
    'period', 'Year-round for qualifying chronic conditions',
    'evidence', CASE
      WHEN COUNT(sp.id) > 0 THEN COUNT(sp.id)::TEXT || ' C-SNP plan(s) available'
      ELSE 'No C-SNP plans in this area'
    END,
    'plan_count', COUNT(sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id,
      'plan_id', sp.plan_id,
      'plan_name', sp.plan_name,
      'organization', sp.organization_name,
      'chronic_conditions', sp.chronic_conditions
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  )
  INTO csnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.snp_plans_by_county sp
    ON sp.county_fips = zc.county_fips
    AND sp.snp_type = 'C-SNP'
    AND sp.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Dual Eligible SNP (D-SNP) SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(4); CY2025+ monthly SEP for full-benefit duals',
    'available', COUNT(sp.id) > 0,
    'period', 'Monthly enrollment for full-benefit duals; quarterly for partial duals',
    'evidence', CASE
      WHEN COUNT(sp.id) > 0 THEN COUNT(sp.id)::TEXT || ' D-SNP plan(s) available'
      ELSE 'No D-SNP plans in this area'
    END,
    'plan_count', COUNT(sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id,
      'plan_id', sp.plan_id,
      'plan_name', sp.plan_name,
      'organization', sp.organization_name,
      'enrollment_count', sp.enrollment_count
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  )
  INTO dsnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.snp_plans_by_county sp
    ON sp.county_fips = zc.county_fips
    AND sp.snp_type = 'D-SNP'
    AND sp.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Institutional SNP (I-SNP) SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(4)',
    'available', COUNT(sp.id) > 0,
    'period', 'Year-round for institutionalized individuals',
    'evidence', CASE
      WHEN COUNT(sp.id) > 0 THEN COUNT(sp.id)::TEXT || ' I-SNP plan(s) available'
      ELSE 'No I-SNP plans in this area'
    END,
    'plan_count', COUNT(sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id,
      'plan_id', sp.plan_id,
      'plan_name', sp.plan_name,
      'organization', sp.organization_name,
      'enrollment_count', sp.enrollment_count
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  )
  INTO isnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.snp_plans_by_county sp
    ON sp.county_fips = zc.county_fips
    AND sp.snp_type = 'I-SNP'
    AND sp.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Involuntary Disenrollment / Plan Termination SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(5)',
    'available', COUNT(pt.id) > 0,
    'period', '2 months from plan termination effective date',
    'evidence', CASE
      WHEN COUNT(pt.id) > 0 THEN 'Carrier exits detected in this market. Displaced members are SEP-eligible.'
      ELSE 'No plan terminations detected in this area'
    END,
    'terminated_plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'old_plan', pt.old_plan_name,
      'old_org', pt.old_organization_name,
      'type', pt.termination_type,
      'effective', pt.effective_date,
      'replacement_plan', pt.new_plan_name
    )) FILTER (WHERE pt.id IS NOT NULL), '[]'::jsonb)
  )
  INTO terminations
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.plan_terminations pt
    ON pt.county_fips = zc.county_fips
    AND pt.plan_year = 2027
    AND (pt.effective_date IS NULL OR pt.effective_date + INTERVAL '2 months' >= CURRENT_DATE)
  WHERE zc.zip = input_zip;

  result := jsonb_build_object(
    'zip', input_zip,
    'counties', county_info,
    'queried_at', NOW(),
    'seps', jsonb_build_array(
      five_star,
      disasters,
      csnp,
      dsnp,
      isnp,
      terminations
    )
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_seps(TEXT) TO anon, authenticated;
