-- Public CMS reference data; no customer or tenant records. Apply on the CMS database
-- (VITE_SUPABASE_CMS_URL if separate, otherwise the primary Supabase database).
BEGIN;
-- Rollback may remove only a table first created by this release. Preserve the
-- marker on repeat application; refuse adoption of an existing unrelated table.
DO $$ BEGIN
  IF to_regclass('oct_slim_088_rollback.state') IS NULL AND
     to_regclass('public.cms_county_penetration') IS NOT NULL THEN
    RAISE EXCEPTION 'cms_county_penetration already exists; verify its origin before applying 088';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS oct_slim_088_rollback;
REVOKE ALL ON SCHEMA oct_slim_088_rollback FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS oct_slim_088_rollback.state(singleton boolean PRIMARY KEY CHECK(singleton));
INSERT INTO oct_slim_088_rollback.state VALUES(true) ON CONFLICT DO NOTHING;
REVOKE ALL ON ALL TABLES IN SCHEMA oct_slim_088_rollback FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA oct_slim_088_rollback TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA oct_slim_088_rollback TO service_role;
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
COMMENT ON TABLE public.cms_county_penetration IS 'CMS monthly MA State/County Penetration. Eligibles = CMS Medicare eligible denominator; ma_enrollees = published enrolled numerator across CMS included organization types. Rate is the CMS-published percentage, not recomputed; suppressed counts/rates remain NULL.';
CREATE INDEX IF NOT EXISTS cms_county_penetration_state_month_idx ON public.cms_county_penetration (state, file_month DESC);
ALTER TABLE public.cms_county_penetration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cms_county_penetration_public_read ON public.cms_county_penetration;
CREATE POLICY cms_county_penetration_public_read ON public.cms_county_penetration FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.cms_county_penetration FROM anon, authenticated;
GRANT SELECT ON public.cms_county_penetration TO anon, authenticated;
GRANT ALL ON public.cms_county_penetration TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
