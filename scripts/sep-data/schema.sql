CREATE TABLE IF NOT EXISTS public.zip_county_crosswalk (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zip TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  county_name TEXT,
  state_code TEXT,
  state_name TEXT,
  residential_ratio NUMERIC(6,4) DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zip_crosswalk_zip ON public.zip_county_crosswalk(zip);
CREATE INDEX IF NOT EXISTS idx_zip_crosswalk_fips ON public.zip_county_crosswalk(county_fips);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zip_crosswalk_zip_fips
  ON public.zip_county_crosswalk(zip, county_fips);

ALTER TABLE public.zip_county_crosswalk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.zip_county_crosswalk;
DROP POLICY IF EXISTS "Allow read for anon" ON public.zip_county_crosswalk;
CREATE POLICY "Allow read for authenticated" ON public.zip_county_crosswalk
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for anon" ON public.zip_county_crosswalk
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS public.star_ratings_by_county (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id TEXT NOT NULL,
  plan_name TEXT,
  organization_name TEXT,
  overall_star_rating NUMERIC(2,1),
  county_fips TEXT NOT NULL,
  county_name TEXT,
  state_code TEXT,
  plan_year INTEGER DEFAULT 2026,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_star_county ON public.star_ratings_by_county(county_fips);
CREATE INDEX IF NOT EXISTS idx_star_rating ON public.star_ratings_by_county(overall_star_rating);
CREATE UNIQUE INDEX IF NOT EXISTS uq_star_contract_county_year
  ON public.star_ratings_by_county(contract_id, county_fips, plan_year);

ALTER TABLE public.star_ratings_by_county ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.star_ratings_by_county;
DROP POLICY IF EXISTS "Allow read for anon" ON public.star_ratings_by_county;
CREATE POLICY "Allow read for authenticated" ON public.star_ratings_by_county
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for anon" ON public.star_ratings_by_county
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS public.fema_disasters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disaster_number INTEGER NOT NULL,
  declaration_type TEXT,
  state_code TEXT,
  county_fips TEXT,
  county_name TEXT,
  incident_type TEXT,
  declaration_title TEXT,
  incident_begin_date DATE,
  incident_end_date DATE,
  declaration_date DATE,
  ia_designated BOOLEAN DEFAULT FALSE,
  sep_end_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fema_county ON public.fema_disasters(county_fips);
CREATE INDEX IF NOT EXISTS idx_fema_active ON public.fema_disasters(sep_end_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fema_disaster_county
  ON public.fema_disasters(disaster_number, county_fips);

ALTER TABLE public.fema_disasters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.fema_disasters;
DROP POLICY IF EXISTS "Allow read for anon" ON public.fema_disasters;
CREATE POLICY "Allow read for authenticated" ON public.fema_disasters
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for anon" ON public.fema_disasters
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS public.snp_plans_by_county (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id TEXT NOT NULL,
  plan_id TEXT,
  plan_name TEXT,
  organization_name TEXT,
  snp_type TEXT NOT NULL,
  chronic_conditions TEXT[],
  county_fips TEXT NOT NULL,
  county_name TEXT,
  state_code TEXT,
  plan_year INTEGER DEFAULT 2026,
  enrollment_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snp_county ON public.snp_plans_by_county(county_fips);
CREATE INDEX IF NOT EXISTS idx_snp_type ON public.snp_plans_by_county(snp_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snp_plan_county_year
  ON public.snp_plans_by_county(contract_id, plan_id, snp_type, county_fips, plan_year);

ALTER TABLE public.snp_plans_by_county ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.snp_plans_by_county;
DROP POLICY IF EXISTS "Allow read for anon" ON public.snp_plans_by_county;
CREATE POLICY "Allow read for authenticated" ON public.snp_plans_by_county
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for anon" ON public.snp_plans_by_county
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS public.plan_terminations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  old_contract_id TEXT NOT NULL,
  old_plan_id TEXT,
  old_plan_name TEXT,
  old_organization_name TEXT,
  termination_type TEXT,
  new_contract_id TEXT,
  new_plan_id TEXT,
  new_plan_name TEXT,
  county_fips TEXT,
  county_name TEXT,
  state_code TEXT,
  effective_date DATE,
  plan_year INTEGER DEFAULT 2026,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_term_county ON public.plan_terminations(county_fips);
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_plan_county_year
  ON public.plan_terminations(old_contract_id, old_plan_id, county_fips, plan_year);

ALTER TABLE public.plan_terminations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.plan_terminations;
DROP POLICY IF EXISTS "Allow read for anon" ON public.plan_terminations;
CREATE POLICY "Allow read for authenticated" ON public.plan_terminations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for anon" ON public.plan_terminations
  FOR SELECT TO anon USING (true);

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
    AND sr.plan_year = 2026
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
    AND sp.plan_year = 2026
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
    AND sp.plan_year = 2026
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
    AND sp.plan_year = 2026
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
    AND pt.plan_year = 2026
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
