-- Canonical phone identity, preservation of legacy duplicates, and explicit merge.
BEGIN;
LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    WHEN regexp_replace(raw, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      THEN '+' || regexp_replace(raw, '[^0-9]', '', 'g')
    WHEN regexp_replace(raw, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
      THEN '+1' || regexp_replace(raw, '[^0-9]', '', 'g')
    WHEN btrim(raw) ~ '^\+[1-9][0-9]{7,14}$' THEN btrim(raw)
    ELSE NULL
  END;
$$;

CREATE TABLE public.contact_merge_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  kept_contact_id UUID NOT NULL,
  merged_contact_id UUID NOT NULL,
  -- Preserve conflicting values encrypted at rest, including custom PII fields.
  encrypted_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_merge_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_merge_archive FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_contacts_internal(p_keep UUID, p_drop UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.contacts; b public.contacts; fk RECORD;
BEGIN
  -- Stable lock order also serializes concurrent reciprocal merges.
  PERFORM id FROM public.contacts WHERE id IN (p_keep, p_drop) ORDER BY id FOR UPDATE;
  SELECT * INTO a FROM public.contacts WHERE id = p_keep;
  SELECT * INTO b FROM public.contacts WHERE id = p_drop;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR a.tenant_id != b.tenant_id THEN
    RAISE EXCEPTION 'Contacts cannot be merged';
  END IF;
  INSERT INTO public.contact_merge_archive(tenant_id, kept_contact_id, merged_contact_id, encrypted_snapshot)
  VALUES(a.tenant_id, a.id, b.id, public.encrypt_pii_value(to_jsonb(b)::text));
  -- Move every single-column FK, including messages, notes, calls, policies,
  -- lead intelligence and PII audit history. Media stays attached to messages.
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, att.attname AS col
    FROM pg_constraint c JOIN pg_attribute att
      ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.contacts'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.col, fk.col) USING p_keep, p_drop;
  END LOOP;
  DELETE FROM public.contacts WHERE id = p_drop;
  UPDATE public.contacts SET
    first_name = coalesce(a.first_name, b.first_name), last_name = coalesce(a.last_name, b.last_name),
    phone = coalesce(a.phone, b.phone), email = coalesce(a.email, b.email), dob = coalesce(a.dob, b.dob),
    address = coalesce(a.address, b.address), zip = coalesce(a.zip, b.zip), county = coalesce(a.county, b.county),
    state = coalesce(a.state, b.state), assigned_agent_id = coalesce(a.assigned_agent_id, b.assigned_agent_id),
    current_carrier = coalesce(a.current_carrier, b.current_carrier), current_plan = coalesce(a.current_plan, b.current_plan),
    medicare_parts = coalesce(a.medicare_parts, b.medicare_parts), mbi_last4 = coalesce(a.mbi_last4, b.mbi_last4),
    do_not_call = a.do_not_call OR b.do_not_call
  WHERE id = p_keep;
  -- Existing encryption trigger retains survivor-only custom keys; fill missing ones.
  UPDATE public.contacts SET pii_encrypted = coalesce(b.pii_encrypted, '{}'::jsonb) || coalesce(pii_encrypted, '{}'::jsonb)
  WHERE id = p_keep;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_contacts_internal(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Repair existing formatted duplicates before enforcing canonical uniqueness.
DO $$
DECLARE grp RECORD; duplicate_id UUID;
BEGIN
  FOR grp IN SELECT tenant_id, public.normalize_phone_e164(phone) AS canonical,
    (array_agg(id ORDER BY (assigned_agent_id IS NOT NULL) DESC, created_at, id))[1] AS keep_id,
    array_agg(id) AS ids
    FROM public.contacts WHERE public.normalize_phone_e164(phone) IS NOT NULL
    GROUP BY tenant_id, public.normalize_phone_e164(phone) HAVING count(*) > 1
  LOOP
    FOREACH duplicate_id IN ARRAY grp.ids LOOP
      IF duplicate_id != grp.keep_id THEN PERFORM public.merge_contacts_internal(grp.keep_id, duplicate_id); END IF;
    END LOOP;
  END LOOP;
END $$;
UPDATE public.contacts SET phone = public.normalize_phone_e164(phone)
WHERE public.normalize_phone_e164(phone) IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);

CREATE OR REPLACE FUNCTION public.contacts_normalize_phone()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF nullif(btrim(NEW.phone), '') IS NOT NULL AND public.normalize_phone_e164(NEW.phone) IS NULL THEN
    RAISE EXCEPTION 'Enter a valid phone number, including its area code.' USING ERRCODE = '22023';
  END IF;
  NEW.phone := public.normalize_phone_e164(NEW.phone);
  RETURN NEW;
END;
$$;
-- Alphabetical ordering makes normalization precede PII encryption/indexing.
CREATE TRIGGER contacts_00_normalize_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_normalize_phone();

CREATE OR REPLACE FUNCTION public.merge_contacts_secure(
  p_keep_id UUID, p_duplicate_id UUID, p_phone TEXT, p_requesting_agent_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents; c public.contacts; n TEXT;
BEGIN
  SELECT * INTO a FROM public.tenant_agents WHERE id = p_requesting_agent_id;
  IF a.id IS NULL OR a.clerk_user_id IS DISTINCT FROM nullif(auth.jwt()->>'sub', '') THEN
    RAISE EXCEPTION 'Your agent account is not linked to this session';
  END IF;
  PERFORM id FROM public.contacts WHERE id IN (p_keep_id, p_duplicate_id) ORDER BY id FOR UPDATE;
  FOR c IN SELECT * FROM public.contacts WHERE id IN (p_keep_id, p_duplicate_id) LOOP
    IF c.tenant_id != a.tenant_id OR (a.role != 'admin' AND c.assigned_agent_id IS DISTINCT FROM a.agent_slug) THEN
      RAISE EXCEPTION 'Only the assigned agent or an administrator can merge these contacts';
    END IF;
  END LOOP;
  n := public.normalize_phone_e164(p_phone);
  IF n IS NULL OR NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = p_duplicate_id AND public.normalize_phone_e164(phone) = n) THEN
    RAISE EXCEPTION 'The duplicate changed. Refresh and try again.';
  END IF;
  PERFORM public.merge_contacts_internal(p_keep_id, p_duplicate_id);
  UPDATE public.contacts SET phone = n WHERE id = p_keep_id;
  INSERT INTO public.pii_access_log(contact_id, agent_id, clerk_user_id, action)
  VALUES(p_keep_id, a.id, a.clerk_user_id, 'edit');
END;
$$;
REVOKE ALL ON FUNCTION public.merge_contacts_secure(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_contacts_secure(UUID, UUID, TEXT, UUID) TO authenticated;

-- SMS-created contacts must pass the existing source constraint.
ALTER TABLE public.contacts DROP CONSTRAINT contacts_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_source_check
CHECK (source IN ('fmo_transfer', 'tms', 'manual', 'ghl_import', 'sms_inbound'));
UPDATE public.messages SET
  from_number = coalesce(public.normalize_phone_e164(from_number), from_number),
  to_number = coalesce(public.normalize_phone_e164(to_number), to_number);
CREATE OR REPLACE FUNCTION public.messages_normalize_phone()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.from_number := coalesce(public.normalize_phone_e164(NEW.from_number), NEW.from_number);
  NEW.to_number := coalesce(public.normalize_phone_e164(NEW.to_number), NEW.to_number);
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_normalize_phone BEFORE INSERT OR UPDATE OF from_number, to_number ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_normalize_phone();

-- Keep active conversations visible at the top of the contact list.
CREATE OR REPLACE FUNCTION public.messages_touch_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.contacts SET updated_at = now() WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_touch_contact AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_touch_contact();
COMMIT;
