-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.snp_plans_by_county
  ADD COLUMN IF NOT EXISTS integration_level text,
  ADD COLUMN IF NOT EXISTS integration_source text,
  ADD COLUMN IF NOT EXISTS applicable_integrated_plan boolean;

-- Source statement 3
ALTER TABLE public.dsnp_eae_lookup
  ADD COLUMN IF NOT EXISTS applicable_integrated_plan boolean;

-- Source statement 4
CREATE UNIQUE INDEX IF NOT EXISTS dsnp_alignment_state_plan_year
  ON public.dsnp_eae_lookup(state,contract_id,plan_id,plan_year);

-- Source statement 5
COMMIT;
