-- Source statement 1
BEGIN;

-- Source statement 2
DO $$ BEGIN
  IF to_regclass('oct_slim_088_rollback.state') IS NULL AND
     to_regclass('public.cms_county_penetration') IS NOT NULL THEN
    RAISE EXCEPTION 'cms_county_penetration already exists; verify its origin before applying 088';
  END IF;
END $$;

-- Source statement 3
CREATE SCHEMA IF NOT EXISTS oct_slim_088_rollback;

-- Source statement 4
REVOKE ALL ON SCHEMA oct_slim_088_rollback FROM PUBLIC,anon,authenticated;

-- Source statement 5
CREATE TABLE IF NOT EXISTS oct_slim_088_rollback.state(singleton boolean PRIMARY KEY CHECK(singleton));

-- Source statement 6
INSERT INTO oct_slim_088_rollback.state VALUES(true) ON CONFLICT DO NOTHING;

-- Source statement 7
REVOKE ALL ON ALL TABLES IN SCHEMA oct_slim_088_rollback FROM PUBLIC,anon,authenticated;

-- Source statement 8
GRANT USAGE ON SCHEMA oct_slim_088_rollback TO service_role;

-- Source statement 9
GRANT ALL ON ALL TABLES IN SCHEMA oct_slim_088_rollback TO service_role;

-- Source statement 10
CREATE TABLE IF NOT EXISTS public.cms_county_penetration (
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  county text NOT NULL CHECK (length(county) > 0),
  fips text NOT NULL CHECK (fips ~ '^[0-9]{5}$'),
  eligibles integer NOT NULL CHECK (eligibles >= 0),
  ma_enrollees integer CHECK (ma_enrollees >= 0),
  penetration_pct numeric(5,2) CHECK (penetration_pct BETWEEN 0 AND 100),
  file_month date NOT NULL CHECK (extract(day FROM file_month) = 1),
  PRIMARY KEY (file_month, fips),
  CHECK (ma_enrollees IS NOT NULL OR penetration_pct IS NULL)
);

-- Source statement 11
COMMENT ON TABLE public.cms_county_penetration IS 'CMS monthly MA State/County Penetration. Eligibles = CMS Medicare eligible denominator; ma_enrollees = published enrolled numerator across CMS included organization types. Rate is the CMS-published percentage, not recomputed; suppressed counts/rates remain NULL.';

-- Source statement 12
CREATE INDEX IF NOT EXISTS cms_county_penetration_state_month_idx ON public.cms_county_penetration (state, file_month DESC);

-- Source statement 13
ALTER TABLE public.cms_county_penetration ENABLE ROW LEVEL SECURITY;

-- Source statement 14
DROP POLICY IF EXISTS cms_county_penetration_public_read ON public.cms_county_penetration;

-- Source statement 15
CREATE POLICY cms_county_penetration_public_read ON public.cms_county_penetration FOR SELECT TO anon, authenticated USING (true);

-- Source statement 16
REVOKE ALL ON public.cms_county_penetration FROM anon, authenticated;

-- Source statement 17
GRANT SELECT ON public.cms_county_penetration TO anon, authenticated;

-- Source statement 18
GRANT ALL ON public.cms_county_penetration TO service_role;

-- Source statement 19
NOTIFY pgrst,'reload schema';

-- Source statement 20
COMMIT;
