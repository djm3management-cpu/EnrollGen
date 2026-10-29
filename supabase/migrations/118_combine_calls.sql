-- Run this entire file in Supabase SQL Editor before deploying the feature.
BEGIN;

ALTER TABLE public.call_records ADD COLUMN parent_call_id uuid
  REFERENCES public.call_records(id) ON DELETE SET NULL;
ALTER TABLE public.call_records ADD CONSTRAINT call_records_not_own_parent
  CHECK (parent_call_id IS DISTINCT FROM id);
CREATE INDEX call_records_parent_call_idx ON public.call_records(parent_call_id)
  WHERE parent_call_id IS NOT NULL;

-- Extend the existing CRM activity trail; no recording or transcript is copied.
ALTER TABLE public.contact_activities ADD COLUMN actor_clerk_user_id text;
ALTER TABLE public.contact_activities ADD COLUMN call_action_details jsonb;
-- A call without a contact still needs a tenant-scoped audit event.
ALTER TABLE public.contact_activities ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE public.contact_activities ADD CONSTRAINT call_action_contact_required
  CHECK (contact_id IS NOT NULL OR coalesce(type='call' AND call_action_details->>'action' IN ('combine','uncombine'),false));

-- Preserve 066's authoritative identity/duration model, including orphan calls.
ALTER VIEW public.v_call_log RENAME TO v_call_log_entries;
CREATE VIEW public.v_call_combine_facts WITH (security_invoker=true) AS
SELECT c.id,c.tenant_id,c.parent_call_id,c.contact_id,
  coalesce(c.call_start,c.created_at) AS occurred_at,
  (SELECT max(r.recording_duration_seconds) FROM public.recording_ingestion r
    WHERE r.tenant_id=c.tenant_id AND r.provider_status='completed'
      AND (r.call_record_id=c.id OR EXISTS (
        SELECT 1 FROM public.inbound_calls i WHERE i.call_record_id=c.id
          AND i.tenant_id=c.tenant_id AND i.id=r.inbound_call_id)
        OR EXISTS (SELECT 1 FROM public.telephony_call_attempts a
          WHERE a.call_record_id=c.id AND a.tenant_id=c.tenant_id AND a.id=r.attempt_id))) AS recording_seconds,
  (SELECT sum(a.talk_seconds)::integer FROM public.telephony_call_attempts a
    WHERE a.tenant_id=c.tenant_id AND a.status IN ('completed','canceled','failed','busy','no-answer')
      AND (a.call_record_id=c.id OR EXISTS (SELECT 1 FROM public.inbound_calls i
        WHERE i.call_record_id=c.id AND i.tenant_id=c.tenant_id AND i.id=a.inbound_call_id))) AS talk_seconds
FROM public.call_records c;

CREATE VIEW public.v_call_log WITH (security_invoker=true) AS
SELECT e.log_id,e.call_record_id,e.inbound_call_id,e.tenant_id,e.occurred_at,e.direction,
  e.contact_id,e.contact_name,e.contact_phone,
  CASE WHEN children.n>0 THEN coalesce(f.talk_seconds,0)+coalesce(children.talk,0)
    ELSE e.duration_seconds END::integer AS duration_seconds,
  e.agent,e.disposition,e.recording_url,e.recording_storage_path,e.compliance_score,
  e.transcript_preview,e.agent_notes,e.attempt_id,
  f.talk_seconds AS original_talk_seconds,children.n::integer AS combined_count
FROM public.v_call_log_entries e
LEFT JOIN public.v_call_combine_facts f ON f.id=e.call_record_id AND f.tenant_id=e.tenant_id
LEFT JOIN LATERAL (
  SELECT count(*) AS n,sum(child.talk_seconds)::integer AS talk
  FROM public.v_call_combine_facts child WHERE child.parent_call_id=e.call_record_id AND child.tenant_id=e.tenant_id
) children ON true
WHERE f.parent_call_id IS NULL;

-- Also exclude children from the existing SQL reporting/search views. Keep their
-- established columns, joins, grants and security_invoker options unchanged.
DO $$
DECLARE view_name text; definition text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['v_enrollment_summary','v_agent_performance',
    'v_compliance_overview','v_pipeline_status','v_daily_activity'] LOOP
    IF to_regclass('public.'||view_name) IS NOT NULL THEN
      definition:=pg_get_viewdef(to_regclass('public.'||view_name),true);
      definition:=regexp_replace(definition,'FROM (public\.)?call_records cr',
        'FROM (SELECT * FROM public.call_records WHERE parent_call_id IS NULL) cr','g');
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',view_name,definition);
    END IF;
  END LOOP;
