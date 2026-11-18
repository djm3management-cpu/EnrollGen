-- UNAPPLIED: isolated pilot only
-- Generic ping engine (spec section 7).
-- Rules 1 to 7 and 13 to 16 reproduce paragon_ping as defined in migration 067.
-- Legacy reasons map as: vendor_paused and controls_missing to source_paused,
-- routing_unconfigured to campaign_inactive. The legacy hard daily cap is not
-- mirrored; rule 12 (daily_budget_reached) owns budgets from S3 on.
-- Rule order follows paragon_ping: staffed hours are checked before the
-- campaign. Rules 8 to 12 are evaluated in order but are no-ops in S1.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Copy of paragon_hours_open so the generic engine does not depend on the
-- legacy routine that is removed after cutover.
CREATE FUNCTION public.ping_hours_open(p_hours jsonb,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE local_at timestamp; day_config jsonb; opens time; closes time;
BEGIN
 IF p_hours IS NULL OR p_at IS NULL OR p_hours->>'timezone' IS DISTINCT FROM 'America/New_York' THEN RETURN false; END IF;
 local_at:=p_at AT TIME ZONE 'America/New_York';
 day_config:=p_hours->'days'->((ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM local_at)::integer+1]);
 IF day_config->>'enabled' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 IF coalesce(day_config->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 OR coalesce(day_config->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
 opens:=(day_config->>'start')::time; closes:=(day_config->>'end')::time;
 RETURN opens<closes AND local_at::time>=opens AND local_at::time<closes;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

-- Same tier semantics as paragon_agent_tier, reading carrier rows.
CREATE FUNCTION public.ping_agent_tier(p_agent_id text,p_state text,p_campaign_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH cfg AS (SELECT * FROM ping_campaigns WHERE id=p_campaign_id),
  matrix AS (SELECT e.carrier,e.enabled FROM agent_campaign_carriers e
    JOIN tenant_agents a ON a.id=e.agent_id
    JOIN cfg ON cfg.id=e.campaign_id AND cfg.plan_year=e.plan_year AND cfg.tenant_id=e.tenant_id
    WHERE e.state=p_state AND a.agent_slug=p_agent_id AND a.is_active AND a.tenant_id=cfg.tenant_id),
  missing AS (SELECT c.carrier FROM cfg CROSS JOIN LATERAL unnest(cfg.required_carriers) c(carrier)
    WHERE NOT EXISTS (SELECT 1 FROM matrix m WHERE m.enabled AND m.carrier=c.carrier))
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cfg) OR NOT EXISTS(SELECT 1 FROM matrix) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing m CROSS JOIN cfg WHERE m.carrier=ANY(cfg.critical_carriers)) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing) THEN 'partial' ELSE 'full' END;
$$;

