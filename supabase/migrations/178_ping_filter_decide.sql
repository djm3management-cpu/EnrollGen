-- UNAPPLIED: isolated pilot only
-- Filter rules 8 to 12 in the decision body, pooled shopper recording and the
-- exchange retention priority (spec sections 6, 9 and 10; session S4).
-- 1. ping_decide_campaign as in 175 with rules 8 to 12 evaluated in the closed
--    order after missing_call_identity. Each rule records pass, hit or skipped
--    in rule_trace; a rule whose campaign fields are null, zero or false is
--    skipped, so campaigns created before 177 decide exactly as before.
--    Rule 8 (retention_enabled): route_owner continues with the owner agent
--    preferred and accepts as accepted_retention_owner, skipping rules 9 to
--    11; reject_and_alert rejects as existing_client_retention. An alert is
--    written while PING_RETENTION_ALERTS_ENABLED is on for generic and
--    exchange decisions, and for an exchange_eval reject_and_alert decision,
--    which is that buyer's final decision. Shadow decisions never alert.
--    Rules 9 and 10 read the evaluating tenant's own publisher calls. Rule 11
--    reads only shopper_history_count. Rule 12 counts this campaign's accepted
--    generic and exchange decisions since local midnight in its hours' zone.
-- 2. ping_decide records one shopper_history row per generic ping after the
--    decision; shadow pings are not recorded.
-- 3. exchange_ping as in 176, plus: an accepting candidate whose decision is
--    accepted_retention_owner ranks before every other accept, the strategy
--    ordering the rest and breaking ties among retention candidates; the
--    rotation state is not advanced when a retention candidate accepted; one
--    shopper_history row per exchange ping under the publisher's tenant; the
--    publisher response reports a retention winner as accepted_full or
--    accepted_partial by the reserved agent's tier, while the auction row keeps
--    the real reason for the operator.
-- The per-source advisory lock is unchanged (deferred to S8).
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

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
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            FOR UPDATE OF a SKIP LOCKED LIMIT 1;
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

