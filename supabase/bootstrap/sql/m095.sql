-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.dsnp_eae_lookup ENABLE ROW LEVEL SECURITY;

-- Source statement 3
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

-- Source statement 4
COMMIT;
