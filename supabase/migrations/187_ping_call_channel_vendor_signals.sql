-- UNAPPLIED: isolated pilot only
-- Call ping paths and the consumer data vendor slot (spec sections 6, 7 and 9;
-- session S9).
-- 1. ping_decide_campaign, ping_decide and exchange_ping are the 184 bodies
--    with two changes. (a) They see only channel 'call' campaigns, so a lead
--    campaign (185) never answers a call ping, is never counted as a source's
--    single active campaign and is never an exchange candidate. Every
--    existing campaign is channel 'call', so decisions are unchanged. (b) After
--    rule 12 and before agent selection, when the server passed consumer data
--    vendor signals for this ping, the campaign tenant's enabled
--    data_vendor_settings are applied through ping_vendor_gate (186): signals
--    are recorded in rule_trace and, when min_intent_score is set and the
--    score is below it, the decision is low_intent. Without signals nothing is
--    read or traced, exactly as in 184.
-- 2. ping_decide_signals and exchange_ping_signals: ping_decide and
--    exchange_ping with signals. The signals live in a transaction local
--    setting for the one call and are cleared before returning.
-- Fenced by PING_PLATFORM_ENABLED (and PING_EXCHANGE_ENABLED for the
-- exchange). Service role only. Forward only. Never alters paragon_* objects
-- and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

-- The signals for the ping being decided, or null when none were passed.
CREATE FUNCTION public.ping_vendor_signals() RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE raw text:=current_setting('ping.vendor_signals',true); parsed jsonb;
BEGIN
 IF raw IS NULL OR raw='' THEN RETURN NULL; END IF;
 parsed:=raw::jsonb;
 RETURN CASE WHEN jsonb_typeof(parsed)='object' THEN parsed END;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

