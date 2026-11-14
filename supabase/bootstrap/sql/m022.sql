-- Source statement 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Source statement 2
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Source statement 3
CREATE SCHEMA IF NOT EXISTS pii_vault;

-- Source statement 4
CREATE TABLE IF NOT EXISTS pii_vault.encryption_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_secret_id UUID NOT NULL,
  key_version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

-- Source statement 5
CREATE UNIQUE INDEX IF NOT EXISTS idx_pii_encryption_keys_active
  ON pii_vault.encryption_keys (is_active)
  WHERE is_active = true;

-- Source statement 6
REVOKE ALL ON pii_vault.encryption_keys FROM PUBLIC, anon, authenticated;

-- Source statement 7
DO $$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pii_vault.encryption_keys WHERE is_active = true) THEN
    v_secret_id := vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'pii_encryption_key_v1',
      'EnrollGen contact PII encryption key (version 1)'
    );

    INSERT INTO pii_vault.encryption_keys (vault_secret_id, key_version, is_active)
    VALUES (v_secret_id, 1, true);
  END IF;
END $$;

-- Source statement 8
CREATE OR REPLACE FUNCTION pii_vault.get_active_key()
RETURNS TABLE (key_id UUID, key_material TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pii_vault, vault
AS $$
  SELECT ek.key_id, ds.decrypted_secret
  FROM pii_vault.encryption_keys ek
  JOIN vault.decrypted_secrets ds ON ds.id = ek.vault_secret_id
  WHERE ek.is_active = true
  ORDER BY ek.created_at DESC
  LIMIT 1;
$$;

-- Source statement 9
REVOKE ALL ON FUNCTION pii_vault.get_active_key() FROM PUBLIC, anon, authenticated;

-- Source statement 10
CREATE OR REPLACE FUNCTION pii_vault.get_key(p_key_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pii_vault, vault
AS $$
  SELECT ds.decrypted_secret
  FROM pii_vault.encryption_keys ek
  JOIN vault.decrypted_secrets ds ON ds.id = ek.vault_secret_id
  WHERE ek.key_id = p_key_id;
$$;

-- Source statement 11
REVOKE ALL ON FUNCTION pii_vault.get_key(UUID) FROM PUBLIC, anon, authenticated;

-- Source statement 12
CREATE OR REPLACE FUNCTION public.encrypt_pii_value(p_plaintext TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pii_vault
AS $$
DECLARE
  v_key RECORD;
BEGIN
  IF p_plaintext IS NULL OR btrim(p_plaintext) = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_key FROM pii_vault.get_active_key();
  IF v_key.key_id IS NULL THEN
    RAISE EXCEPTION 'no active PII encryption key configured';
  END IF;

  RETURN jsonb_build_object(
    'c', encode(extensions.pgp_sym_encrypt(p_plaintext, v_key.key_material, 'cipher-algo=aes256'), 'base64'),
    'k', v_key.key_id
  );
END;
$$;

-- Source statement 13
REVOKE ALL ON FUNCTION public.encrypt_pii_value(TEXT) FROM PUBLIC, anon, authenticated;

-- Source statement 14
GRANT EXECUTE ON FUNCTION public.encrypt_pii_value(TEXT) TO service_role;

-- Source statement 15
CREATE OR REPLACE FUNCTION public.decrypt_pii_value(p_encrypted JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pii_vault
AS $$
DECLARE
  v_key_material TEXT;
BEGIN
  IF p_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_key_material := pii_vault.get_key((p_encrypted->>'k')::UUID);
  IF v_key_material IS NULL THEN
    RAISE EXCEPTION 'PII encryption key % not found', p_encrypted->>'k';
  END IF;

  RETURN extensions.pgp_sym_decrypt(decode(p_encrypted->>'c', 'base64'), v_key_material);
END;
$$;

-- Source statement 16
REVOKE ALL ON FUNCTION public.decrypt_pii_value(JSONB) FROM PUBLIC, anon, authenticated;

-- Source statement 17
GRANT EXECUTE ON FUNCTION public.decrypt_pii_value(JSONB) TO service_role;

-- Source statement 18
CREATE OR REPLACE FUNCTION pii_vault.blind_index_key()
RETURNS BYTEA
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pii_vault
AS $$
  SELECT extensions.digest(key_material || ':blind-index', 'sha256') FROM pii_vault.get_active_key();
$$;

-- Source statement 19
REVOKE ALL ON FUNCTION pii_vault.blind_index_key() FROM PUBLIC, anon, authenticated;

-- Source statement 20
CREATE OR REPLACE FUNCTION public.pii_blind_index(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pii_vault
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR btrim(p_value) = '' THEN NULL
    ELSE encode(extensions.hmac(convert_to(lower(btrim(p_value)), 'UTF8'), pii_vault.blind_index_key(), 'sha256'), 'hex')
  END;
$$;

-- Source statement 21
REVOKE ALL ON FUNCTION public.pii_blind_index(TEXT) FROM PUBLIC, anon;

-- Source statement 22
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pii_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS phone_hash TEXT,
  ADD COLUMN IF NOT EXISTS name_search TEXT,
  ADD COLUMN IF NOT EXISTS first_initial TEXT,
  ADD COLUMN IF NOT EXISTS last_initial TEXT,
  ADD COLUMN IF NOT EXISTS phone_last4 TEXT;

-- Source statement 23
CREATE INDEX IF NOT EXISTS idx_contacts_phone_hash ON public.contacts (phone_hash);

-- Source statement 24
CREATE INDEX IF NOT EXISTS idx_contacts_name_search ON public.contacts (name_search);

-- Source statement 25
ALTER TABLE public.tenant_agents
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'admin')),
  ADD COLUMN IF NOT EXISTS agent_slug TEXT;

-- Source statement 27
CREATE INDEX IF NOT EXISTS idx_tenant_agents_slug ON public.tenant_agents (agent_slug);

-- Source statement 28
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

  -- Preserve any fields (e.g. ssn, mbi_full) written directly by
  -- application code that aren't backed by a plaintext column.
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

  RETURN NEW;
END;
$$;

-- Source statement 29
DROP TRIGGER IF EXISTS contacts_sync_pii_encrypted ON public.contacts;

-- Source statement 30
CREATE TRIGGER contacts_sync_pii_encrypted
  BEFORE INSERT OR UPDATE OF first_name, last_name, dob, phone, email, address, mbi_last4
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.contacts_sync_pii_encrypted();

-- Source statement 31
UPDATE public.contacts SET first_name = first_name WHERE pii_encrypted IS NULL;

-- Source statement 32
CREATE TABLE IF NOT EXISTS public.pii_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.tenant_agents(id) ON DELETE SET NULL,
  clerk_user_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('view', 'edit', 'export', 'search')),
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 33
CREATE INDEX IF NOT EXISTS idx_pii_access_log_contact ON public.pii_access_log (contact_id, timestamp DESC);

-- Source statement 34
CREATE INDEX IF NOT EXISTS idx_pii_access_log_agent ON public.pii_access_log (agent_id, timestamp DESC);

-- Source statement 35
CREATE INDEX IF NOT EXISTS idx_pii_access_log_timestamp ON public.pii_access_log (timestamp DESC);

-- Source statement 36
ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

-- Source statement 37
DROP POLICY IF EXISTS "pii_access_log_service_role" ON public.pii_access_log;

-- Source statement 38
CREATE POLICY "pii_access_log_service_role"
  ON public.pii_access_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 39
DROP POLICY IF EXISTS "pii_access_log_admin_read" ON public.pii_access_log;

-- Source statement 40
CREATE POLICY "pii_access_log_admin_read"
  ON public.pii_access_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_agents ta
      WHERE ta.clerk_user_id = NULLIF(auth.jwt() ->> 'sub', '')
        AND ta.role = 'admin'
        AND public.is_current_tenant(ta.tenant_id)
    )
  );

