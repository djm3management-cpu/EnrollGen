-- Bind sensitive PII and telephony-facing agent operations to the
-- authenticated Clerk subject. This is a forward migration for databases
-- where migrations 022/023/025 have already been applied.

CREATE OR REPLACE FUNCTION public.decrypt_pii(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_action TEXT DEFAULT 'view',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact RECORD;
  v_agent RECORD;
  v_result JSONB := '{}'::jsonb;
  v_field TEXT;
  v_value JSONB;
BEGIN
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;

  SELECT id, tenant_id, assigned_agent_id, pii_encrypted INTO v_contact
  FROM public.contacts WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact % not found', p_contact_id;
  END IF;

  SELECT id, tenant_id, role, agent_slug, clerk_user_id INTO v_agent
  FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;
  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;
  IF v_agent.tenant_id != v_contact.tenant_id THEN
    RAISE EXCEPTION 'access denied: agent and contact belong to different tenants';
  END IF;
  IF v_agent.role != 'admin' AND v_agent.agent_slug IS DISTINCT FROM v_contact.assigned_agent_id THEN
    RAISE EXCEPTION 'access denied: contact % is not assigned to agent %', p_contact_id, p_requesting_agent_id;
  END IF;

  IF v_contact.pii_encrypted IS NOT NULL THEN
    FOR v_field, v_value IN SELECT * FROM jsonb_each(v_contact.pii_encrypted) LOOP
      v_result := v_result || jsonb_build_object(v_field, public.decrypt_pii_value(v_value));
    END LOOP;
  END IF;

  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action, ip_address, user_agent)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, p_action, p_ip_address, p_user_agent);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_contacts_secure(
  p_query TEXT,
  p_requesting_agent_id UUID
)
RETURNS TABLE (contact_id UUID, masked_preview TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent RECORD;
  v_phone TEXT;
  v_phone_hash TEXT;
  v_name_hash TEXT;
BEGIN
  SELECT id, tenant_id, role, agent_slug, clerk_user_id INTO v_agent
  FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;
  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;

  v_phone := public.normalize_phone_e164(p_query);
  IF v_phone IS NOT NULL THEN v_phone_hash := public.pii_blind_index(v_phone); END IF;
  v_name_hash := public.pii_blind_index(p_query);
  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action)
  VALUES (NULL, p_requesting_agent_id, v_agent.clerk_user_id, 'search');

  RETURN QUERY
  SELECT c.id,
    coalesce(c.first_initial, '') || '*** ' || coalesce(c.last_initial, '') || '**, --' || coalesce(c.phone_last4, '????')
  FROM public.contacts c
  WHERE c.tenant_id = v_agent.tenant_id
    AND (v_agent.role = 'admin' OR c.assigned_agent_id = v_agent.agent_slug)
    AND ((v_phone_hash IS NOT NULL AND c.phone_hash = v_phone_hash) OR c.name_search = v_name_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_action TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent RECORD;
BEGIN
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;
  SELECT id, clerk_user_id INTO v_agent
  FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;
  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;
  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action, ip_address, user_agent)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, p_action, p_ip_address, p_user_agent);
END;
$$;

CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(
  p_phones TEXT[], p_requesting_agent_id UUID
)
RETURNS TABLE (
  phone TEXT, id UUID, first_initial TEXT, last_initial TEXT,
  email_set BOOLEAN, dob_set BOOLEAN, zip TEXT, county TEXT, state TEXT,
  current_carrier TEXT, current_plan TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent RECORD;
BEGIN
  SELECT ta.id, ta.tenant_id, ta.clerk_user_id INTO v_agent
  FROM public.tenant_agents ta WHERE ta.id = p_requesting_agent_id;
  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;
  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;

  RETURN QUERY
  SELECT input.phone, c.id, c.first_initial, c.last_initial, c.email_set, c.dob_set,
    c.zip, c.county, c.state, c.current_carrier, c.current_plan
  FROM unnest(p_phones) AS input(phone)
  JOIN public.contacts c ON c.tenant_id = v_agent.tenant_id
    AND c.phone_hash = public.pii_blind_index(public.normalize_phone_e164(input.phone));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pii_field(
  p_contact_id UUID, p_requesting_agent_id UUID, p_field TEXT, p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact RECORD;
  v_agent RECORD;
  v_encrypted JSONB;
BEGIN
  IF p_field NOT IN ('mbi_full', 'ssn') THEN
    RAISE EXCEPTION 'field % is not a supported write-only PII field', p_field;
  END IF;
  SELECT id, tenant_id, assigned_agent_id, pii_encrypted INTO v_contact
  FROM public.contacts WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN RAISE EXCEPTION 'contact % not found', p_contact_id; END IF;
  SELECT id, tenant_id, role, agent_slug, clerk_user_id INTO v_agent
  FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF v_agent.id IS NULL THEN RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id; END IF;
  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;
  IF v_agent.tenant_id != v_contact.tenant_id THEN
    RAISE EXCEPTION 'access denied: agent and contact belong to different tenants';
  END IF;
  IF v_agent.role != 'admin' AND v_agent.agent_slug IS DISTINCT FROM v_contact.assigned_agent_id THEN
    RAISE EXCEPTION 'access denied: contact % is not assigned to agent %', p_contact_id, p_requesting_agent_id;
  END IF;

  IF p_value IS NULL OR btrim(p_value) = '' THEN
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb) - p_field;
  ELSE
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb)
      || jsonb_build_object(p_field, public.encrypt_pii_value(p_value));
  END IF;
  UPDATE public.contacts SET pii_encrypted = v_encrypted,
    mbi_last4 = CASE WHEN p_field != 'mbi_full' THEN mbi_last4
      WHEN p_value IS NOT NULL AND length(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g')) >= 4
      THEN right(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g'), 4) ELSE NULL END
  WHERE id = p_contact_id;
  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, 'edit');
  RETURN v_encrypted;
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_pii(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_contacts_secure(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_pii_field(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_contacts_secure(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_pii_field(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
