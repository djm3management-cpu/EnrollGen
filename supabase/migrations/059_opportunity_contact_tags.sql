-- Native contact tags for opportunity card actions. Existing contact rows,
-- vendor payloads and opportunity/stage behavior remain unchanged.
BEGIN;
CREATE TABLE public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  name_encrypted jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.tenant_agents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_tags_contact ON public.contact_tags(tenant_id,contact_id);
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_tags_tenant_access ON public.contact_tags FOR SELECT TO authenticated
  USING (public.opportunities_is_tenant(tenant_id));
CREATE POLICY contact_tags_service_role ON public.contact_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.contact_tags FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,tenant_id,contact_id,created_by,created_at) ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;

CREATE FUNCTION public.read_contact_tags(p_tenant_id uuid, p_requesting_agent_id uuid, p_contact_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; result jsonb;
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
  IF coalesce(cardinality(p_contact_ids),0) > 200 THEN RAISE EXCEPTION 'Request up to 200 contacts at a time'; END IF;
  -- Same audited, encrypted read pattern as contacts and opportunities.
  FOR cid IN SELECT DISTINCT contact_id FROM public.contact_tags
    WHERE tenant_id = p_tenant_id AND contact_id = ANY(p_contact_ids) LOOP
    INSERT INTO public.pii_access_log(contact_id,agent_id,clerk_user_id,action)
      VALUES(cid,p_requesting_agent_id,auth.jwt()->>'sub','view');
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_id',contact_id,
    'name',public.decrypt_pii_value(name_encrypted)) ORDER BY created_at,id),'[]') INTO result
    FROM public.contact_tags WHERE tenant_id = p_tenant_id AND contact_id = ANY(p_contact_ids);
  RETURN result;
END;
$$;

CREATE FUNCTION public.add_contact_tag(p_tenant_id uuid, p_contact_id uuid, p_requesting_agent_id uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tag public.contact_tags; label text := btrim(p_name);
BEGIN
  PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
  IF label IS NULL OR length(label) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Enter a tag with 1–60 characters'; END IF;
  -- A contact lock serializes duplicate checks, including concurrent additions.
  PERFORM id FROM public.contacts WHERE id = p_contact_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a contact in this workspace'; END IF;
  SELECT * INTO tag FROM public.contact_tags WHERE tenant_id = p_tenant_id AND contact_id = p_contact_id
    AND lower(public.decrypt_pii_value(name_encrypted)) = lower(label) LIMIT 1;
  IF tag.id IS NULL THEN
    INSERT INTO public.contact_tags(tenant_id,contact_id,name_encrypted,created_by)
      VALUES(p_tenant_id,p_contact_id,public.encrypt_pii_value(label),p_requesting_agent_id) RETURNING * INTO tag;
    INSERT INTO public.pii_access_log(contact_id,agent_id,clerk_user_id,action)
      VALUES(p_contact_id,p_requesting_agent_id,auth.jwt()->>'sub','edit');
  END IF;
  RETURN jsonb_build_object('id',tag.id,'contact_id',tag.contact_id,'name',public.decrypt_pii_value(tag.name_encrypted));
END;
$$;

CREATE FUNCTION public.remove_contact_tag(p_tag_id uuid, p_requesting_agent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tag public.contact_tags;
BEGIN
  SELECT * INTO tag FROM public.contact_tags WHERE id = p_tag_id;
  IF tag.id IS NULL THEN RAISE EXCEPTION 'Tag not found'; END IF;
  PERFORM public.opportunities_assert_agent(tag.tenant_id,p_requesting_agent_id);
  DELETE FROM public.contact_tags WHERE id = tag.id;
  INSERT INTO public.pii_access_log(contact_id,agent_id,clerk_user_id,action)
    VALUES(tag.contact_id,p_requesting_agent_id,auth.jwt()->>'sub','edit');
END;
$$;
REVOKE ALL ON FUNCTION public.read_contact_tags(uuid,uuid,uuid[]),public.add_contact_tag(uuid,uuid,uuid,text),
  public.remove_contact_tag(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_contact_tags(uuid,uuid,uuid[]),public.add_contact_tag(uuid,uuid,uuid,text),
  public.remove_contact_tag(uuid,uuid) TO authenticated,service_role;
COMMIT;
