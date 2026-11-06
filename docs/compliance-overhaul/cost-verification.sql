-- READ ONLY. NOT RUN. Replace the deployment timestamp once; compare 7 days
-- before/after in America/New_York. Application sent-audio estimates are not
-- proof of vendor-billed minutes; reconcile against the Deepgram export.
WITH settings AS (
 SELECT timestamptz '2026-11-06 00:00:00+00' AS deploy_at -- REPLACE with real approved deploy time
), audio AS (
 SELECT (u.recorded_at AT TIME ZONE 'America/New_York')::date AS day,
 CASE WHEN u.recorded_at<s.deploy_at THEN 'before' ELSE 'after' END AS phase,
 sum(CASE WHEN u.record_type='stt_seconds' AND coalesce(u.metadata->>'source','')<>'manual_gap_fill' THEN u.quantity/60.0 ELSE 0 END) AS live_channel_minutes,
 sum(CASE WHEN u.record_type='stt_seconds' AND u.metadata->>'source'='manual_gap_fill' THEN u.quantity/60.0 ELSE 0 END) AS manual_gap_channel_minutes,
 sum(CASE WHEN u.record_type='deepgram_minutes' THEN u.quantity ELSE 0 END) AS legacy_or_batch_minutes,
 count(*) FILTER(WHERE u.record_type='stt_seconds') AS audio_usage_records
 FROM public.usage_records u CROSS JOIN settings s
 WHERE u.recorded_at>=s.deploy_at-interval '7 days' AND u.recorded_at<s.deploy_at+interval '7 days'
 AND u.record_type IN ('stt_seconds','deepgram_minutes') GROUP BY 1,2
), talk AS (
 SELECT (a.answered_at AT TIME ZONE 'America/New_York')::date AS day,
 CASE WHEN a.answered_at<s.deploy_at THEN 'before' ELSE 'after' END AS phase,
 sum(CASE WHEN a.talk_seconds BETWEEN 1 AND 21600 THEN a.talk_seconds/60.0 ELSE 0 END) AS valid_talk_minutes,
 count(*) FILTER(WHERE a.talk_seconds>21600 OR a.talk_seconds IS NULL) AS duration_anomalies
 FROM public.telephony_call_attempts a CROSS JOIN settings s
 WHERE a.answered_at>=s.deploy_at-interval '7 days' AND a.answered_at<s.deploy_at+interval '7 days'
 GROUP BY 1,2
)
SELECT coalesce(a.day,t.day) AS day,coalesce(a.phase,t.phase) AS phase,
 a.live_channel_minutes,a.manual_gap_channel_minutes,a.legacy_or_batch_minutes,
 t.valid_talk_minutes,t.duration_anomalies,a.audio_usage_records,
 a.live_channel_minutes/nullif(t.valid_talk_minutes,0) AS live_channel_minutes_per_talk_minute
FROM audio a FULL JOIN talk t USING(day,phase) ORDER BY day,phase;
-- Distinct channel-minute sources are shown separately to avoid double counting.
-- Streams crossing midnight are reported on their close/report day in the
-- current ledger; an invoice-aligned daily allocation needs provider timestamps.
