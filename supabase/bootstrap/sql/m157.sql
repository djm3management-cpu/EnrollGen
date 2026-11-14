-- UNAPPLIED. P0-8 / P0-11: audited evidence boundary, no legacy data rewrite.
BEGIN;
CREATE TABLE public.evidence_access_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),
 tenant_id uuid NOT NULL,
 resource_type text NOT NULL CHECK(resource_type ~ '^[a-z_]{1,64}$'),
 resource_id text NOT NULL CHECK(resource_id='collection' OR resource_id ~ '^[0-9a-fA-F-]{36}$' OR resource_id ~ '^sha256:[0-9a-f]{64}$'),
 action text NOT NULL CHECK(action IN ('list','read','play','download','export','sign','ticket','decrypt')),
 result text NOT NULL CHECK(result IN ('allowed','denied')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 grant_id uuid NOT NULL
);
CREATE INDEX evidence_access_tenant_time ON public.evidence_access_log(tenant_id,occurred_at,id);
CREATE FUNCTION public.reject_evidence_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Evidence audit is append only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER evidence_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.evidence_access_log
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_evidence_audit_mutation();
ALTER TABLE public.evidence_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evidence_access_log FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.evidence_access_log TO authenticated;
GRANT INSERT,SELECT ON public.evidence_access_log TO service_role;
CREATE POLICY evidence_audit_admin_read ON public.evidence_access_log FOR SELECT TO authenticated
 USING(public.deployment_is_admin(tenant_id));
REVOKE ALL ON FUNCTION public.reject_evidence_audit_mutation() FROM PUBLIC,anon,authenticated;
-- No caller-supplied actor/time/link text enters the browser insert boundary.
CREATE FUNCTION public.audit_browser_evidence(p_type text,p_resource uuid,p_action text,p_allowed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record;
BEGIN
 SELECT * INTO i FROM public.current_deployment_identity();
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id)
 VALUES(coalesce(nullif(auth.jwt()->>'sub',''),'anonymous'),
 coalesce(i.tenant_id,(SELECT tenant_id FROM public.deployment_settings LIMIT 1)),
 p_type,coalesce(p_resource::text,'collection'),p_action,CASE WHEN p_allowed THEN 'allowed' ELSE 'denied' END,gen_random_uuid());
