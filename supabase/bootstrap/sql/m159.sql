-- Owner decision 1: minimize both existing and future encrypted CRM queue copies.
-- Canonical protected contact/intake PII is unchanged. Queue identity/leases are unchanged.
BEGIN;
LOCK TABLE public.ghl_enrollment_deliveries IN ACCESS EXCLUSIVE MODE;
CREATE FUNCTION public.minimize_ghl_delivery_snapshot() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE payload jsonb; reduced jsonb;
BEGIN
 payload := public.decrypt_pii_value(NEW.payload_encrypted)::jsonb;
 IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
  RAISE EXCEPTION 'Invalid CRM delivery snapshot';
 END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO reduced
 FROM jsonb_each(payload) WHERE key = ANY(ARRAY[
'planType','zip','firstName','lastName','phone','email','state','medicaid',
  'prevCarrier','newCarrier','planName','enrollCode','premium','sunfireCode',
  'effectiveDate','sixtyDayDate','sep','contractId','planId','segmentId',
  'enrollmentId','pcpName','agency','aor','assignedUserId','assignedTo','hra','hraDate','submittedAt'
 ]::text[]);
 NEW.payload_encrypted := public.encrypt_pii_value(reduced::text);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.minimize_ghl_delivery_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER minimize_ghl_delivery_snapshot
 BEFORE INSERT OR UPDATE OF payload_encrypted ON public.ghl_enrollment_deliveries
 FOR EACH ROW EXECUTE FUNCTION public.minimize_ghl_delivery_snapshot();
-- Project historical snapshots through the same boundary, retaining every allowed value.
-- The feature-off fence must not silently suppress this administrative cleanup.
-- The exclusive transaction lock prevents concurrent queue writes or claims;
-- the original enabled fence is restored before commit (or by rollback on error).
DO $$ DECLARE fence_state "char"; BEGIN
 SELECT tgenabled INTO fence_state FROM pg_trigger
 WHERE tgrelid='public.ghl_enrollment_deliveries'::regclass AND tgname='deployment_feature_fence';
 IF fence_state IS NOT NULL THEN
  IF fence_state <> 'O' THEN RAISE EXCEPTION 'CRM feature fence must be enabled before migration'; END IF;
  ALTER TABLE public.ghl_enrollment_deliveries DISABLE TRIGGER deployment_feature_fence;
 END IF;
 UPDATE public.ghl_enrollment_deliveries SET payload_encrypted=payload_encrypted;
 IF fence_state IS NOT NULL THEN
  ALTER TABLE public.ghl_enrollment_deliveries ENABLE TRIGGER deployment_feature_fence;
 END IF;
END $$;
COMMIT;
