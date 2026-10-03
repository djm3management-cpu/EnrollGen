-- 054 retired historical alignment data. Refuse to relabel any undated rows.
BEGIN;
LOCK TABLE public.dsnp_eae_lookup IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dsnp_eae_lookup'
      AND column_name = 'plan_year'
  ) AND EXISTS (SELECT 1 FROM public.dsnp_eae_lookup) THEN
    RAISE EXCEPTION 'Undated D-SNP alignment rows exist; inspect them before applying 081';
  END IF;
END $$;
ALTER TABLE public.dsnp_eae_lookup ADD COLUMN IF NOT EXISTS plan_year integer NOT NULL DEFAULT 2027;
ALTER TABLE public.dsnp_eae_lookup ALTER COLUMN eae_status DROP NOT NULL;
ALTER TABLE public.dsnp_eae_lookup ALTER COLUMN eae_status DROP DEFAULT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dsnp_eae_py2027_only'
      AND conrelid = 'public.dsnp_eae_lookup'::regclass
  ) THEN
    ALTER TABLE public.dsnp_eae_lookup ADD CONSTRAINT dsnp_eae_py2027_only CHECK (plan_year = 2027);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS dsnp_eae_py2027_plan_idx ON public.dsnp_eae_lookup (plan_year, state, contract_id, plan_id);
COMMIT;