END $$;
REVOKE ALL ON FUNCTION public.audit_browser_evidence(text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
-- Only these reviewed composites are exposed. Filters/paging/projections still
-- apply through PostgREST after this ownership-scoped function. ID requests pass
-- p_resource, so inaccessible IDs are durably denied without a rollback error.
REVOKE SELECT ON public.call_transcripts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_call_transcripts(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.call_transcripts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.call_transcripts r WHERE r.id=p_resource AND public.deployment_row_visible('call_transcripts',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_transcripts',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.call_transcripts r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('call_transcripts',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_call_transcripts(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_call_transcripts(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.transcript_chunks FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_transcript_chunks(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.transcript_chunks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.transcript_chunks r WHERE r.id=p_resource AND public.deployment_row_visible('transcript_chunks',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('transcript_chunks',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.transcript_chunks r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('transcript_chunks',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_transcript_chunks(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_transcript_chunks(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.call_records FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_call_records(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.call_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.call_records r WHERE r.id=p_resource AND public.deployment_row_visible('call_records',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_records',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.call_records r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('call_records',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_call_records(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_call_records(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.sessions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_sessions(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.sessions r WHERE r.id=p_resource AND public.deployment_row_visible('sessions',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('sessions',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.sessions r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('sessions',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_sessions(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_sessions(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.call_logs FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_call_logs(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.call_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.call_logs r WHERE r.id=p_resource AND public.deployment_row_visible('call_logs',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_logs',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.call_logs r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('call_logs',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_call_logs(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_call_logs(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.call_threads FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_call_threads(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.call_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.call_threads r WHERE r.id=p_resource AND public.deployment_row_visible('call_threads',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_threads',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.call_threads r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('call_threads',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_call_threads(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_call_threads(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.compliance_flags FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_compliance_flags(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.compliance_flags LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.compliance_flags r WHERE r.id=p_resource AND public.deployment_row_visible('compliance_flags',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('compliance_flags',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.compliance_flags r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('compliance_flags',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_compliance_flags(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_compliance_flags(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.section_scores FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_section_scores(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.section_scores LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.section_scores r WHERE r.id=p_resource AND public.deployment_row_visible('section_scores',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('section_scores',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.section_scores r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('section_scores',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_section_scores(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_section_scores(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.compliance_scorecards FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_compliance_scorecards(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.compliance_scorecards LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.compliance_scorecards r WHERE r.id=p_resource AND public.deployment_row_visible('compliance_scorecards',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('compliance_scorecards',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.compliance_scorecards r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('compliance_scorecards',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_compliance_scorecards(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_compliance_scorecards(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.compliance_scores FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_compliance_scores(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.compliance_scores LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.compliance_scores r WHERE r.id=p_resource AND public.deployment_row_visible('compliance_scores',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('compliance_scores',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.compliance_scores r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('compliance_scores',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_compliance_scores(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_compliance_scores(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.intent_detections FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_intent_detections(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.intent_detections LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.intent_detections r WHERE r.id=p_resource AND public.deployment_row_visible('intent_detections',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('intent_detections',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.intent_detections r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('intent_detections',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_intent_detections(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_intent_detections(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.phi_redactions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_phi_redactions(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.phi_redactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.phi_redactions r WHERE r.id=p_resource AND public.deployment_row_visible('phi_redactions',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('phi_redactions',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.phi_redactions r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('phi_redactions',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_phi_redactions(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_phi_redactions(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.scorecard_items FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_scorecard_items(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.scorecard_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.scorecard_items r WHERE r.id=p_resource AND public.deployment_row_visible('scorecard_items',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('scorecard_items',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.scorecard_items r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('scorecard_items',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_scorecard_items(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_scorecard_items(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.inbound_calls FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_inbound_calls(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.inbound_calls LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.inbound_calls r WHERE r.id=p_resource AND public.deployment_row_visible('inbound_calls',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('inbound_calls',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.inbound_calls r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('inbound_calls',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_inbound_calls(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_inbound_calls(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.telephony_events FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_telephony_events(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.telephony_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.telephony_events r WHERE r.id=p_resource AND public.deployment_row_visible('telephony_events',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('telephony_events',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.telephony_events r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('telephony_events',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_telephony_events(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_telephony_events(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.contact_lead_intel FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_contact_lead_intel(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.contact_lead_intel LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.contact_lead_intel r WHERE r.id=p_resource AND public.deployment_row_visible('contact_lead_intel',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('contact_lead_intel',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.contact_lead_intel r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('contact_lead_intel',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_contact_lead_intel(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_contact_lead_intel(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.contact_notes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_contact_notes(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.contact_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.contact_notes r WHERE r.id=p_resource AND public.deployment_row_visible('contact_notes',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('contact_notes',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.contact_notes r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('contact_notes',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_contact_notes(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_contact_notes(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.contact_activities FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_contact_activities(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.contact_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.contact_activities r WHERE r.id=p_resource AND public.deployment_row_visible('contact_activities',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('contact_activities',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.contact_activities r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('contact_activities',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_contact_activities(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_contact_activities(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.messages FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_messages(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.messages r WHERE r.id=p_resource AND public.deployment_row_visible('messages',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('messages',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.messages r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('messages',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_messages(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_messages(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.follow_ups FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_follow_ups(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.follow_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.follow_ups r WHERE r.id=p_resource AND public.deployment_row_visible('follow_ups',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('follow_ups',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.follow_ups r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('follow_ups',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_follow_ups(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_follow_ups(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.followup_queue FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_followup_queue(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.followup_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.followup_queue r WHERE r.id=p_resource AND public.deployment_row_visible('followup_queue',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('followup_queue',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.followup_queue r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('followup_queue',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_followup_queue(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_followup_queue(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.opportunities FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_opportunities(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.opportunities LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.opportunities r WHERE r.id=p_resource AND public.deployment_row_visible('opportunities',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('opportunities',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.opportunities r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('opportunities',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_opportunities(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_opportunities(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.opportunity_events FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_opportunity_events(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.opportunity_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.opportunity_events r WHERE r.id=p_resource AND public.deployment_row_visible('opportunity_events',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('opportunity_events',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.opportunity_events r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('opportunity_events',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_opportunity_events(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_opportunity_events(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.opportunity_stage_history FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_opportunity_stage_history(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.opportunity_stage_history LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.opportunity_stage_history r WHERE r.id=p_resource AND public.deployment_row_visible('opportunity_stage_history',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('opportunity_stage_history',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.opportunity_stage_history r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('opportunity_stage_history',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_opportunity_stage_history(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_opportunity_stage_history(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.sales_log FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_sales_log(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.sales_log LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.sales_log r WHERE r.id=p_resource AND public.deployment_row_visible('sales_log',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('sales_log',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.sales_log r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('sales_log',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_sales_log(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_sales_log(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.call_insights FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_call_insights(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.call_insights LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.call_insights r WHERE r.id=p_resource AND public.deployment_row_visible('call_insights',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_insights',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.call_insights r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('call_insights',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_call_insights(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_call_insights(uuid,text) TO authenticated,service_role;
REVOKE SELECT ON public.agent_coaching FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_evidence_agent_coaching(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list')
RETURNS SETOF public.agent_coaching LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;
BEGIN
 IF p_action NOT IN ('list','read','export') THEN p_action:='read'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity()) AND
 (p_resource IS NULL OR EXISTS(SELECT 1 FROM public.agent_coaching r WHERE r.id=p_resource AND public.deployment_row_visible('agent_coaching',to_jsonb(r)))) INTO allowed;
 PERFORM public.audit_browser_evidence('agent_coaching',p_resource,p_action,allowed);
 IF allowed THEN RETURN QUERY SELECT r.* FROM public.agent_coaching r
 WHERE (p_resource IS NULL OR r.id=p_resource) AND public.deployment_row_visible('agent_coaching',to_jsonb(r)); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.read_evidence_agent_coaching(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_agent_coaching(uuid,text) TO authenticated,service_role;
-- Preserve both search signatures; old invoker functions remain private.
DO $search$ DECLARE f record; args text; argnames text; original text; BEGIN
 FOR f IN SELECT p.oid,p.proargnames,p.proargtypes,p.pronargs,pg_get_function_arguments(p.oid) arguments,
 pg_get_function_result(p.oid) result,pg_get_function_identity_arguments(p.oid) identity_args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_transcript_chunks' LOOP
 original:='private_search_transcript_chunks';
 EXECUTE format('ALTER FUNCTION public.search_transcript_chunks(%s) RENAME TO %I',f.identity_args,original);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',original,f.identity_args);
 SELECT string_agg(quote_ident(x),',') INTO argnames FROM unnest(f.proargnames[1:f.pronargs]) x;
 EXECUTE format('CREATE FUNCTION public.search_transcript_chunks(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $body$ BEGIN
 PERFORM public.audit_browser_evidence(''transcript_chunks'',NULL,''list'',EXISTS(SELECT 1 FROM public.current_deployment_identity()));
 RETURN QUERY SELECT * FROM public.%I(%s); END $body$',f.arguments,f.result,original,argnames);
 EXECUTE format('REVOKE ALL ON FUNCTION public.search_transcript_chunks(%s) FROM PUBLIC,anon',f.identity_args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.search_transcript_chunks(%s) TO authenticated,service_role',f.identity_args);
 END LOOP;
END $search$;
ALTER TABLE public.recording_download_tickets ADD COLUMN actor_id text, ADD COLUMN grant_id uuid;
ALTER TABLE public.recording_compliance_tickets ADD COLUMN grant_id uuid;


-- Same content allowlist and writable-row check as 153; no ownership writes.
CREATE FUNCTION public.update_evidence_call_records(p_resource uuid,p_patch jsonb,p_expected jsonb DEFAULT '{}')
RETURNS SETOF public.call_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean; assignments text;
BEGIN
 IF jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(string_to_array('call_outcome,ancillary_product_type,sunfire_code',','))) THEN
  RAISE EXCEPTION 'Unsupported content update' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.call_records r WHERE r.id=p_resource AND to_jsonb(r) @> p_expected AND public.deployment_row_writable('call_records',to_jsonb(r))) INTO allowed;
 PERFORM public.audit_browser_evidence('call_records',p_resource,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 IF p_patch='{}'::jsonb THEN RETURN; END IF;
 SELECT string_agg(format('%I=v.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
 RETURN QUERY EXECUTE format('UPDATE public.call_records r SET %s FROM jsonb_populate_record(NULL::public.call_records,$1) v WHERE r.id=$2 AND to_jsonb(r) @> $3 AND public.deployment_row_writable(''call_records'',to_jsonb(r)) RETURNING r.*',assignments)
 USING p_patch,p_resource,p_expected;
END $fn$;
REVOKE ALL ON FUNCTION public.update_evidence_call_records(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_evidence_call_records(uuid,jsonb,jsonb) TO authenticated;

-- Same content allowlist and writable-row check as 153; no ownership writes.
CREATE FUNCTION public.update_evidence_contact_notes(p_resource uuid,p_patch jsonb,p_expected jsonb DEFAULT '{}')
RETURNS SETOF public.contact_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean; assignments text;
BEGIN
 IF jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(string_to_array('body,pinned',','))) THEN
  RAISE EXCEPTION 'Unsupported content update' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.contact_notes r WHERE r.id=p_resource AND to_jsonb(r) @> p_expected AND public.deployment_row_writable('contact_notes',to_jsonb(r))) INTO allowed;
 PERFORM public.audit_browser_evidence('contact_notes',p_resource,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 IF p_patch='{}'::jsonb THEN RETURN; END IF;
 SELECT string_agg(format('%I=v.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
 RETURN QUERY EXECUTE format('UPDATE public.contact_notes r SET %s FROM jsonb_populate_record(NULL::public.contact_notes,$1) v WHERE r.id=$2 AND to_jsonb(r) @> $3 AND public.deployment_row_writable(''contact_notes'',to_jsonb(r)) RETURNING r.*',assignments)
 USING p_patch,p_resource,p_expected;
END $fn$;
REVOKE ALL ON FUNCTION public.update_evidence_contact_notes(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_evidence_contact_notes(uuid,jsonb,jsonb) TO authenticated;

-- Same content allowlist and writable-row check as 153; no ownership writes.
CREATE FUNCTION public.update_evidence_follow_ups(p_resource uuid,p_patch jsonb,p_expected jsonb DEFAULT '{}')
RETURNS SETOF public.follow_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean; assignments text;
BEGIN
 IF jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(string_to_array('due_at,reason,status',','))) THEN
  RAISE EXCEPTION 'Unsupported content update' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.follow_ups r WHERE r.id=p_resource AND to_jsonb(r) @> p_expected AND public.deployment_row_writable('follow_ups',to_jsonb(r))) INTO allowed;
 PERFORM public.audit_browser_evidence('follow_ups',p_resource,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 IF p_patch='{}'::jsonb THEN RETURN; END IF;
 SELECT string_agg(format('%I=v.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
 RETURN QUERY EXECUTE format('UPDATE public.follow_ups r SET %s FROM jsonb_populate_record(NULL::public.follow_ups,$1) v WHERE r.id=$2 AND to_jsonb(r) @> $3 AND public.deployment_row_writable(''follow_ups'',to_jsonb(r)) RETURNING r.*',assignments)
 USING p_patch,p_resource,p_expected;
END $fn$;
REVOKE ALL ON FUNCTION public.update_evidence_follow_ups(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_evidence_follow_ups(uuid,jsonb,jsonb) TO authenticated;

-- Same content allowlist and writable-row check as 153; no ownership writes.
CREATE FUNCTION public.update_evidence_followup_queue(p_resource uuid,p_patch jsonb,p_expected jsonb DEFAULT '{}')
RETURNS SETOF public.followup_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean; assignments text;
BEGIN
 IF jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(string_to_array('followup_status,notes',','))) THEN
  RAISE EXCEPTION 'Unsupported content update' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.followup_queue r WHERE r.id=p_resource AND to_jsonb(r) @> p_expected AND public.deployment_row_writable('followup_queue',to_jsonb(r))) INTO allowed;
 PERFORM public.audit_browser_evidence('followup_queue',p_resource,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 IF p_patch='{}'::jsonb THEN RETURN; END IF;
 SELECT string_agg(format('%I=v.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
 RETURN QUERY EXECUTE format('UPDATE public.followup_queue r SET %s FROM jsonb_populate_record(NULL::public.followup_queue,$1) v WHERE r.id=$2 AND to_jsonb(r) @> $3 AND public.deployment_row_writable(''followup_queue'',to_jsonb(r)) RETURNING r.*',assignments)
 USING p_patch,p_resource,p_expected;
END $fn$;
REVOKE ALL ON FUNCTION public.update_evidence_followup_queue(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_evidence_followup_queue(uuid,jsonb,jsonb) TO authenticated;

-- Same content allowlist and writable-row check as 153; no ownership writes.
CREATE FUNCTION public.update_evidence_messages(p_resource uuid,p_patch jsonb,p_expected jsonb DEFAULT '{}')
RETURNS SETOF public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean; assignments text;
BEGIN
 IF jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(string_to_array('read_at',','))) THEN
  RAISE EXCEPTION 'Unsupported content update' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.messages r WHERE r.id=p_resource AND to_jsonb(r) @> p_expected AND public.deployment_row_writable('messages',to_jsonb(r))) INTO allowed;
 PERFORM public.audit_browser_evidence('messages',p_resource,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 IF p_patch='{}'::jsonb THEN RETURN; END IF;
 SELECT string_agg(format('%I=v.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
 RETURN QUERY EXECUTE format('UPDATE public.messages r SET %s FROM jsonb_populate_record(NULL::public.messages,$1) v WHERE r.id=$2 AND to_jsonb(r) @> $3 AND public.deployment_row_writable(''messages'',to_jsonb(r)) RETURNING r.*',assignments)
 USING p_patch,p_resource,p_expected;
END $fn$;
REVOKE ALL ON FUNCTION public.update_evidence_messages(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_evidence_messages(uuid,jsonb,jsonb) TO authenticated;

DO $views$ DECLARE v text; definition text; t text; BEGIN
 FOREACH v IN ARRAY ARRAY['v_enrollment_summary','v_agent_performance','v_compliance_overview','v_pipeline_status','v_daily_activity'] LOOP
 definition:=pg_get_viewdef(('public.'||v)::regclass,true);
 FOREACH t IN ARRAY ARRAY['call_records','sessions','compliance_scorecards','compliance_scores','section_scores','compliance_flags'] LOOP
 definition:=regexp_replace(definition,'(FROM|JOIN) (public\.)?'||t||'([[:space:]]+)([a-z_]+)','\1 public.read_evidence_'||t||'() \4','g');
 definition:=regexp_replace(definition,'(FROM|JOIN) (public\.)?'||t||'([[:space:]])','\1 public.read_evidence_'||t||'() AS '||t||'\3','g');
 END LOOP;
 EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH(security_invoker=true) AS %s',v,definition);
 END LOOP;
END $views$;
DROP POLICY IF EXISTS pilot_message_media_read ON storage.objects;
REVOKE SELECT ON storage.objects FROM anon,authenticated;

CREATE FUNCTION public.read_evidence_v_enrollment_summary(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS SETOF public.v_enrollment_summary
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$SELECT * FROM public.v_enrollment_summary$$;
REVOKE ALL ON FUNCTION public.read_evidence_v_enrollment_summary(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_v_enrollment_summary(uuid,text) TO authenticated;
CREATE FUNCTION public.read_evidence_v_agent_performance(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS SETOF public.v_agent_performance
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$SELECT * FROM public.v_agent_performance$$;
REVOKE ALL ON FUNCTION public.read_evidence_v_agent_performance(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_v_agent_performance(uuid,text) TO authenticated;
CREATE FUNCTION public.read_evidence_v_compliance_overview(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS SETOF public.v_compliance_overview
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$SELECT * FROM public.v_compliance_overview$$;
REVOKE ALL ON FUNCTION public.read_evidence_v_compliance_overview(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_v_compliance_overview(uuid,text) TO authenticated;
CREATE FUNCTION public.read_evidence_v_pipeline_status(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS SETOF public.v_pipeline_status
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$SELECT * FROM public.v_pipeline_status$$;
REVOKE ALL ON FUNCTION public.read_evidence_v_pipeline_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_v_pipeline_status(uuid,text) TO authenticated;
CREATE FUNCTION public.read_evidence_v_daily_activity(p_resource uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS SETOF public.v_daily_activity
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$SELECT * FROM public.v_daily_activity$$;
REVOKE ALL ON FUNCTION public.read_evidence_v_daily_activity(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_evidence_v_daily_activity(uuid,text) TO authenticated;
CREATE FUNCTION public.export_evidence_calls() RETURNS SETOF public.call_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid;
BEGIN
 SELECT tenant_id INTO STRICT tenant FROM public.deployment_settings WHERE singleton;
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id)
 VALUES('service:nextcloud',tenant,'call_evidence','collection','list','allowed',gen_random_uuid());
 RETURN QUERY SELECT projected.* FROM public.call_records c
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.call_records,to_jsonb(c)||jsonb_build_object('metadata',
 jsonb_build_object('summary_pdf_path',c.metadata->'summary_pdf_path','call_summary_pdf_path',c.metadata->'call_summary_pdf_path',
 'summaryPdfPath',c.metadata->'summaryPdfPath','summary_pdf',jsonb_build_object('storage_path',c.metadata#>'{summary_pdf,storage_path}'),
 'summaryPdf',jsonb_build_object('storagePath',c.metadata#>'{summaryPdf,storagePath}'),
 'transcript_storage_path',c.metadata->'transcript_storage_path','transcript_txt_path',c.metadata->'transcript_txt_path',
 'raw_transcript_path',c.metadata->'raw_transcript_path','transcript',jsonb_build_object('storage_path',c.metadata#>'{transcript,storage_path}','storagePath',c.metadata#>'{transcript,storagePath}'),
 'transcript_raw',c.metadata->'transcript_raw','transcript_text',c.metadata->'transcript_text',
 'customer_first_name',c.metadata->'customer_first_name','customer_last_name',c.metadata->'customer_last_name',
 'contact_name',c.metadata->'contact_name','agent_name',c.metadata->'agent_name'))) projected
 WHERE c.tenant_id=tenant;
END $$;
REVOKE ALL ON FUNCTION public.export_evidence_calls() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_evidence_calls() TO service_role;

ALTER TABLE public.recording_download_tickets
 ADD COLUMN storage_path text,ADD COLUMN recording_id text,
 ALTER COLUMN recording_sid DROP NOT NULL,ALTER COLUMN account_sid DROP NOT NULL,ALTER COLUMN expected_call_sid DROP NOT NULL;
ALTER TABLE public.recording_download_tickets ADD CONSTRAINT recording_ticket_source
 CHECK(storage_path IS NOT NULL OR (recording_sid IS NOT NULL AND account_sid IS NOT NULL AND expected_call_sid IS NOT NULL));
-- The old search depended on invoker RLS. The private implementation must now
-- enforce the same scope explicitly BEFORE ordering/limiting under its wrapper.
DO $scope_search$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid,p.pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='private_search_transcript_chunks' LOOP
 definition:=pg_get_functiondef(f.oid);
 IF f.pronargs=7 THEN
  IF position('and ct.phi_scrubbed = true' IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized transcript search body'; END IF;
  definition:=replace(definition,'and ct.phi_scrubbed = true','and ct.phi_scrubbed = true AND public.deployment_row_visible(''call_transcripts'',to_jsonb(ct))');
 ELSE definition:=replace(definition,'FROM public.search_transcript_chunks','FROM public.private_search_transcript_chunks'); END IF;
 EXECUTE definition;
 END LOOP;
END $scope_search$;

-- Preserve the existing contact-wide unread-message action without restoring
-- direct plaintext SELECT or accepting arbitrary bulk-update filters.
CREATE FUNCTION public.mark_evidence_messages_read(p_contact uuid,p_read_at timestamptz)
RETURNS SETOF public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean;
BEGIN
 allowed:=public.deployment_can_access_contact(p_contact);
 PERFORM public.audit_browser_evidence('messages',p_contact,'read',allowed);
 IF NOT allowed THEN PERFORM set_config('response.status','403',true); RETURN; END IF;
 RETURN QUERY UPDATE public.messages m SET read_at=p_read_at WHERE m.contact_id=p_contact
 AND m.direction='inbound' AND m.read_at IS NULL AND public.deployment_row_writable('messages',to_jsonb(m)) RETURNING m.*;
END $$;
REVOKE ALL ON FUNCTION public.mark_evidence_messages_read(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_evidence_messages_read(uuid,timestamptz) TO authenticated;
COMMIT;
