-- Read-only investigation; no transcript text, consumer identity, media URLs or credentials.
-- Call supplied by the user: 2026-11-09, 50:26, Dylan Maria.
SELECT id, tenant_id, call_start, call_end, call_duration_seconds, product_type,
 call_outcome, compliance_status, compliance_scorecard_id,
 metadata->>'scoring_status' AS scoring_status,
 metadata->>'scoring_error_code' AS scoring_error_code,
 metadata->>'scoring_failed_at' AS scoring_failed_at
FROM public.call_records WHERE id='7743bf6a-893f-4744-a5cf-c4988dabb81e';

SELECT revision, delivered_revision, dispatch_attempts, last_error,
 available_at, transcript_ready_at
FROM public.transcript_score_dispatch WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT id,status,attempt_count,updated_at,
 CASE WHEN error ~ '^[a-zA-Z0-9_]+$' THEN error ELSE '[non-code error withheld]' END AS error_code
FROM public.scoring_jobs WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT id,rules_version,scoring_state,created_at FROM public.compliance_scorecards
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT id,status,created_at FROM public.compliance_llm_passes
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';

SELECT a.id AS attempt_id,a.answered_at,a.ended_at,s.speaker,count(*) AS segments,
 min(s.start_ms) AS first_start_ms,max(s.end_ms) AS last_end_ms,
 min(s.captured_at) AS first_capture,max(s.captured_at) AS last_capture
FROM public.telephony_call_attempts a JOIN public.telephony_transcript_segments s ON s.attempt_id=a.id
WHERE a.call_record_id='7743bf6a-893f-4744-a5cf-c4988dabb81e'
GROUP BY a.id,a.answered_at,a.ended_at,s.speaker;
SELECT channels,reconnects,updated_at FROM public.stt_call_reconnects
WHERE call_sid='CA0784f3a7b82446562197ee4dd2b83241';
SELECT call_id,phase,started_at,ended_at FROM public.call_conferences
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT event,occurred_at FROM public.telephony_events
WHERE twilio_call_sid='CA0784f3a7b82446562197ee4dd2b83241' ORDER BY occurred_at;

SELECT id,provider_status,recording_source,recording_channels,recording_duration_seconds,
 copy_status,last_error_code,attempts,provider_created_at,copy_verified_at
FROM public.recording_ingestion WHERE call_record_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT ct.source FROM public.contacts ct JOIN public.call_records c ON c.contact_id=ct.id AND c.tenant_id=ct.tenant_id
WHERE c.id='7743bf6a-893f-4744-a5cf-c4988dabb81e';

-- Fixed 30-day window ending at midnight after the incident date (EST).
SELECT count(*) AS exhausted_calls,
 count(*) FILTER(WHERE id<>'7743bf6a-893f-4744-a5cf-c4988dabb81e') AS other_exhausted_calls
FROM public.call_records WHERE call_start>='2026-10-11T05:00:00Z'
 AND call_start<'2026-11-10T05:00:00Z' AND metadata->>'scoring_error_code'='scoring_attempts_exhausted';
SELECT id,enabled FROM public.compliance_runtime_control;
SELECT id,product_type,version,policy_version,total_possible_points FROM public.scoring_templates WHERE is_active;

-- After migration 147 only: durable incident and recovery trail.
SELECT reason,at_ms,created_at FROM public.transcription_incidents
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e' ORDER BY created_at;
SELECT reason,created_at,alerted_at FROM public.transcript_recovery_alerts
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e';
SELECT id,mode,status,estimated_cost_usd,created_at FROM public.manual_transcript_gap_fills
WHERE call_id='7743bf6a-893f-4744-a5cf-c4988dabb81e' ORDER BY created_at;