-- Source statement 41
CREATE OR REPLACE FUNCTION public.decrypt_pii(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_action TEXT DEFAULT 'view',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact RECORD;
  v_agent RECORD;
  v_result JSONB := '{}'::jsonb;
  v_key TEXT;
  v_field TEXT;
  v_value JSONB;
BEGIN
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;

  SELECT id, tenant_id, assigned_agent_id, pii_encrypted
  INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id;

  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact % not found', p_contact_id;
  END IF;

  SELECT id, tenant_id, role, agent_slug, clerk_user_id
  INTO v_agent
  FROM public.tenant_agents
  WHERE id = p_requesting_agent_id;

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

  IF v_agent.role != 'admin' AND (v_agent.agent_slug IS DISTINCT FROM v_contact.assigned_agent_id) THEN
    RAISE EXCEPTION 'access denied: contact % is not assigned to agent %', p_contact_id, p_requesting_agent_id;
  END IF;

  IF v_contact.pii_encrypted IS NOT NULL THEN
    FOR v_field, v_value IN SELECT * FROM jsonb_each(v_contact.pii_encrypted)
    LOOP
      v_result := v_result || jsonb_build_object(v_field, public.decrypt_pii_value(v_value));
    END LOOP;
  END IF;

  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action, ip_address, user_agent)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, p_action, p_ip_address, p_user_agent);

  RETURN v_result;
END;
$$;

-- Source statement 42
REVOKE ALL ON FUNCTION public.decrypt_pii(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- Source statement 43
GRANT EXECUTE ON FUNCTION public.decrypt_pii(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source statement 44
CREATE OR REPLACE FUNCTION public.search_contacts_secure(
  p_query TEXT,
  p_requesting_agent_id UUID
)
RETURNS TABLE (contact_id UUID, masked_preview TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_phone TEXT;
  v_phone_hash TEXT;
  v_name_hash TEXT;
BEGIN
  SELECT id, tenant_id, role, agent_slug, clerk_user_id
  INTO v_agent
  FROM public.tenant_agents
  WHERE id = p_requesting_agent_id;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
  END IF;

  IF auth.role() = 'authenticated'
     AND v_agent.clerk_user_id IS DISTINCT FROM NULLIF(auth.jwt() ->> 'sub', '') THEN
    RAISE EXCEPTION 'access denied: requesting agent is not the signed-in Clerk user';
  END IF;

  v_phone := public.normalize_phone_e164(p_query);
  IF v_phone IS NOT NULL THEN
    v_phone_hash := public.pii_blind_index(v_phone);
  END IF;
  v_name_hash := public.pii_blind_index(p_query);

  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action)
  VALUES (NULL, p_requesting_agent_id, v_agent.clerk_user_id, 'search');

  RETURN QUERY
  SELECT c.id,
    (coalesce(c.first_initial, '') || '*** ' || coalesce(c.last_initial, '') || '**, --' || coalesce(c.phone_last4, '????'))
      AS masked_preview
  FROM public.contacts c
  WHERE c.tenant_id = v_agent.tenant_id
    AND (v_agent.role = 'admin' OR c.assigned_agent_id = v_agent.agent_slug)
    AND (
      (v_phone_hash IS NOT NULL AND c.phone_hash = v_phone_hash)
      OR c.name_search = v_name_hash
    );
END;
$$;

-- Source statement 45
REVOKE ALL ON FUNCTION public.search_contacts_secure(TEXT, UUID) FROM PUBLIC, anon;

-- Source statement 46
GRANT EXECUTE ON FUNCTION public.search_contacts_secure(TEXT, UUID) TO authenticated, service_role;
