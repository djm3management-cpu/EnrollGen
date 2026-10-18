-- Send at most one provider quota/billing alert per hour across all workers.
CREATE TABLE public.provider_alert_throttle (
  alert_key text PRIMARY KEY,
  last_attempt_at timestamptz NOT NULL
);

ALTER TABLE public.provider_alert_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_alert_throttle FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_provider_quota_alert()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
  WITH claim AS (
    INSERT INTO provider_alert_throttle(alert_key,last_attempt_at)
    VALUES ('openai_quota',clock_timestamp())
    ON CONFLICT (alert_key) DO UPDATE
      SET last_attempt_at=EXCLUDED.last_attempt_at
      WHERE provider_alert_throttle.last_attempt_at <= clock_timestamp()-interval '1 hour'
    RETURNING true AS claimed
  )
  SELECT coalesce((SELECT claimed FROM claim),false);
$$;

REVOKE ALL ON FUNCTION public.claim_provider_quota_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provider_quota_alert() TO service_role;
NOTIFY pgrst,'reload schema';
