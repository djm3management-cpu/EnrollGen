-- Consolidated CRM follow-ups. Keep the existing table and agent slug identity.
BEGIN;
CREATE OR REPLACE FUNCTION public.follow_up_access(p_tenant_id uuid, p_agent_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_agents a
    WHERE a.tenant_id = p_tenant_id AND a.is_active = true
      AND a.clerk_user_id = nullif(auth.jwt()->>'sub', '')
      AND auth.role() = 'authenticated'
      AND (a.role = 'admin' OR a.agent_slug = p_agent_slug)
  );
$$;
REVOKE ALL ON FUNCTION public.follow_up_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_up_access(uuid,text) TO authenticated;

-- Legacy unassigned tasks belong to the contact's assigned agent when available.
UPDATE public.follow_ups f SET agent_id = c.assigned_agent_id
FROM public.contacts c WHERE c.id = f.contact_id AND c.tenant_id = f.tenant_id AND f.agent_id IS NULL;

-- Replace all permissive authenticated policies, retaining service-role policies.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'follow_ups' AND ('authenticated' = ANY(roles) OR 'public' = ANY(roles))
  LOOP EXECUTE format('DROP POLICY %I ON public.follow_ups', p.policyname); END LOOP;
END $$;
CREATE POLICY follow_ups_agent_access ON public.follow_ups FOR ALL TO authenticated
  USING (public.follow_up_access(tenant_id, agent_id))
  WITH CHECK (public.follow_up_access(tenant_id, agent_id)
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.tenant_id = follow_ups.tenant_id)
    AND (agent_id IS NULL OR EXISTS (SELECT 1 FROM public.tenant_agents a
      WHERE a.tenant_id = follow_ups.tenant_id AND a.agent_slug = follow_ups.agent_id AND a.is_active = true)));

CREATE OR REPLACE FUNCTION public.save_follow_up(
  p_tenant_id uuid, p_requesting_agent_id uuid, p_contact_id uuid,
  p_due_at timestamptz, p_reason text DEFAULT NULL, p_agent_slug text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents; c public.contacts; task_id uuid; owner_slug text;
BEGIN
  SELECT * INTO a FROM public.tenant_agents WHERE id = p_requesting_agent_id
    AND tenant_id = p_tenant_id AND is_active = true;
  IF auth.role() IS DISTINCT FROM 'authenticated' OR a.id IS NULL
    OR a.clerk_user_id IS DISTINCT FROM nullif(auth.jwt()->>'sub','') THEN
    RAISE EXCEPTION 'Follow-up access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.contacts WHERE id = p_contact_id AND tenant_id = p_tenant_id;
  IF c.id IS NULL OR (a.role IS DISTINCT FROM 'admin' AND c.assigned_agent_id IS DISTINCT FROM a.agent_slug) THEN
    RAISE EXCEPTION 'Contact access denied' USING ERRCODE = '42501';
  END IF;
  owner_slug := coalesce(nullif(p_agent_slug,''), a.agent_slug);
  IF NOT public.follow_up_access(p_tenant_id, owner_slug) OR NOT EXISTS (
    SELECT 1 FROM public.tenant_agents WHERE tenant_id = p_tenant_id AND agent_slug = owner_slug AND is_active = true
  ) THEN RAISE EXCEPTION 'Follow-up assignee denied' USING ERRCODE = '42501'; END IF;
  IF p_due_at IS NULL OR NOT isfinite(p_due_at) THEN RAISE EXCEPTION 'A valid due date is required'; END IF;
  INSERT INTO public.follow_ups(tenant_id,contact_id,agent_id,due_at,reason)
    VALUES(p_tenant_id,p_contact_id,owner_slug,p_due_at,nullif(trim(p_reason),'')) RETURNING id INTO task_id;
  INSERT INTO public.contact_activities(tenant_id,contact_id,type,summary)
    VALUES(p_tenant_id,p_contact_id,'follow_up','Follow-up scheduled');
  RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.save_follow_up(uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_follow_up(uuid,uuid,uuid,timestamptz,text,text) TO authenticated;
COMMIT;
