-- Soft deletion and retained stage colors. No automation triggers/actions.
-- Migration 060 is reserved for DSNP; 061 is the source-label reader.
BEGIN;

ALTER TABLE public.opportunities
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.tenant_agents(id),
  ADD CONSTRAINT opportunities_delete_metadata CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
CREATE INDEX opportunities_active_board ON public.opportunities(tenant_id,pipeline_id,stage_id)
  WHERE deleted_at IS NULL;
CREATE INDEX opportunities_active_contact ON public.opportunities(tenant_id,contact_id)
  WHERE deleted_at IS NULL;
GRANT SELECT (deleted_at,deleted_by) ON public.opportunities TO authenticated;
ALTER POLICY opportunities_tenant_access ON public.opportunities
  USING (deleted_at IS NULL AND public.opportunities_is_tenant(tenant_id));

ALTER TABLE public.opportunity_stage_history
  ADD COLUMN from_stage_color text CHECK (from_stage_color ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN to_stage_color text CHECK (to_stage_color ~ '^#[0-9a-fA-F]{6}$');
-- Historical colors were not previously saved. Backfill from surviving stages;
-- the UI uses its existing purple fallback when a stage was already removed.
UPDATE public.opportunity_stage_history h SET from_stage_color = s.color
  FROM public.pipeline_stages s WHERE h.from_stage_id = s.id;
UPDATE public.opportunity_stage_history h SET to_stage_color = s.color
  FROM public.pipeline_stages s WHERE h.to_stage_id = s.id;

CREATE FUNCTION public.delete_opportunity(p_opportunity_id uuid,p_requesting_agent_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; a public.tenant_agents; ts timestamptz;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  a := public.opportunities_assert_agent(o.tenant_id,p_requesting_agent_id);
  -- Match move/edit lock order, then check ownership on the locked row.
  PERFORM id FROM public.pipelines WHERE id = o.pipeline_id FOR UPDATE;
  SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF a.role IS DISTINCT FROM 'admin' AND o.assigned_agent_id IS DISTINCT FROM a.id THEN
    RAISE EXCEPTION 'Only the assigned agent or an administrator can delete this opportunity' USING ERRCODE = '42501';
  END IF;
  -- Retried deletes are harmless and retain the original actor/time.
  IF o.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This opportunity changed in another session. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
  ts := clock_timestamp();
  UPDATE public.opportunities SET deleted_at = ts,deleted_by = a.id,updated_at = ts WHERE id = o.id;
  -- Deliberately no stage/history/event writes.
END;
$$;
REVOKE ALL ON FUNCTION public.delete_opportunity(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_opportunity(uuid,uuid,timestamptz) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.opportunities_move_internal(p_id uuid, p_stage_id uuid, p_agent_id uuid, p_expected_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; dest public.pipeline_stages; old_name text; old_color text; h uuid; ts timestamptz;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opportunity not found or deleted'; END IF;
  IF o.stage_id IS DISTINCT FROM p_expected_stage_id THEN
    RAISE EXCEPTION 'This opportunity changed in another session. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO dest FROM public.pipeline_stages WHERE id = p_stage_id AND tenant_id = o.tenant_id;
  IF dest.id IS NULL THEN RAISE EXCEPTION 'Stage does not belong to this workspace'; END IF;
  IF o.stage_id = dest.id THEN RETURN to_jsonb(o) - 'pii_encrypted' - 'title' - 'notes'; END IF;
  SELECT name,color INTO old_name,old_color FROM public.pipeline_stages WHERE id = o.stage_id;
  ts := clock_timestamp();
  UPDATE public.opportunities SET stage_id = dest.id, pipeline_id = dest.pipeline_id,
    status = CASE WHEN dest.is_won THEN 'won' WHEN dest.is_lost THEN 'lost' ELSE 'open' END,
    stage_entered_at = ts, updated_at = ts WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.opportunity_stage_history(tenant_id,opportunity_id,from_stage_id,to_stage_id,from_stage_name,to_stage_name,from_stage_color,to_stage_color,changed_by,changed_at)
    VALUES(o.tenant_id,o.id,p_expected_stage_id,dest.id,old_name,dest.name,old_color,dest.color,p_agent_id,ts) RETURNING id INTO h;
  INSERT INTO public.opportunity_events(tenant_id,opportunity_id,history_id,event_type,payload,created_at)
    VALUES(o.tenant_id,o.id,h,'opportunity.stage_changed',jsonb_build_object(
      'opportunity_id',o.id,'from_stage_id',p_expected_stage_id,'to_stage_id',dest.id,'changed_by',p_agent_id,'changed_at',ts),ts);
  RETURN to_jsonb(o) - 'pii_encrypted' - 'title' - 'notes';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_opportunity(p_tenant_id uuid, p_requesting_agent_id uuid, p_fields jsonb,
  p_opportunity_id uuid DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; s public.pipeline_stages; cid uuid; aid uuid; source_id uuid; callid uuid; encrypted jsonb; a public.tenant_agents;
BEGIN
  a := public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
  cid := (p_fields->>'contact_id')::uuid;
  aid := nullif(p_fields->>'assigned_agent_id','')::uuid;
  source_id := nullif(p_fields->>'lead_source_id','')::uuid;
  callid := nullif(p_fields->>'call_id','')::uuid;
  SELECT * INTO s FROM public.pipeline_stages WHERE id = (p_fields->>'stage_id')::uuid
    AND pipeline_id = (p_fields->>'pipeline_id')::uuid AND tenant_id = p_tenant_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Select a valid pipeline and stage'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE id = cid AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'Select a contact in this workspace'; END IF;
  IF aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_agents WHERE id = aid AND tenant_id = p_tenant_id AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'Agent is outside this workspace'; END IF;
  IF source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lead_sources WHERE id = source_id AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'Source is outside this workspace'; END IF;
  IF callid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.call_records WHERE id = callid AND tenant_id = p_tenant_id AND contact_id = cid) THEN RAISE EXCEPTION 'Call must belong to the selected contact'; END IF;
  IF nullif(btrim(p_fields->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Enter an opportunity title'; END IF;
  SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id AND tenant_id = p_tenant_id;
  PERFORM id FROM public.pipelines WHERE id IN (s.pipeline_id,o.pipeline_id) ORDER BY id FOR UPDATE;
  encrypted := jsonb_strip_nulls(jsonb_build_object('title',public.encrypt_pii_value(btrim(p_fields->>'title')),
    'notes',public.encrypt_pii_value(p_fields->>'notes')));
  IF p_opportunity_id IS NULL THEN
    -- Unspecified call links to the latest related call. No inbound automation.
    IF callid IS NULL THEN
      SELECT id INTO callid FROM public.call_records WHERE contact_id = cid AND tenant_id = p_tenant_id ORDER BY call_start DESC NULLS LAST, id LIMIT 1;
    END IF;
    INSERT INTO public.opportunities(tenant_id,pipeline_id,stage_id,contact_id,assigned_agent_id,pii_encrypted,
      line_of_business,carrier,plan_name,effective_date,est_value,lead_source_id,call_id,status)
    VALUES(p_tenant_id,s.pipeline_id,s.id,cid,aid,encrypted,p_fields->>'line_of_business',nullif(btrim(p_fields->>'carrier'),''),
      nullif(btrim(p_fields->>'plan_name'),''),nullif(p_fields->>'effective_date','')::date,coalesce(nullif(p_fields->>'est_value','')::numeric,0),source_id,callid,
      CASE WHEN s.is_won THEN 'won' WHEN s.is_lost THEN 'lost' ELSE 'open' END) RETURNING * INTO o;
    INSERT INTO public.opportunity_stage_history(tenant_id,opportunity_id,to_stage_id,to_stage_name,to_stage_color,changed_by)
      VALUES(p_tenant_id,o.id,s.id,s.name,s.color,a.id);
  ELSE
    SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF o.id IS NULL OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opportunity not found or deleted'; END IF;
    IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'This opportunity changed in another session. Refresh and try again.' USING ERRCODE = '40001';
    END IF;
    PERFORM public.opportunities_move_internal(o.id,s.id,a.id,o.stage_id);
    UPDATE public.opportunities SET contact_id = cid, assigned_agent_id = aid, pii_encrypted = encrypted,
      line_of_business = p_fields->>'line_of_business', carrier = nullif(btrim(p_fields->>'carrier'),''),
      plan_name = nullif(btrim(p_fields->>'plan_name'),''), effective_date = nullif(p_fields->>'effective_date','')::date,
      est_value = coalesce(nullif(p_fields->>'est_value','')::numeric,0), lead_source_id = source_id,call_id = callid,updated_at = clock_timestamp() WHERE id = o.id;
  END IF;
  INSERT INTO public.pii_access_log(contact_id,agent_id,clerk_user_id,action) VALUES(cid,a.id,a.clerk_user_id,'edit');
  RETURN o.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_opportunities(p_tenant_id uuid, p_requesting_agent_id uuid,
  p_contact_id uuid DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; details jsonb; names jsonb := '{}'; display_name text;
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
  IF p_limit NOT BETWEEN 1 AND 200 OR p_offset < 0 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  FOR o IN SELECT * FROM public.opportunities WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND (p_contact_id IS NULL OR contact_id = p_contact_id)
    ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset LOOP
    IF NOT names ? o.contact_id::text THEN
      -- Existing audited RPC; no contact names are stored on opportunities.
      details := public.decrypt_pii(o.contact_id,p_requesting_agent_id,'view');
      display_name := coalesce(nullif(btrim(concat_ws(' ',details->>'first_name',details->>'last_name')),''),'Unknown contact');
      names := names || jsonb_build_object(o.contact_id::text,display_name);
    END IF;
    RETURN NEXT (to_jsonb(o) - 'pii_encrypted') || jsonb_build_object(
      'title',public.decrypt_pii_value(o.pii_encrypted->'title'),
      'notes',public.decrypt_pii_value(nullif(o.pii_encrypted->'notes','null'::jsonb)),
      'contact_name',names->>o.contact_id::text);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_opportunity_stage(p_stage_id uuid, p_requesting_agent_id uuid, p_move_to_stage_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.pipeline_stages; o record; retained_stage uuid;
BEGIN
  SELECT * INTO s FROM public.pipeline_stages WHERE id = p_stage_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  PERFORM public.opportunities_assert_agent(s.tenant_id,p_requesting_agent_id,true);
  PERFORM id FROM public.pipelines WHERE id = s.pipeline_id FOR UPDATE;
  IF (SELECT count(*) FROM public.pipeline_stages WHERE pipeline_id = s.pipeline_id) <= 1 THEN RAISE EXCEPTION 'Keep at least one stage'; END IF;
  IF p_move_to_stage_id IS NOT NULL AND (p_move_to_stage_id = s.id OR NOT EXISTS(
    SELECT 1 FROM public.pipeline_stages WHERE id = p_move_to_stage_id AND pipeline_id = s.pipeline_id AND tenant_id = s.tenant_id)) THEN
    RAISE EXCEPTION 'Choose another stage in this pipeline';
  END IF;
  IF EXISTS(SELECT 1 FROM public.opportunities WHERE stage_id = s.id AND deleted_at IS NULL) AND p_move_to_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage has opportunities. Move them to another stage before deleting.' USING ERRCODE = '23503';
  END IF;
  FOR o IN SELECT id,stage_id FROM public.opportunities WHERE stage_id = s.id AND deleted_at IS NULL ORDER BY id FOR UPDATE LOOP
    PERFORM public.opportunities_move_internal(o.id,p_move_to_stage_id,p_requesting_agent_id,o.stage_id);
  END LOOP;
  -- Retained deleted records must not block stage removal. Relink only their
  -- inert FK, without changing clocks/status or writing history/events. Their
  -- original stage names/colors remain in the retained history snapshots.
  SELECT id INTO retained_stage FROM public.pipeline_stages
    WHERE pipeline_id = s.pipeline_id AND id <> s.id
    ORDER BY (id = p_move_to_stage_id) DESC NULLS LAST,position,id LIMIT 1;
  UPDATE public.opportunities SET stage_id = retained_stage
    WHERE stage_id = s.id AND deleted_at IS NOT NULL;
  DELETE FROM public.pipeline_stages WHERE id = s.id;
END;
$$;
-- CREATE OR REPLACE preserves the existing entry-point grants. Keep the
-- internal mover private and all direct authenticated writes revoked.
REVOKE ALL ON FUNCTION public.opportunities_move_internal(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.opportunities FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
