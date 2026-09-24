-- Agent UI displays complete contact details automatically. Encryption,
-- authenticated identity binding, tenant isolation and audit logging remain.
BEGIN;
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
    AND ((v_phone_hash IS NOT NULL AND c.phone_hash = v_phone_hash) OR c.name_search = v_name_hash);
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

  IF p_value IS NULL OR btrim(p_value) = '' THEN
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb) - p_field;
  ELSE
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb)
      || jsonb_build_object(p_field, public.encrypt_pii_value(p_value));
  END IF;
  UPDATE public.contacts SET mbi_last4 = CASE WHEN p_field != 'mbi_full' THEN mbi_last4
      WHEN p_value IS NOT NULL AND length(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g')) >= 4
      THEN right(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g'), 4) ELSE NULL END
  WHERE id = p_contact_id;
  -- The last-four update fires the encryption trigger. Write custom encrypted
  -- fields afterwards so that trigger cannot replace the newly saved MBI.
  UPDATE public.contacts SET pii_encrypted = v_encrypted WHERE id = p_contact_id;
  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, 'edit');
  RETURN v_encrypted;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_contact_details(
  p_contact_ids UUID[], p_requesting_agent_id UUID
) RETURNS TABLE(contact_id UUID, fields JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents; c RECORD; details JSONB;
BEGIN
  SELECT * INTO a FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF a.id IS NULL OR (auth.role() = 'authenticated'
    AND a.clerk_user_id IS DISTINCT FROM nullif(auth.jwt()->>'sub', '')) THEN
    RAISE EXCEPTION 'Your agent account is not linked to this session';
  END IF;
  IF coalesce(cardinality(p_contact_ids), 0) > 200 THEN
    RAISE EXCEPTION 'Request at most 200 contacts at a time';
  END IF;
  FOR c IN SELECT id FROM public.contacts WHERE id = ANY(p_contact_ids) AND tenant_id = a.tenant_id LOOP
    details := public.decrypt_pii(c.id, a.id, 'view');
    -- Only send fields needed by the CRM, never SSNs or encryption metadata.
    RETURN QUERY SELECT c.id, jsonb_build_object(
      'first_name', details->'first_name', 'last_name', details->'last_name',
      'phone', details->'phone', 'email', details->'email',
      'dob', details->'dob', 'address', details->'address', 'mbi_full', details->'mbi_full');
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.read_contact_details(UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_contact_details(UUID[], UUID) TO authenticated, service_role;
COMMIT;
