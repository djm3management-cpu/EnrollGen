-- SQL-only hotfix: blank encrypted fields are JSON null, not key envelopes.
-- No key rotation, data rewrite, RLS change or browser deployment required.
BEGIN;
CREATE OR REPLACE FUNCTION public.decrypt_pii_value(p_encrypted JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pii_vault
AS $$
DECLARE
  v_key_material TEXT;
BEGIN
  IF p_encrypted IS NULL OR p_encrypted = 'null'::jsonb THEN
    RETURN NULL;
  END IF;

  v_key_material := pii_vault.get_key((p_encrypted->>'k')::UUID);
  IF v_key_material IS NULL THEN
    RAISE EXCEPTION 'PII encryption key % not found', p_encrypted->>'k';
  END IF;

  RETURN extensions.pgp_sym_decrypt(decode(p_encrypted->>'c', 'base64'), v_key_material);
END;
$$;
-- CREATE OR REPLACE preserves the existing restricted execution grants.
COMMIT;
