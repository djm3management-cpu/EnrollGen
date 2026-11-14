-- UNAPPLIED. Replace every installed policy (including unknown bootstrap
-- policies), revoke TABLE AND COLUMN grants, then install an explicit allowlist.
BEGIN;
SET LOCAL lock_timeout='5s';
-- Reject even a zero-row PATCH/DELETE from an unprovisioned browser subject,
-- rather than relying on RLS silently filtering all target rows.
CREATE FUNCTION public.deployment_require_member_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_setting('role',true)='anon' OR (current_setting('role',true)='authenticated'
  AND NOT EXISTS(SELECT 1 FROM public.current_deployment_identity())) THEN
  RAISE EXCEPTION 'Active deployment membership required' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.deployment_require_member_write() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.deployment_row_visible(p_table text,r jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; t uuid; parent jsonb; owner_id uuid;
BEGIN
 SELECT * INTO i FROM public.current_deployment_identity();
 IF i.tenant_id IS NULL THEN RETURN false; END IF;
 t:=nullif(r->>'tenant_id','')::uuid;
 IF t IS NOT NULL AND t<>i.tenant_id THEN RETURN false; END IF;
 CASE
 WHEN p_table='tenants' THEN RETURN r->>'id'=i.tenant_id::text;
 WHEN p_table IN ('tenant_agents','enrolled_agents') THEN RETURN t=i.tenant_id;
 WHEN p_table='agents' THEN
  RETURN EXISTS(SELECT 1 FROM public.call_transcripts ct WHERE ct.agent_id=(r->>'id')::uuid AND public.deployment_row_visible('call_transcripts',to_jsonb(ct)));
 WHEN p_table='contacts' THEN RETURN public.deployment_can_access_contact((r->>'id')::uuid);
 WHEN p_table IN ('contact_notes','contact_activities','contact_lead_intel','policies','messages','contact_tags','opportunities','follow_ups') THEN
  IF NOT public.deployment_can_access_contact(nullif(r->>'contact_id','')::uuid) THEN RETURN false; END IF;
  IF p_table='contact_notes' THEN RETURN r->>'agent_id'=i.agent_slug OR public.deployment_is_admin(i.tenant_id); END IF;
  IF p_table='follow_ups' THEN RETURN public.follow_up_access(t,r->>'agent_id'); END IF;
  IF p_table='opportunities' THEN RETURN r->>'assigned_agent_id'=i.roster_id::text OR public.deployment_is_admin(i.tenant_id); END IF;
  RETURN t=i.tenant_id;
 WHEN p_table IN ('opportunity_events','opportunity_stage_history') THEN
  SELECT to_jsonb(o) INTO parent FROM public.opportunities o WHERE o.id=(r->>'opportunity_id')::uuid;
  RETURN public.deployment_row_visible('opportunities',parent);
 WHEN p_table='call_disposition_opportunity_log' THEN
  SELECT to_jsonb(c) INTO parent FROM public.call_records c WHERE c.id=(r->>'call_id')::uuid;
  RETURN public.deployment_row_visible('call_records',parent);
 WHEN p_table IN ('pipelines','pipeline_stages') THEN RETURN t=i.tenant_id;
 WHEN p_table IN ('script_templates','knowledge_base') THEN RETURN t=i.tenant_id OR t IS NULL;
 WHEN p_table='message_media' THEN
  SELECT to_jsonb(m) INTO parent FROM public.messages m WHERE m.id=(r->>'message_id')::uuid;
  RETURN public.deployment_row_visible('messages',parent);
 WHEN p_table='knowledge_updates' THEN
  SELECT to_jsonb(k) INTO parent FROM public.knowledge_base k WHERE k.id=(r->>'knowledge_base_id')::uuid;
  RETURN public.deployment_row_visible('knowledge_base',parent);
 WHEN p_table IN ('sessions','call_records','call_logs','sales_log','call_threads','agent_compliance_profiles','corrective_actions','cross_sell_attempts') THEN
  owner_id:=nullif(r->>'agent_id','')::uuid;
  IF t IS NULL THEN SELECT e.tenant_id INTO t FROM public.enrolled_agents e WHERE e.id=owner_id; END IF;
  RETURN public.deployment_can_read_agent(t,owner_id);
 WHEN p_table='call_transcripts' THEN
  owner_id:=nullif(r->>'owner_agent_id','')::uuid;
  IF owner_id IS NOT NULL THEN RETURN public.deployment_can_read_agent(t,owner_id); END IF;
  SELECT to_jsonb(s) INTO parent FROM public.sessions s WHERE s.id=(r->>'session_id')::uuid AND s.tenant_id=t;
  RETURN public.deployment_row_visible('sessions',parent);
 WHEN p_table='transcript_chunks' THEN
  SELECT to_jsonb(c) INTO parent FROM public.call_transcripts c WHERE c.id=(r->>'transcript_id')::uuid;
  RETURN public.deployment_row_visible('call_transcripts',parent);
 WHEN p_table IN ('compliance_flags','section_scores') THEN
  SELECT to_jsonb(s) INTO parent FROM public.sessions s WHERE s.id=(r->>'session_id')::uuid;
  RETURN public.deployment_row_visible('sessions',parent);
 WHEN p_table IN ('compliance_scorecards','compliance_scores','intent_detections','phi_redactions','followup_queue','enrollment_intakes') THEN
  SELECT to_jsonb(c) INTO parent FROM public.call_records c WHERE c.id=(r->>'call_id')::uuid;
  RETURN public.deployment_row_visible('call_records',parent);
 WHEN p_table='scorecard_items' THEN
  SELECT to_jsonb(s) INTO parent FROM public.compliance_scorecards s WHERE s.id=(r->>'scorecard_id')::uuid;
  RETURN public.deployment_row_visible('compliance_scorecards',parent);
 WHEN p_table='inbound_calls' THEN
  SELECT to_jsonb(c) INTO parent FROM public.call_records c WHERE c.id=(r->>'call_record_id')::uuid AND c.tenant_id=t;
  RETURN public.deployment_row_visible('call_records',parent);
 WHEN p_table='telephony_events' THEN
  SELECT to_jsonb(c) INTO parent FROM public.call_records c WHERE c.twilio_call_sid=coalesce(r->>'twilio_call_sid',r->>'call_sid') AND c.tenant_id=t;
  RETURN public.deployment_row_visible('call_records',parent);
 WHEN p_table='carrier_rts' THEN RETURN t=i.tenant_id AND (r->>'agent_id'=i.roster_id::text OR public.deployment_is_admin(t));
 WHEN p_table='pii_access_log' THEN RETURN r->>'clerk_user_id'=auth.jwt()->>'sub' OR
  (public.deployment_is_admin(i.tenant_id) AND EXISTS(SELECT 1 FROM public.tenant_agents a WHERE a.id=(r->>'agent_id')::uuid AND a.tenant_id=i.tenant_id));
 WHEN p_table IN ('subscriptions','usage_records','rts_ingestion_log','call_insights','agent_coaching') THEN RETURN t=i.tenant_id AND public.deployment_is_admin(t);
 WHEN p_table IN ('calibration_runs','calibration_overrides','autoresearch_iterations') THEN RETURN false; -- legacy rows have no reliable tenant binding
 WHEN p_table='training_completions' THEN RETURN t=i.tenant_id AND (r->>'agent_id'=i.agent_id::text OR r->>'agent_id'=auth.jwt()->>'sub' OR public.deployment_is_admin(t));
 WHEN p_table='user_preferences' THEN RETURN r->>'clerk_user_id'=auth.jwt()->>'sub';
 WHEN p_table IN ('compliance_intents','scoring_templates','scoring_template_items') THEN RETURN true; -- authenticated deployment reference data
 ELSE RETURN false; -- unrecognized, missing-baseline and service ledgers stay closed
 END CASE;
 RETURN false;
END $$;
-- Team evidence review does not grant another agent's disposition/task writes.
CREATE FUNCTION public.deployment_row_writable(p_table text,r jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_id uuid; tenant uuid:=(r->>'tenant_id')::uuid;
BEGIN
 IF public.deployment_row_visible(p_table,r) IS NOT TRUE THEN RETURN false; END IF;
 IF p_table IN ('call_records','followup_queue') THEN
  IF public.deployment_is_admin(tenant) THEN RETURN true; END IF;
  IF p_table='call_records' THEN owner_id:=nullif(r->>'agent_id','')::uuid;
  ELSE SELECT c.agent_id INTO owner_id FROM public.call_records c WHERE c.tenant_id=tenant AND c.id=(r->>'call_id')::uuid; END IF;
  RETURN public.evidence_owns_agent(owner_id,tenant);
 END IF;
 RETURN true;
END $$;
-- An exhaustive reset matters: permissive policies combine with OR. Unknown
-- public tables are closed too, so an omitted historical object cannot leak.
DO $reset$ DECLARE rel record; pol record; col record; BEGIN
 FOR rel IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel.relname);
  EXECUTE format('DROP TRIGGER IF EXISTS pilot_require_member_write ON public.%I',rel.relname);
  EXECUTE format('CREATE TRIGGER pilot_require_member_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.deployment_require_member_write()',rel.relname);
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=rel.relname LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,rel.relname);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',rel.relname);
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=rel.relname LOOP
   EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.column_name,rel.relname);
  END LOOP;
  EXECUTE format('GRANT ALL ON public.%I TO service_role',rel.relname);
 END LOOP;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated;
