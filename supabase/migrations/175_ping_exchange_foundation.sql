-- UNAPPLIED: isolated pilot only
-- Exchange foundation and platform metering (spec sections 5, 7 and 9; session S3).
-- 1. ping_decide_campaign holds the decision body of ping_decide (173). Modes:
--    'generic' and 'shadow' as before; 'exchange_eval' decides like shadow (no
--    reservation, claim or delete) against engine_mode='generic' campaigns;
--    'exchange' reserves like generic. Exchange modes may evaluate a buyer
--    campaign in another tenant, only through an active exchange route. Hours,
--    pause, agents and reservations always belong to the campaign's own tenant.
--    ping_decide keeps its signature: it authenticates, resolves the campaign
--    within the source's own tenant, and delegates.
-- 2. exchange_sources, exchange_routes, exchange_auctions, and the exchange
--    columns on ping_campaigns.
-- 3. platform_price_plans and the append only platform_usage_events.
-- The per-source advisory lock in the decision body is unchanged (spec 7.3 is
-- deferred to the S8 load test by owner decision).
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_decisions DROP CONSTRAINT ping_decisions_engine_check;
ALTER TABLE public.ping_decisions ADD CONSTRAINT ping_decisions_engine_check
  CHECK (engine IN ('generic','shadow','exchange_eval','exchange'));
ALTER TABLE public.ping_decisions DROP CONSTRAINT ping_decisions_reason_check;
ALTER TABLE public.ping_decisions ADD CONSTRAINT ping_decisions_reason_check CHECK (reason IN (
  'routing_disabled','invalid_payload','source_paused','campaign_inactive',
  'outside_staffed_hours','state_not_allowed','missing_call_identity',
  'existing_client_retention','cooldown_same_source','cooldown_any_source',
  'repeat_shopper','daily_budget_reached','no_eligible_agent','all_eligible_busy',
  'accepted_full','accepted_partial','accepted_retention_owner','error_rejected',
  'exchange_no_buyer','buyer_cap_reached'));

ALTER TABLE public.ping_campaigns
  ADD COLUMN transfer_number text CHECK (transfer_number IS NULL OR transfer_number ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN exchange_daily_cap integer CHECK (exchange_daily_cap IS NULL OR exchange_daily_cap>=0),
  ADD COLUMN exchange_hourly_cap integer CHECK (exchange_hourly_cap IS NULL OR exchange_hourly_cap>=0);

-- One row per exchange publisher. rotation_state holds the smooth weighted
-- round robin current weight per campaign id for weighted_rotation.
CREATE TABLE public.exchange_sources (
  source_id uuid PRIMARY KEY REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'priority_waterfall'
    CHECK (strategy IN ('priority_waterfall','weighted_rotation','highest_price')),
  active boolean NOT NULL DEFAULT true,
  rotation_state jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(rotation_state)='object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER touch_exchange_sources BEFORE UPDATE ON public.exchange_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_ping_updated_at();

CREATE TABLE public.exchange_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  weight integer NOT NULL DEFAULT 1 CHECK (weight>=1),
  price_override numeric(10,2) CHECK (price_override IS NULL OR price_override>=0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id,campaign_id)
);
CREATE INDEX exchange_routes_campaign ON public.exchange_routes(campaign_id);

-- One row per exchange ping. candidates holds only campaign_id, decision_id,
-- available, reason and price per candidate; never a phone number.
CREATE TABLE public.exchange_auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms>=0),
  strategy text CHECK (strategy IS NULL OR strategy IN ('priority_waterfall','weighted_rotation','highest_price')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count>=0),
  winner_campaign_id uuid REFERENCES public.ping_campaigns(id),
  winner_decision_id uuid REFERENCES public.ping_decisions(id),
  reason text NOT NULL CHECK (reason IN ('accepted_full','accepted_partial','exchange_no_buyer')),
  candidates jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(candidates)='array'),
  CHECK ((winner_campaign_id IS NULL)=(reason='exchange_no_buyer')),
  CHECK ((winner_decision_id IS NULL)=(winner_campaign_id IS NULL))
);
CREATE INDEX exchange_auctions_source_time ON public.exchange_auctions(source_id,received_at DESC);
CREATE INDEX exchange_auctions_last_won ON public.exchange_auctions(source_id,winner_campaign_id,received_at DESC)
  WHERE winner_campaign_id IS NOT NULL;

-- Operator-defined plan per buyer tenant.
CREATE TABLE public.platform_price_plans (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
  included_pings integer NOT NULL DEFAULT 0 CHECK (included_pings>=0),
  overage_per_ping numeric(12,4) NOT NULL DEFAULT 0 CHECK (overage_per_ping>=0),
  per_routed_call numeric(12,4) NOT NULL DEFAULT 0 CHECK (per_routed_call>=0),
  per_screener_minute numeric(12,4) NOT NULL DEFAULT 0 CHECK (per_screener_minute>=0),
  effective_at timestamptz NOT NULL DEFAULT now()
);

