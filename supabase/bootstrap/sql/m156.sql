-- Source statement 1
BEGIN;

-- Source statement 2
CREATE OR REPLACE FUNCTION public.deployment_log_owner(r jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t uuid:=(r->>'tenant_id')::uuid; owner_id uuid; item jsonb; slug text; subject text;
BEGIN
 IF nullif(r->>'call_record_id','') IS NOT NULL THEN
  SELECT c.agent_id INTO owner_id FROM public.call_records c WHERE c.tenant_id=t AND c.id=(r->>'call_record_id')::uuid;
  IF owner_id IS NOT NULL THEN RETURN owner_id; END IF;
  SELECT s.agent_id INTO owner_id FROM public.sessions s JOIN public.call_records c ON c.session_id=s.id AND c.tenant_id=s.tenant_id
   WHERE c.id=(r->>'call_record_id')::uuid AND c.tenant_id=t AND s.call_record_id=c.id;
  IF owner_id IS NOT NULL THEN RETURN owner_id; END IF;
 END IF;
 IF nullif(r->>'attempt_id','') IS NOT NULL THEN
  SELECT to_jsonb(a) INTO item FROM public.telephony_call_attempts a WHERE a.tenant_id=t AND a.id=(r->>'attempt_id')::uuid;
  slug:=item->>'agent_id';
 ELSIF nullif(r->>'inbound_call_id','') IS NOT NULL THEN
  SELECT to_jsonb(c) INTO item FROM public.inbound_calls c WHERE c.tenant_id=t AND c.id=(r->>'inbound_call_id')::uuid;
  slug:=coalesce(nullif(item->>'answered_agent_id',''),nullif(item->>'routed_agent_id',''));
 END IF;
 IF slug IS NULL THEN RETURN NULL; END IF;
 SELECT s.clerk_user_id INTO subject FROM public.availability_agent_subjects s WHERE s.tenant_id=t AND s.agent_slug=slug AND s.is_active;
 SELECT i.agent_id INTO owner_id FROM public.resolve_deployment_subject(subject,NULL) i WHERE i.tenant_id=t AND i.agent_slug=slug;
 RETURN owner_id;
END $$;

-- Source statement 3
REVOKE ALL ON FUNCTION public.deployment_log_owner(jsonb) FROM PUBLIC,anon,authenticated;

-- Source statement 4
GRANT EXECUTE ON FUNCTION public.deployment_log_owner(jsonb) TO service_role;

-- Source statement 5
DO $views$ DECLARE item text[]; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
  ['v_call_log','v_deployment_call_log'],
  ['v_call_log_entries','v_deployment_call_log_entries'],
  ['calls_missing_recordings','v_deployment_missing_recordings']
 ] LOOP
  IF to_regclass('public.'||item[1]) IS NOT NULL THEN
   EXECUTE format('GRANT SELECT ON public.%I TO service_role',item[1]);
   EXECUTE format('DROP VIEW IF EXISTS public.%I',item[2]);
   EXECUTE format('CREATE VIEW public.%I WITH (security_invoker=true) AS SELECT entry.*,public.deployment_log_owner(to_jsonb(entry)) AS owner_agent_id FROM public.%I entry',item[2],item[1]);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',item[2]);
   EXECUTE format('GRANT SELECT ON public.%I TO service_role',item[2]);
  END IF;
 END LOOP;
END $views$;

-- Source statement 6
NOTIFY pgrst,'reload schema';

-- Source statement 7
COMMIT;
