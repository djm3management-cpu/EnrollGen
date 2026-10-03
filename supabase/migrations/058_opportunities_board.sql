-- Opportunities is additive and independent of call routing/postbacks.
-- All writes use authenticated RPCs. No automation triggers or actions.
BEGIN;

CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  line_of_business text CHECK (line_of_business IN ('MA','Med Supp','ACA','U65','Annuity','Ancillary')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX pipelines_one_default ON public.pipelines(tenant_id) WHERE is_default;

CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pipeline_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  position integer NOT NULL CHECK (position >= 0),
  color text NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  CHECK (NOT (is_won AND is_lost)),
  FOREIGN KEY (tenant_id, pipeline_id) REFERENCES public.pipelines(tenant_id, id),
  UNIQUE (tenant_id, pipeline_id, id),
  CONSTRAINT pipeline_stages_position UNIQUE (pipeline_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pipeline_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  assigned_agent_id uuid REFERENCES public.tenant_agents(id),
  -- Free text can contain PII. Like contacts, plaintext columns stay empty;
  -- RPCs encrypt into pii_encrypted using the existing Vault/pgcrypto helpers.
  title text CHECK (title IS NULL),
  notes text CHECK (notes IS NULL),
  pii_encrypted jsonb NOT NULL DEFAULT '{}',
  line_of_business text NOT NULL CHECK (line_of_business IN ('MA','Med Supp','ACA','U65','Annuity','Ancillary')),
  carrier text,
  plan_name text,
  effective_date date,
  est_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (est_value >= 0),
  lead_source_id uuid REFERENCES public.lead_sources(id),
  call_id uuid REFERENCES public.call_records(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, pipeline_id, stage_id) REFERENCES public.pipeline_stages(tenant_id, pipeline_id, id),
  UNIQUE (tenant_id, id)
);
CREATE INDEX opportunities_board ON public.opportunities(tenant_id, pipeline_id, stage_id);
CREATE INDEX opportunities_contact ON public.opportunities(tenant_id, contact_id);

CREATE TABLE public.opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL,
  from_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  -- Keep the timeline readable after a stage is renamed/deleted.
  from_stage_name text,
  to_stage_name text NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.tenant_agents(id),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, opportunity_id) REFERENCES public.opportunities(tenant_id, id)
);
CREATE INDEX opportunity_history_timeline ON public.opportunity_stage_history(opportunity_id, changed_at DESC);

CREATE TABLE public.opportunity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL,
  history_id uuid NOT NULL UNIQUE REFERENCES public.opportunity_stage_history(id),
  event_type text NOT NULL CHECK (event_type = 'opportunity.stage_changed'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, opportunity_id) REFERENCES public.opportunities(tenant_id, id)
);
CREATE INDEX opportunity_events_feed ON public.opportunity_events(tenant_id, created_at);

-- Migration 028's is_current_tenant() deliberately permits every tenant.
-- Use CRM's tenant-agent/Clerk subject binding for these NEW tables only.
CREATE FUNCTION public.opportunities_is_tenant(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM public.tenant_agents a
    WHERE a.tenant_id = p_tenant_id AND coalesce(a.is_active, true)
      AND a.clerk_user_id = nullif(auth.jwt()->>'sub', '')
  );
$$;
REVOKE ALL ON FUNCTION public.opportunities_is_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opportunities_is_tenant(uuid) TO authenticated, service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pipelines','pipeline_stages','opportunities','opportunity_stage_history','opportunity_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.opportunities_is_tenant(tenant_id))', t || '_tenant_access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Match contacts' safe-column reads: ciphertext and encryption metadata are
-- available only to the audited reader, never to authenticated table queries.
REVOKE SELECT ON public.opportunities FROM authenticated;
GRANT SELECT (id,tenant_id,pipeline_id,stage_id,contact_id,assigned_agent_id,line_of_business,
  carrier,plan_name,effective_date,est_value,lead_source_id,call_id,status,stage_entered_at,created_at,updated_at)
  ON public.opportunities TO authenticated;

CREATE FUNCTION public.opportunities_assert_agent(p_tenant_id uuid, p_agent_id uuid, p_admin boolean DEFAULT false)
RETURNS public.tenant_agents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents;
BEGIN
  SELECT * INTO a FROM public.tenant_agents WHERE id = p_agent_id AND tenant_id = p_tenant_id AND coalesce(is_active, true);
  IF a.id IS NULL OR coalesce(auth.role(),'') NOT IN ('authenticated','service_role') OR
    (auth.role() = 'authenticated' AND a.clerk_user_id IS DISTINCT FROM nullif(auth.jwt()->>'sub', '')) THEN
    RAISE EXCEPTION 'Access denied: your agent account is not linked to this workspace/session' USING ERRCODE = '42501';
  END IF;
  IF p_admin AND a.role IS DISTINCT FROM 'admin' AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Pipeline settings require an administrator' USING ERRCODE = '42501';
  END IF;
  RETURN a;
