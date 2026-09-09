ALTER TABLE public.usage_records DROP CONSTRAINT IF EXISTS usage_records_record_type_check;
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_record_type_check
  CHECK (record_type IN ('deepgram_minutes', 'claude_tokens', 'call_completed', 'compliance_score',
    'llm_tokens', 'llm_shadow_compare', 'llm_skipped_ticks'));

-- One cumulative counter per tenant/engine/browser call session. This partial
-- index does not constrain primary/retry/fallback rows sharing an LLM request ID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_records_llm_skip_session
  ON public.usage_records (tenant_id, engine_name, request_id)
  WHERE record_type = 'llm_skipped_ticks';

CREATE OR REPLACE FUNCTION public.record_llm_skipped_ticks(
  p_tenant_id uuid, p_user_id text, p_engine text, p_session_id uuid, p_count integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_engine IS NULL OR p_count IS NULL OR p_session_id IS NULL
    OR p_engine NOT IN ('MA', 'MEDSUP', 'ACA', 'U65') OR p_count NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'Invalid skip counter';
  END IF;
  INSERT INTO public.usage_records (tenant_id, record_type, engine_name, request_id, quantity, metadata)
  VALUES (p_tenant_id, 'llm_skipped_ticks', p_engine, p_session_id, p_count,
    jsonb_build_object('event', 'silence_skip_counter', 'user_id', p_user_id, 'updated_at', now()))
  ON CONFLICT (tenant_id, engine_name, request_id) WHERE record_type = 'llm_skipped_ticks'
  DO UPDATE SET quantity = greatest(usage_records.quantity, EXCLUDED.quantity),
    metadata = EXCLUDED.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.record_llm_skipped_ticks(uuid, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_llm_skipped_ticks(uuid, text, text, uuid, integer) TO service_role;
