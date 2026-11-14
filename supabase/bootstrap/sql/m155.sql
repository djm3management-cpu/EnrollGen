-- Source statement 1
BEGIN;

-- Source statement 2
CREATE FUNCTION public.create_workspace_record(p_table text,p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i record; allowed text[]; fields jsonb; result jsonb; cols text; key text; c public.contacts; s public.sessions;
BEGIN
 SELECT * INTO i FROM public.current_deployment_identity();
 IF i.tenant_id IS NULL THEN RAISE EXCEPTION 'Active deployment membership required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_fields)<>'object' OR p_fields ?| ARRAY['id','tenant_id','clerk_user_id','clerk_org_id','organization_id','role','actor','agent_id','assigned_agent_id','writing_agent_id','created_by'] THEN
  RAISE EXCEPTION 'Identity fields are service managed' USING ERRCODE='42501';
 END IF;
 CASE p_table
 WHEN 'contacts' THEN allowed:=ARRAY['first_name','last_name','phone','email','dob','address','zip','county','state','medicare_parts','current_carrier','current_plan','status','do_not_call'];
 WHEN 'contact_notes' THEN allowed:=ARRAY['contact_id','body','pinned'];
 WHEN 'contact_activities' THEN allowed:=ARRAY['contact_id','type','summary','ref_id'];
 WHEN 'policies' THEN allowed:=ARRAY['contact_id','carrier','plan_name','plan_id','product_line','effective_date','status'];
 WHEN 'cross_sell_attempts' THEN allowed:=ARRAY['session_id','call_transcript_id','primary_product','primary_carrier','cross_sell_product','presented','client_response','decline_reason','metadata'];
 WHEN 'user_preferences' THEN allowed:=ARRAY['theme_preference'];
 ELSE RAISE EXCEPTION 'Unsupported workspace mutation' USING ERRCODE='42501';
 END CASE;
 FOR key IN SELECT jsonb_object_keys(p_fields) LOOP
  IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Unsupported content field' USING ERRCODE='42501'; END IF;
 END LOOP;
 fields:=p_fields;
 IF p_table='user_preferences' THEN
  INSERT INTO public.user_preferences(clerk_user_id,theme_preference) VALUES(auth.jwt()->>'sub',p_fields->>'theme_preference')
  ON CONFLICT(clerk_user_id) DO UPDATE SET theme_preference=excluded.theme_preference RETURNING to_jsonb(user_preferences) INTO result;
  RETURN result;
 END IF;
 fields:=fields||jsonb_build_object('tenant_id',i.tenant_id);
 IF p_table='contacts' THEN fields:=fields||jsonb_build_object('assigned_agent_id',i.agent_slug,'source','manual');
 ELSIF p_table='cross_sell_attempts' THEN
  SELECT * INTO s FROM public.sessions WHERE id=(fields->>'session_id')::uuid AND tenant_id=i.tenant_id AND agent_id=i.agent_id;
  IF s.id IS NULL OR (nullif(fields->>'call_transcript_id','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.call_transcripts t WHERE t.id=(fields->>'call_transcript_id')::uuid AND t.session_id=s.id AND t.tenant_id=i.tenant_id)) THEN
   RAISE EXCEPTION 'Session access denied' USING ERRCODE='42501';
  END IF;
  fields:=fields||jsonb_build_object('agent_id',i.agent_id);
 ELSE
  SELECT * INTO c FROM public.contacts WHERE id=(fields->>'contact_id')::uuid AND tenant_id=i.tenant_id;
  IF c.id IS NULL OR NOT public.deployment_can_access_contact(c.id) THEN RAISE EXCEPTION 'Contact access denied' USING ERRCODE='42501'; END IF;
  IF p_table='contact_notes' THEN fields:=fields||jsonb_build_object('agent_id',i.agent_slug); END IF;
  IF p_table='policies' THEN fields:=fields||jsonb_build_object('writing_agent_id',i.agent_slug); END IF;
 END IF;
 SELECT string_agg(quote_ident(k),',') INTO cols FROM jsonb_object_keys(fields) k;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) RETURNING to_jsonb(%I)',p_table,cols,cols,p_table,p_table)
 INTO result USING fields;
 IF p_table='contacts' THEN result:=result-ARRAY['first_name','last_name','phone','email','dob','address','mbi_last4','pii_encrypted','phone_hash','name_search']; END IF;
 RETURN result;
END $$;

-- Source statement 3
REVOKE ALL ON FUNCTION public.create_workspace_record(text,jsonb) FROM PUBLIC,anon;

-- Source statement 4
GRANT EXECUTE ON FUNCTION public.create_workspace_record(text,jsonb) TO authenticated,service_role;

-- Source statement 5
CREATE OR REPLACE FUNCTION public.ensure_opportunities_pipeline(p_tenant_id uuid,p_requesting_agent_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 PERFORM public.opportunities_assert_agent(p_tenant_id,p_requesting_agent_id);
 SELECT id INTO result FROM public.pipelines WHERE tenant_id=p_tenant_id AND is_default;
 IF result IS NULL THEN RAISE EXCEPTION 'An operator must provision the default pipeline'; END IF;
 RETURN result;
END $$;

-- Source statement 6
REVOKE ALL ON FUNCTION public.ensure_opportunities_pipeline(uuid,uuid) FROM PUBLIC,anon;

-- Source statement 7
GRANT EXECUTE ON FUNCTION public.ensure_opportunities_pipeline(uuid,uuid) TO authenticated,service_role;

-- Source statement 8
NOTIFY pgrst,'reload schema';

-- Source statement 9
COMMIT;
