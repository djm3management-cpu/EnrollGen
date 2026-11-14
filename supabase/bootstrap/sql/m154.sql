-- Source statement 1
BEGIN;

-- Source statement 2
CREATE OR REPLACE FUNCTION public.is_org_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(bool_or(public.deployment_is_admin(i.tenant_id)),false) FROM public.current_deployment_identity() i;
$$;

-- Source statement 3
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
  IF current_setting('role',true)<>'service_role' AND NOT public.deployment_can_access_contact(p_contact_id) THEN RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;

  SELECT id, tenant_id, assigned_agent_id, pii_encrypted INTO v_contact
  FROM public.contacts WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact % not found', p_contact_id;
  END IF;

  SELECT * INTO v_agent FROM public.deployment_assert_roster(p_requesting_agent_id);
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

-- Source statement 4
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
  SELECT * INTO v_agent FROM public.deployment_assert_roster(p_requesting_agent_id);
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
  WHERE c.tenant_id = v_agent.tenant_id AND (v_agent.role='admin' OR c.assigned_agent_id=v_agent.agent_slug)
    AND ((v_phone_hash IS NOT NULL AND c.phone_hash = v_phone_hash) OR c.name_search = v_name_hash);
END;
$$;

-- Source statement 5
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
  IF current_setting('role',true)<>'service_role' AND NOT public.deployment_can_access_contact(p_contact_id) THEN RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501'; END IF;
  IF p_field NOT IN ('mbi_full', 'ssn') THEN
    RAISE EXCEPTION 'field % is not a supported write-only PII field', p_field;
  END IF;
  SELECT id, tenant_id, assigned_agent_id, pii_encrypted INTO v_contact
  FROM public.contacts WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN RAISE EXCEPTION 'contact % not found', p_contact_id; END IF;
  SELECT * INTO v_agent FROM public.deployment_assert_roster(p_requesting_agent_id);
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

