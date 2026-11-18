-- UNAPPLIED: isolated pilot only
-- Filter rule storage and lookups (spec sections 5, 6, 10 and 16; session S4).
-- 1. ping_campaigns.retention_enabled (default false). retention_mode is NOT
--    NULL with default 'route_owner' since 171 and the seeded Paragon campaign
--    carries it, so a separate switch keeps rule 8 off until a campaign opts in.
-- 2. ping_retention_alerts: one row per existing client match, tenant scoped.
-- 3. platform_settings: operator singleton; pooled_shopper_enabled default false.
-- 4. shopper_history: pooled, keyed by the peppered phone hash from 176. Rows
--    are read only by service_role; buyers see only an integer count through
--    shopper_history_count.
-- 5. Lookups used by ping_decide_campaign in 178: ping_existing_client,
--    ping_recent_publisher_call, ping_campaign_accepted_today.
-- 6. exchange_auctions.reason also accepts accepted_retention_owner.
-- An existing client of tenant T for phone P is a contacts row with
-- tenant_id=T and phone=duplicate_phone_key(P) (043 stores contacts.phone
-- normalized) that has either a call_records row in T with contact_id=c.id,
-- call_outcome in ('enrolled','enrolled_pending_verification') (the compliance
-- sale outcomes of src/lib/saleCompliance.js) and is_test_enrollment not true,
-- or an opportunities row in T with contact_id=c.id, status='won' (058: a won
-- stage, Enrolled by default) and deleted_at null (062). The owner is the
-- agent slug on the most recent such sale (call_records.agent_id through
-- enrolled_agents and tenant_agents by clerk_user_id as in 119, or
-- opportunities.assigned_agent_id through tenant_agents), else the sticky
-- owner contacts.assigned_agent_id (046, src/stickyRouting.js).
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_campaigns ADD COLUMN retention_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.exchange_auctions DROP CONSTRAINT exchange_auctions_reason_check;
ALTER TABLE public.exchange_auctions ADD CONSTRAINT exchange_auctions_reason_check
  CHECK (reason IN ('accepted_full','accepted_partial','accepted_retention_owner','exchange_no_buyer'));

CREATE TABLE public.ping_retention_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  contact_id uuid NOT NULL,
  owner_agent_id text,
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL UNIQUE REFERENCES public.ping_decisions(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz
);
CREATE INDEX ping_retention_alerts_open ON public.ping_retention_alerts(tenant_id,created_at DESC)
  WHERE acknowledged_at IS NULL;

CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pooled_shopper_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings(id) VALUES(true);
CREATE TRIGGER touch_platform_settings BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_ping_updated_at();

CREATE TABLE public.shopper_history (
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  seen_on date NOT NULL,
  PRIMARY KEY (phone_hash,source_id,seen_on)
);
CREATE INDEX shopper_history_window ON public.shopper_history(phone_hash,seen_on);

-- True when pooled history may be written and read.
CREATE FUNCTION public.ping_pooled_shopper_on() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.deployment_feature_enabled('PING_PLATFORM_ENABLED')
  AND public.deployment_feature_enabled('PING_EXCHANGE_ENABLED')
  AND coalesce((SELECT pooled_shopper_enabled FROM platform_settings WHERE id),false);
END $$;

-- The only read path into shopper_history: a count of rows for one hash whose
-- UTC day falls in the last p_window_days days, today included. Never returns
-- a tenant, source or day. Zero while pooling is off.
CREATE FUNCTION public.shopper_history_count(p_phone_hash text,p_window_days integer) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF p_phone_hash IS NULL OR coalesce(p_window_days,0)<=0 OR NOT public.ping_pooled_shopper_on() THEN RETURN 0; END IF;
 SELECT count(*)::integer INTO n FROM shopper_history
  WHERE phone_hash=p_phone_hash AND seen_on>(clock_timestamp() AT TIME ZONE 'UTC')::date-p_window_days;
 RETURN n;
END $$;

