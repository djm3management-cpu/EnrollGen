BEGIN;

CREATE OR REPLACE FUNCTION public.paragon_ping(
  p_key_hash text,p_state text,p_phone text DEFAULT NULL,p_call_id text DEFAULT NULL,
  p_routing_enabled boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; cfg vendor_routing_config; ctl vendor_controls;
  local_now timestamp; day_cfg jsonb; staffed boolean:=true;
  state_code text:=upper(trim(coalesce(p_state,''))); key text;
  existing paragon_agent_reservations; selected record; eligible_count integer;
  decision text; accepted boolean:=false;
BEGIN
  SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
  SELECT * INTO src FROM lead_sources WHERE name='Paragon Media' AND type='publisher' AND active
    AND (ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers
      WHERE name='Paragon Media' AND active AND key_hash=p_key_hash)) LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
  DELETE FROM paragon_agent_reservations WHERE expires_at<clock_timestamp()-interval '1 day';
  SELECT * INTO cfg FROM vendor_routing_config WHERE source_id=src.id;
  SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=src.tenant_id;
  key:=CASE WHEN nullif(trim(p_call_id),'') IS NOT NULL THEN 'id:'||left(trim(p_call_id),128)
    WHEN nullif(trim(p_phone),'') IS NOT NULL THEN 'phone:'||left(trim(p_phone),32) ELSE NULL END;
  IF ctl.staffed_hours IS NOT NULL THEN
    local_now:=clock_timestamp() AT TIME ZONE coalesce(ctl.staffed_hours->>'timezone','America/New_York');
    day_cfg:=ctl.staffed_hours->'days'->lower(to_char(local_now,'Dy'));
    IF day_cfg->>'enabled' IS NOT NULL THEN
      staffed:=(day_cfg->>'enabled')::boolean AND local_now::time>=(day_cfg->>'start')::time
        AND local_now::time<(day_cfg->>'end')::time;
    END IF;
  END IF;
  IF NOT p_routing_enabled THEN decision:='routing_disabled';
  ELSIF coalesce(ctl.vendor_pause,false) THEN decision:='vendor_paused';
  ELSIF NOT staffed THEN decision:='outside_staffed_hours';
  ELSIF cfg.source_id IS NULL THEN decision:='routing_unconfigured';
  ELSIF state_code='' OR NOT state_code=ANY(cfg.allowed_states) THEN decision:='state_not_allowed';
  ELSIF key IS NULL THEN decision:='missing_call_identity';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(src.id::text||key,0));
    SELECT * INTO existing FROM paragon_agent_reservations
      WHERE source_id=src.id AND reservation_key=key FOR UPDATE;
    IF existing.id IS NOT NULL AND existing.expires_at>clock_timestamp()
      AND existing.consumed_call_sid IS NULL AND existing.caller_state=state_code
      AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=existing.agent_id
        AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
      SELECT existing.agent_id AS agent_id,
        public.paragon_agent_tier(existing.agent_id,state_code,src.id) AS tier INTO selected;
      IF selected.tier NOT IN ('full','partial') THEN selected:=NULL; END IF;
    END IF;
    IF selected.agent_id IS NULL THEN
      DELETE FROM paragon_agent_reservations WHERE source_id=src.id AND reservation_key=key;
      SELECT count(*) INTO eligible_count FROM agent_availability a
        WHERE public.paragon_agent_tier(a.agent_id,state_code,src.id) IN ('full','partial');
      SELECT a.agent_id,public.paragon_agent_tier(a.agent_id,state_code,src.id) AS tier
        INTO selected FROM agent_availability a
        WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
          AND public.paragon_agent_tier(a.agent_id,state_code,src.id) IN ('full','partial')
          AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r
            WHERE r.agent_id=a.agent_id AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
        ORDER BY CASE public.paragon_agent_tier(a.agent_id,state_code,src.id)
          WHEN 'full' THEN 0 ELSE 1 END,a.last_assigned_at ASC NULLS FIRST,a.agent_id
        FOR UPDATE OF a SKIP LOCKED LIMIT 1;
      IF selected.agent_id IS NOT NULL THEN
        INSERT INTO paragon_agent_reservations(source_id,reservation_key,caller_state,agent_id,expires_at)
          VALUES(src.id,key,state_code,selected.agent_id,
            clock_timestamp()+make_interval(secs=>cfg.reservation_ttl_seconds));
      END IF;
    END IF;
    IF selected.agent_id IS NOT NULL THEN
      accepted:=true;
      decision:=CASE selected.tier WHEN 'full' THEN 'accepted_full' ELSE 'accepted_partial' END;
    ELSE
      decision:=CASE WHEN eligible_count>0 THEN 'all_eligible_busy' ELSE 'no_eligible_agent' END;
    END IF;
  END IF;
  INSERT INTO paragon_ping_decisions(source_id,caller_state,caller_phone,vendor_call_id,available,reason,agent_id)
    VALUES(src.id,nullif(state_code,''),nullif(p_phone,''),nullif(p_call_id,''),accepted,decision,selected.agent_id);
  RETURN jsonb_build_object('authorized',true,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_paragon_call(
  p_call_sid text,p_phone text,p_call_id text DEFAULT NULL,p_exclude text[] DEFAULT '{}',
  p_preferred_agent_id text DEFAULT NULL,p_routing_enabled boolean DEFAULT false
) RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; ping paragon_ping_decisions; reserved paragon_agent_reservations;
  selected_id text; selected_tier text; preferred_tier text;
  ctl vendor_controls; cfg vendor_routing_config; local_now timestamp; day_cfg jsonb;
BEGIN
  IF NOT p_routing_enabled OR nullif(p_call_sid,'') IS NULL THEN RETURN; END IF;
  SELECT * INTO src FROM lead_sources WHERE name='Paragon Media' AND type='publisher' AND active LIMIT 1;
  IF src.id IS NULL THEN RETURN; END IF;
  SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=src.tenant_id;
  IF coalesce(ctl.vendor_pause,false) THEN RETURN; END IF;
  IF ctl.staffed_hours IS NOT NULL THEN
    local_now:=clock_timestamp() AT TIME ZONE coalesce(ctl.staffed_hours->>'timezone','America/New_York');
    day_cfg:=ctl.staffed_hours->'days'->lower(to_char(local_now,'Dy'));
    IF day_cfg->>'enabled' IS NOT NULL AND NOT ((day_cfg->>'enabled')::boolean
      AND local_now::time>=(day_cfg->>'start')::time AND local_now::time<(day_cfg->>'end')::time) THEN RETURN; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid,0));
  RETURN QUERY SELECT a.agent_id,a.agent_name,i.caller_state,'existing'::text,i.aggregator_call_id
    FROM agent_availability a JOIN inbound_calls i ON i.twilio_call_sid=p_call_sid
    WHERE a.active_call_sid=p_call_sid AND i.caller_state IS NOT NULL LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  SELECT * INTO ping FROM paragon_ping_decisions d WHERE d.source_id=src.id AND d.available
    AND (d.matched_call_sid IS NULL OR d.matched_call_sid=p_call_sid)
    AND d.received_at>=clock_timestamp()-interval '5 minutes'
    AND ((nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id)
      OR (nullif(p_phone,'') IS NOT NULL AND d.caller_phone=p_phone
        AND (nullif(p_call_id,'') IS NULL OR d.vendor_call_id IS NULL)))
    ORDER BY (d.vendor_call_id=p_call_id) DESC NULLS LAST,d.received_at DESC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF ping.id IS NULL OR ping.caller_state IS NULL THEN RETURN; END IF;
  SELECT * INTO cfg FROM vendor_routing_config WHERE source_id=src.id;
  IF cfg.source_id IS NULL OR NOT ping.caller_state=ANY(cfg.allowed_states) THEN RETURN; END IF;
  SELECT * INTO reserved FROM paragon_agent_reservations r WHERE r.source_id=src.id
    AND r.reservation_key=CASE WHEN ping.vendor_call_id IS NOT NULL THEN 'id:'||ping.vendor_call_id
      ELSE 'phone:'||ping.caller_phone END AND r.expires_at>clock_timestamp()
    AND r.consumed_call_sid IS NULL FOR UPDATE;
  -- A reserved agent is used only while still routable and eligible.
  IF reserved.id IS NOT NULL AND reserved.agent_id<>ALL(coalesce(p_exclude,'{}'))
    AND public.paragon_agent_tier(reserved.agent_id,ping.caller_state,src.id) IN ('full','partial')
    AND (public.paragon_agent_tier(reserved.agent_id,ping.caller_state,src.id)='full'
      OR NOT EXISTS(SELECT 1 FROM agent_availability f
        WHERE public.agent_inbound_routable(f.agent_id,f.status,f.available,f.active_call_sid)
          AND public.paragon_agent_tier(f.agent_id,ping.caller_state,src.id)='full'
          AND f.agent_id<>ALL(coalesce(p_exclude,'{}'))))
    AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=reserved.agent_id
      AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
    selected_id:=reserved.agent_id; claim_path:='reserved';
  ELSE
    preferred_tier:=public.paragon_agent_tier(p_preferred_agent_id,ping.caller_state,src.id);
    SELECT a.agent_id,public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id)
      INTO selected_id,selected_tier FROM agent_availability a
      WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
        AND a.agent_id<>ALL(coalesce(p_exclude,'{}'))
        AND public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id) IN ('full','partial')
        AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
          AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.id IS DISTINCT FROM reserved.id)
      ORDER BY CASE public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id)
        WHEN 'full' THEN 0 ELSE 1 END,
        CASE WHEN a.agent_id=p_preferred_agent_id THEN 0 ELSE 1 END,
        a.last_assigned_at ASC NULLS FIRST,a.agent_id
      FOR UPDATE OF a SKIP LOCKED LIMIT 1;
    claim_path:=CASE WHEN selected_id=p_preferred_agent_id AND preferred_tier=selected_tier
      THEN 'preferred' ELSE 'round_robin' END;
  END IF;
  IF selected_id IS NULL THEN
    RETURN QUERY SELECT NULL::text,NULL::text,ping.caller_state,'rejected'::text,ping.vendor_call_id;
    RETURN;
  END IF;
  RETURN QUERY UPDATE agent_availability a
    SET active_call_sid=p_call_sid,resume_status=a.status,status='busy',available=false,
      last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
    WHERE a.agent_id=selected_id AND a.active_call_sid IS NULL
    RETURNING a.agent_id,a.agent_name,ping.caller_state,claim_path,ping.vendor_call_id;
  IF FOUND THEN
    UPDATE paragon_ping_decisions SET matched_call_sid=p_call_sid WHERE id=ping.id;
    UPDATE paragon_agent_reservations SET consumed_call_sid=p_call_sid WHERE id=reserved.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.paragon_ping(text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_paragon_call(text,text,text,text[],text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paragon_ping(text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_paragon_call(text,text,text,text[],text,boolean) TO service_role;
COMMIT;
