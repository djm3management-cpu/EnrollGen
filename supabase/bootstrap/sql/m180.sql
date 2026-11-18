-- UNAPPLIED: isolated pilot only
-- Performance routing (spec sections 5 and 11.3; session S5).
-- 1. ping_campaigns.performance_routing (default false), performance_min_calls
--    (default 20) and performance_window_days (default 30).
-- 2. agent_performance: one row per (campaign, agent slug) with the rolling
--    window's connected calls, enrollments and the conversion used for routing.
--    refresh_agent_performance(p_campaign) rebuilds a campaign's rows from its
--    routed calls (ping_decisions engine generic or exchange with
--    matched_call_sid, received in the last performance_window_days) that an
--    agent answered (inbound_calls.answered_agent_id, 045, same tenant) and
--    their call_records (inbound_calls.call_record_id; an enrollment is
--    call_outcome 'enrolled' and not a test enrollment). The campaign average
--    is total enrollments over total connected calls in the window. An agent
--    below performance_min_calls, or with no calls, gets the campaign average
--    so new agents still receive calls. Every active agent with carrier rows
--    for the campaign gets a row.
-- 3. ping_decide_campaign (as in 178) and ping_claim_arrival (as in 176): when
--    the campaign's performance_routing is true, the free agent pool orders by
--    tier, then conversion descending (an agent without a row gets the
--    campaign average), then last_assigned_at, then agent_id; at arrival the
--    preferred agent still ranks before conversion. When false the extra sort
--    key is null for every agent, so ordering is exactly as before. The
--    retention owner (178) and a live reservation are chosen before the pool
--    and still win. A pool pick under performance routing adds
--    {"rule":"performance_routing","result":"applied"} to rule_trace.
-- Fenced by PING_PLATFORM_ENABLED. The per-source advisory lock is unchanged
-- (deferred to S8). Forward only. Never alters paragon_* objects and never
-- touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_campaigns
  ADD COLUMN performance_routing boolean NOT NULL DEFAULT false,
  ADD COLUMN performance_min_calls integer NOT NULL DEFAULT 20 CHECK (performance_min_calls>=0),
  ADD COLUMN performance_window_days integer NOT NULL DEFAULT 30 CHECK (performance_window_days BETWEEN 1 AND 365);

CREATE TABLE public.agent_performance (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  window_days integer NOT NULL CHECK (window_days>=1),
  connected_calls integer NOT NULL DEFAULT 0 CHECK (connected_calls>=0),
  enrollments integer NOT NULL DEFAULT 0 CHECK (enrollments>=0 AND enrollments<=connected_calls),
  conversion numeric(7,6) NOT NULL CHECK (conversion BETWEEN 0 AND 1),
  refreshed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (campaign_id,agent_id)
);
CREATE INDEX agent_performance_tenant ON public.agent_performance(tenant_id,campaign_id);

-- Total enrollments over total connected calls for the campaign's last refresh; 0 without data.
CREATE FUNCTION public.ping_campaign_conversion(p_campaign uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(round(sum(p.enrollments)::numeric/nullif(sum(p.connected_calls),0),6),0)
  FROM agent_performance p WHERE p.campaign_id=p_campaign;
$$;

-- The conversion an agent is ranked by: its row, else the given campaign average.
CREATE FUNCTION public.ping_agent_conversion(p_campaign uuid,p_agent text,p_average numeric) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT p.conversion FROM agent_performance p WHERE p.campaign_id=p_campaign AND p.agent_id=p_agent),
    p_average,0);
$$;

