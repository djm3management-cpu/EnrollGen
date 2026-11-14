-- Source statement 1
BEGIN;

-- Source statement 2
CREATE TABLE IF NOT EXISTS public.fema_feed_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  status text NOT NULL CHECK (status IN ('live','unavailable')),
  fetched_at timestamptz,
  checked_at timestamptz NOT NULL,
  disasters jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disasters) = 'array')
);

-- Source statement 3
ALTER TABLE public.fema_feed_snapshot ENABLE ROW LEVEL SECURITY;

-- Source statement 4
REVOKE ALL ON public.fema_feed_snapshot FROM anon, authenticated;

-- Source statement 5
GRANT ALL ON public.fema_feed_snapshot TO service_role;

-- Source statement 6
DO $$ BEGIN
  IF to_regprocedure('public.get_available_seps_before_fema_078(text)') IS NULL THEN
    ALTER FUNCTION public.get_available_seps(text) RENAME TO get_available_seps_before_fema_078;
  END IF;
END $$;

-- Source statement 7
REVOKE ALL ON FUNCTION public.get_available_seps_before_fema_078(text) FROM PUBLIC, anon, authenticated;

-- Source statement 8
CREATE OR REPLACE FUNCTION public.get_available_seps(input_zip text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
  snapshot public.fema_feed_snapshot%ROWTYPE;
  matches jsonb := '[]'::jsonb;
  disaster_sep jsonb;
  fresh boolean;
BEGIN
  result := public.get_available_seps_before_fema_078(input_zip);
  IF result ? 'error' THEN RETURN result; END IF;
  SELECT * INTO snapshot FROM public.fema_feed_snapshot WHERE singleton;
  fresh := coalesce(snapshot.status = 'live'
    AND snapshot.fetched_at BETWEEN now() - interval '24 hours' AND now(), false);
  IF fresh THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'disaster_number', d->'disasterNumber', 'title', d->>'title',
      'type', d->>'type', 'declared', d->>'declaredDate',
      'sep_ends', CASE WHEN (d->>'isOngoing')::boolean THEN 'Open (incident ongoing)' ELSE d->>'sepEndDate' END,
      'county_fips', d->>'countyFips', 'designated_area', d->'counties'
    )), '[]'::jsonb) INTO matches
    FROM jsonb_array_elements(snapshot.disasters) d
    WHERE (d->>'verified')::boolean AND d->>'source' = 'OpenFEMA'
      AND NOT coalesce((d->>'paOnly')::boolean, true)
      AND (coalesce((d->>'iaProgram')::boolean, false) OR coalesce((d->>'ihProgram')::boolean, false))
      AND (coalesce((d->>'isOngoing')::boolean, false) OR (d->>'sepEndDate')::date >= CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM public.zip_county_crosswalk z
        WHERE z.zip = input_zip AND z.county_fips = d->>'countyFips' AND z.state_code = d->>'state');
  END IF;
  disaster_sep := jsonb_build_object(
    'sep_type', 'Disaster / Emergency SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(18)(ii); CMS HPMS memo',
    'available', fresh AND jsonb_array_length(matches) > 0,
    'period', 'Duration of disaster declaration + 2 calendar months',
    'data_status', CASE WHEN fresh THEN 'live' ELSE 'unavailable' END,
    'fetched_at', snapshot.fetched_at, 'checked_at', snapshot.checked_at,
    'evidence', CASE WHEN NOT fresh THEN 'FEMA data unavailable'
      WHEN jsonb_array_length(matches) > 0 THEN 'County designated in OpenFEMA; verify missed election period and beneficiary impact. Data from ' || snapshot.fetched_at::text
      ELSE 'No active FEMA declaration in this county. Data from ' || snapshot.fetched_at::text END,
    'disasters', matches
  );
  RETURN jsonb_set(result, '{seps}', (
    SELECT coalesce(jsonb_agg(CASE WHEN s->>'sep_type' = 'Disaster / Emergency SEP' THEN disaster_sep ELSE s END ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(result->'seps') WITH ORDINALITY AS items(s, ord)
  ));
END $$;

-- Source statement 9
REVOKE ALL ON FUNCTION public.get_available_seps(text) FROM PUBLIC;

-- Source statement 10
GRANT EXECUTE ON FUNCTION public.get_available_seps(text) TO anon, authenticated, service_role;

-- Source statement 11
COMMIT;