-- ping_decide_campaign as in 184, call campaigns only, plus the vendor gate.
CREATE OR REPLACE FUNCTION public.ping_decide_campaign(p_campaign_id uuid,p_source_id uuid,p_payload jsonb,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; camp ping_campaigns; ctl vendor_controls;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); run_mode text:=p_mode; shadow boolean; exchange boolean;
  match_mode text; is_sandbox boolean; held_skip text[]:='{}'; pick_attempt integer;
  owner_tenant uuid; pause_source uuid;
  phone text; state_code text:=''; call_id text; zip text; sub_id text; consent text; t65 boolean;
  routing boolean; valid boolean:=true; key text;
  existing ping_reservations; selected record; eligible_count integer:=0; committed ping_decisions;
  decision text; accepted boolean:=false; trace jsonb:='[]'::jsonb; gate_at timestamptz;
  price numeric; decision_id uuid; phone_hash text;
  retention_hit boolean:=false; client_contact uuid; owner_agent text;
  perf boolean:=false; perf_avg numeric; perf_pool boolean:=false;
  county text; county_carriers text[]; tier_carriers text[]; signals jsonb; gate jsonb;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('generic','shadow','exchange_eval','exchange','sandbox','sandbox_exchange')
  THEN RAISE EXCEPTION 'Invalid ping engine'; END IF;
  SELECT s.* INTO src FROM lead_sources s WHERE s.id=p_source_id AND s.active AND s.type IN ('publisher','aggregator');
  IF src.id IS NULL THEN RAISE EXCEPTION 'Unknown ping source'; END IF;
  -- A sandbox source is only ever evaluated in a sandbox mode, whatever the caller asked.
  IF src.sandbox THEN
    run_mode:=CASE WHEN p_mode IN ('exchange_eval','exchange','sandbox_exchange') THEN 'sandbox_exchange' ELSE 'sandbox' END;
  END IF;
  is_sandbox:=run_mode IN ('sandbox','sandbox_exchange');
  shadow:=run_mode IN ('shadow','exchange_eval','sandbox','sandbox_exchange');
  exchange:=run_mode IN ('exchange_eval','exchange','sandbox_exchange');
  match_mode:=CASE WHEN run_mode IN ('exchange_eval','exchange','sandbox','sandbox_exchange') THEN 'generic' ELSE run_mode END;
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
          AND c.channel='call'
          AND EXISTS(SELECT 1 FROM exchange_routes r WHERE r.source_id=src.id AND r.campaign_id=c.id AND r.active);
      ELSE
        SELECT c.* INTO camp FROM ping_campaigns c WHERE c.id=p_campaign_id AND c.source_id=src.id AND c.tenant_id=src.tenant_id
          AND c.channel='call';
      END IF;
    END IF;
    owner_tenant:=coalesce(camp.tenant_id,src.tenant_id);
    pause_source:=coalesce(camp.source_id,src.id);
    routing:=routing AND (camp.id IS NULL OR camp.engine_mode=match_mode);
    SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=owner_tenant;

    -- S8a: serialize per campaign plus call identity, not per source. Only the
    -- modes with side effects lock; evaluations read. Agent safety comes from
    -- FOR UPDATE SKIP LOCKED on the agent row plus the re-check below.
    IF NOT shadow AND camp.id IS NOT NULL AND key IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||camp.id::text||key,0));
    END IF;
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
    -- exchange evaluation and a sandbox ping never replay; they report the current state.
    IF decision IS NULL AND camp.id IS NOT NULL AND run_mode NOT IN ('exchange_eval','sandbox','sandbox_exchange') THEN
      SELECT * INTO committed FROM ping_decisions d WHERE d.source_id=src.id AND d.campaign_id=camp.id
        AND d.engine=run_mode AND d.available AND d.matched_call_sid IS NULL
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
            -- S6: the ZIP's county, only for a campaign that opts in. Nothing is
            -- traced and tiering is unchanged when no county resolves.
            IF (camp.county_aware OR camp.county_filter) AND zip ~ '^[0-9]{5}$' THEN
              county:=public.ping_zip_county(zip,state_code);
              IF county IS NOT NULL THEN county_carriers:=public.ping_county_carriers(county,camp.plan_year); END IF;
              IF county_carriers IS NULL THEN county:=NULL; END IF;
            END IF;
            IF county IS NOT NULL THEN
              trace:=trace||jsonb_build_array(jsonb_build_object('rule','county','result','resolved','county_fips',county,
                'county_aware',camp.county_aware));
              IF camp.county_aware THEN tier_carriers:=county_carriers; END IF;
            END IF;
            IF county IS NOT NULL AND camp.county_filter AND cardinality(camp.required_carriers)>0
            AND NOT camp.required_carriers && county_carriers THEN decision:='county_not_served';
            ELSE
              IF county IS NOT NULL AND camp.county_filter THEN
                trace:=trace||jsonb_build_array(jsonb_build_object('rule','county_not_served','result','pass'));
              END IF;
              IF key IS NULL THEN decision:='missing_call_identity';
              ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','missing_call_identity','result','pass')); END IF;
            END IF;
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

    -- Rule 12, daily_budget_reached, in the campaign tenant's own day. With the
    -- per source lock gone, a reserving decision for a budgeted campaign holds a
    -- per campaign lock from the count to commit so concurrent pings never overshoot.
    IF decision IS NULL THEN
      IF NOT shadow AND coalesce(camp.daily_budget_calls,0)>0 THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('ping-campaign-cap:'||camp.id::text,0));
      END IF;
      IF coalesce(camp.daily_budget_calls,0)=0 THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','skipped'));
      ELSIF public.ping_campaign_accepted_today(camp.id,coalesce(camp.staffed_hours_override,ctl.staffed_hours),gate_at)
          >=camp.daily_budget_calls THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','hit'));
        decision:='daily_budget_reached';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','pass')); END IF;
    END IF;

    -- S9: consumer data vendor signals, only when the server passed them for
    -- this ping (ping_decide_signals, exchange_ping_signals). Without signals
    -- nothing is read or traced and the decision is exactly as in 184.
    IF decision IS NULL THEN
      signals:=public.ping_vendor_signals();
      IF signals IS NOT NULL THEN
        gate:=public.ping_vendor_gate(owner_tenant,signals);
        trace:=trace||(gate->'trace');
        IF (gate->>'low_intent')::boolean THEN decision:='low_intent'; END IF;
      END IF;
    END IF;

    IF decision IS NULL THEN
      IF shadow THEN SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key;
      ELSE SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key FOR UPDATE; END IF;
      IF existing.id IS NOT NULL AND existing.expires_at>clock_timestamp()
        AND existing.consumed_call_sid IS NULL AND existing.caller_state=state_code
        AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=existing.agent_id
          AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
        SELECT existing.agent_id AS agent_id,public.ping_agent_tier(existing.agent_id,state_code,camp.id,tier_carriers) AS tier INTO selected;
        IF selected.tier NOT IN ('full','partial') THEN SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','reservation_reuse','result','hit')); END IF;
      END IF;
      IF selected.agent_id IS NULL THEN
        IF NOT shadow THEN DELETE FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key; END IF;
        SELECT count(*) INTO eligible_count FROM agent_availability a
          WHERE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial');
        -- Performance routing (180): only when the campaign opts in.
        perf:=coalesce(camp.performance_routing,false);
        IF perf THEN perf_avg:=public.ping_campaign_conversion(camp.id); END IF;
        -- Rule 8 route_owner: the owner first, while routable, eligible and not
        -- held by another reservation; otherwise the pool below.
        IF retention_hit AND owner_agent IS NOT NULL THEN
          IF shadow THEN
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL);
          ELSE
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              FOR UPDATE OF a SKIP LOCKED;
            -- Re-check with a fresh snapshot now that the agent row is ours: a
            -- reservation committed by whoever held the row lock is visible here.
            IF selected.agent_id IS NOT NULL AND public.ping_agent_held(selected.agent_id) THEN
              held_skip:=held_skip||selected.agent_id::text;
              SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
            END IF;
          END IF;
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','retention_owner',
            'result',CASE WHEN selected.agent_id IS NOT NULL THEN 'hit' ELSE 'pass' END));
        END IF;
        -- Agents are shared across engines: a live legacy reservation also holds the agent.
        perf_pool:=perf AND selected.agent_id IS NULL;
        IF selected.agent_id IS NULL AND shadow THEN
          SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
            INTO selected FROM agent_availability a
            WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
              AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
              AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
              AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
            ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) WHEN 'full' THEN 0 ELSE 1 END,
              CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            LIMIT 1;
        ELSIF selected.agent_id IS NULL THEN
          -- An agent whose fresh re-check finds a live reservation is skipped and
          -- the next one tried, at most three times.
          FOR pick_attempt IN 1..3 LOOP
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
              INTO selected FROM agent_availability a
              WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND a.agent_id<>ALL(held_skip)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) WHEN 'full' THEN 0 ELSE 1 END,
                CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
                a.last_assigned_at ASC NULLS FIRST,a.agent_id
              FOR UPDATE OF a SKIP LOCKED LIMIT 1;
            EXIT WHEN selected.agent_id IS NULL OR NOT public.ping_agent_held(selected.agent_id);
            held_skip:=held_skip||selected.agent_id::text;
            SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
          END LOOP;
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
  -- winning tenant's 'exchange' decision does. A sandbox decision stores neither.
  IF run_mode='exchange_eval' THEN
    phone_hash:=public.ping_phone_hash(left(phone,32));
    IF phone_hash IS NOT NULL THEN
      trace:=trace||jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
    END IF;
  END IF;
  INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
    vendor_call_id,publisher_sub_id,consent_cert_id,t65_flag,available,reason,agent_id,price,rule_trace,engine)
  VALUES(owner_tenant,src.id,camp.id,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
    CASE WHEN run_mode IN ('generic','shadow','exchange') THEN left(phone,32) END,nullif(left(state_code,8),''),
    CASE WHEN run_mode IN ('generic','shadow','exchange') AND zip ~ '^[0-9]{5}$' THEN zip END,
    call_id,sub_id,consent,t65,accepted,decision,selected.agent_id,price,trace,
    CASE WHEN is_sandbox THEN 'sandbox' ELSE run_mode END)
  RETURNING id INTO decision_id;

  -- Rule 8 alert in the campaign's own tenant. Never blocks the decision.
  IF retention_hit AND client_contact IS NOT NULL
  AND (run_mode IN ('generic','exchange') OR (run_mode='exchange_eval' AND decision='existing_client_retention'))
  AND public.deployment_feature_enabled('PING_RETENTION_ALERTS_ENABLED') THEN
    BEGIN
      INSERT INTO ping_retention_alerts(tenant_id,contact_id,owner_agent_id,source_id,campaign_id,decision_id)
      VALUES(owner_tenant,client_contact,owner_agent,src.id,camp.id,decision_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ping_retention_alert_failed';
    END;
  END IF;
  RETURN jsonb_build_object('authorized',true,'decision_id',decision_id,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id,'price',price,
    'ttl_seconds',CASE WHEN accepted THEN camp.reservation_ttl_seconds END)
    ||CASE WHEN is_sandbox THEN jsonb_build_object('sandbox',true) ELSE '{}'::jsonb END;
END;
$$;

-- ping_decide as in 184, resolving call campaigns only.
CREATE OR REPLACE FUNCTION public.ping_decide(p_key_hash text,p_campaign text,p_payload jsonb,p_engine text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; camp_id uuid; campaign_ref text:=nullif(trim(p_campaign),''); result jsonb; phone text;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_engine IS NULL OR p_engine NOT IN ('generic','shadow') THEN RAISE EXCEPTION 'Invalid ping engine'; END IF;
  SELECT s.* INTO src FROM lead_sources s WHERE s.active AND s.type IN ('publisher','aggregator')
    AND (s.ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers c
      WHERE c.name=s.name AND c.active AND c.key_hash=p_key_hash))
    ORDER BY (s.ping_key_hash=p_key_hash) DESC NULLS LAST LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
  -- Campaign: explicit id or name, else the source's single active campaign.
  IF campaign_ref IS NOT NULL THEN
    SELECT id INTO camp_id FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND channel='call'
      AND (id::text=campaign_ref OR name=campaign_ref) ORDER BY (id::text=campaign_ref) DESC LIMIT 1;
  ELSIF (SELECT count(*) FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active AND channel='call')=1 THEN
    SELECT id INTO camp_id FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active AND channel='call';
  END IF;
  -- A sandbox source is evaluated without side effects and never recorded in
  -- the pooled shopper history.
  result:=public.ping_decide_campaign(camp_id,src.id,p_payload,CASE WHEN src.sandbox THEN 'sandbox' ELSE p_engine END);
  IF p_engine='generic' AND NOT src.sandbox AND jsonb_typeof(p_payload)='object' THEN
    phone:=nullif(trim(p_payload->>'phone'),'');
    IF phone ~ '^\+[1-9][0-9]{7,14}$' THEN
      BEGIN PERFORM public.shopper_history_record(phone,src.tenant_id,src.id);
      EXCEPTION WHEN OTHERS THEN RAISE WARNING 'shopper_history_record_failed';
      END;
    END IF;
  END IF;
  RETURN result;
END;
$$;

-- exchange_ping as in 184, routing to call campaigns only.
CREATE OR REPLACE FUNCTION public.exchange_ping(p_key_hash text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; xs exchange_sources;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); phone text; call_id text; state_code text:='';
  sub_id text; consent text; phone_hash text; hash_trace jsonb:='[]'::jsonb;
  r record; d jsonb; cand jsonb:='[]'::jsonb; accepts jsonb:='[]'::jsonb;
  cap_scope text; used_day integer; used_hour integer; day_start timestamptz; hour_start timestamptz;
  committed_campaign uuid; ranking uuid[]; total integer; rotation jsonb;
  winner_campaign uuid; winner_decision jsonb; pick uuid; cap_decision uuid; auction_id uuid;
  transfer text; reason text; public_reason text; retention_accepts boolean:=false;
  is_sandbox boolean; key text; evals jsonb:='{}'::jsonb; winner_row jsonb;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN
    RETURN jsonb_build_object('status','disabled','feature','PING_PLATFORM_ENABLED'); END IF;
  IF NOT public.deployment_feature_enabled('PING_EXCHANGE_ENABLED') THEN
    RETURN jsonb_build_object('status','disabled','feature','PING_EXCHANGE_ENABLED'); END IF;
  -- Publisher authentication exactly as ping_decide.
  SELECT s.* INTO src FROM lead_sources s WHERE s.active AND s.type IN ('publisher','aggregator')
    AND (s.ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers c
      WHERE c.name=s.name AND c.active AND c.key_hash=p_key_hash))
    ORDER BY (s.ping_key_hash=p_key_hash) DESC NULLS LAST LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
  -- Fail closed: without the pepper no loser row could be written safely.
  IF public.ping_phone_pepper() IS NULL THEN RAISE EXCEPTION 'Ping phone pepper is not provisioned'; END IF;
  is_sandbox:=coalesce(src.sandbox,false);

  IF jsonb_typeof(payload)='object' THEN
    phone:=left(nullif(trim(payload->>'phone'),''),32);
    state_code:=upper(trim(coalesce(payload->>'state','')));
    call_id:=left(nullif(trim(payload->>'call_id'),''),128);
    sub_id:=left(nullif(trim(payload->>'sub_id'),''),128);
    consent:=left(nullif(trim(payload->>'consent_cert_id'),''),128);
  END IF;
  phone_hash:=CASE WHEN NOT is_sandbox THEN public.ping_phone_hash(phone) END;
  IF phone_hash IS NOT NULL THEN
    hash_trace:=jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
  END IF;
  key:=CASE WHEN call_id IS NOT NULL THEN 'id:'||call_id WHEN phone IS NOT NULL THEN 'phone:'||phone END;

  -- S8a: no row lock here. Candidate evaluation runs unserialized; the
  -- exchange_sources row is locked only to read and update weighted rotation
  -- state below. Pings for the same call identity on this source serialize so
  -- the commitment check and the reservation stay one decision.
  SELECT * INTO xs FROM exchange_sources WHERE source_id=src.id AND active;
  IF xs.source_id IS NOT NULL AND key IS NOT NULL AND NOT is_sandbox THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('exchange-ping:'||src.id::text||':'||key,0));
  END IF;
  IF xs.source_id IS NOT NULL AND NOT is_sandbox THEN
    -- A re-ping inside the 30 second commitment stays with the buyer that
    -- already holds an agent for it, so two buyers never hold the same call.
    SELECT x.campaign_id INTO committed_campaign FROM ping_decisions x
      WHERE x.source_id=src.id AND x.engine='exchange' AND x.available AND x.matched_call_sid IS NULL
        AND x.received_at+interval '30 seconds'>=started AND x.caller_state=state_code
        AND ((call_id IS NOT NULL AND x.vendor_call_id=call_id)
          OR (call_id IS NULL AND phone IS NOT NULL AND x.caller_phone=phone))
        AND NOT x.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb
      ORDER BY x.received_at DESC LIMIT 1;
  END IF;
  IF xs.source_id IS NOT NULL THEN
    FOR r IN SELECT er.campaign_id,er.priority,er.weight,c.tenant_id AS buyer,c.transfer_number,
        c.exchange_daily_cap,c.exchange_hourly_cap,coalesce(c.staffed_hours_override,v.staffed_hours) AS hours,
        coalesce(er.price_override,CASE c.pricing_model WHEN 'free' THEN 0 ELSE c.rate END) AS price,
        (SELECT max(a.received_at) FROM exchange_auctions a
          WHERE a.source_id=src.id AND a.winner_campaign_id=er.campaign_id) AS last_won
      FROM exchange_routes er JOIN ping_campaigns c ON c.id=er.campaign_id
      LEFT JOIN vendor_controls v ON v.tenant_id=c.tenant_id
      WHERE er.source_id=src.id AND er.active AND c.active AND c.engine_mode='generic' AND c.channel='call'
      ORDER BY er.priority,er.campaign_id
    LOOP
      -- A campaign without a transfer number can never win; it is not evaluated.
      IF r.transfer_number IS NULL THEN
        cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',NULL,
          'available',false,'reason','campaign_inactive','price',NULL));
        CONTINUE;
      END IF;
      -- Caps count accepted, non-replayed exchange decisions in the buyer's own day and hour.
      cap_scope:=NULL;
      IF r.campaign_id IS DISTINCT FROM committed_campaign THEN
        cap_scope:=public.exchange_cap_scope(r.campaign_id,r.exchange_daily_cap,r.exchange_hourly_cap,r.hours,started);
      END IF;
      IF cap_scope IS NOT NULL THEN
        INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
          vendor_call_id,publisher_sub_id,consent_cert_id,available,reason,rule_trace,engine)
        VALUES(r.buyer,src.id,r.campaign_id,0,NULL,nullif(left(state_code,8),''),NULL,call_id,sub_id,consent,false,
          'buyer_cap_reached',jsonb_build_array(jsonb_build_object('rule','buyer_cap_reached','result','reject','scope',cap_scope))||hash_trace,
          CASE WHEN is_sandbox THEN 'sandbox' ELSE 'exchange_eval' END)
        RETURNING id INTO cap_decision;
        cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',cap_decision,
          'available',false,'reason','buyer_cap_reached','price',r.price));
        CONTINUE;
      END IF;

      d:=public.ping_decide_campaign(r.campaign_id,src.id,payload,CASE WHEN is_sandbox THEN 'sandbox_exchange' ELSE 'exchange_eval' END);
      evals:=evals||jsonb_build_object(r.campaign_id::text,d);
      cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',d->'decision_id',
        'available',d->'available','reason',d->'reason','price',r.price));
      -- Pings the publisher or platform could not deliver are not metered.
      IF NOT is_sandbox AND d->>'reason' NOT IN ('routing_disabled','invalid_payload','error_rejected') THEN
        PERFORM public.platform_record_usage(r.buyer,'ping',src.id,r.campaign_id,d->>'decision_id');
      END IF;
      IF (d->>'available')::boolean THEN
        accepts:=accepts||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'priority',r.priority,
          'weight',r.weight,'price',r.price,'last_won',r.last_won,
          'retention',d->>'reason'='accepted_retention_owner','daily_cap',r.exchange_daily_cap,
          'hourly_cap',r.exchange_hourly_cap,'hours',r.hours));
      END IF;
    END LOOP;

    -- Rank the accepts: the committed buyer, then retention owners, then the
    -- strategy; ties go to the least recently won, then id. weighted_rotation
    -- is smooth weighted round robin over rotation_state.
    -- Weighted rotation reads its state under the row lock, held from here to
    -- commit so the read, the reservation and the update are one step.
    IF xs.strategy='weighted_rotation' AND NOT is_sandbox AND jsonb_array_length(accepts)>0 THEN
      SELECT e.rotation_state INTO rotation FROM exchange_sources e WHERE e.source_id=src.id FOR UPDATE;
    END IF;
    rotation:=coalesce(rotation,xs.rotation_state);
    SELECT coalesce(sum((e->>'weight')::integer),0),coalesce(bool_or((e->>'retention')::boolean),false)
      INTO total,retention_accepts FROM jsonb_array_elements(accepts) e;
    SELECT array_agg(x.cid ORDER BY (x.cid IS NOT DISTINCT FROM committed_campaign) DESC,x.retention DESC,
        CASE xs.strategy WHEN 'priority_waterfall' THEN x.priority END ASC,
        CASE xs.strategy WHEN 'highest_price' THEN x.price END DESC NULLS LAST,
        CASE xs.strategy WHEN 'weighted_rotation' THEN x.current END DESC,
        x.last_won ASC NULLS FIRST,x.cid::text)
      INTO ranking FROM (SELECT (e->>'campaign_id')::uuid AS cid,(e->>'priority')::integer AS priority,
        (e->>'price')::numeric AS price,(e->>'last_won')::timestamptz AS last_won,
        coalesce((e->>'retention')::boolean,false) AS retention,
        coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer AS current
        FROM jsonb_array_elements(accepts) e) x;

    -- The real decision reserves an agent. If it loses a race, the next best
    -- accept is tried once.
    -- A sandbox ping reserves nothing: the best ranked evaluation is the answer.
    IF is_sandbox AND coalesce(array_length(ranking,1),0)>0 THEN
      winner_campaign:=ranking[1]; winner_decision:=evals->(ranking[1]::text);
    END IF;
    FOR attempt IN 1..CASE WHEN is_sandbox THEN 0 ELSE least(2,coalesce(array_length(ranking,1),0)) END LOOP
      pick:=ranking[attempt];
      -- Capped buyers re-count under a per campaign lock (taken after the
      -- campaign plus identity lock, the order ping_decide_campaign uses) so
      -- concurrent auctions never overshoot a cap.
      SELECT e INTO winner_row FROM jsonb_array_elements(accepts) e WHERE (e->>'campaign_id')::uuid=pick;
      IF pick IS DISTINCT FROM committed_campaign
      AND (winner_row->'daily_cap' <> 'null'::jsonb OR winner_row->'hourly_cap' <> 'null'::jsonb) THEN
        IF key IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||pick::text||key,0)); END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('ping-campaign-cap:'||pick::text,0));
        IF public.exchange_cap_scope(pick,(winner_row->>'daily_cap')::integer,(winner_row->>'hourly_cap')::integer,
          winner_row->'hours',started) IS NOT NULL THEN CONTINUE; END IF;
      END IF;
      d:=public.ping_decide_campaign(pick,src.id,payload,'exchange');
      IF (d->>'available')::boolean THEN winner_campaign:=pick; winner_decision:=d; EXIT; END IF;
      UPDATE ping_decisions SET caller_phone=NULL,caller_zip=NULL,rule_trace=rule_trace||hash_trace
        WHERE id=(d->>'decision_id')::uuid;
    END LOOP;

    IF xs.strategy='weighted_rotation' AND winner_campaign IS NOT NULL AND NOT is_sandbox
    AND winner_campaign IS DISTINCT FROM committed_campaign AND NOT retention_accepts THEN
      SELECT rotation||coalesce(jsonb_object_agg(e->>'campaign_id',
          coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer
          -CASE WHEN (e->>'campaign_id')::uuid=winner_campaign THEN total ELSE 0 END),'{}'::jsonb)
        INTO rotation FROM jsonb_array_elements(accepts) e;
      UPDATE exchange_sources SET rotation_state=rotation WHERE source_id=src.id;
    END IF;
  END IF;

  reason:=coalesce(winner_decision->>'reason','exchange_no_buyer');
  -- A sandbox ping writes no auction row (it would steer least recently won
  -- tie breaks), no rotation state and no shopper history.
  IF NOT is_sandbox THEN
    INSERT INTO exchange_auctions(source_id,received_at,latency_ms,strategy,candidate_count,
      winner_campaign_id,winner_decision_id,reason,candidates)
    VALUES(src.id,started,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,xs.strategy,
      jsonb_array_length(cand),winner_campaign,(winner_decision->>'decision_id')::uuid,reason,cand)
    RETURNING id INTO auction_id;
  END IF;
  -- One pooled shopper row per exchange ping, under the publisher's tenant.
  IF NOT is_sandbox AND phone ~ '^\+[1-9][0-9]{7,14}$' THEN
    BEGIN PERFORM public.shopper_history_record(phone,src.tenant_id,src.id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'shopper_history_record_failed';
    END;
  END IF;
  -- The publisher never learns that the caller is a buyer's existing client.
  public_reason:=CASE WHEN reason='accepted_retention_owner' THEN
    CASE public.ping_agent_tier(winner_decision->>'agent_id',state_code,winner_campaign)
      WHEN 'partial' THEN 'accepted_partial' ELSE 'accepted_full' END
    ELSE reason END;
  SELECT c.transfer_number INTO transfer FROM ping_campaigns c WHERE c.id=winner_campaign;
  RETURN jsonb_build_object('authorized',true,'auction_id',auction_id,'available',winner_campaign IS NOT NULL,
    'reason',public_reason,'ttl_seconds',(winner_decision->>'ttl_seconds')::integer,'transfer_number',transfer)
    ||CASE WHEN is_sandbox THEN jsonb_build_object('sandbox',true) ELSE '{}'::jsonb END;
END;
$$;

-- ping_decide and exchange_ping with consumer data vendor signals for this call only.
CREATE FUNCTION public.ping_decide_signals(p_key_hash text,p_campaign text,p_payload jsonb,p_engine text,p_signals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('ping.vendor_signals',CASE WHEN jsonb_typeof(p_signals)='object' THEN p_signals::text ELSE '' END,true);
  result:=public.ping_decide(p_key_hash,p_campaign,p_payload,p_engine);
  PERFORM set_config('ping.vendor_signals','',true);
  RETURN result;
END $$;

CREATE FUNCTION public.exchange_ping_signals(p_key_hash text,p_payload jsonb,p_signals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('ping.vendor_signals',CASE WHEN jsonb_typeof(p_signals)='object' THEN p_signals::text ELSE '' END,true);
  result:=public.exchange_ping(p_key_hash,p_payload);
  PERFORM set_config('ping.vendor_signals','',true);
  RETURN result;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_vendor_signals','ping_decide_campaign','ping_decide','exchange_ping',
   'ping_decide_signals','exchange_ping_signals') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ping_decide(text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_ping(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_decide_signals(text,text,jsonb,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_ping_signals(text,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
