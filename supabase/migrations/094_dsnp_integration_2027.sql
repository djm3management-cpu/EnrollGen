BEGIN;
ALTER TABLE public.snp_plans_by_county
  ADD COLUMN IF NOT EXISTS integration_level text,
  ADD COLUMN IF NOT EXISTS integration_source text,
  ADD COLUMN IF NOT EXISTS applicable_integrated_plan boolean;
ALTER TABLE public.dsnp_eae_lookup
  ADD COLUMN IF NOT EXISTS applicable_integrated_plan boolean;
CREATE UNIQUE INDEX IF NOT EXISTS dsnp_alignment_state_plan_year
  ON public.dsnp_eae_lookup(state,contract_id,plan_id,plan_year);
COMMIT;
