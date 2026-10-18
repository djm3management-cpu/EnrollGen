-- Read-only inventory. No transcript text or beneficiary information is returned.
-- Uses protected enrolled membership, linked to Dylan's reviewed telephony slug.
WITH dylan AS (
 SELECT e.id,e.tenant_id FROM public.enrolled_agents e
 JOIN public.tenant_agents t ON t.tenant_id=e.tenant_id AND t.clerk_user_id=e.clerk_user_id
 WHERE t.agent_slug='dylan_maria' AND t.is_active AND e.is_active
), transcript_sessions AS (
 SELECT DISTINCT s.id AS session_id,s.tenant_id,s.started_at,s.ended_at,s.call_record_id
 FROM public.sessions s JOIN dylan d ON d.id=s.agent_id AND d.tenant_id=s.tenant_id
 WHERE EXISTS(SELECT 1 FROM public.call_transcripts t WHERE t.session_id=s.id AND t.tenant_id=s.tenant_id AND nullif(btrim(t.transcript_text),'') IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.call_records c WHERE c.session_id=s.id AND c.tenant_id=s.tenant_id AND nullif(btrim(c.transcript_raw),'') IS NOT NULL)
)
SELECT s.session_id,s.tenant_id,s.started_at,s.ended_at,c.id AS call_record_id,
 c.transcript_id,c.compliance_scorecard_id,
 c.metadata->>'wrap_up_saved_at' AS wrap_up_saved_at,
 c.metadata->>'scoring_status' AS scoring_status,
 CASE WHEN c.id IS NULL THEN 'missing_call_record'
 WHEN c.compliance_scorecard_id IS NULL THEN 'missing_scorecard'
 ELSE 'missing_wrap_up' END AS missing_output
FROM transcript_sessions s LEFT JOIN LATERAL (
 SELECT r.* FROM public.call_records r WHERE r.tenant_id=s.tenant_id
 AND (r.id=s.call_record_id OR r.session_id=s.session_id)
 ORDER BY (r.id=s.call_record_id) DESC,r.created_at DESC LIMIT 1
) c ON true
WHERE c.id IS NULL OR c.compliance_scorecard_id IS NULL
 OR nullif(c.metadata->>'wrap_up_saved_at','') IS NULL
ORDER BY s.started_at DESC,s.session_id;
