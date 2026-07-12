-- ============================================================
-- Full MBI field
-- contacts has no plaintext mbi_full column (by design — avoids a
-- new PHI-at-rest surface, per migration 017). This adds the write
-- path Phase 1 anticipated: mbi_full is written directly into the
-- encrypted pii_encrypted blob via encrypt_pii_value(), permission-
-- and audit-logged the same as decrypt_pii(), and only ever
-- surfaces to the client through decrypt_pii()'s existing dynamic
-- field iteration — no schema change needed on the read side.
-- mbi_last4 (freely readable, migration 024) is kept in sync from
-- whatever full MBI is written, same relationship phone_last4 has
-- to phone.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_pii_field(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_field TEXT,
  p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact RECORD;
  v_agent RECORD;
  v_encrypted JSONB;
BEGIN
  IF p_field NOT IN ('mbi_full', 'ssn') THEN
    RAISE EXCEPTION 'field % is not a supported write-only PII field', p_field;
  END IF;

  SELECT id, tenant_id, assigned_agent_id, pii_encrypted INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id;

  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact % not found', p_contact_id;
  END IF;

  SELECT id, tenant_id, role, agent_slug, clerk_user_id INTO v_agent
  FROM public.tenant_agents
  WHERE id = p_requesting_agent_id;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;

  IF v_agent.tenant_id != v_contact.tenant_id THEN
    RAISE EXCEPTION 'access denied: agent and contact belong to different tenants';
  END IF;

  IF v_agent.role != 'admin' AND (v_agent.agent_slug IS DISTINCT FROM v_contact.assigned_agent_id) THEN
    RAISE EXCEPTION 'access denied: contact % is not assigned to agent %', p_contact_id, p_requesting_agent_id;
  END IF;

  IF p_value IS NULL OR btrim(p_value) = '' THEN
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb) - p_field;
  ELSE
    v_encrypted := coalesce(v_contact.pii_encrypted, '{}'::jsonb)
      || jsonb_build_object(p_field, public.encrypt_pii_value(p_value));
  END IF;

  UPDATE public.contacts
  SET pii_encrypted = v_encrypted,
    mbi_last4 = CASE
      WHEN p_field != 'mbi_full' THEN mbi_last4
      WHEN p_value IS NOT NULL AND length(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g')) >= 4
        THEN right(regexp_replace(p_value, '[^a-zA-Z0-9]', '', 'g'), 4)
      ELSE NULL
    END
  WHERE id = p_contact_id;

  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, 'edit');

  RETURN v_encrypted;
END;
$$;

REVOKE ALL ON FUNCTION public.update_pii_field(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_pii_field(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