END $reset$;
-- Genuinely public reference data only. No agency identity, credentials, PII,
-- custom scripts, rosters or operational ledgers belong in this allowlist.
DO $public_reference$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['birthday_rule_states','bulletin_feed_status','bulletins','carrier_profiles',
 'cms_county_penetration','cms_plan_embeddings_py2027','cms_plans_py2027','csnp_carrier_verification',
 'dsnp_eae_lookup','fema_disasters','plan_terminations','qhp_landscape_2026','snp_plans_by_county',
 'snp_routing_rules','star_ratings_by_county','state_excess_charge_rules','zip_county_crosswalk'] LOOP
  IF to_regclass('public.'||name) IS NOT NULL THEN
   EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',name);
   EXECUTE format('CREATE POLICY pilot_public_reference ON public.%I FOR SELECT TO anon,authenticated USING (%s)',name,CASE WHEN name IN ('cms_plans_py2027','cms_plan_embeddings_py2027','dsnp_eae_lookup') THEN 'plan_year=2027' ELSE 'true' END);
  END IF;
 END LOOP;
END $public_reference$;
DO $reads$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['agents','tenants','tenant_agents','enrolled_agents','contacts','contact_notes','contact_activities',
 'contact_lead_intel','policies','messages','message_media','contact_tags','opportunities','opportunity_events',
 'opportunity_stage_history','call_disposition_opportunity_log','follow_ups','pipelines','pipeline_stages',
 'script_templates','knowledge_base','knowledge_updates','sessions','call_records','call_logs','sales_log','call_threads',
 'agent_compliance_profiles','corrective_actions','cross_sell_attempts','call_transcripts','transcript_chunks',
 'compliance_flags','section_scores','compliance_scorecards','compliance_scores','intent_detections','phi_redactions',
 'followup_queue','scorecard_items','inbound_calls','telephony_events','carrier_rts','pii_access_log','subscriptions',
 'usage_records','rts_ingestion_log','call_insights','agent_coaching','training_completions','user_preferences',
 'compliance_intents','scoring_templates','scoring_template_items'] LOOP
  IF to_regclass('public.'||name) IS NOT NULL THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',name);
   EXECUTE format('CREATE POLICY pilot_scoped_read ON public.%I FOR SELECT TO authenticated USING(public.deployment_row_visible(%L,to_jsonb(%I)))',name,name,name);
  END IF;
 END LOOP;