END;
$$;
REVOKE ALL ON FUNCTION public.opportunities_assert_agent(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ensure_opportunities_pipeline(p_tenant_id uuid, p_requesting_agent_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid;
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id, p_requesting_agent_id);
  INSERT INTO public.pipelines(tenant_id, name, is_default) VALUES(p_tenant_id, 'Default Pipeline', true)
    ON CONFLICT (tenant_id) WHERE is_default DO NOTHING;
  SELECT id INTO p FROM public.pipelines WHERE tenant_id = p_tenant_id AND is_default;
  -- Serializes first use in a newly onboarded tenant.
  PERFORM 1 FROM public.pipelines WHERE id = p FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = p) THEN
    INSERT INTO public.pipeline_stages(tenant_id,pipeline_id,name,position,color,is_won,is_lost) VALUES
      (p_tenant_id,p,'New Lead',0,'#a78bfa',false,false),
      (p_tenant_id,p,'Contacted',1,'#facc15',false,false),
      (p_tenant_id,p,'Pending',2,'#fb923c',false,false),
      (p_tenant_id,p,'Enrolled',3,'#4ade80',true,false),
      (p_tenant_id,p,'Disenrolled',4,'#f87171',false,true);
  END IF;
  RETURN p;
END;
$$;

INSERT INTO public.pipelines(tenant_id,name,is_default) SELECT id,'Default Pipeline',true FROM public.tenants;
INSERT INTO public.pipeline_stages(tenant_id,pipeline_id,name,position,color,is_won,is_lost)
SELECT p.tenant_id,p.id,s.name,s.position,s.color,s.is_won,s.is_lost FROM public.pipelines p
CROSS JOIN (VALUES ('New Lead',0,'#a78bfa',false,false),('Contacted',1,'#facc15',false,false),
  ('Pending',2,'#fb923c',false,false),('Enrolled',3,'#4ade80',true,false),('Disenrolled',4,'#f87171',false,true))
  AS s(name,position,color,is_won,is_lost) WHERE p.is_default;

