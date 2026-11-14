-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.plan_terminations
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_status text,
  ADD COLUMN IF NOT EXISTS county_mapping_status text;

-- Source statement 3
DROP INDEX IF EXISTS public.uq_term_plan_county_year;

-- Source statement 4
CREATE UNIQUE INDEX IF NOT EXISTS uq_crosswalk_source_county_year
  ON public.plan_terminations(source_key,county_fips,plan_year) NULLS NOT DISTINCT;

-- Source statement 5
COMMENT ON COLUMN public.plan_terminations.county_mapping_status IS
  'current_service_area is successor coverage, not proof of a county affected by SAR; unavailable has no county evidence.';

-- Source statement 6
DO $$
DECLARE target regprocedure; definition text; patched text;
BEGIN
  target := COALESCE(to_regprocedure('public.get_available_seps_before_fema_078(text)'), to_regprocedure('public.get_available_seps(text)'));
  IF target IS NULL THEN RAISE EXCEPTION 'Missing SEP function'; END IF;
  definition := pg_get_functiondef(target);
  IF position('pt.county_mapping_status' in definition) = 0 THEN
    patched := replace(definition, 'AND pt.plan_year = 2027', E'AND pt.plan_year = 2027\n    AND pt.termination_type IN (''terminated'', ''service_area_reduction'')\n    AND pt.county_mapping_status = ''affected_service_area''');
    IF patched = definition THEN RAISE EXCEPTION 'Unexpected SEP function layout'; END IF;
    EXECUTE patched;
  END IF;
END $$;

-- Source statement 7
COMMIT;
