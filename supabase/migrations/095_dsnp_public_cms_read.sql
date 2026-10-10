BEGIN;
-- This table contains published CMS plan reference data, not member records.
-- The browser uses a public client for availability and integration lookups.
ALTER TABLE public.dsnp_eae_lookup ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'dsnp_eae_lookup' AND policyname = 'Read published PY2027 CMS alignment'
  ) THEN
    CREATE POLICY "Read published PY2027 CMS alignment"
      ON public.dsnp_eae_lookup FOR SELECT TO anon, authenticated
      USING (plan_year = 2027);
  END IF;
END $$;
COMMIT;
