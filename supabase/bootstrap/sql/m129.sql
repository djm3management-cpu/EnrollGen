-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.usage_records DROP CONSTRAINT IF EXISTS usage_records_record_type_check;

-- Source statement 3
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_record_type_check
  CHECK (record_type IN ('deepgram_minutes','claude_tokens','call_completed','compliance_score',
    'llm_tokens','llm_shadow_compare','llm_skipped_ticks','stt_seconds'));

-- Source statement 4
ALTER TABLE public.recording_ingestion
  ADD COLUMN copy_verified_at timestamptz,
  ADD COLUMN twilio_delete_attempted_at timestamptz,
  ADD COLUMN twilio_deleted_at timestamptz,
  ADD COLUMN twilio_delete_error text,
  ADD COLUMN twilio_delete_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN retention_until timestamptz;

-- Source statement 5
CREATE INDEX recording_provider_cleanup ON public.recording_ingestion(twilio_delete_next_attempt_at)
  WHERE copy_status='stored' AND twilio_deleted_at IS NULL;

-- Source statement 6
NOTIFY pgrst, 'reload schema';

-- Source statement 7
COMMIT;
