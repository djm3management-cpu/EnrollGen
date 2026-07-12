-- ============================================================
-- FIX: mbi_last4 is not full PII
-- Migration 017's own design comment says the point of storing only
-- the last 4 of the MBI is to avoid a PHI-at-rest surface — it's
-- meant to be exactly as low-sensitivity as phone_last4 (already
-- freely readable). Phases 1/2 incorrectly folded it into the
-- encrypted-blob/revoked-column PII set, which made it unreadable
-- and un-editable without a full PII reveal. This corrects that:
-- mbi_last4 goes back to being a plain, freely selectable column.
-- ============================================================

GRANT SELECT (mbi_last4) ON public.contacts TO authenticated;

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
