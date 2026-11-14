-- Source statement 1
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_set BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dob_set BOOLEAN NOT NULL DEFAULT false;

-- Source statement 2
CREATE OR REPLACE FUNCTION public.contacts_sync_pii_encrypted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key RECORD;
  v_fields JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_key FROM pii_vault.get_active_key();
  IF v_key.key_id IS NULL THEN
    RAISE EXCEPTION 'no active PII encryption key configured';
  END IF;

  IF NEW.first_name IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('first_name', public.encrypt_pii_value(NEW.first_name));
  END IF;
  IF NEW.last_name IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('last_name', public.encrypt_pii_value(NEW.last_name));
  END IF;
  IF NEW.dob IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('dob', public.encrypt_pii_value(NEW.dob::text));
  END IF;
  IF NEW.phone IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('phone', public.encrypt_pii_value(NEW.phone));
  END IF;
  IF NEW.email IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('email', public.encrypt_pii_value(NEW.email));
  END IF;
  IF NEW.address IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('address', public.encrypt_pii_value(NEW.address));
  END IF;
  IF NEW.mbi_last4 IS NOT NULL THEN
    v_fields := v_fields || jsonb_build_object('mbi_last4', public.encrypt_pii_value(NEW.mbi_last4));
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.pii_encrypted IS NOT NULL THEN
    v_fields := (OLD.pii_encrypted - 'first_name' - 'last_name' - 'dob' - 'phone' - 'email' - 'address' - 'mbi_last4') || v_fields;
  END IF;

  NEW.pii_encrypted := v_fields;

  NEW.phone_hash := public.pii_blind_index(public.normalize_phone_e164(NEW.phone));
  NEW.name_search := public.pii_blind_index(concat_ws(' ', NEW.first_name, NEW.last_name));
  NEW.first_initial := CASE WHEN NEW.first_name IS NOT NULL AND length(NEW.first_name) > 0
    THEN upper(left(NEW.first_name, 1)) END;
  NEW.last_initial := CASE WHEN NEW.last_name IS NOT NULL AND length(NEW.last_name) > 0
    THEN upper(left(NEW.last_name, 1)) END;
  NEW.phone_last4 := CASE WHEN NEW.phone IS NOT NULL AND length(regexp_replace(NEW.phone, '[^0-9]', '', 'g')) >= 4
    THEN right(regexp_replace(NEW.phone, '[^0-9]', '', 'g'), 4) END;
  NEW.email_set := NEW.email IS NOT NULL AND btrim(NEW.email) != '';
  NEW.dob_set := NEW.dob IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Source statement 3
UPDATE public.contacts SET first_name = first_name;

-- Source statement 4
CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_action TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;

  SELECT id, clerk_user_id INTO v_agent
  FROM public.tenant_agents
  WHERE id = p_requesting_agent_id;

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

-- Source statement 5
REVOKE ALL ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- Source statement 6
GRANT EXECUTE ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source statement 7
CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(
  p_phones TEXT[],
  p_requesting_agent_id UUID
)
RETURNS TABLE (
  phone TEXT,
  id UUID,
  first_initial TEXT,
  last_initial TEXT,
  email_set BOOLEAN,
  dob_set BOOLEAN,
  zip TEXT,
  county TEXT,
  state TEXT,
  current_carrier TEXT,
  current_plan TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  SELECT ta.id, ta.tenant_id, ta.clerk_user_id INTO v_agent
  FROM public.tenant_agents ta
  WHERE ta.id = p_requesting_agent_id;

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
  JOIN public.contacts c
    ON c.tenant_id = v_agent.tenant_id
    AND c.phone_hash = public.pii_blind_index(public.normalize_phone_e164(input.phone));
END;
$$;

-- Source statement 8
REVOKE ALL ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) FROM PUBLIC, anon;

-- Source statement 9
GRANT EXECUTE ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) TO authenticated, service_role;

-- Source statement 10
REVOKE SELECT (
  first_name, last_name, phone, email, dob, address, mbi_last4,
  pii_encrypted, phone_hash, name_search
) ON public.contacts FROM authenticated, anon;

-- Source statement 11
GRANT SELECT (
  id, tenant_id, zip, county, state, medicare_parts, current_carrier,
  current_plan, status, source, assigned_agent_id, do_not_call,
  ghl_contact_id, first_initial, last_initial, phone_last4,
  email_set, dob_set, created_at, updated_at
) ON public.contacts TO authenticated;