CREATE FUNCTION public.ping_decide(p_key_hash text,p_campaign text,p_payload jsonb,p_engine text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; camp ping_campaigns; ctl vendor_controls;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); shadow boolean:=p_engine='shadow';
  phone text; state_code text:=''; call_id text; zip text; sub_id text; consent text; t65 boolean;
  routing boolean; valid boolean:=true; key text; campaign_ref text:=nullif(trim(p_campaign),'');
  existing ping_reservations; selected record; eligible_count integer:=0; committed ping_decisions;
  decision text; accepted boolean:=false; trace jsonb:='[]'::jsonb; gate_at timestamptz;
  price numeric; decision_id uuid; rule text;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_engine IS NULL OR p_engine NOT IN ('generic','shadow') THEN RAISE EXCEPTION 'Invalid ping engine'; END IF;
  SELECT s.* INTO src FROM lead_sources s WHERE s.active AND s.type IN ('publisher','aggregator')
    AND (s.ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers c
      WHERE c.name=s.name AND c.active AND c.key_hash=p_key_hash))
    ORDER BY (s.ping_key_hash=p_key_hash) DESC NULLS LAST LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
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

    -- Campaign: explicit id or name, else the source's single active campaign.
    IF campaign_ref IS NOT NULL THEN
      SELECT * INTO camp FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id
        AND (id::text=campaign_ref OR name=campaign_ref) ORDER BY (id::text=campaign_ref) DESC LIMIT 1;
    ELSIF (SELECT count(*) FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active)=1 THEN
      SELECT * INTO camp FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active;
    END IF;
    routing:=routing AND (camp.id IS NULL OR camp.engine_mode=p_engine);
    SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=src.tenant_id;

    -- Serialize a source's decisions, as paragon_ping does.
    PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||src.id::text,0));
    gate_at:=clock_timestamp();
    IF NOT shadow THEN DELETE FROM ping_reservations WHERE expires_at<clock_timestamp()-interval '1 day'; END IF;

    IF NOT routing THEN decision:='routing_disabled';
    ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','routing_disabled','result','pass'));
      IF NOT valid THEN decision:='invalid_payload';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','pass'));
        IF ctl.tenant_id IS NULL OR ctl.vendor_pause THEN decision:='source_paused';
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','source_paused','result','pass')); END IF;
      END IF;
    END IF;

    -- The 30 second accepted commitment: a re-ping for the same identity and
    -- state replays the committed decision without re-checking hours.
    IF decision IS NULL AND camp.id IS NOT NULL THEN
      SELECT * INTO committed FROM ping_decisions d WHERE d.source_id=src.id AND d.campaign_id=camp.id
        AND d.engine=p_engine AND d.available AND d.matched_call_sid IS NULL
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
      -- Rules 8 to 12 are S3 filter rules; evaluated in order as no-ops.
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
              VALUES(src.tenant_id,camp.id,key,state_code,selected.agent_id,
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

  INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
    vendor_call_id,publisher_sub_id,consent_cert_id,t65_flag,available,reason,agent_id,price,rule_trace,engine)
  VALUES(src.tenant_id,src.id,camp.id,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
    left(phone,32),nullif(left(state_code,8),''),CASE WHEN zip ~ '^[0-9]{5}$' THEN zip END,
    call_id,sub_id,consent,t65,accepted,decision,selected.agent_id,price,trace,p_engine)
  RETURNING id INTO decision_id;
  RETURN jsonb_build_object('authorized',true,'decision_id',decision_id,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id,'price',price,
    'ttl_seconds',CASE WHEN accepted THEN camp.reservation_ttl_seconds END);
END;
$$;

REVOKE ALL ON FUNCTION public.ping_hours_open(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_agent_tier(text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_decide(text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ping_hours_open(jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_agent_tier(text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_decide(text,text,jsonb,text) TO service_role;

-- Pilot seed: Paragon becomes campaign one in legacy mode. Inserts nothing when
-- the Paragon source or its routing config is absent. New rule fields stay null.
INSERT INTO public.ping_campaigns(tenant_id,source_id,name,product_line,active,engine_mode,allowed_states,
  required_carriers,critical_carriers,plan_year,pricing_model,rate,billable_seconds,reservation_ttl_seconds,retention_mode)
SELECT s.tenant_id,s.id,'default','ma',true,'legacy',c.allowed_states,c.required_carriers,c.critical_carriers,
  c.plan_year,'per_call',ctl.paragon_rate,90,c.reservation_ttl_seconds,'route_owner'
FROM public.lead_sources s JOIN public.vendor_routing_config c ON c.source_id=s.id
LEFT JOIN public.vendor_controls ctl ON ctl.tenant_id=s.tenant_id
WHERE s.name='Paragon Media' AND s.type='publisher'
ON CONFLICT (tenant_id,source_id,name) DO NOTHING;

INSERT INTO public.agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,enabled,updated_by)
SELECT p.tenant_id,p.id,e.plan_year,e.agent_id,e.state,v.carrier,true,'migration-172'
FROM public.ping_campaigns p
JOIN public.lead_sources s ON s.id=p.source_id AND s.name='Paragon Media' AND s.type='publisher'
JOIN public.vendor_agent_state_eligibility e ON e.source_id=p.source_id
CROSS JOIN LATERAL (VALUES ('aetna',e.aetna),('humana',e.humana),('uhc',e.uhc),
  ('wellcare',e.wellcare),('devoted',e.devoted),('healthspring',e.healthspring)) v(carrier,enabled)
WHERE p.name='default' AND v.enabled
ON CONFLICT DO NOTHING;

NOTIFY pgrst,'reload schema';
COMMIT;