-- Source statement 6
CREATE OR REPLACE FUNCTION public.read_contact_details(
  p_contact_ids UUID[], p_requesting_agent_id UUID
) RETURNS TABLE(contact_id UUID, fields JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents; c RECORD; details JSONB;
BEGIN
  a := public.deployment_assert_roster(p_requesting_agent_id);
  IF a.id IS NULL OR (auth.role() = 'authenticated'
    AND a.clerk_user_id IS DISTINCT FROM nullif(auth.jwt()->>'sub', '')) THEN
    RAISE EXCEPTION 'Your agent account is not linked to this session';
  END IF;
  IF coalesce(cardinality(p_contact_ids), 0) > 200 THEN
    RAISE EXCEPTION 'Request at most 200 contacts at a time';
  END IF;
  FOR c IN SELECT id FROM public.contacts WHERE id = ANY(p_contact_ids) AND tenant_id = a.tenant_id AND (a.role='admin' OR assigned_agent_id=a.agent_slug) LOOP
    details := public.decrypt_pii(c.id, a.id, 'view');
    -- Only send fields needed by the CRM, never SSNs or encryption metadata.
    RETURN QUERY SELECT c.id, jsonb_build_object(
      'first_name', details->'first_name', 'last_name', details->'last_name',
      'phone', details->'phone', 'email', details->'email',
      'dob', details->'dob', 'address', details->'address', 'mbi_full', details->'mbi_full');
  END LOOP;
END;
$$;

-- Source statement 7
CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_contact_id UUID,
  p_requesting_agent_id UUID,
  p_action TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent RECORD;
BEGIN
  IF current_setting('role',true)<>'service_role' AND NOT public.deployment_can_access_contact(p_contact_id) THEN RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('view', 'edit', 'export', 'search') THEN
    RAISE EXCEPTION 'invalid pii_access_log action: %', p_action;
  END IF;
  SELECT * INTO v_agent FROM public.deployment_assert_roster(p_requesting_agent_id);
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

-- Source statement 8
CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(
  p_phones TEXT[], p_requesting_agent_id UUID
)
RETURNS TABLE (
  phone TEXT, id UUID, first_initial TEXT, last_initial TEXT,
  email_set BOOLEAN, dob_set BOOLEAN, zip TEXT, county TEXT, state TEXT,
  current_carrier TEXT, current_plan TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent RECORD;
BEGIN
  SELECT * INTO v_agent FROM public.deployment_assert_roster(p_requesting_agent_id);
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
  JOIN public.contacts c ON c.tenant_id = v_agent.tenant_id AND (v_agent.role='admin' OR c.assigned_agent_id=v_agent.agent_slug)
    AND c.phone_hash = public.pii_blind_index(public.normalize_phone_e164(input.phone));
END;
$$;

-- Source statement 9
CREATE OR REPLACE FUNCTION public.merge_contacts_secure(
  p_keep_id UUID, p_duplicate_id UUID, p_phone TEXT, p_requesting_agent_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.tenant_agents; c public.contacts; n TEXT;
BEGIN
  a := public.deployment_assert_roster(p_requesting_agent_id);
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

-- Source statement 10
CREATE OR REPLACE FUNCTION public.deployment_timezone() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE zone text; tenant uuid;
BEGIN
 SELECT tenant_id,public_profile->>'timezone' INTO tenant,zone FROM public.deployment_settings WHERE singleton;
 IF current_setting('role',true)='authenticated' AND NOT public.is_current_tenant(tenant) THEN
  RAISE EXCEPTION 'Active deployment membership required' USING ERRCODE='42501';
 END IF;
 IF zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Deployment timezone has not been provisioned'; END IF;
 RETURN zone;
END $$;

-- Source statement 11
DO $crm$ DECLARE routine record; definition text; BEGIN
 FOR routine IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('save_opportunity','read_opportunities','move_opportunity_stage','delete_opportunity',
  'add_contact_tag','read_contact_tags','remove_contact_tag','save_follow_up') LOOP
  definition:=pg_get_functiondef(routine.oid);
  IF routine.proname='save_follow_up' THEN
   definition:=replace(definition,'SELECT * INTO a FROM public.tenant_agents WHERE id = p_requesting_agent_id
    AND tenant_id = p_tenant_id AND is_active = true;',
    'a := public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);');
  END IF;
  IF routine.proname IN ('save_opportunity','add_contact_tag','save_follow_up') THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF current_setting(''role'',true)<>''service_role'' AND NOT public.deployment_can_access_contact('||
    CASE WHEN routine.proname='save_opportunity' THEN '(p_fields->>''contact_id'')::uuid' ELSE 'p_contact_id' END||
    ') THEN RAISE EXCEPTION ''Contact access denied'' USING ERRCODE=''42501''; END IF;','i');
  END IF;
  IF routine.proname='save_opportunity' THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF current_setting(''role'',true)<>''service_role'' AND (NOT public.deployment_is_admin(p_tenant_id)) AND ((p_fields->>''assigned_agent_id'')::uuid IS DISTINCT FROM p_requesting_agent_id OR (p_opportunity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.opportunities resource_check WHERE resource_check.id=p_opportunity_id AND resource_check.assigned_agent_id=p_requesting_agent_id AND public.deployment_can_access_contact(resource_check.contact_id)))) THEN RAISE EXCEPTION ''Opportunity access denied'' USING ERRCODE=''42501''; END IF;','i');
  END IF;
  IF routine.proname='read_opportunities' THEN
   definition:=replace(definition,'WHERE tenant_id = p_tenant_id AND deleted_at IS NULL',
    'WHERE tenant_id = p_tenant_id AND (current_setting(''role'',true)=''service_role'' OR public.deployment_row_visible(''opportunities'',to_jsonb(opportunities))) AND deleted_at IS NULL');
  END IF;
  IF routine.proname='read_contact_tags' THEN
   definition:=replace(definition,'WHERE tenant_id = p_tenant_id AND contact_id = ANY(p_contact_ids)',
    'WHERE tenant_id = p_tenant_id AND contact_id = ANY(p_contact_ids) AND (current_setting(''role'',true)=''service_role'' OR public.deployment_can_access_contact(contact_id))');
  END IF;
  IF routine.proname IN ('move_opportunity_stage','delete_opportunity','remove_contact_tag') THEN
   definition:=replace(definition,'PERFORM public.opportunities_assert_agent(',
    CASE WHEN routine.proname='remove_contact_tag' THEN
     'IF current_setting(''role'',true)<>''service_role'' AND NOT public.deployment_can_access_contact(tag.contact_id) THEN RAISE EXCEPTION ''Contact access denied'' USING ERRCODE=''42501''; END IF; PERFORM public.opportunities_assert_agent('
    ELSE 'IF current_setting(''role'',true)<>''service_role'' AND public.deployment_row_visible(''opportunities'',to_jsonb(o)) IS NOT TRUE THEN RAISE EXCEPTION ''Opportunity access denied'' USING ERRCODE=''42501''; END IF; PERFORM public.opportunities_assert_agent(' END);
   -- delete_opportunity uses an assignment rather than PERFORM.
   IF routine.proname='delete_opportunity' THEN
    definition:=replace(definition,'a := public.opportunities_assert_agent(',
     'IF current_setting(''role'',true)<>''service_role'' AND public.deployment_row_visible(''opportunities'',to_jsonb(o)) IS NOT TRUE THEN RAISE EXCEPTION ''Opportunity access denied'' USING ERRCODE=''42501''; END IF; a := public.opportunities_assert_agent(');
   END IF;
  END IF;
  EXECUTE definition;
 END LOOP;
END $crm$;

-- Source statement 12
DO $routines$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid,p.proname,p.prosecdef,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND l.lanname IN ('sql','plpgsql') LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,public,extensions,pg_temp',r.oid::regprocedure);
  IF r.proname='search_transcript_chunks' THEN EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER',r.oid::regprocedure); END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.oid::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.oid::regprocedure);
  -- This is the entire browser RPC/helper allowlist. Pipeline settings and
  -- provisioning mutations are deliberately service-only, including admins.
  IF r.proname=ANY(ARRAY['current_deployment_identity','is_current_tenant','deployment_timezone','deployment_is_admin',
   'deployment_can_read_agent','deployment_can_access_contact','deployment_row_visible','deployment_row_writable','evidence_tenant_member',
   'evidence_owns_agent','evidence_can_read_transcript','opportunities_is_tenant','follow_up_access','is_org_admin',
   'decrypt_pii','search_contacts_secure','log_pii_access','match_contacts_by_phone','update_pii_field',
   'read_contact_details','merge_contacts_secure','search_transcript_chunks','read_opportunities','save_opportunity',
   'move_opportunity_stage','delete_opportunity','read_opportunity_sources','read_contact_tags','add_contact_tag',
   'remove_contact_tag','save_follow_up','get_available_seps','get_counties_for_state','get_plans_for_county',
   'get_county_plan_counts','match_cms_plans_py2027_area','normalize_phone_e164','ensure_opportunities_pipeline']) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.oid::regprocedure);
  END IF;
 END LOOP;
END $routines$;

-- Source statement 13
DO $private_schemas$ DECLARE ns text; r record; BEGIN
 FOREACH ns IN ARRAY ARRAY['pii_vault','oct_slim_086_rollback','oct_slim_088_rollback'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=ns) THEN CONTINUE; END IF;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC,anon,authenticated',ns);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC,anon,authenticated',ns);
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ns LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,public,extensions,pg_temp',r.oid::regprocedure);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.oid::regprocedure);
  END LOOP;
 END LOOP;
END $private_schemas$;

-- Source statement 14
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;

-- Source statement 15
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;

-- Source statement 16
NOTIFY pgrst,'reload schema';

-- Source statement 17
COMMIT;
