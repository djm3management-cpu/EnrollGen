-- Read-only operator snapshot for F22 call-status recovery.
-- "Stuck" is operationally defined as ringing/accepted for over two minutes.
-- A busy reservation has a live call only while its matching inbound call or
-- telephony attempt remains in a non-terminal state.
WITH terminal_statuses(status) AS (
  VALUES ('completed'), ('canceled'), ('failed'), ('busy'), ('no-answer')
), live_call_sids AS (
  SELECT i.twilio_call_sid AS call_sid
  FROM public.inbound_calls AS i
  WHERE i.status IN ('ringing', 'accepted')
    AND i.twilio_call_sid IS NOT NULL
  UNION
  SELECT a.parent_call_sid AS call_sid
  FROM public.telephony_call_attempts AS a
  WHERE a.parent_call_sid IS NOT NULL
    AND a.status NOT IN (SELECT status FROM terminal_statuses)
    AND a.ended_at IS NULL
), stuck_inbound AS (
  SELECT i.id, i.twilio_call_sid, i.status, i.created_at,
         now() - i.created_at AS age
  FROM public.inbound_calls AS i
  WHERE i.status IN ('ringing', 'accepted')
    AND i.created_at <= now() - interval '2 minutes'
), busy_without_live_call AS (
  SELECT a.agent_id, a.status, a.active_call_sid, a.last_assigned_at,
         now() - a.last_assigned_at AS reservation_age
  FROM public.agent_availability AS a
  LEFT JOIN live_call_sids AS live ON live.call_sid = a.active_call_sid
  WHERE a.status = 'busy'
    AND (a.active_call_sid IS NULL OR live.call_sid IS NULL)
)
SELECT 'stuck_inbound' AS section,
       count(*)::bigint AS row_count,
       coalesce(jsonb_agg(jsonb_build_object(
         'inbound_call_id', id,
         'call_sid', twilio_call_sid,
         'status', status,
         'created_at', created_at,
         'age', age
       ) ORDER BY created_at), '[]'::jsonb) AS details
FROM stuck_inbound
UNION ALL
SELECT 'busy_without_live_call' AS section,
       count(*)::bigint AS row_count,
       coalesce(jsonb_agg(jsonb_build_object(
         'agent_id', agent_id,
         'status', status,
         'active_call_sid', active_call_sid,
         'last_assigned_at', last_assigned_at,
         'reservation_age', reservation_age
       ) ORDER BY agent_id), '[]'::jsonb) AS details
FROM busy_without_live_call;