-- One row per (hash, publisher source, UTC day). Callers record after the
-- decision so the count a ping reads never includes that ping.
CREATE FUNCTION public.shopper_history_record(p_phone text,p_tenant uuid,p_source uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_phone IS NULL OR p_tenant IS NULL OR p_source IS NULL OR NOT public.ping_pooled_shopper_on()
 OR public.ping_phone_pepper() IS NULL THEN RETURN; END IF;
 INSERT INTO shopper_history(phone_hash,tenant_id,source_id,seen_on)
 VALUES(public.ping_phone_hash(left(p_phone,32)),p_tenant,p_source,(clock_timestamp() AT TIME ZONE 'UTC')::date)
 ON CONFLICT DO NOTHING;
END $$;

-- Rule 8 lookup inside one tenant only. No row when the caller is not a client.
CREATE FUNCTION public.ping_existing_client(p_tenant uuid,p_phone text)
RETURNS TABLE(contact_id uuid,owner_agent_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE phone_key text:=public.duplicate_phone_key(p_phone); c record; owner text;
BEGIN
 IF p_tenant IS NULL OR phone_key IS NULL THEN RETURN; END IF;
 SELECT x.id,x.assigned_agent_id INTO c FROM contacts x
  WHERE x.tenant_id=p_tenant AND x.phone=phone_key AND public.duplicate_phone_key(x.phone)=phone_key
    AND (EXISTS(SELECT 1 FROM call_records r WHERE r.tenant_id=p_tenant AND r.contact_id=x.id
          AND r.call_outcome IN ('enrolled','enrolled_pending_verification') AND r.is_test_enrollment IS NOT TRUE)
      OR EXISTS(SELECT 1 FROM opportunities o WHERE o.tenant_id=p_tenant AND o.contact_id=x.id
          AND o.status='won' AND o.deleted_at IS NULL))
  ORDER BY x.created_at,x.id LIMIT 1;
 IF c.id IS NULL THEN RETURN; END IF;
 SELECT s.slug INTO owner FROM (
   SELECT ta.agent_slug AS slug,coalesce(r.call_start,r.created_at) AS sold_at FROM call_records r
    JOIN enrolled_agents e ON e.id=r.agent_id AND e.tenant_id=r.tenant_id
    JOIN tenant_agents ta ON ta.tenant_id=r.tenant_id AND ta.clerk_user_id=e.clerk_user_id
    WHERE r.tenant_id=p_tenant AND r.contact_id=c.id
      AND r.call_outcome IN ('enrolled','enrolled_pending_verification') AND r.is_test_enrollment IS NOT TRUE
   UNION ALL
   SELECT ta.agent_slug,o.stage_entered_at FROM opportunities o
    JOIN tenant_agents ta ON ta.id=o.assigned_agent_id AND ta.tenant_id=o.tenant_id
    WHERE o.tenant_id=p_tenant AND o.contact_id=c.id AND o.status='won' AND o.deleted_at IS NULL
 ) s WHERE nullif(trim(s.slug),'') IS NOT NULL
 ORDER BY s.sold_at DESC NULLS LAST,s.slug LIMIT 1;
 RETURN QUERY SELECT c.id,coalesce(owner,nullif(trim(c.assigned_agent_id),''));
END $$;

-- Rules 9 and 10: a publisher inbound call in p_tenant from the same phone key
-- since p_since. A publisher call is source_kind 'publisher' or a call matched
-- by a generic or exchange ping decision of p_tenant. With p_source the call
-- must come from that source (its lead_source_id, or the matched decision's).
CREATE FUNCTION public.ping_recent_publisher_call(p_tenant uuid,p_phone text,p_source uuid,p_since timestamptz,p_until timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE phone_key text:=public.duplicate_phone_key(p_phone);
BEGIN
 IF p_tenant IS NULL OR phone_key IS NULL OR p_since IS NULL OR p_until IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM inbound_calls i
  WHERE i.tenant_id=p_tenant AND public.duplicate_phone_key(i.from_number)=phone_key
    AND i.created_at>p_since AND i.created_at<=p_until
    AND ((i.source_kind='publisher' AND (p_source IS NULL OR i.lead_source_id=p_source))
      OR EXISTS(SELECT 1 FROM ping_decisions d WHERE d.matched_call_sid=i.twilio_call_sid
        AND d.tenant_id=p_tenant AND d.engine IN ('generic','exchange')
        AND (p_source IS NULL OR d.source_id=p_source))));
END $$;

-- Rule 12: accepted, non-replayed generic and exchange decisions for one
-- campaign since the start of today in the hours' own IANA zone (176).
CREATE FUNCTION public.ping_campaign_accepted_today(p_campaign uuid,p_hours jsonb,p_at timestamptz)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 SELECT count(*)::integer INTO n FROM ping_decisions d
  WHERE d.campaign_id=p_campaign AND d.available AND d.engine IN ('generic','exchange')
    AND d.received_at>=public.exchange_cap_window(p_hours,'day',p_at) AND d.received_at<=p_at
    AND NOT d.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb;
 RETURN n;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ping_retention_alerts','platform_settings','shopper_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.ping_retention_alerts TO service_role;
GRANT SELECT,UPDATE ON public.platform_settings TO service_role;
GRANT SELECT,INSERT,DELETE ON public.shopper_history TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_pooled_shopper_on','shopper_history_count','shopper_history_record','ping_existing_client',
   'ping_recent_publisher_call','ping_campaign_accepted_today') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.shopper_history_count(text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