-- ping_decide as in 175, plus one pooled shopper row per generic ping after
-- the decision. Recording never changes or blocks the decision.
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
    SELECT id INTO camp_id FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id
      AND (id::text=campaign_ref OR name=campaign_ref) ORDER BY (id::text=campaign_ref) DESC LIMIT 1;
  ELSIF (SELECT count(*) FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active)=1 THEN
    SELECT id INTO camp_id FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active;
  END IF;
  result:=public.ping_decide_campaign(camp_id,src.id,p_payload,p_engine);
  IF p_engine='generic' AND jsonb_typeof(p_payload)='object' THEN
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

  IF jsonb_typeof(payload)='object' THEN
    phone:=left(nullif(trim(payload->>'phone'),''),32);
    state_code:=upper(trim(coalesce(payload->>'state','')));
    call_id:=left(nullif(trim(payload->>'call_id'),''),128);
    sub_id:=left(nullif(trim(payload->>'sub_id'),''),128);
    consent:=left(nullif(trim(payload->>'consent_cert_id'),''),128);
  END IF;
  phone_hash:=public.ping_phone_hash(phone);
  IF phone_hash IS NOT NULL THEN
    hash_trace:=jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
  END IF;

  -- The row lock serializes this source's auctions and its rotation state.
  SELECT * INTO xs FROM exchange_sources WHERE source_id=src.id AND active FOR UPDATE;
  IF xs.source_id IS NOT NULL THEN
    -- A re-ping inside the 30 second commitment stays with the buyer that
    -- already holds an agent for it, so two buyers never hold the same call.
    SELECT x.campaign_id INTO committed_campaign FROM ping_decisions x
      WHERE x.source_id=src.id AND x.engine='exchange' AND x.available AND x.matched_call_sid IS NULL
        AND x.received_at+interval '30 seconds'>=started AND x.caller_state=state_code
        AND ((call_id IS NOT NULL AND x.vendor_call_id=call_id)
          OR (call_id IS NULL AND phone IS NOT NULL AND x.caller_phone=phone))
        AND NOT x.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb
      ORDER BY x.received_at DESC LIMIT 1;

    FOR r IN SELECT er.campaign_id,er.priority,er.weight,c.tenant_id AS buyer,c.transfer_number,
        c.exchange_daily_cap,c.exchange_hourly_cap,coalesce(c.staffed_hours_override,v.staffed_hours) AS hours,
        coalesce(er.price_override,CASE c.pricing_model WHEN 'free' THEN 0 ELSE c.rate END) AS price,
        (SELECT max(a.received_at) FROM exchange_auctions a
          WHERE a.source_id=src.id AND a.winner_campaign_id=er.campaign_id) AS last_won
      FROM exchange_routes er JOIN ping_campaigns c ON c.id=er.campaign_id
      LEFT JOIN vendor_controls v ON v.tenant_id=c.tenant_id
      WHERE er.source_id=src.id AND er.active AND c.active AND c.engine_mode='generic'
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
      IF (r.exchange_daily_cap IS NOT NULL OR r.exchange_hourly_cap IS NOT NULL)
      AND r.campaign_id IS DISTINCT FROM committed_campaign THEN
        day_start:=public.exchange_cap_window(r.hours,'day',started);
        hour_start:=public.exchange_cap_window(r.hours,'hour',started);
        SELECT count(*) FILTER (WHERE x.received_at>=day_start),count(*) FILTER (WHERE x.received_at>=hour_start)
          INTO used_day,used_hour FROM ping_decisions x
          WHERE x.campaign_id=r.campaign_id AND x.engine='exchange' AND x.available
            AND x.received_at>=least(day_start,hour_start)
            AND NOT x.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb;
        IF r.exchange_daily_cap IS NOT NULL AND used_day>=r.exchange_daily_cap THEN cap_scope:='daily';
        ELSIF r.exchange_hourly_cap IS NOT NULL AND used_hour>=r.exchange_hourly_cap THEN cap_scope:='hourly'; END IF;
      END IF;
      IF cap_scope IS NOT NULL THEN
        INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
          vendor_call_id,publisher_sub_id,consent_cert_id,available,reason,rule_trace,engine)
        VALUES(r.buyer,src.id,r.campaign_id,0,NULL,nullif(left(state_code,8),''),NULL,call_id,sub_id,consent,false,
          'buyer_cap_reached',jsonb_build_array(jsonb_build_object('rule','buyer_cap_reached','result','reject','scope',cap_scope))||hash_trace,
          'exchange_eval')
        RETURNING id INTO cap_decision;
        cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',cap_decision,
          'available',false,'reason','buyer_cap_reached','price',r.price));
        CONTINUE;
      END IF;

      d:=public.ping_decide_campaign(r.campaign_id,src.id,payload,'exchange_eval');
      cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',d->'decision_id',
        'available',d->'available','reason',d->'reason','price',r.price));
      -- Pings the publisher or platform could not deliver are not metered.
      IF d->>'reason' NOT IN ('routing_disabled','invalid_payload','error_rejected') THEN
        PERFORM public.platform_record_usage(r.buyer,'ping',src.id,r.campaign_id,d->>'decision_id');
      END IF;
      IF (d->>'available')::boolean THEN
        accepts:=accepts||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'priority',r.priority,
          'weight',r.weight,'price',r.price,'last_won',r.last_won,
          'retention',d->>'reason'='accepted_retention_owner'));
      END IF;
    END LOOP;

    -- Rank the accepts: the committed buyer, then retention owners, then the
    -- strategy; ties go to the least recently won, then id. weighted_rotation
    -- is smooth weighted round robin over rotation_state.
    rotation:=xs.rotation_state;
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
    FOR attempt IN 1..least(2,coalesce(array_length(ranking,1),0)) LOOP
      pick:=ranking[attempt];
      d:=public.ping_decide_campaign(pick,src.id,payload,'exchange');
      IF (d->>'available')::boolean THEN winner_campaign:=pick; winner_decision:=d; EXIT; END IF;
      UPDATE ping_decisions SET caller_phone=NULL,caller_zip=NULL,rule_trace=rule_trace||hash_trace
        WHERE id=(d->>'decision_id')::uuid;
    END LOOP;

    IF xs.strategy='weighted_rotation' AND winner_campaign IS NOT NULL
    AND winner_campaign IS DISTINCT FROM committed_campaign AND NOT retention_accepts THEN
      SELECT rotation||coalesce(jsonb_object_agg(e->>'campaign_id',
          coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer
          -CASE WHEN (e->>'campaign_id')::uuid=winner_campaign THEN total ELSE 0 END),'{}'::jsonb)
        INTO rotation FROM jsonb_array_elements(accepts) e;
      UPDATE exchange_sources SET rotation_state=rotation WHERE source_id=src.id;
    END IF;
  END IF;

  reason:=coalesce(winner_decision->>'reason','exchange_no_buyer');
  INSERT INTO exchange_auctions(source_id,received_at,latency_ms,strategy,candidate_count,
    winner_campaign_id,winner_decision_id,reason,candidates)
  VALUES(src.id,started,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,xs.strategy,
    jsonb_array_length(cand),winner_campaign,(winner_decision->>'decision_id')::uuid,reason,cand)
  RETURNING id INTO auction_id;
  -- One pooled shopper row per exchange ping, under the publisher's tenant.
  IF phone ~ '^\+[1-9][0-9]{7,14}$' THEN
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
    'reason',public_reason,'ttl_seconds',(winner_decision->>'ttl_seconds')::integer,'transfer_number',transfer);
END;
$$;

REVOKE ALL ON FUNCTION public.ping_decide_campaign(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_decide(text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.exchange_ping(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ping_decide(text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_ping(text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