END $reads$;
-- Contacts retain the intended masked projection. A TABLE grant would override
-- column revocations, so revoke it first, then grant exactly the safe projection.
REVOKE SELECT ON public.contacts FROM authenticated;
DO $$ DECLARE col record; BEGIN
 FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts'
  AND column_name=ANY(ARRAY['id','tenant_id','zip','county','state','medicare_parts','current_carrier','current_plan','status','source',
  'assigned_agent_id','do_not_call','mbi_last4','ghl_contact_id','first_initial','last_initial','phone_last4','email_set','dob_set','created_at','updated_at']) LOOP
  EXECUTE format('GRANT SELECT (%I) ON public.contacts TO authenticated',col.column_name);
 END LOOP;
END $$;
DO $identity_projection$ DECLARE item text[]; col record; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
 ['agents','id,name'],
 ['tenants','id,name,clerk_org_id,ghl_location_id,coop_rates,carrier_options,agency_display_name,agency_npn,licensed_states,compliance_config,created_at,updated_at'],
 ['tenant_agents','id,tenant_id,name,npn,clerk_user_id,agent_slug,is_active,identity_aliases,licensed_states,created_at']
 ] LOOP
  EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated',item[1]);
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=item[1] AND column_name=ANY(string_to_array(item[2],',')) LOOP
   EXECUTE format('GRANT SELECT (%I) ON public.%I TO authenticated',col.column_name,item[1]);
  END LOOP;
 END LOOP;
