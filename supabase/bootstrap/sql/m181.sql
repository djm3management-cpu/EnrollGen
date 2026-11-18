-- UNAPPLIED: isolated pilot only
-- RTS and county aware eligibility, part one: settings and reference data
-- (spec sections 5 and 12; session S6).
-- 1. ping_campaigns.eligibility_source ('manual' default, or 'rts'),
--    county_aware and county_filter (both default false). Every existing
--    campaign, including the seeded Paragon campaign, stays 'manual' with both
--    county switches off, so its decisions are unchanged.
-- 2. agent_campaign_carriers.origin ('manual' default, or 'rts'). Rows stay
--    state level; county logic is computed at decision time, never stored.
-- 3. carrier_aliases maps a normalized carrier name (lowercase, letters and
--    digits only) to a matrix carrier key. normalize_carrier_key(text) looks a
--    name up and falls back to the normalized text. Seeded for the six matrix
--    keys from the names used by the matrix (paragonEligibility.js), the RTS
--    tracker and the CY2027 landscape loaded into cms_plans_py2027 (carrier is
--    the Organization Marketing Name):
--      aetna        'Aetna Medicare', 'Aetna Medicare FIDE', 'Aetna Medicare HIDE'
--      humana       'Humana'
--      uhc          'UnitedHealthcare'
--      wellcare     'Wellcare'
--      devoted      'Devoted Health'
--      healthspring 'HealthSpring'
--    Deliberately unmapped (separate brands or appointments, ignored for
--    tiering): 'Allina Health Aetna Medicare', 'CarePlus Health Plans, Inc.',
--    'iCare', 'Peoples Health', 'KelseyCare Advantage'.
-- 4. ping_zip_county_crosswalk in the HUD USPS ZIP to county layout, loaded by
--    scripts/load_zip_county_crosswalk.js from a local file. primary_county_for_zip
--    returns the county with the highest res_ratio, ties broken by county_fips.
--    It is a separate table because public.zip_county_crosswalk (SEP reference
--    data, read by 068, 078 and the Paragon residence routines of 126 and 131)
--    already exists with another layout and must not change.
-- Fenced by PING_PLATFORM_ENABLED. Forward only. Never alters paragon_* objects
-- and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_campaigns
  ADD COLUMN eligibility_source text NOT NULL DEFAULT 'manual' CHECK (eligibility_source IN ('manual','rts')),
  ADD COLUMN county_aware boolean NOT NULL DEFAULT false,
  ADD COLUMN county_filter boolean NOT NULL DEFAULT false;

ALTER TABLE public.agent_campaign_carriers
  ADD COLUMN origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','rts'));

CREATE TABLE public.carrier_aliases (
  alias_normalized text PRIMARY KEY CHECK (alias_normalized ~ '^[a-z0-9]{1,128}$'),
  carrier_key text NOT NULL CHECK (carrier_key ~ '^[a-z0-9_]{1,64}$')
);
INSERT INTO public.carrier_aliases(alias_normalized,carrier_key) VALUES
  -- Matrix keys and the aliases in paragonEligibility.js.
  ('aetna','aetna'),('humana','humana'),('uhc','uhc'),('wellcare','wellcare'),
  ('devoted','devoted'),('healthspring','healthspring'),
  ('unitedhealthcare','uhc'),('unitedhealthcaregroup','uhc'),('centene','wellcare'),('cigna','healthspring'),
  -- RTS tracker carrier names.
  ('aetnasilverscript','aetna'),('devotedhealth','devoted'),('healthspringhcsccigna','healthspring'),
  -- cms_plans_py2027 carrier strings (CY2027 Organization Marketing Name).
  ('aetnamedicare','aetna'),('aetnamedicarefide','aetna'),('aetnamedicarehide','aetna');

CREATE FUNCTION public.normalize_carrier_key(p_name text) RETURNS text
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT coalesce((SELECT a.carrier_key FROM carrier_aliases a WHERE a.alias_normalized=n.k),nullif(n.k,''))
  FROM (SELECT regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]','','g') AS k) n;
$$;

CREATE TABLE public.ping_zip_county_crosswalk (
  zip text NOT NULL CHECK (zip ~ '^[0-9]{5}$'),
  county_fips text NOT NULL CHECK (county_fips ~ '^[0-9]{5}$'),
  state_code text NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  res_ratio numeric NOT NULL CHECK (res_ratio BETWEEN 0 AND 1),
  PRIMARY KEY (zip,county_fips)
);

-- The county holding most of the ZIP's residential addresses. Null when the
-- platform is off or the ZIP is not in the crosswalk.
CREATE FUNCTION public.primary_county_for_zip(p_zip text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT x.county_fips FROM ping_zip_county_crosswalk x
  WHERE public.deployment_feature_enabled('PING_PLATFORM_ENABLED') AND x.zip=trim(p_zip)
  ORDER BY x.res_ratio DESC,x.county_fips LIMIT 1;
$$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['carrier_aliases','ping_zip_county_crosswalk'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.normalize_carrier_key(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.primary_county_for_zip(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_carrier_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.primary_county_for_zip(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