-- Internal transactional move: called only by authorized write RPCs below.
CREATE FUNCTION public.opportunities_move_internal(p_id uuid, p_stage_id uuid, p_agent_id uuid, p_expected_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; dest public.pipeline_stages; old_name text; h uuid; ts timestamptz;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  IF o.stage_id IS DISTINCT FROM p_expected_stage_id THEN
    RAISE EXCEPTION 'This opportunity changed in another session. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO dest FROM public.pipeline_stages WHERE id = p_stage_id AND tenant_id = o.tenant_id;
  IF dest.id IS NULL THEN RAISE EXCEPTION 'Stage does not belong to this workspace'; END IF;
  IF o.stage_id = dest.id THEN RETURN to_jsonb(o) - 'pii_encrypted' - 'title' - 'notes'; END IF;
  SELECT name INTO old_name FROM public.pipeline_stages WHERE id = o.stage_id;
  ts := clock_timestamp();
  UPDATE public.opportunities SET stage_id = dest.id, pipeline_id = dest.pipeline_id,
    status = CASE WHEN dest.is_won THEN 'won' WHEN dest.is_lost THEN 'lost' ELSE 'open' END,
    stage_entered_at = ts, updated_at = ts WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.opportunity_stage_history(tenant_id,opportunity_id,from_stage_id,to_stage_id,from_stage_name,to_stage_name,changed_by,changed_at)
    VALUES(o.tenant_id,o.id,p_expected_stage_id,dest.id,old_name,dest.name,p_agent_id,ts) RETURNING id INTO h;
  INSERT INTO public.opportunity_events(tenant_id,opportunity_id,history_id,event_type,payload,created_at)
    VALUES(o.tenant_id,o.id,h,'opportunity.stage_changed',jsonb_build_object(
      'opportunity_id',o.id,'from_stage_id',p_expected_stage_id,'to_stage_id',dest.id,'changed_by',p_agent_id,'changed_at',ts),ts);
  RETURN to_jsonb(o) - 'pii_encrypted' - 'title' - 'notes';
END;
$$;
REVOKE ALL ON FUNCTION public.opportunities_move_internal(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.move_opportunity_stage(p_opportunity_id uuid, p_to_stage_id uuid, p_requesting_agent_id uuid, p_expected_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; dest_pipeline uuid;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  PERFORM public.opportunities_assert_agent(o.tenant_id,p_requesting_agent_id);
  SELECT pipeline_id INTO dest_pipeline FROM public.pipeline_stages WHERE id = p_to_stage_id AND tenant_id = o.tenant_id;
  -- Stable lock order across moves, edits and stage deletion prevents races.
  PERFORM id FROM public.pipelines WHERE id IN (o.pipeline_id,dest_pipeline) ORDER BY id FOR UPDATE;
  RETURN public.opportunities_move_internal(o.id,p_to_stage_id,p_requesting_agent_id,p_expected_stage_id);
END;
$$;

CREATE FUNCTION public.save_opportunity(p_tenant_id uuid, p_requesting_agent_id uuid, p_fields jsonb,
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
    INSERT INTO public.opportunity_stage_history(tenant_id,opportunity_id,to_stage_id,to_stage_name,changed_by)
      VALUES(p_tenant_id,o.id,s.id,s.name,a.id);
  ELSE
    SELECT * INTO o FROM public.opportunities WHERE id = p_opportunity_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF o.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
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

CREATE FUNCTION public.read_opportunities(p_tenant_id uuid, p_requesting_agent_id uuid,
  p_contact_id uuid DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.opportunities; details jsonb; names jsonb := '{}'; display_name text;
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
  IF p_limit NOT BETWEEN 1 AND 200 OR p_offset < 0 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  FOR o IN SELECT * FROM public.opportunities WHERE tenant_id = p_tenant_id AND (p_contact_id IS NULL OR contact_id = p_contact_id)
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

CREATE FUNCTION public.save_opportunity_pipeline(p_tenant_id uuid, p_requesting_agent_id uuid,
  p_pipeline_id uuid, p_name text, p_line_of_business text, p_stages jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid; item jsonb; sid uuid; pos integer := 0;
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id,true);
  IF jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'A pipeline needs at least one stage'; END IF;
  IF p_pipeline_id IS NULL THEN
    INSERT INTO public.pipelines(tenant_id,name,line_of_business) VALUES(p_tenant_id,btrim(p_name),nullif(p_line_of_business,'')) RETURNING id INTO p;
  ELSE
    SELECT id INTO p FROM public.pipelines WHERE id = p_pipeline_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF p IS NULL THEN RAISE EXCEPTION 'Pipeline not found'; END IF;
    UPDATE public.pipelines SET name = btrim(p_name),line_of_business = nullif(p_line_of_business,'') WHERE id = p;
  END IF;
  IF EXISTS(SELECT 1 FROM public.pipeline_stages s WHERE s.pipeline_id = p
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_stages) x WHERE nullif(x->>'id','')::uuid = s.id)) THEN
    RAISE EXCEPTION 'Delete stages using the move-to-stage workflow first';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_stages) LOOP
    sid := coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    IF EXISTS(SELECT 1 FROM public.pipeline_stages WHERE id = sid AND (tenant_id <> p_tenant_id OR pipeline_id <> p)) THEN RAISE EXCEPTION 'Stage belongs to another pipeline'; END IF;
    INSERT INTO public.pipeline_stages(id,tenant_id,pipeline_id,name,position,color,is_won,is_lost)
      VALUES(sid,p_tenant_id,p,btrim(item->>'name'),pos,item->>'color',coalesce((item->>'is_won')::boolean,false),coalesce((item->>'is_lost')::boolean,false))
      ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name,position = EXCLUDED.position,color = EXCLUDED.color,is_won = EXCLUDED.is_won,is_lost = EXCLUDED.is_lost;
    pos := pos + 1;
  END LOOP;
  UPDATE public.opportunities o SET status = CASE WHEN s.is_won THEN 'won' WHEN s.is_lost THEN 'lost' ELSE 'open' END,updated_at = clock_timestamp()
    FROM public.pipeline_stages s WHERE o.stage_id = s.id AND s.pipeline_id = p
      AND o.status IS DISTINCT FROM CASE WHEN s.is_won THEN 'won' WHEN s.is_lost THEN 'lost' ELSE 'open' END;
  RETURN p;
END;
$$;

CREATE FUNCTION public.delete_opportunity_stage(p_stage_id uuid, p_requesting_agent_id uuid, p_move_to_stage_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.pipeline_stages; o record;
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
  IF EXISTS(SELECT 1 FROM public.opportunities WHERE stage_id = s.id) AND p_move_to_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage has opportunities. Move them to another stage before deleting.' USING ERRCODE = '23503';
  END IF;
  FOR o IN SELECT id,stage_id FROM public.opportunities WHERE stage_id = s.id ORDER BY id FOR UPDATE LOOP
    PERFORM public.opportunities_move_internal(o.id,p_move_to_stage_id,p_requesting_agent_id,o.stage_id);
  END LOOP;
  DELETE FROM public.pipeline_stages WHERE id = s.id;
END;
$$;

-- Default PUBLIC execution is revoked for every entry point.
REVOKE ALL ON FUNCTION public.ensure_opportunities_pipeline(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.move_opportunity_stage(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_opportunity(uuid,uuid,jsonb,uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.read_opportunities(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_opportunity_pipeline(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_opportunity_stage(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_opportunities_pipeline(uuid,uuid),public.move_opportunity_stage(uuid,uuid,uuid,uuid),
  public.save_opportunity(uuid,uuid,jsonb,uuid,timestamptz),public.read_opportunities(uuid,uuid,uuid,integer,integer),
  public.save_opportunity_pipeline(uuid,uuid,uuid,text,text,jsonb),public.delete_opportunity_stage(uuid,uuid,uuid) TO authenticated,service_role;
COMMIT;