END $identity_projection$;
-- Direct content updates only. No browser INSERT/DELETE/table UPDATE grant,
-- including admin browsers. Trusted RPCs derive all identity/ownership columns.
DO $updates$ DECLARE item text[]; name text; col text; cols text; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
 ['contacts','first_name,last_name,phone,email,dob,address,zip,county,state,medicare_parts,current_carrier,current_plan,status,do_not_call'],
 ['call_records','call_outcome,ancillary_product_type,sunfire_code'],
 ['contact_notes','body,pinned'],['policies','carrier,plan_name,plan_id,product_line,effective_date,status'],
 ['follow_ups','due_at,reason,status'],['followup_queue','followup_status,notes'],['messages','read_at'],
 ['user_preferences','theme_preference'],['carrier_rts','status,states,cert_date,notes']
 ] LOOP
  name:=item[1]; cols:='';
  IF to_regclass('public.'||name) IS NULL THEN CONTINUE; END IF;
  FOREACH col IN ARRAY string_to_array(item[2],',') LOOP
   IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=name AND column_name=col) THEN
    EXECUTE format('GRANT UPDATE (%I) ON public.%I TO authenticated',col,name);
   END IF;
  END LOOP;
  EXECUTE format('CREATE POLICY pilot_scoped_update ON public.%I FOR UPDATE TO authenticated USING(public.deployment_row_writable(%L,to_jsonb(%I))) WITH CHECK(public.deployment_row_writable(%L,to_jsonb(%I)))',name,name,name,name,name);
 END LOOP;
END $updates$;
-- All views execute with caller privileges. Only reviewed reporting views
-- retain prior browser reads; unreviewed and service views fail closed.
-- Materialized views cannot enforce underlying RLS and remain service-only.
DO $$ DECLARE rel record; col record; readable boolean; BEGIN
 FOR rel IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') LOOP
  readable:=has_table_privilege('authenticated','public.'||quote_ident(rel.relname),'SELECT');
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',rel.relname);
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=rel.relname LOOP
   EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.column_name,rel.relname);
  END LOOP;
  IF rel.relkind='v' AND readable AND rel.relname=ANY(ARRAY['v_enrollment_summary','v_agent_performance','v_compliance_overview','v_pipeline_status','v_daily_activity']) THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',rel.relname); END IF;
  IF rel.relkind='v' THEN EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',rel.relname);
  ELSE EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',rel.relname); END IF;
 END LOOP;
END $$;
-- Never authorize a storage object by a path prefix or browser-supplied owner.
-- Recordings already use short-lived server capabilities after owner checks.
-- Message attachments are tied to their protected message/contact metadata.
DO $$ DECLARE pol record; col record; BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
   EXECUTE format('DROP POLICY %I ON storage.objects',pol.policyname);
  END LOOP;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON storage.objects FROM PUBLIC,anon,authenticated;
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' LOOP
   EXECUTE format('REVOKE ALL (%I) ON storage.objects FROM PUBLIC,anon,authenticated',col.column_name);
  END LOOP;
  GRANT SELECT ON storage.objects TO authenticated;
  CREATE POLICY pilot_message_media_read ON storage.objects FOR SELECT TO authenticated USING(
   bucket_id='message-media' AND EXISTS(SELECT 1 FROM public.message_media m
    JOIN public.messages msg ON msg.id=m.message_id AND msg.tenant_id=m.tenant_id
    WHERE m.storage_path=storage.objects.name AND public.deployment_can_access_contact(msg.contact_id)));
 END IF;
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  UPDATE storage.buckets SET public=false WHERE id IN ('call-recordings','message-media');
  REVOKE ALL ON storage.buckets FROM PUBLIC,anon,authenticated;
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='storage' AND table_name='buckets' LOOP
   EXECUTE format('REVOKE ALL (%I) ON storage.buckets FROM PUBLIC,anon,authenticated',col.column_name);
  END LOOP;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
