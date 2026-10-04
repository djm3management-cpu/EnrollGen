-- Public CMS reference data; no customer or tenant records. Apply on the CMS database
-- (VITE_SUPABASE_CMS_URL if separate, otherwise the primary Supabase database).
BEGIN;
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
COMMIT;
