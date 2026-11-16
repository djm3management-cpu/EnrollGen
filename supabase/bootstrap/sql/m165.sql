-- Deterministic, default-off recap; canonical enrollment and messaging stores only.
BEGIN;
CREATE FUNCTION public.valid_client_recap_templates(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE ch text; t jsonb; token text[]; remainder text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['sms','pdf'] OR v-ARRAY['sms','pdf']<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH ch IN ARRAY ARRAY['sms','pdf'] LOOP
  t:=v->ch;
  IF jsonb_typeof(t)<>'object' OR NOT t ?& ARRAY['body','next','disclaimer','version'] OR t-ARRAY['body','next','disclaimer','version']<>'{}'::jsonb
   OR jsonb_typeof(t->'body')<>'string' OR length(btrim(t->>'body'))=0 OR length(t->>'body')>1800
   OR t->>'next' IS DISTINCT FROM 'The carrier will send plan materials and a member card.'
   OR t->>'disclaimer' IS DISTINCT FROM 'Submission is not confirmation of coverage. The carrier determines enrollment status.'
   OR jsonb_typeof(t->'version')<>'number' OR (t->>'version') !~ '^[1-9][0-9]{0,8}$' THEN RETURN false; END IF;
  FOR token IN SELECT regexp_matches(t->>'body','\{\{([A-Za-z]+)\}\}','g') LOOP
   IF token[1]<>ALL(ARRAY['firstName','planName','carrier','planType','effectiveDate','confirmationNumber','agentName','agencyName','callbackNumber']) OR ch='sms' AND token[1]='confirmationNumber' THEN RETURN false; END IF;
  END LOOP;
  IF (t->>'body') ~ '\m[0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4}\M' OR (t->>'body') ~* '\m[1-9][A-HJ-NP-Z][A-HJ-NP-Z0-9][0-9][- ]?[A-HJ-NP-Z][A-HJ-NP-Z0-9][0-9][- ]?[A-HJ-NP-Z]{2}[0-9]{2}\M' THEN RETURN false; END IF;
  remainder:=regexp_replace(t->>'body','\{\{([A-Za-z]+)\}\}','','g');
  IF remainder ~ '[{}]' OR (t->>'body') ~ '[\x00-\x08\x0B-\x1F\x7F]' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.tenants ADD COLUMN client_recap_templates jsonb NOT NULL DEFAULT '{"sms":{"version":1,"body":"{{firstName}}, {{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}, effective {{effectiveDate}}. Questions: {{callbackNumber}}.","next":"The carrier will send plan materials and a member card.","disclaimer":"Submission is not confirmation of coverage. The carrier determines enrollment status."},"pdf":{"version":1,"body":"Hello {{firstName}},\n\n{{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}. Effective date: {{effectiveDate}}.\nConfirmation number: {{confirmationNumber}}.\nQuestions: call {{agencyName}} at {{callbackNumber}}.","next":"The carrier will send plan materials and a member card.","disclaimer":"Submission is not confirmation of coverage. The carrier determines enrollment status."}}'::jsonb CHECK(public.valid_client_recap_templates(client_recap_templates));
CREATE FUNCTION public.guard_client_recap_templates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ch text; t jsonb;
BEGIN
 IF NEW.client_recap_templates IS NOT DISTINCT FROM OLD.client_recap_templates THEN RETURN NEW; END IF;
 IF NOT public.deployment_feature_enabled('CLIENT_RECAP_ENABLED') OR NOT EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current()) THEN RAISE EXCEPTION 'Audited administrator required' USING ERRCODE='42501'; END IF;
 IF NOT public.valid_client_recap_templates(NEW.client_recap_templates) THEN RAISE EXCEPTION 'Invalid recap template' USING ERRCODE='22023'; END IF;
 FOREACH ch IN ARRAY ARRAY['sms','pdf'] LOOP
  t:=NEW.client_recap_templates->ch;
  IF t IS DISTINCT FROM OLD.client_recap_templates->ch THEN
   IF (t->>'version')::integer<>(OLD.client_recap_templates->ch->>'version')::integer THEN RAISE EXCEPTION 'Template changed; reload' USING ERRCODE='40001'; END IF;
   NEW.client_recap_templates:=jsonb_set(NEW.client_recap_templates,ARRAY[ch,'version'],to_jsonb((t->>'version')::integer+1));
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER client_recap_template_guard BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_client_recap_templates();

