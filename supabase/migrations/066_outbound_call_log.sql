-- Deploy the authenticated call-log endpoint and all browser consumers first.
-- Display durations only: no timer, billing, admission or routing mutations.
BEGIN;

WITH candidates AS (
  SELECT a.id AS attempt_id, c.id AS record_id
  FROM public.telephony_call_attempts a
  JOIN public.call_records c ON c.tenant_id=a.tenant_id
    AND c.twilio_call_sid IN (a.parent_call_sid,a.child_call_sid)
    AND lower(c.call_direction)='outbound' AND c.contact_id=a.contact_id
  JOIN public.sessions s ON s.id=c.session_id AND s.tenant_id=a.tenant_id
    AND s.call_record_id=c.id
  JOIN public.enrolled_agents e ON e.id=s.agent_id AND e.tenant_id=a.tenant_id
    AND e.is_active=true
  JOIN public.recording_agent_subjects subject ON subject.tenant_id=a.tenant_id
    AND subject.agent_slug=a.agent_id AND subject.clerk_user_id=e.clerk_user_id
  WHERE a.direction='outbound' AND a.call_record_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.telephony_call_attempts other WHERE other.call_record_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM public.inbound_calls i WHERE i.call_record_id=c.id)
), unique_candidates AS (
  SELECT attempt_id,record_id FROM (
    SELECT candidates.*,count(*) OVER (PARTITION BY attempt_id) AS attempt_matches,
      count(*) OVER (PARTITION BY record_id) AS record_matches FROM candidates
  ) matches WHERE attempt_matches=1 AND record_matches=1
)
UPDATE public.telephony_call_attempts a SET call_record_id=candidate.record_id
FROM unique_candidates candidate WHERE a.id=candidate.attempt_id AND a.call_record_id IS NULL;
-- Migration 064's link trigger propagates recording metadata. No records created.

CREATE OR REPLACE VIEW public.v_call_log WITH (security_invoker=true) AS
WITH measured_records AS (
  SELECT tenant_id,call_record_id,sum(talk_seconds)::integer AS duration_seconds
  FROM public.telephony_call_attempts WHERE call_record_id IS NOT NULL
    AND status IN ('completed','canceled','failed','busy','no-answer')
  GROUP BY tenant_id,call_record_id
), measured_inbound AS (
  SELECT tenant_id,inbound_call_id,sum(talk_seconds)::integer AS duration_seconds
  FROM public.telephony_call_attempts WHERE inbound_call_id IS NOT NULL
    AND status IN ('completed','canceled','failed','busy','no-answer')
  GROUP BY tenant_id,inbound_call_id
)
SELECT 'cr-'||c.id::text AS log_id,c.id AS call_record_id,NULL::uuid AS inbound_call_id,
  c.tenant_id,coalesce(c.call_start,c.created_at) AS occurred_at,
  coalesce(nullif(lower(c.call_direction),''),'outbound') AS direction,c.contact_id,
  nullif(btrim(concat_ws(' ',ct.first_name,ct.last_name)),'') AS contact_name,
  ct.phone AS contact_phone,measured.duration_seconds,
  coalesce(nullif(c.writing_agent,''),c.agent_name::text) AS agent,
  CASE WHEN c.enrollment_completed THEN 'connected'
    WHEN lower(coalesce(c.call_outcome,'')) IN ('','enrolled','completed','connected') THEN 'connected'
    ELSE lower(c.call_outcome) END AS disposition,
  c.recording_url,c.recording_storage_path,score.overall_score AS compliance_score,
  left(c.transcript_raw,200) AS transcript_preview,c.agent_notes,NULL::uuid AS attempt_id
FROM public.call_records c
LEFT JOIN public.contacts ct ON ct.id=c.contact_id AND ct.tenant_id=c.tenant_id
LEFT JOIN public.compliance_scorecards score ON score.id=c.compliance_scorecard_id AND score.tenant_id=c.tenant_id
LEFT JOIN measured_records measured ON measured.call_record_id=c.id AND measured.tenant_id=c.tenant_id
WHERE c.contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.inbound_calls i WHERE i.call_record_id=c.id AND i.tenant_id=c.tenant_id)
  AND NOT EXISTS (SELECT 1 FROM public.telephony_call_attempts a
    WHERE a.call_record_id=c.id AND a.tenant_id=c.tenant_id AND a.direction='outbound')
UNION ALL
SELECT 'ic-'||i.id::text,i.call_record_id,i.id,i.tenant_id,i.created_at,'inbound'::text,i.contact_id,
  nullif(btrim(concat_ws(' ',ct.first_name,ct.last_name)),''),coalesce(ct.phone,i.from_number),
  measured.duration_seconds,i.routed_agent_id,
  CASE i.status WHEN 'accepted' THEN 'connected' WHEN 'completed' THEN 'connected'
    WHEN 'voicemail' THEN 'voicemail' WHEN 'declined' THEN 'declined' ELSE 'missed' END,
  i.recording_url,i.recording_storage_path,score.overall_score,left(c.transcript_raw,200),c.agent_notes,NULL::uuid
FROM public.inbound_calls i
LEFT JOIN public.contacts ct ON ct.id=i.contact_id AND ct.tenant_id=i.tenant_id
LEFT JOIN public.call_records c ON c.id=i.call_record_id AND c.tenant_id=i.tenant_id
LEFT JOIN public.compliance_scorecards score ON score.id=c.compliance_scorecard_id AND score.tenant_id=i.tenant_id
LEFT JOIN measured_inbound measured ON measured.inbound_call_id=i.id AND measured.tenant_id=i.tenant_id
UNION ALL
SELECT 'ta-'||a.id::text,a.call_record_id,NULL::uuid,a.tenant_id,a.created_at,'outbound'::text,a.contact_id,
  nullif(btrim(concat_ws(' ',ct.first_name,ct.last_name)),''),coalesce(ct.phone,a.to_number),
  CASE WHEN a.status IN ('completed','canceled','failed','busy','no-answer') THEN a.talk_seconds ELSE NULL END,
  a.agent_id,CASE WHEN a.answered_at IS NOT NULL THEN 'connected'
    WHEN a.status IN ('completed','canceled','failed','busy','no-answer') THEN 'missed' ELSE 'ringing' END,
  recording.recording_url,recording.storage_path,score.overall_score,left(c.transcript_raw,200),c.agent_notes,a.id
FROM public.telephony_call_attempts a
LEFT JOIN public.contacts ct ON ct.id=a.contact_id AND ct.tenant_id=a.tenant_id
LEFT JOIN public.call_records c ON c.id=a.call_record_id AND c.tenant_id=a.tenant_id
LEFT JOIN public.compliance_scorecards score ON score.id=c.compliance_scorecard_id AND score.tenant_id=a.tenant_id
LEFT JOIN LATERAL (
  SELECT r.recording_url,r.storage_path FROM public.recording_ingestion r
  WHERE r.tenant_id=a.tenant_id AND r.attempt_id=a.id AND r.provider_status='completed'
  ORDER BY (r.copy_status='stored') DESC,r.provider_created_at DESC NULLS LAST,r.first_seen_at DESC LIMIT 1
) recording ON true WHERE a.direction='outbound';

REVOKE ALL ON public.v_call_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_call_log TO service_role;
COMMIT;
