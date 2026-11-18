-- UNAPPLIED: isolated pilot only
-- Generic publisher controls (spec sections 5, 7 and 8; session S2).
-- 1. admit_vendor: route vendorPing also authorizes any active publisher or
--    aggregator ping key while PING_PLATFORM_ENABLED is on. The availability
--    route and the deployment vendor (Paragon) branch are unchanged.
-- 2. ping_hours_open: any region based IANA zone (Area/Location) from the hours
--    jsonb. Aliases such as UTC or EST and POSIX strings stay closed, as before.
-- 3. ping_source_controls: per source and per campaign pause with an append
--    only audit. ping_decide treats a generic campaign as source_paused when the
--    tenant-wide pause is on OR a matching source or campaign row is paused.
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.admit_vendor(p_key_hash text,p_route text,p_limit integer DEFAULT 600) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_route NOT IN ('vendorPing','availability') THEN RAISE EXCEPTION 'Invalid vendor route'; END IF;
 IF NOT EXISTS(SELECT 1 FROM availability_consumers WHERE key_hash=p_key_hash AND active)
 AND NOT (p_route='vendorPing' AND EXISTS(SELECT 1 FROM lead_sources WHERE ping_key_hash=p_key_hash AND active AND name=deployment_vendor_name() AND type='publisher'))
 AND NOT (p_route='vendorPing' AND public.deployment_feature_enabled('PING_PLATFORM_ENABLED')
   AND EXISTS(SELECT 1 FROM lead_sources WHERE ping_key_hash=p_key_hash AND active AND type IN ('publisher','aggregator')))
 THEN RETURN jsonb_build_object('authorized',false); END IF;
 result:=consume_admission(jsonb_build_array(jsonb_build_object('key','vendor:'||p_route||':'||p_key_hash,'seconds',60,'limit',p_limit)));
 RETURN result||jsonb_build_object('authorized',true);
END $$;
REVOKE ALL ON FUNCTION public.admit_vendor(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_vendor(text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ping_hours_open(p_hours jsonb,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE zone text; local_at timestamp; day_config jsonb; opens time; closes time;
BEGIN
 zone:=p_hours->>'timezone';
 IF p_hours IS NULL OR p_at IS NULL OR zone IS NULL
 OR zone !~ '^[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2}$' THEN RETURN false; END IF;
 -- An unknown zone raises here and the handler below closes.
 local_at:=p_at AT TIME ZONE zone;
 day_config:=p_hours->'days'->((ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM local_at)::integer+1]);
 IF day_config->>'enabled' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 IF coalesce(day_config->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 OR coalesce(day_config->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
 opens:=(day_config->>'start')::time; closes:=(day_config->>'end')::time;
 RETURN opens<closes AND local_at::time>=opens AND local_at::time<closes;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.ping_hours_open(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ping_hours_open(jsonb,timestamptz) TO service_role;

-- One row per (tenant, source) with campaign_id null, and per (tenant, source,
-- campaign). Every write lands in the append only audit through a trigger.
CREATE TABLE public.ping_source_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  paused boolean NOT NULL DEFAULT false,
  changed_by text NOT NULL CHECK (length(changed_by) BETWEEN 1 AND 128),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX ping_source_controls_scope ON public.ping_source_controls
  (tenant_id,source_id,coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.ping_source_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL,
  campaign_id uuid,
  paused boolean NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ping_source_control_audit_scope ON public.ping_source_control_audit(tenant_id,source_id,changed_at DESC);

CREATE FUNCTION public.check_ping_source_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM lead_sources WHERE id=NEW.source_id AND tenant_id=NEW.tenant_id)
 OR (NEW.campaign_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ping_campaigns
   WHERE id=NEW.campaign_id AND source_id=NEW.source_id AND tenant_id=NEW.tenant_id))
 THEN RAISE EXCEPTION 'Ping source control scope mismatch'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.source_id,NEW.campaign_id) IS DISTINCT FROM (OLD.tenant_id,OLD.source_id,OLD.campaign_id)
 THEN RAISE EXCEPTION 'Ping source control scope is immutable'; END IF;
 NEW.changed_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER check_ping_source_control BEFORE INSERT OR UPDATE ON public.ping_source_controls
  FOR EACH ROW EXECUTE FUNCTION public.check_ping_source_control();

CREATE FUNCTION public.audit_ping_source_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r ping_source_controls;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 INSERT INTO ping_source_control_audit(control_id,tenant_id,source_id,campaign_id,paused,operation,changed_by)
 VALUES(r.id,r.tenant_id,r.source_id,r.campaign_id,r.paused,TG_OP,r.changed_by);
 RETURN NULL;
END $$;
CREATE TRIGGER audit_ping_source_control AFTER INSERT OR UPDATE OR DELETE ON public.ping_source_controls
  FOR EACH ROW EXECUTE FUNCTION public.audit_ping_source_control();

CREATE FUNCTION public.ping_audit_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Ping audit is append only'; END $$;
CREATE TRIGGER ping_source_control_audit_append_only BEFORE UPDATE OR DELETE ON public.ping_source_control_audit
  FOR EACH ROW EXECUTE FUNCTION public.ping_audit_append_only();
CREATE TRIGGER ping_source_control_audit_no_truncate BEFORE TRUNCATE ON public.ping_source_control_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.ping_audit_append_only();

-- Operator entry point. p_campaign null pauses or resumes the whole source.
CREATE FUNCTION public.set_ping_source_control(p_tenant uuid,p_source uuid,p_campaign uuid,p_paused boolean,p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE control_id uuid;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RAISE EXCEPTION 'Ping platform disabled'; END IF;
 IF p_tenant IS NULL OR p_source IS NULL OR p_paused IS NULL OR nullif(trim(p_actor),'') IS NULL
 THEN RAISE EXCEPTION 'Invalid ping source control'; END IF;
 UPDATE ping_source_controls SET paused=p_paused,changed_by=left(trim(p_actor),128)
  WHERE tenant_id=p_tenant AND source_id=p_source AND campaign_id IS NOT DISTINCT FROM p_campaign
  RETURNING id INTO control_id;
 IF control_id IS NULL THEN
  INSERT INTO ping_source_controls(tenant_id,source_id,campaign_id,paused,changed_by)
  VALUES(p_tenant,p_source,p_campaign,p_paused,left(trim(p_actor),128)) RETURNING id INTO control_id;
 END IF;
 RETURN control_id;
END $$;

-- ping_decide as in 172; only the source_paused rule changes.
CREATE OR REPLACE FUNCTION public.ping_decide(p_key_hash text,p_campaign text,p_payload jsonb,p_engine text)
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
        -- Tenant-wide pause, or a source-level or campaign-level row (173).
        IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR EXISTS(SELECT 1 FROM ping_source_controls p
          WHERE p.tenant_id=src.tenant_id AND p.source_id=src.id AND p.paused
            AND (p.campaign_id IS NULL OR p.campaign_id=camp.id)) THEN decision:='source_paused';
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

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ping_source_controls','ping_source_control_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ping_source_controls TO service_role;
GRANT SELECT,INSERT ON public.ping_source_control_audit TO service_role;
REVOKE ALL ON FUNCTION public.check_ping_source_control() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.audit_ping_source_control() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_audit_append_only() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_ping_source_control(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ping_decide(text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_ping_source_control(uuid,uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_decide(text,text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