CREATE FUNCTION public.refresh_agent_performance(p_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE camp ping_campaigns; window_start timestamptz; written integer;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RAISE EXCEPTION 'Ping platform disabled'; END IF;
 SELECT * INTO camp FROM ping_campaigns WHERE id=p_campaign;
 IF camp.id IS NULL THEN RAISE EXCEPTION 'Unknown ping campaign'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agent-performance:'||camp.id::text,0));
 window_start:=clock_timestamp()-make_interval(days=>camp.performance_window_days);
 DELETE FROM agent_performance WHERE campaign_id=camp.id;
 WITH calls AS (
   -- One row per routed call of this campaign's tenant that an agent answered in the window.
   SELECT DISTINCT ON (d.matched_call_sid) i.answered_agent_id AS agent_id,
     coalesce(r.call_outcome='enrolled' AND r.is_test_enrollment IS NOT TRUE,false) AS enrolled
   FROM ping_decisions d
   JOIN inbound_calls i ON i.twilio_call_sid=d.matched_call_sid AND i.tenant_id=d.tenant_id
   LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=d.tenant_id
   WHERE d.campaign_id=camp.id AND d.tenant_id=camp.tenant_id AND d.engine IN ('generic','exchange')
     AND d.matched_call_sid IS NOT NULL AND d.received_at>=window_start
     AND nullif(trim(i.answered_agent_id),'') IS NOT NULL
   ORDER BY d.matched_call_sid,i.created_at,i.id
 ), per AS (
   SELECT agent_id,count(*)::integer AS connected,count(*) FILTER (WHERE enrolled)::integer AS enrolled
   FROM calls GROUP BY agent_id
 ), average AS (
   SELECT coalesce(round(sum(enrolled)::numeric/nullif(sum(connected),0),6),0) AS conversion FROM per
 ), roster AS (
   SELECT ta.agent_slug AS agent_id FROM agent_campaign_carriers e
   JOIN tenant_agents ta ON ta.id=e.agent_id AND ta.tenant_id=camp.tenant_id AND ta.is_active
   WHERE e.campaign_id=camp.id AND e.tenant_id=camp.tenant_id AND nullif(trim(ta.agent_slug),'') IS NOT NULL
   UNION SELECT agent_id FROM per
 )
 INSERT INTO agent_performance(tenant_id,campaign_id,agent_id,window_days,connected_calls,enrollments,conversion)
 SELECT camp.tenant_id,camp.id,x.agent_id,camp.performance_window_days,coalesce(c.connected,0),coalesce(c.enrolled,0),
   CASE WHEN coalesce(c.connected,0)>0 AND c.connected>=camp.performance_min_calls
     THEN round(c.enrolled::numeric/c.connected,6) ELSE average.conversion END
 FROM roster x CROSS JOIN average LEFT JOIN per c ON c.agent_id=x.agent_id;
 GET DIAGNOSTICS written=ROW_COUNT;
 RETURN written;
END $$;

-- ping_decide_campaign as in 178; only the pool ordering and its trace step change.
CREATE OR REPLACE FUNCTION public.ping_decide_campaign(p_campaign_id uuid,p_source_id uuid,p_payload jsonb,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; camp ping_campaigns; ctl vendor_controls;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); shadow boolean:=p_mode IN ('shadow','exchange_eval');
  exchange boolean:=p_mode IN ('exchange_eval','exchange');
  match_mode text:=CASE WHEN p_mode IN ('exchange_eval','exchange') THEN 'generic' ELSE p_mode END;
  owner_tenant uuid; pause_source uuid;
  phone text; state_code text:=''; call_id text; zip text; sub_id text; consent text; t65 boolean;
  routing boolean; valid boolean:=true; key text;
  existing ping_reservations; selected record; eligible_count integer:=0; committed ping_decisions;
  decision text; accepted boolean:=false; trace jsonb:='[]'::jsonb; gate_at timestamptz;
  price numeric; decision_id uuid; phone_hash text;
  retention_hit boolean:=false; client_contact uuid; owner_agent text;
  perf boolean:=false; perf_avg numeric; perf_pool boolean:=false;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('generic','shadow','exchange_eval','exchange') THEN RAISE EXCEPTION 'Invalid ping engine'; END IF;
  SELECT s.* INTO src FROM lead_sources s WHERE s.id=p_source_id AND s.active AND s.type IN ('publisher','aggregator');
  IF src.id IS NULL THEN RAISE EXCEPTION 'Unknown ping source'; END IF;
  SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;

  BEGIN
    IF jsonb_typeof(payload)='object' THEN
      phone:=nullif(trim(payload->>'phone'),'');
      state_code:=upper(trim(coalesce(payload->>'state','')));
      call_id:=left(nullif(trim(payload->>'call_id'),''),128);
      zip:=nullif(trim(payload->>'zip'),'');
      sub_id:=left(nullif(trim(payload->>'sub_id'),''),128);
      consent:=left(nullif(trim(payload->>'consent_cert_id'),''),128);
      valid:=(phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
        AND (zip IS NULL OR zip ~ '^[0-9]{5}$')
        AND (payload->'t65' IS NULL OR jsonb_typeof(payload->'t65') IN ('boolean','null'));
      IF jsonb_typeof(payload->'t65')='boolean' THEN t65:=(payload->>'t65')::boolean; END IF;
    ELSE valid:=false; END IF;
    routing:=coalesce(payload->'routing_enabled'='true'::jsonb,false);
    key:=CASE WHEN call_id IS NOT NULL THEN 'id:'||call_id
      WHEN phone IS NOT NULL THEN 'phone:'||left(phone,32) ELSE NULL END;

    -- Direct pings reach only the source's own campaigns in its own tenant.
    -- The exchange reaches a buyer campaign only through an active route.
    IF p_campaign_id IS NOT NULL THEN
      IF exchange THEN
        SELECT c.* INTO camp FROM ping_campaigns c WHERE c.id=p_campaign_id
          AND EXISTS(SELECT 1 FROM exchange_routes r WHERE r.source_id=src.id AND r.campaign_id=c.id AND r.active);
      ELSE
        SELECT c.* INTO camp FROM ping_campaigns c WHERE c.id=p_campaign_id AND c.source_id=src.id AND c.tenant_id=src.tenant_id;
      END IF;
    END IF;
    owner_tenant:=coalesce(camp.tenant_id,src.tenant_id);
    pause_source:=coalesce(camp.source_id,src.id);
    routing:=routing AND (camp.id IS NULL OR camp.engine_mode=match_mode);
    SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=owner_tenant;

    -- Serialize a source's decisions, as paragon_ping does.
    PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||src.id::text,0));
    gate_at:=clock_timestamp();
    IF NOT shadow THEN DELETE FROM ping_reservations WHERE expires_at<clock_timestamp()-interval '1 day'; END IF;

    IF NOT routing THEN decision:='routing_disabled';
    ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','routing_disabled','result','pass'));
      IF NOT valid THEN decision:='invalid_payload';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','pass'));
        -- Tenant-wide pause, or a source-level or campaign-level row (173), of
        -- the campaign's own tenant and source.
        IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR EXISTS(SELECT 1 FROM ping_source_controls p
          WHERE p.tenant_id=owner_tenant AND p.source_id=pause_source AND p.paused
            AND (p.campaign_id IS NULL OR p.campaign_id=camp.id)) THEN decision:='source_paused';
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','source_paused','result','pass')); END IF;
      END IF;
    END IF;

    -- The 30 second accepted commitment: a re-ping for the same identity and
    -- state replays the committed decision without re-checking hours. An
    -- exchange evaluation never replays; it reports the current state.
    IF decision IS NULL AND camp.id IS NOT NULL AND p_mode<>'exchange_eval' THEN
      SELECT * INTO committed FROM ping_decisions d WHERE d.source_id=src.id AND d.campaign_id=camp.id
        AND d.engine=p_mode AND d.available AND d.matched_call_sid IS NULL
        AND d.received_at+interval '30 seconds'>=gate_at AND d.caller_state=state_code
        AND ((call_id IS NOT NULL AND d.vendor_call_id=call_id)
          OR (call_id IS NULL AND phone IS NOT NULL AND d.caller_phone=phone))
        AND NOT d.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb
        ORDER BY d.received_at DESC LIMIT 1;
      IF committed.id IS NOT NULL THEN
        decision:=committed.reason; accepted:=true;
        SELECT committed.agent_id AS agent_id,NULL::text AS tier INTO selected;
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','commitment_replay','result','hit','decision_id',committed.id));
      END IF;
    END IF;

    IF decision IS NULL THEN
      IF NOT ping_hours_open(coalesce(camp.staffed_hours_override,ctl.staffed_hours),gate_at) THEN decision:='outside_staffed_hours';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','outside_staffed_hours','result','pass'));
        IF camp.id IS NULL OR NOT camp.active THEN decision:='campaign_inactive';
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','campaign_inactive','result','pass'));
          IF state_code='' OR NOT state_code=ANY(camp.allowed_states) THEN decision:='state_not_allowed';
          ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','state_not_allowed','result','pass'));
            IF key IS NULL THEN decision:='missing_call_identity';
            ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','missing_call_identity','result','pass')); END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Rule 8, existing_client_retention: the campaign tenant's own contacts only.
    IF decision IS NULL THEN
      IF NOT camp.retention_enabled OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','skipped'));
      ELSE
        SELECT x.contact_id,x.owner_agent_id INTO client_contact,owner_agent
          FROM public.ping_existing_client(owner_tenant,phone) x;
        IF client_contact IS NULL THEN
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','pass'));
        ELSE
          retention_hit:=true;
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','hit','mode',camp.retention_mode));
          IF camp.retention_mode='reject_and_alert' THEN decision:='existing_client_retention'; END IF;
        END IF;
      END IF;
    END IF;

    -- Rule 9, cooldown_same_source. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.cooldown_same_source_days,0)=0 OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','skipped'));
      ELSIF public.ping_recent_publisher_call(owner_tenant,phone,src.id,
          gate_at-make_interval(days=>camp.cooldown_same_source_days),gate_at) THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','hit'));
        decision:='cooldown_same_source';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','pass')); END IF;
    END IF;

    -- Rule 10, cooldown_any_source. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.cooldown_any_source_days,0)=0 OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','skipped'));
      ELSIF public.ping_recent_publisher_call(owner_tenant,phone,NULL,
          gate_at-make_interval(days=>camp.cooldown_any_source_days),gate_at) THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','hit'));
        decision:='cooldown_any_source';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','pass')); END IF;
    END IF;

    -- Rule 11, repeat_shopper: pooled count only, while the exchange flag and
    -- the operator opt-in are on. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.repeat_shopper_threshold,0)=0 OR coalesce(camp.repeat_shopper_window_days,0)=0
      OR phone IS NULL OR NOT public.ping_pooled_shopper_on() THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','skipped'));
      ELSIF public.shopper_history_count(public.ping_phone_hash(left(phone,32)),camp.repeat_shopper_window_days)
          >=camp.repeat_shopper_threshold THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','hit'));
        decision:='repeat_shopper';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','pass')); END IF;
    END IF;

    -- Rule 12, daily_budget_reached, in the campaign tenant's own day.
    IF decision IS NULL THEN
      IF coalesce(camp.daily_budget_calls,0)=0 THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','skipped'));
      ELSIF public.ping_campaign_accepted_today(camp.id,coalesce(camp.staffed_hours_override,ctl.staffed_hours),gate_at)
          >=camp.daily_budget_calls THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','hit'));
        decision:='daily_budget_reached';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','pass')); END IF;
    END IF;

    IF decision IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||camp.id::text||key,0));
      IF shadow THEN SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key;
      ELSE SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key FOR UPDATE; END IF;
      IF existing.id IS NOT NULL AND existing.expires_at>clock_timestamp()
        AND existing.consumed_call_sid IS NULL AND existing.caller_state=state_code
        AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=existing.agent_id
          AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
        SELECT existing.agent_id AS agent_id,public.ping_agent_tier(existing.agent_id,state_code,camp.id) AS tier INTO selected;
        IF selected.tier NOT IN ('full','partial') THEN SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','reservation_reuse','result','hit')); END IF;
      END IF;
      IF selected.agent_id IS NULL THEN
        IF NOT shadow THEN DELETE FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key; END IF;
        SELECT count(*) INTO eligible_count FROM agent_availability a
          WHERE public.ping_agent_tier(a.agent_id,state_code,camp.id) IN ('full','partial');
        -- Performance routing (180): only when the campaign opts in.
        perf:=coalesce(camp.performance_routing,false);
        IF perf THEN perf_avg:=public.ping_campaign_conversion(camp.id); END IF;
        -- Rule 8 route_owner: the owner first, while routable, eligible and not
        -- held by another reservation; otherwise the pool below.
        IF retention_hit AND owner_agent IS NOT NULL THEN
          IF shadow THEN
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL);
          ELSE
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              FOR UPDATE OF a SKIP LOCKED;
          END IF;
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','retention_owner',
            'result',CASE WHEN selected.agent_id IS NOT NULL THEN 'hit' ELSE 'pass' END));
        END IF;
        -- Agents are shared across engines: a live legacy reservation also holds the agent.
        perf_pool:=perf AND selected.agent_id IS NULL;
        IF selected.agent_id IS NULL AND shadow THEN
          SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id) AS tier
            INTO selected FROM agent_availability a
            WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
              AND public.ping_agent_tier(a.agent_id,state_code,camp.id) IN ('full','partial')
              AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
              AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
            ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id) WHEN 'full' THEN 0 ELSE 1 END,
              CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            LIMIT 1;
        ELSIF selected.agent_id IS NULL THEN
          SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id) AS tier
            INTO selected FROM agent_availability a
            WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
              AND public.ping_agent_tier(a.agent_id,state_code,camp.id) IN ('full','partial')
              AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
            ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id) WHEN 'full' THEN 0 ELSE 1 END,
              CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            FOR UPDATE OF a SKIP LOCKED LIMIT 1;
        END IF;
        IF perf_pool AND selected.agent_id IS NOT NULL THEN
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','performance_routing','result','applied'));
        END IF;
        IF NOT shadow AND selected.agent_id IS NOT NULL THEN
          INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
            VALUES(owner_tenant,camp.id,key,state_code,selected.agent_id,
              clock_timestamp()+make_interval(secs=>camp.reservation_ttl_seconds));
        END IF;
      END IF;
      IF selected.agent_id IS NOT NULL THEN
        accepted:=true;
        decision:=CASE WHEN retention_hit THEN 'accepted_retention_owner'
          WHEN selected.tier='full' THEN 'accepted_full' ELSE 'accepted_partial' END;
      ELSE
        decision:=CASE WHEN eligible_count>0 THEN 'all_eligible_busy' ELSE 'no_eligible_agent' END;
      END IF;
    END IF;
    IF accepted THEN price:=CASE camp.pricing_model WHEN 'free' THEN 0 ELSE camp.rate END; END IF;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule',decision,'result',CASE WHEN accepted THEN 'accept' ELSE 'reject' END));
  EXCEPTION WHEN OTHERS THEN
    -- Publisher pings fail closed. The subtransaction rolled back any reservation.
    decision:='error_rejected'; accepted:=false; price:=NULL; retention_hit:=false;
    SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule','error_rejected','result','reject','sqlstate',SQLSTATE));
  END;

  -- An exchange evaluation never stores the caller's phone or ZIP; only the
  -- winning tenant's 'exchange' decision does.
  IF p_mode='exchange_eval' THEN
    phone_hash:=public.ping_phone_hash(left(phone,32));
    IF phone_hash IS NOT NULL THEN
      trace:=trace||jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
    END IF;
  END IF;
  INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
    vendor_call_id,publisher_sub_id,consent_cert_id,t65_flag,available,reason,agent_id,price,rule_trace,engine)
  VALUES(owner_tenant,src.id,camp.id,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
    CASE WHEN p_mode<>'exchange_eval' THEN left(phone,32) END,nullif(left(state_code,8),''),
    CASE WHEN p_mode<>'exchange_eval' AND zip ~ '^[0-9]{5}$' THEN zip END,
    call_id,sub_id,consent,t65,accepted,decision,selected.agent_id,price,trace,p_mode)
  RETURNING id INTO decision_id;

  -- Rule 8 alert in the campaign's own tenant. Never blocks the decision.
  IF retention_hit AND client_contact IS NOT NULL
  AND (p_mode IN ('generic','exchange') OR (p_mode='exchange_eval' AND decision='existing_client_retention'))
  AND public.deployment_feature_enabled('PING_RETENTION_ALERTS_ENABLED') THEN
    BEGIN
      INSERT INTO ping_retention_alerts(tenant_id,contact_id,owner_agent_id,source_id,campaign_id,decision_id)
      VALUES(owner_tenant,client_contact,owner_agent,src.id,camp.id,decision_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ping_retention_alert_failed';
    END;
  END IF;
  RETURN jsonb_build_object('authorized',true,'decision_id',decision_id,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id,'price',price,
    'ttl_seconds',CASE WHEN accepted THEN camp.reservation_ttl_seconds END);
END;
$$;

-- ping_claim_arrival as in 176; only the pool ordering changes.
CREATE OR REPLACE FUNCTION public.ping_claim_arrival(p_call_sid text,p_phone text,p_call_id text,p_to_number text,
  p_exclude text[],p_preferred_agent_id text,p_arrived_at timestamptz)
RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions; camp ping_campaigns; ctl vendor_controls; reserved ping_reservations;
  key text; selected_id text; selected_tier text; preferred_tier text; path text; exchange_on boolean;
  claimed_id text; claimed_name text; excluded text[]:=coalesce(p_exclude,'{}'); pause_source uuid; bill_rate numeric;
  perf boolean:=false; perf_avg numeric;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN; END IF;
 IF nullif(p_call_sid,'') IS NULL OR nullif(p_to_number,'') IS NULL OR p_arrived_at IS NULL
 OR p_arrived_at>clock_timestamp()+interval '5 seconds'
 OR (nullif(p_phone,'') IS NULL AND nullif(p_call_id,'') IS NULL) THEN RETURN; END IF;
 exchange_on:=public.deployment_feature_enabled('PING_EXCHANGE_ENABLED');
 PERFORM pg_advisory_xact_lock(hashtextextended('ping-arrival:'||p_call_sid,0));

 -- A retried webhook for an already claimed call returns that claim.
 RETURN QUERY SELECT a.agent_id,a.agent_name,x.caller_state,'existing'::text,x.vendor_call_id,x.id,x.campaign_id,x.tenant_id,x.source_id
  FROM ping_decisions x JOIN agent_availability a ON a.active_call_sid=p_call_sid
  WHERE x.matched_call_sid=p_call_sid AND (x.engine='generic' OR (x.engine='exchange' AND exchange_on)) LIMIT 1;
 IF FOUND THEN RETURN; END IF;

 SELECT x.* INTO d FROM ping_decisions x
  JOIN ping_campaigns c ON c.id=x.campaign_id AND c.tenant_id=x.tenant_id
  JOIN lead_sources s ON s.id=x.source_id
  WHERE x.available AND c.engine_mode='generic' AND s.active
    AND ((x.engine='generic' AND c.source_id=x.source_id AND s.tenant_id=x.tenant_id AND s.twilio_number=p_to_number)
      OR (x.engine='exchange' AND exchange_on AND c.transfer_number=p_to_number))
    AND x.received_at>=p_arrived_at-interval '5 minutes' AND x.received_at<=p_arrived_at
    AND (x.matched_call_sid IS NULL OR x.matched_call_sid=p_call_sid)
    AND ((nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id)
      OR (nullif(p_phone,'') IS NOT NULL AND x.caller_phone=p_phone
        AND (nullif(p_call_id,'') IS NULL OR x.vendor_call_id IS NULL)))
  ORDER BY CASE WHEN nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id THEN 0 ELSE 1 END,x.received_at DESC,x.id
  FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF d.id IS NULL OR d.caller_state IS NULL THEN RETURN; END IF;

 SELECT * INTO camp FROM ping_campaigns WHERE id=d.campaign_id;
 SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=d.tenant_id;
 pause_source:=CASE WHEN d.engine='exchange' THEN camp.source_id ELSE d.source_id END;
 -- The pause and campaign gates of ping_decide still hold at arrival.
 IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR NOT camp.active OR camp.engine_mode<>'generic'
 OR NOT d.caller_state=ANY(camp.allowed_states)
 OR EXISTS(SELECT 1 FROM ping_source_controls p WHERE p.tenant_id=d.tenant_id AND p.source_id=pause_source
   AND p.paused AND (p.campaign_id IS NULL OR p.campaign_id=d.campaign_id)) THEN
  RETURN QUERY SELECT NULL::text,NULL::text,d.caller_state,'rejected'::text,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
  RETURN;
 END IF;

 key:=CASE WHEN d.vendor_call_id IS NOT NULL THEN 'id:'||d.vendor_call_id ELSE 'phone:'||left(d.caller_phone,32) END;
 SELECT * INTO reserved FROM ping_reservations r WHERE r.campaign_id=d.campaign_id AND r.reservation_key=key
  AND r.expires_at>=p_arrived_at AND r.consumed_call_sid IS NULL FOR UPDATE;
 -- A reserved agent is used only while still routable and eligible, and a
 -- partial reservation yields to a routable full agent, as in claim_paragon_call_at.
 IF reserved.id IS NOT NULL AND reserved.agent_id<>ALL(excluded)
   AND public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id) IN ('full','partial')
   AND (public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id)='full'
     OR NOT EXISTS(SELECT 1 FROM agent_availability f
       WHERE public.agent_inbound_routable(f.agent_id,f.status,f.available,f.active_call_sid)
         AND public.ping_agent_tier(f.agent_id,d.caller_state,d.campaign_id)='full'
         AND f.agent_id<>ALL(excluded)))
   AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=reserved.agent_id
     AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
  selected_id:=reserved.agent_id; path:='reserved';
 ELSE
  preferred_tier:=public.ping_agent_tier(p_preferred_agent_id,d.caller_state,d.campaign_id);
  -- Performance routing (180): only when the campaign opts in.
  perf:=coalesce(camp.performance_routing,false);
  IF perf THEN perf_avg:=public.ping_campaign_conversion(d.campaign_id); END IF;
  SELECT a.agent_id,public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id)
   INTO selected_id,selected_tier FROM agent_availability a
   WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
     AND a.agent_id<>ALL(excluded)
     AND public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id) IN ('full','partial')
     AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.id IS DISTINCT FROM reserved.id)
     AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
   ORDER BY CASE public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id) WHEN 'full' THEN 0 ELSE 1 END,
     CASE WHEN a.agent_id=p_preferred_agent_id THEN 0 ELSE 1 END,
     CASE WHEN perf THEN public.ping_agent_conversion(d.campaign_id,a.agent_id,perf_avg) END DESC NULLS LAST,
     a.last_assigned_at ASC NULLS FIRST,a.agent_id
   FOR UPDATE OF a SKIP LOCKED LIMIT 1;
  path:=CASE WHEN selected_id=p_preferred_agent_id AND preferred_tier=selected_tier THEN 'preferred' ELSE 'round_robin' END;
 END IF;

 IF selected_id IS NOT NULL THEN
  UPDATE agent_availability a SET active_call_sid=p_call_sid,resume_status=a.status,status='busy',available=false,
    last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
   WHERE a.agent_id=selected_id AND a.active_call_sid IS NULL
   RETURNING a.agent_id,a.agent_name INTO claimed_id,claimed_name;
 END IF;
 IF claimed_id IS NULL THEN
  RETURN QUERY SELECT NULL::text,NULL::text,d.caller_state,'rejected'::text,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
  RETURN;
 END IF;
 UPDATE ping_decisions SET matched_call_sid=p_call_sid WHERE id=d.id;
 UPDATE ping_reservations SET consumed_call_sid=p_call_sid WHERE id=reserved.id;
 -- Price snapshot at claim time; later campaign or route edits never reprice this call.
 bill_rate:=CASE camp.pricing_model WHEN 'free' THEN 0 ELSE coalesce(camp.rate,0) END;
 IF d.engine='exchange' AND camp.pricing_model<>'free' THEN
  SELECT coalesce(er.price_override,bill_rate) INTO bill_rate FROM exchange_routes er
   WHERE er.source_id=d.source_id AND er.campaign_id=d.campaign_id;
  bill_rate:=coalesce(bill_rate,camp.rate,0);
 END IF;
 IF p_call_sid ~ '^CA[0-9a-fA-F]{32}$' THEN
  INSERT INTO ping_call_billing(parent_call_sid,tenant_id,source_id,campaign_id,decision_id,pricing_model,rate,billable_threshold_seconds)
  VALUES(p_call_sid,d.tenant_id,d.source_id,d.campaign_id,d.id,camp.pricing_model,bill_rate,camp.billable_seconds)
  ON CONFLICT DO NOTHING;
 END IF;
 IF d.engine='exchange' THEN
  PERFORM public.platform_record_usage(d.tenant_id,'routed_call',d.source_id,d.campaign_id,left(p_call_sid,128));
 END IF;
 RETURN QUERY SELECT claimed_id,claimed_name,d.caller_state,path,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
END; $$;
ALTER TABLE public.agent_performance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_performance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.agent_performance TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_campaign_conversion','ping_agent_conversion','refresh_agent_performance',
   'ping_decide_campaign','ping_claim_arrival') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_agent_performance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_claim_arrival(text,text,text,text,text[],text,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