END $$;

-- Parent links may only be changed by the service transaction, never a browser
-- update. Enforce same-tenant links and one level even for other service writers.
CREATE FUNCTION public.guard_call_parent() RETURNS trigger LANGUAGE plpgsql
SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.parent_call_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.parent_call_id IS NOT DISTINCT FROM OLD.parent_call_id THEN RETURN NEW; END IF;
  -- Let the FK restore children when their parent is deleted.
  IF pg_trigger_depth()>1 AND NEW.parent_call_id IS NULL THEN RETURN NEW; END IF;
  IF current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION 'Use the combine calls service'; END IF;
  IF NEW.parent_call_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,118));
    IF NOT EXISTS (SELECT 1 FROM call_records p WHERE p.id=NEW.parent_call_id
      AND p.tenant_id=NEW.tenant_id AND p.parent_call_id IS NULL AND p.id<>NEW.id)
      OR EXISTS (SELECT 1 FROM call_records child WHERE child.parent_call_id=NEW.id) THEN
      RAISE EXCEPTION 'Invalid call parent';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_call_parent BEFORE INSERT OR UPDATE OF parent_call_id ON public.call_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_call_parent();

-- Service-only RPC; the endpoint supplies a verified Clerk subject and tenant.
-- The tenant lock serializes combine/uncombine, including overlapping groups.
CREATE FUNCTION public.combine_call_records(p_tenant_id uuid,p_actor text,p_admin boolean,
  p_action text,p_first uuid,p_second uuid,p_confirm_different boolean DEFAULT false,
  p_expected_primary uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_call call_records; second_call call_records; primary_id uuid; child_id uuid;
  affected uuid[]; subject_slug text; actor_agent uuid; activity_contact uuid;
BEGIN
  IF p_action NOT IN ('preview','combine','uncombine') OR p_first=p_second THEN
    RAISE EXCEPTION 'Invalid call selection' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,118));
  SELECT * INTO first_call FROM call_records WHERE id=p_first AND tenant_id=p_tenant_id FOR UPDATE;
  SELECT * INTO second_call FROM call_records WHERE id=p_second AND tenant_id=p_tenant_id FOR UPDATE;
  IF first_call.id IS NULL OR second_call.id IS NULL THEN
    RAISE EXCEPTION 'Call unavailable' USING ERRCODE='42501';
  END IF;
  SELECT id INTO actor_agent FROM enrolled_agents WHERE tenant_id=p_tenant_id
    AND clerk_user_id=p_actor AND is_active=true;
  SELECT agent_slug INTO subject_slug FROM recording_agent_subjects
    WHERE tenant_id=p_tenant_id AND clerk_user_id=p_actor;
  SELECT array_agg(id ORDER BY id) INTO affected FROM call_records WHERE tenant_id=p_tenant_id
    AND (id IN (p_first,p_second) OR parent_call_id IN (p_first,p_second));
  IF NOT p_admin AND (actor_agent IS NULL OR EXISTS (
    SELECT 1 FROM call_records c WHERE c.id=ANY(affected) AND (
      EXISTS (SELECT 1 FROM telephony_call_attempts a WHERE a.call_record_id=c.id
        AND a.tenant_id=p_tenant_id AND a.agent_id IS DISTINCT FROM subject_slug)
      OR NOT (EXISTS (SELECT 1 FROM sessions s WHERE s.id=c.session_id
        AND s.call_record_id=c.id AND s.tenant_id=p_tenant_id AND s.agent_id=actor_agent)
        OR (c.session_id IS NULL AND EXISTS (SELECT 1 FROM telephony_call_attempts a
          WHERE a.call_record_id=c.id AND a.tenant_id=p_tenant_id AND a.agent_id=subject_slug))))
  )) THEN RAISE EXCEPTION 'Call unavailable for this agent' USING ERRCODE='42501'; END IF;

  IF p_action='uncombine' THEN
    IF first_call.parent_call_id IS NOT NULL OR second_call.parent_call_id IS DISTINCT FROM p_first THEN
      RAISE EXCEPTION 'Calls changed; reload before uncombining' USING ERRCODE='22023';
    END IF;
    primary_id:=p_first; child_id:=p_second; affected:=ARRAY[p_first,p_second];
    UPDATE call_records SET parent_call_id=NULL WHERE id=child_id;
  ELSE
    IF first_call.parent_call_id IS NOT NULL OR second_call.parent_call_id IS NOT NULL THEN
      RAISE EXCEPTION 'Calls changed; reload before combining' USING ERRCODE='22023';
    END IF;
    -- Missing either recording falls back to measured talk, then earlier call.
    SELECT f.id INTO primary_id FROM v_call_combine_facts f WHERE f.id IN (p_first,p_second)
      ORDER BY CASE WHEN (SELECT count(recording_seconds) FROM v_call_combine_facts
        WHERE id IN (p_first,p_second))=2 THEN f.recording_seconds ELSE NULL END DESC NULLS LAST,
        f.talk_seconds DESC NULLS LAST,f.occurred_at ASC NULLS LAST,f.id LIMIT 1;
    child_id:=CASE WHEN primary_id=p_first THEN p_second ELSE p_first END;
    IF p_action='preview' THEN
      RETURN jsonb_build_object('primary_id',primary_id,'child_id',child_id,
        'different_contacts',first_call.contact_id IS DISTINCT FROM second_call.contact_id,
        'calls',(SELECT jsonb_agg(coalesce(to_jsonb(e),'{}'::jsonb)||jsonb_build_object(
          'call_record_id',c.id,'log_id',coalesce(e.log_id,'cr-'||c.id),
          'occurred_at',coalesce(e.occurred_at,c.call_start,c.created_at),
          'agent',coalesce(e.agent,c.writing_agent,c.agent_name::text),
          'disposition',e.disposition,'call_outcome',c.call_outcome,
          'recording_seconds',f.recording_seconds,'original_talk_seconds',f.talk_seconds))
          FROM call_records c JOIN v_call_combine_facts f ON f.id=c.id
          LEFT JOIN LATERAL (SELECT * FROM v_call_log_entries entry
            WHERE entry.call_record_id=c.id AND entry.tenant_id=c.tenant_id
            ORDER BY entry.occurred_at,entry.log_id LIMIT 1) e ON true
          WHERE c.tenant_id=p_tenant_id AND c.id IN (p_first,p_second)));
    END IF;
    IF p_expected_primary IS DISTINCT FROM primary_id THEN
      RAISE EXCEPTION 'Call durations changed; review the calls again' USING ERRCODE='22023';
    END IF;
    IF first_call.contact_id IS DISTINCT FROM second_call.contact_id AND NOT p_confirm_different THEN
      RAISE EXCEPTION 'Confirm different contacts before combining' USING ERRCODE='22023';
    END IF;
    -- Re-parent children first so the final update never creates a chain.
    UPDATE call_records SET parent_call_id=primary_id WHERE tenant_id=p_tenant_id AND parent_call_id=child_id;
    UPDATE call_records SET parent_call_id=primary_id WHERE id=child_id;
  END IF;
  FOR activity_contact IN SELECT DISTINCT contact_id FROM call_records
    WHERE id=ANY(affected) LOOP
    INSERT INTO contact_activities(tenant_id,contact_id,type,ref_id,summary,actor_clerk_user_id,call_action_details)
      VALUES(p_tenant_id,activity_contact,'call',primary_id,
        CASE WHEN p_action='combine' THEN 'Combined calls' ELSE 'Uncombined call' END,
        p_actor,jsonb_build_object('action',p_action,'primary_call_id',primary_id,'child_call_id',child_id,
          'affected_call_ids',affected));
  END LOOP;
  RETURN jsonb_build_object('primary_id',primary_id,'child_id',child_id);
END $$;

REVOKE ALL ON public.v_call_log,public.v_call_log_entries,public.v_call_combine_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_call_log,public.v_call_log_entries,public.v_call_combine_facts TO service_role;
REVOKE ALL ON FUNCTION public.combine_call_records(uuid,text,boolean,text,uuid,uuid,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combine_call_records(uuid,text,boolean,text,uuid,uuid,boolean,uuid) TO service_role;
COMMIT;