-- Append only. unit_price is the plan price snapshot at write time.
CREATE TABLE public.platform_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind text NOT NULL CHECK (kind IN ('ping','routed_call','screener_minute','screened_qualified')),
  quantity numeric(12,4) NOT NULL CHECK (quantity>0),
  unit_price numeric(12,4) NOT NULL CHECK (unit_price>=0),
  source_id uuid REFERENCES public.lead_sources(id),
  campaign_id uuid REFERENCES public.ping_campaigns(id),
  ref_id text CHECK (ref_id IS NULL OR length(ref_id) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_usage_tenant_time ON public.platform_usage_events(tenant_id,kind,occurred_at DESC);
-- At most one event per kind and reference (one routed_call per call SID).
CREATE UNIQUE INDEX platform_usage_once ON public.platform_usage_events(kind,ref_id) WHERE ref_id IS NOT NULL;

CREATE FUNCTION public.platform_usage_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Platform usage events are append only'; END $$;
CREATE TRIGGER platform_usage_append_only BEFORE UPDATE OR DELETE ON public.platform_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.platform_usage_append_only();
CREATE TRIGGER platform_usage_no_truncate BEFORE TRUNCATE ON public.platform_usage_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.platform_usage_append_only();

-- Writes one usage event at the tenant's plan price. Pings are free inside the
-- plan's included_pings for the current UTC calendar month and charged at
-- overage_per_ping beyond it. No plan, or a plan not yet effective, prices 0.
CREATE FUNCTION public.platform_record_usage(p_tenant uuid,p_kind text,p_source uuid,p_campaign uuid,p_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan platform_price_plans; used numeric; unit numeric:=0; event_id uuid;
BEGIN
 -- Serialize one tenant's allowance count; other tenants are not blocked.
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-usage:'||p_tenant::text,0));
 SELECT * INTO plan FROM platform_price_plans WHERE tenant_id=p_tenant AND effective_at<=clock_timestamp();
 IF plan.tenant_id IS NOT NULL THEN
  IF p_kind='ping' THEN
   SELECT coalesce(sum(quantity),0) INTO used FROM platform_usage_events
    WHERE tenant_id=p_tenant AND kind='ping'
      AND occurred_at>=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   unit:=CASE WHEN used+1<=plan.included_pings THEN 0 ELSE plan.overage_per_ping END;
  ELSIF p_kind='routed_call' THEN unit:=plan.per_routed_call;
  ELSIF p_kind='screener_minute' THEN unit:=plan.per_screener_minute;
  END IF;
 END IF;
 INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price,source_id,campaign_id,ref_id)
 VALUES(p_tenant,p_kind,1,unit,p_source,p_campaign,p_ref)
 ON CONFLICT DO NOTHING RETURNING id INTO event_id;
 RETURN event_id;
END $$;

-- The decision body of ping_decide (173) for one campaign and one
-- authenticated source. Rule order and reasons are unchanged.
CREATE FUNCTION public.ping_decide_campaign(p_campaign_id uuid,p_source_id uuid,p_payload jsonb,p_mode text)
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
  price numeric; decision_id uuid; rule text; phone_hash text;
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

    IF decision IS NULL THEN
      -- Rules 8 to 12 are S4 filter rules; evaluated in order as no-ops.
      FOREACH rule IN ARRAY ARRAY['existing_client_retention','cooldown_same_source','cooldown_any_source','repeat_shopper','daily_budget_reached'] LOOP
        trace:=trace||jsonb_build_array(jsonb_build_object('rule',rule,'result','skipped'));
      END LOOP;

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
        -- Agents are shared across engines: a live legacy reservation also holds the agent.
        IF shadow THEN
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
        ELSE
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
          IF selected.agent_id IS NOT NULL THEN
            INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
              VALUES(owner_tenant,camp.id,key,state_code,selected.agent_id,
                clock_timestamp()+make_interval(secs=>camp.reservation_ttl_seconds));
          END IF;
        END IF;
      END IF;
      IF selected.agent_id IS NOT NULL THEN
        accepted:=true;
        decision:=CASE selected.tier WHEN 'full' THEN 'accepted_full' ELSE 'accepted_partial' END;
      ELSE
        decision:=CASE WHEN eligible_count>0 THEN 'all_eligible_busy' ELSE 'no_eligible_agent' END;
      END IF;
    END IF;
    IF accepted THEN price:=CASE camp.pricing_model WHEN 'free' THEN 0 ELSE camp.rate END; END IF;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule',decision,'result',CASE WHEN accepted THEN 'accept' ELSE 'reject' END));
  EXCEPTION WHEN OTHERS THEN
    -- Publisher pings fail closed. The subtransaction rolled back any reservation.
    decision:='error_rejected'; accepted:=false; price:=NULL;
    SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule','error_rejected','result','reject','sqlstate',SQLSTATE));
  END;

  -- An exchange evaluation never stores the caller's phone or ZIP; only the
  -- winning tenant's 'exchange' decision does. ping_phone_hash is defined in
  -- 176 with the exchange entry point, the only caller of this mode.
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
  RETURN jsonb_build_object('authorized',true,'decision_id',decision_id,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id,'price',price,
    'ttl_seconds',CASE WHEN accepted THEN camp.reservation_ttl_seconds END);
END;
$$;

-- ping_decide keeps its signature and behavior: authenticate, resolve the
-- campaign within the source's own tenant as in 172, then delegate.
CREATE OR REPLACE FUNCTION public.ping_decide(p_key_hash text,p_campaign text,p_payload jsonb,p_engine text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; camp_id uuid; campaign_ref text:=nullif(trim(p_campaign),'');
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
  RETURN public.ping_decide_campaign(camp_id,src.id,p_payload,p_engine);
END;
$$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['exchange_sources','exchange_routes','exchange_auctions','platform_price_plans','platform_usage_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.exchange_sources,public.exchange_routes,public.platform_price_plans TO service_role;
GRANT SELECT,INSERT ON public.exchange_auctions,public.platform_usage_events TO service_role;
REVOKE ALL ON FUNCTION public.platform_usage_append_only() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.platform_record_usage(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_decide_campaign(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_decide(text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ping_decide(text,text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
