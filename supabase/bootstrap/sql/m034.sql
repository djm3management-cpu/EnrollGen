-- Source statement 1
ALTER TABLE public.usage_records
  DROP CONSTRAINT IF EXISTS usage_records_record_type_check;

-- Source statement 2
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_record_type_check
  CHECK (record_type IN ('deepgram_minutes', 'claude_tokens', 'call_completed', 'compliance_score', 'llm_tokens', 'llm_shadow_compare'));

-- Source statement 3
ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS engine_name TEXT,
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cached_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS reasoning_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_error_code TEXT,
  ADD COLUMN IF NOT EXISTS primary_output JSONB,
  ADD COLUMN IF NOT EXISTS shadow_output JSONB,
  ADD COLUMN IF NOT EXISTS shadow_match BOOLEAN;

-- Source statement 4
CREATE INDEX IF NOT EXISTS idx_usage_records_llm_engine
  ON public.usage_records (tenant_id, engine_name, recorded_at DESC) WHERE model IS NOT NULL;