CREATE TABLE public.client_recaps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid NOT NULL REFERENCES public.enrollment_intakes(id) DEFERRABLE,
 contact_id uuid NOT NULL REFERENCES public.contacts(id) DEFERRABLE,agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 channel text NOT NULL CHECK(channel IN ('sms','pdf')),template_version integer NOT NULL CHECK(template_version>0),
 approved_by text NOT NULL,approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),enrollment_updated_at timestamptz NOT NULL,
 message_id uuid REFERENCES public.messages(id) DEFERRABLE,status text NOT NULL CHECK(status IN ('queued','sent','delivered','failed','downloaded')),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),retention_started_at timestamptz NOT NULL,
 CHECK(channel='sms' AND message_id IS NOT NULL OR channel='pdf' AND message_id IS NULL AND status='downloaded')
);
CREATE INDEX client_recaps_enrollment ON public.client_recaps(tenant_id,enrollment_id,approved_at,id);
ALTER TABLE public.client_recaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_recaps FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,DELETE ON public.client_recaps TO service_role;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.client_recaps FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.deployment_row_visible(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHEN p_table=''tenants'' THEN',
 'WHEN p_table=''client_recaps'' THEN
   SELECT to_jsonb(c) INTO parent FROM public.enrollment_intakes e JOIN public.call_records c ON c.id=e.call_id AND c.tenant_id=e.tenant_id WHERE e.id=(r->>''enrollment_id'')::uuid AND e.tenant_id=t AND c.agent_id=(r->>''agent_id'')::uuid;
   RETURN public.deployment_row_visible(''call_records'',parent);
  WHEN p_table=''tenants'' THEN');
 EXECUTE definition;
END $$;
CREATE POLICY recap_scoped_read ON public.client_recaps FOR SELECT TO authenticated USING(public.deployment_row_visible('client_recaps',to_jsonb(client_recaps)));

-- Read only the reviewed fields; no intake decryption and no arbitrary JSON escapes.
CREATE FUNCTION public.client_recap_source(p_actor text,p_org text,p_id uuid,p_status_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity record; e public.enrollment_intakes; c public.call_records; consumer public.contacts; fields jsonb; settings jsonb; profile jsonb; history jsonb; missing text[]:='{}'; reason text; can_send boolean;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('CLIENT_RECAP_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 IF identity.tenant_id IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.enrollment_intakes WHERE id=p_id AND tenant_id=identity.tenant_id;
 SELECT * INTO c FROM public.call_records WHERE id=e.call_id AND tenant_id=identity.tenant_id;
 SELECT * INTO consumer FROM public.contacts WHERE id=e.contact_id AND tenant_id=identity.tenant_id;
 IF e.id IS NULL OR c.id IS NULL OR consumer.id IS NULL OR NOT (identity.authority='admin' OR c.agent_id=identity.agent_id AND consumer.assigned_agent_id=identity.agent_slug OR identity.authority='manager' AND c.agent_id=ANY(identity.team_agent_ids) AND EXISTS(SELECT 1 FROM public.tenant_agents a JOIN public.enrolled_agents ea ON ea.clerk_user_id=a.clerk_user_id AND ea.tenant_id=a.tenant_id WHERE a.tenant_id=identity.tenant_id AND a.agent_slug=consumer.assigned_agent_id AND ea.id=ANY(identity.team_agent_ids))) THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='42501'; END IF;
 can_send:=identity.authority='admin' OR identity.authority='agent' AND c.agent_id=identity.agent_id;
 IF p_status_only IS DISTINCT FROM true AND NOT can_send THEN RAISE EXCEPTION 'Status only' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'channel',r.channel,'template_version',r.template_version,'approved_by',r.approved_by,'approved_at',r.approved_at,'status',r.status,'sha256',r.content_sha256,'out_of_date',e.updated_at>r.enrollment_updated_at) ORDER BY r.approved_at,r.id),'[]') INTO history FROM public.client_recaps r WHERE r.enrollment_id=e.id AND r.tenant_id=e.tenant_id;
 IF p_status_only IS TRUE THEN RETURN jsonb_build_object('history',history,'can_send',can_send,'admin',identity.authority='admin'); END IF;
 IF e.completed_at IS NULL OR e.submitted_at IS NULL OR e.is_test_enrollment THEN missing:=array_append(missing,'submitted enrollment'); END IF;
 IF nullif(btrim(e.data->>'planName'),'') IS NULL THEN missing:=array_append(missing,'plan name'); END IF;
 IF nullif(btrim(e.data->>'newCarrier'),'') IS NULL THEN missing:=array_append(missing,'carrier'); END IF;
 IF nullif(btrim(e.data->>'effectiveDate'),'') IS NULL THEN missing:=array_append(missing,'effective date'); END IF;
 SELECT public_profile INTO profile FROM public.deployment_settings WHERE singleton AND tenant_id=e.tenant_id;
 SELECT client_recap_templates INTO settings FROM public.tenants WHERE id=e.tenant_id;
 fields:=jsonb_build_object('firstName',e.data->>'firstName','planName',e.data->>'planName','carrier',e.data->>'newCarrier','planType',e.data->>'planType','effectiveDate',e.data->>'effectiveDate','confirmationNumber',coalesce(nullif(e.data->>'sunfireCode',''),e.data->>'enrollmentId'),'agentName',(SELECT name FROM public.enrolled_agents WHERE id=c.agent_id AND tenant_id=e.tenant_id),'agencyName',profile->>'agencyName','callbackNumber',profile->>'agencyLine');
 -- Existing DNC flag and permission records are authoritative; inbound STOP is
 -- conservatively permanent here (no inferred reconsent from a later message).
 reason:=CASE WHEN consumer.do_not_call THEN 'Consumer opted out.'
 WHEN EXISTS(SELECT 1 FROM public.messages m WHERE m.tenant_id=e.tenant_id AND m.contact_id=e.contact_id AND m.direction='inbound' AND upper(btrim(m.body)) IN ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT')) THEN 'Consumer opted out.'
 WHEN NOT EXISTS(SELECT 1 FROM public.call_records pc WHERE pc.tenant_id=e.tenant_id AND pc.contact_id=e.contact_id AND pc.ptc_on_file IS TRUE AND pc.ptc_date IS NOT NULL AND pc.ptc_date<=current_date AND pc.ptc_expiry IS NOT NULL AND pc.ptc_expiry>=current_date) THEN 'Current permission to contact is missing.'
 WHEN NOT EXISTS(SELECT 1 FROM public.messages m JOIN public.call_records pc ON pc.tenant_id=m.tenant_id AND pc.contact_id=m.contact_id WHERE m.tenant_id=e.tenant_id AND m.contact_id=e.contact_id AND m.channel='sms' AND m.direction='inbound' AND upper(btrim(m.body)) IN ('START','UNSTOP') AND pc.ptc_on_file IS TRUE AND pc.ptc_date IS NOT NULL AND pc.ptc_date<=current_date AND pc.ptc_expiry>=current_date AND m.created_at>=pc.ptc_date::timestamptz AND m.created_at<=clock_timestamp()) THEN 'Recorded text opt-in is missing.'
 WHEN public.normalize_phone_e164(consumer.phone) IS NULL THEN 'Consumer phone is missing or invalid.' ELSE NULL END;
 RETURN jsonb_build_object('fields',fields,'templates',settings,'missing',missing,'sms_reason',reason,'history',history,'can_send',can_send,'admin',identity.authority='admin','revision',e.updated_at);
END $$;
CREATE FUNCTION public.client_recap_render(fields jsonb,t jsonb,ch text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE body text:=t->>'body'; k text; v text; rendered text;
BEGIN
 IF ch NOT IN ('sms','pdf') OR fields-ARRAY['firstName','planName','carrier','planType','effectiveDate','confirmationNumber','agentName','agencyName','callbackNumber']<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid fields' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP
  v:=coalesce(nullif(v,''),'Not recorded');
  IF length(v)>200 OR v ~ '[{}\x00-\x1F\x7F]' THEN RAISE EXCEPTION 'Invalid field' USING ERRCODE='22023'; END IF;
  body:=replace(body,'{{'||k||'}}',v);
 END LOOP;
 rendered:=body||CASE WHEN ch='sms' THEN ' ' ELSE E'\n\n' END||(t->>'next')||CASE WHEN ch='sms' THEN ' ' ELSE E'\n\n' END||(t->>'disclaimer');
 IF ch='sms' AND nullif(fields->>'confirmationNumber','') IS NOT NULL AND strpos(rendered,fields->>'confirmationNumber')>0 THEN RAISE EXCEPTION 'Confirmation unavailable in text' USING ERRCODE='22023'; END IF;
 IF ch='sms' AND length(rendered)>480 OR length(rendered)>2600 THEN RAISE EXCEPTION 'Recap exceeds channel limit' USING ERRCODE='22023'; END IF;
 RETURN rendered;
END $$;
-- A transactional reservation serializes all sends/downloads for an intake.
-- Expected content/revision binds approval to the exact preview, including edits.
CREATE FUNCTION public.approve_client_recap(p_actor text,p_org text,p_id uuid,p_channel text,p_approved boolean,p_checksum text,p_revision timestamptz,p_resend boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE source jsonb; e public.enrollment_intakes; c public.call_records; content text; rid uuid:=gen_random_uuid(); mid uuid; phone text; template jsonb; prior boolean; allowance jsonb;
BEGIN
 IF p_approved IS DISTINCT FROM true OR p_channel IS NULL OR p_channel NOT IN ('sms','pdf') THEN RAISE EXCEPTION 'Approval required' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.enrollment_intakes WHERE id=p_id FOR UPDATE;
 PERFORM 1 FROM public.tenants WHERE id=e.tenant_id FOR SHARE;
 source:=public.client_recap_source(p_actor,p_org,p_id,false);
 IF jsonb_array_length(source->'missing')>0 THEN RAISE EXCEPTION 'Incomplete enrollment' USING ERRCODE='22023'; END IF;
 IF p_channel='sms' AND source->>'sms_reason' IS NOT NULL THEN RAISE EXCEPTION 'Channel unavailable' USING ERRCODE='42501'; END IF;
 template:=source->'templates'->p_channel;
 content:=public.client_recap_render(source->'fields',template,p_channel);
 IF p_checksum IS DISTINCT FROM encode(extensions.digest(content,'sha256'),'hex') OR p_revision IS DISTINCT FROM e.updated_at THEN RAISE EXCEPTION 'Preview changed' USING ERRCODE='40001'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.client_recaps WHERE enrollment_id=e.id AND channel=p_channel) INTO prior;
 IF prior AND (NOT coalesce(p_resend,false) OR source->>'admin'<>'true') OR p_resend AND source->>'admin'<>'true' THEN RAISE EXCEPTION 'Already approved' USING ERRCODE='23505'; END IF;
 IF source->>'admin'='true' AND NOT EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current()) THEN RAISE EXCEPTION 'Audited administrator required' USING ERRCODE='42501'; END IF;
 -- Independent service-RPC resend fence in addition to profile HTTP admission.
 IF prior THEN
  SELECT public.consume_admission(jsonb_build_array(jsonb_build_object('key',e.tenant_id::text||':client-recap-resend:'||p_actor,'seconds',60,'limit',3))) INTO allowance;
  IF allowance->>'allowed'<>'true' THEN RAISE EXCEPTION 'Resend limited' USING ERRCODE='54000'; END IF;
 END IF;
 SELECT * INTO c FROM public.call_records WHERE id=e.call_id AND tenant_id=e.tenant_id;
 IF p_channel='sms' THEN
  SELECT consumer.phone INTO phone FROM public.contacts consumer WHERE consumer.id=e.contact_id AND consumer.tenant_id=e.tenant_id;
  INSERT INTO public.messages(tenant_id,contact_id,direction,channel,to_number,body,status,agent_id) VALUES(e.tenant_id,e.contact_id,'outbound','sms',phone,content,'queued',(SELECT agent_slug FROM public.tenant_agents a JOIN public.enrolled_agents ea ON ea.clerk_user_id=a.clerk_user_id AND ea.tenant_id=a.tenant_id WHERE ea.id=c.agent_id AND a.tenant_id=e.tenant_id)) RETURNING id INTO mid;
 END IF;
 INSERT INTO public.client_recaps(id,enrollment_id,contact_id,agent_id,tenant_id,channel,template_version,approved_by,enrollment_updated_at,message_id,status,content_sha256,retention_started_at)
 VALUES(rid,e.id,e.contact_id,c.agent_id,e.tenant_id,p_channel,(template->>'version')::integer,p_actor,e.updated_at,mid,CASE WHEN p_channel='pdf' THEN 'downloaded' ELSE 'queued' END,p_checksum,e.retention_started_at);
 RETURN jsonb_build_object('id',rid,'message_id',mid,'phone',phone,'body',content);
END $$;
-- Existing signed status callback updates messages; mirror its bounded status.
CREATE FUNCTION public.update_client_recap_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN UPDATE public.client_recaps SET status=NEW.status WHERE message_id=NEW.id AND tenant_id=NEW.tenant_id AND NEW.status IN ('queued','sent','delivered','failed'); RETURN NEW; END $$;
CREATE TRIGGER client_recap_delivery AFTER UPDATE OF status ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_client_recap_delivery();

DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.execute_admin_action(text,text,text,uuid,jsonb,boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'''tenant_settings'',''contact_assignment''','''client_recap'',''tenant_settings'',''contact_assignment''');
 definition:=replace(definition,'''set_vendor_pause'',''save_opportunity_pipeline''','''approve_client_recap'',''set_vendor_pause'',''save_opportunity_pipeline'''); EXECUTE definition;
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'''feature_conference_calling_enabled''','''feature_client_recap_enabled'',''feature_conference_calling_enabled'''); EXECUTE definition;
 SELECT pg_get_functiondef('public.capture_lifecycle_purge_marker(text,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'ARRAY[''call_records''','ARRAY[''client_recaps'',''call_records'''); EXECUTE definition;
END $$;
CREATE TRIGGER lifecycle_purge_marker BEFORE DELETE ON public.client_recaps FOR EACH ROW EXECUTE FUNCTION public.retain_lifecycle_purge_marker();
-- Extend the existing private projection; its scoped public reader and six checks
-- remain unchanged. The feature's records never expose message bodies.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.consumer_lifecycle_rows(uuid,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'WITH c AS (', 'WITH recap_events AS (SELECT ''client_recaps:''||r.id::text||'':recap'' key,''recap''::text type,r.approved_at "time",r.approved_by staff,r.status,''Enrollment recap approved''::text summary,jsonb_build_array(jsonb_build_object(''table'',''client_recaps'',''id'',r.id,''time'',r.approved_at)) evidence,jsonb_build_object(''channel'',r.channel,''sha256'',r.content_sha256,''stored'',true) details FROM public.client_recaps r WHERE r.contact_id=p_contact AND r.tenant_id=p_tenant AND public.deployment_feature_enabled(''CLIENT_RECAP_ENABLED'')), c AS (');
 definition:=replace(definition,'SELECT ''contacts:''','SELECT * FROM recap_events UNION ALL SELECT ''contacts:'''); EXECUTE definition;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('valid_client_recap_templates','guard_client_recap_templates','client_recap_source','client_recap_render','approve_client_recap','update_client_recap_delivery') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN ('valid_client_recap_templates','client_recap_source','approve_client_recap') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
END $$;
COMMIT;
