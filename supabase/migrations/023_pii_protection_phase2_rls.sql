-- ============================================================
-- PII PROTECTION — PHASE 2 (part 1: DB enforcement)
-- Closes the gap left open by Phase 1: contacts_tenant_access
-- (migration 017) is a row-level policy that lets any authenticated
-- agent in a tenant SELECT every column of every contact, including
-- the plaintext PII columns pii_encrypted/decrypt_pii were meant to
-- gate. Row-level restriction (agent can only see assigned contacts)
-- would break the shared team pool this CRM is built around (any
-- agent can see and reassign any teammate's contact) — instead this
-- locks the specific PII columns at the column-privilege level,
-- leaving row-level (tenant-wide) visibility untouched.
--
-- After this migration, `authenticated` cannot SELECT plaintext PII
-- columns on public.contacts directly (select("*") or naming them
-- explicitly both fail with "permission denied for column ...").
-- The only way to read them is through decrypt_pii()/search_contacts_
-- secure(), which permission-check per-contact-assignment and log to
-- pii_access_log. service_role is untouched (Postgres functions and
-- ops tooling still have full access).
-- ============================================================

-- ------------------------------------------------------------
-- Presence flags for fields that have no blind-index/initial
-- column to signal "is this set" without reading the value.
-- Needed so callers that only need to know whether a plaintext
-- field is already populated (e.g. contact-import fill-blanks-only
-- dedup) don't need a decrypt_pii round trip just to check presence.
-- Booleans carry no PII themselves.
-- ------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_set BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dob_set BOOLEAN NOT NULL DEFAULT false;

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

-- Backfill the new presence flags for existing rows (fires the
-- trigger, which recomputes everything else too — idempotent).
UPDATE public.contacts SET first_name = first_name;

-- ------------------------------------------------------------
-- log_pii_access: permission-checked audit-log insert with no
-- decryption. Used for events that touch PII without going through
-- decrypt_pii (e.g. a browser copy event on an already-revealed
-- field — the value was already decrypted client-side; this just
-- records that it left the field).
-- ------------------------------------------------------------
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

  INSERT INTO public.pii_access_log (contact_id, agent_id, clerk_user_id, action, ip_address, user_agent)
  VALUES (p_contact_id, p_requesting_agent_id, v_agent.clerk_user_id, p_action, p_ip_address, p_user_agent);
END;
$$;

REVOKE ALL ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- match_contacts_by_phone: batch dedup lookup for CSV import. The
-- import UI needs to know, per phone number in the file, whether a
-- contact already exists and which fields it's missing (to fill
-- blanks without overwriting) — without ever reading plaintext PII
-- client-side. Computes the same blind index search_contacts_secure
-- uses, batched, and returns only the masked-safe columns.
-- ------------------------------------------------------------
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
  SELECT ta.id, ta.tenant_id INTO v_agent
  FROM public.tenant_agents ta
  WHERE ta.id = p_requesting_agent_id;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'requesting agent % not found', p_requesting_agent_id;
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

REVOKE ALL ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contacts_by_phone(TEXT[], UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Column-level lockdown. Row-level access (contacts_tenant_access)
-- is unchanged — the shared tenant-wide contact list still works.
-- phone_hash/name_search stay revoked too: every legitimate lookup
-- goes through search_contacts_secure() or match_contacts_by_phone()
-- above (both SECURITY DEFINER, so they retain access regardless),
-- not a direct table read of the blind-index columns.
-- ------------------------------------------------------------
REVOKE SELECT (
  first_name, last_name, phone, email, dob, address, mbi_last4,
  pii_encrypted, phone_hash, name_search
) ON public.contacts FROM authenticated, anon;

GRANT SELECT (
  id, tenant_id, zip, county, state, medicare_parts, current_carrier,
  current_plan, status, source, assigned_agent_id, do_not_call,
  ghl_contact_id, first_initial, last_initial, phone_last4,
  email_set, dob_set, created_at, updated_at
) ON public.contacts TO authenticated;

-- ------------------------------------------------------------
-- Seed the admin role from the tenant roster identity. Clerk user ids are
-- case-sensitive and are assigned by a later identity backfill migration.
-- ------------------------------------------------------------
UPDATE public.tenant_agents
SET role = 'admin'
WHERE agent_slug = 'mike_shiomos'
   OR lower(btrim(name)) = 'mike shiomos';
