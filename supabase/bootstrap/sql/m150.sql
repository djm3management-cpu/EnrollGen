-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout='5s';

-- Source statement 3
CREATE FUNCTION public.deployment_feature_enabled(flag text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE headers jsonb; claims jsonb;
BEGIN
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 IF coalesce(claims->>'role','')<>'service_role' AND coalesce(current_setting('role',true),'')<>'service_role' THEN RETURN false; END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 RETURN coalesce(((headers->>'x-enrollgen-features')::jsonb)->flag,'false'::jsonb)='true'::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;

-- Source statement 4
REVOKE ALL ON FUNCTION public.deployment_feature_enabled(text) FROM PUBLIC,anon,authenticated;

-- Source statement 5
GRANT EXECUTE ON FUNCTION public.deployment_feature_enabled(text) TO service_role;

-- Source statement 6
DO $fences$ DECLARE item text[]; routine record; definition text; guard text; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
  ['claim_post_call_webhook','GHL_ENABLED','RETURN false;'],
  ['enqueue_compliance_uploads','IX_UPLOAD_ENABLED','RETURN;'],
  ['claim_ix_upload','IX_UPLOAD_ENABLED','RETURN;'],
  ['claim_conversely_run','CONVERSELY_UPLOAD_ENABLED','RETURN;'],
  ['reserve_conversely_week','CONVERSELY_UPLOAD_ENABLED','RETURN;'],
  ['reserve_conversely_run','CONVERSELY_UPLOAD_ENABLED','RETURN;'],
  ['request_conversely_run','CONVERSELY_UPLOAD_ENABLED','RETURN NULL;'],
  ['claim_integration_delivery','PARAGON_ENABLED','RETURN;'],
  ['enqueue_availability_push','PARAGON_ENABLED','RETURN;'],
  ['enqueue_disposition_postbacks','PARAGON_ENABLED','RETURN;'],
  ['enqueue_paragon_billing_event','PARAGON_ENABLED','RETURN;'],
  ['claim_paragon_billing_jobs','PARAGON_ENABLED','RETURN;'],
  ['claim_paragon_residence_jobs','PARAGON_ENABLED','RETURN;'],
  ['refresh_sale_compliance_request','SCORING_ENABLED','RETURN;'],
  ['get_sale_compliance_dispatch','SCORING_ENABLED','RETURN;'],
  ['begin_scoring_job','SCORING_ENABLED', 'RETURN jsonb_build_object(''status'',''disabled'');'],
  ['claim_compliance_pass','SCORING_ENABLED', 'RETURN jsonb_build_object(''status'',''disabled'');'],
  ['claim_automatic_transcript_recovery','TRANSCRIPT_AUTO_RECOVERY_ENABLED','RETURN jsonb_build_object(''status'',''disabled'');'],
  ['claim_paragon_report_email','OPERATIONAL_EMAIL_ENABLED','RETURN NULL;'],
  ['enqueue_daily_vendor_reports','OPERATIONAL_EMAIL_ENABLED','RETURN;']
 ] LOOP
  FOR routine IN SELECT p.oid,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname=item[1] AND l.lanname='plpgsql'
  LOOP
   guard:=format('IF NOT public.deployment_feature_enabled(%L) THEN %s END IF;',item[2],item[3]);
   definition:=regexp_replace(pg_get_functiondef(routine.oid),'\mBEGIN\M',E'BEGIN\n '||guard,'i');
   IF definition=pg_get_functiondef(routine.oid) THEN RAISE EXCEPTION 'Cannot fence %',item[1]; END IF;
   -- Do not let a parked mail job block enabled pushes/postbacks.
   IF item[1]='claim_integration_delivery' THEN
    definition:=replace(definition,'WHERE NOT d.superseded','WHERE (d.kind<>''report'' OR public.deployment_feature_enabled(''OPERATIONAL_EMAIL_ENABLED'')) AND NOT d.superseded');
   END IF;
   EXECUTE definition;
  END LOOP;
 END LOOP;
 -- This dispatcher multiplexes independent providers.
 FOR routine IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='claim_compliance_upload'
 LOOP
  definition:=regexp_replace(pg_get_functiondef(routine.oid),'\mBEGIN\M',
   E'BEGIN\n IF NOT public.deployment_feature_enabled(CASE p_provider WHEN ''ghl'' THEN ''GHL_ENABLED'' WHEN ''ix'' THEN ''IX_UPLOAD_ENABLED'' WHEN ''conversely'' THEN ''CONVERSELY_UPLOAD_ENABLED'' ELSE '''' END) THEN RETURN; END IF;','i');
  EXECUTE definition;
 END LOOP;
END $fences$;

-- Source statement 7
CREATE FUNCTION public.fence_deployment_queue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE flag text:=TG_ARGV[0]; row_data jsonb:=to_jsonb(NEW);
BEGIN
 IF flag='TRANSCRIPT_REQUEST_MODE' THEN
  SELECT CASE WHEN mode='automatic' THEN 'TRANSCRIPT_AUTO_RECOVERY_ENABLED' ELSE 'TRANSCRIPT_GAP_FILL_ENABLED' END INTO flag
   FROM manual_transcript_gap_fills WHERE id::text=row_data->>'job_id';
  IF flag IS NULL THEN RETURN NULL; END IF;
 END IF;
 IF flag='TRANSCRIPT_MODE' THEN
  flag:=CASE WHEN row_data->>'mode'='automatic' THEN 'TRANSCRIPT_AUTO_RECOVERY_ENABLED' ELSE 'TRANSCRIPT_GAP_FILL_ENABLED' END;
 END IF;
 IF NOT deployment_feature_enabled(flag) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='integration_deliveries' AND row_data->>'kind'='report' AND NOT deployment_feature_enabled('OPERATIONAL_EMAIL_ENABLED') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('paragon_report_email_log','paragon_report_email_days') AND NOT deployment_feature_enabled('OPERATIONAL_EMAIL_ENABLED') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='compliance_daily_summaries' AND (NOT deployment_feature_enabled('IX_UPLOAD_ENABLED') OR NOT deployment_feature_enabled('OPERATIONAL_EMAIL_ENABLED')) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;

-- Source statement 8
REVOKE ALL ON FUNCTION public.fence_deployment_queue() FROM PUBLIC,anon,authenticated;

-- Source statement 9
DO $$ DECLARE item text[]; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
  ['integration_deliveries','PARAGON_ENABLED'],
  ['lead_source_pings','PARAGON_ENABLED'],
  ['paragon_billing_events','PARAGON_ENABLED'],
  ['paragon_call_billing','PARAGON_ENABLED'],
  ['paragon_residence_jobs','PARAGON_ENABLED'],
  ['paragon_residence_sep_inputs','PARAGON_ENABLED'],
  ['paragon_callback_tasks','PARAGON_ENABLED'],
  ['paragon_report_email_log','PARAGON_ENABLED'],
  ['paragon_report_email_days','PARAGON_ENABLED'],
  ['ghl_enrollment_deliveries','GHL_ENABLED'],
  ['post_call_webhook_claims','GHL_ENABLED'],
  ['provider_alert_throttle','OPERATIONAL_EMAIL_ENABLED'],
  ['transcript_recovery_alerts','OPERATIONAL_EMAIL_ENABLED'],
  ['conversely_submissions','CONVERSELY_UPLOAD_ENABLED'],
  ['conversely_runs','CONVERSELY_UPLOAD_ENABLED'],
  ['conversely_weekly_runs','CONVERSELY_UPLOAD_ENABLED'],
  ['ix_uploads','IX_UPLOAD_ENABLED'],
  ['compliance_daily_summaries','IX_REPORT_ENABLED'],
  ['compliance_llm_passes','SCORING_ENABLED'],
  ['scoring_jobs','SCORING_ENABLED'],
  ['transcript_score_dispatch','SCORING_ENABLED'],
  ['manual_transcript_gap_requests','TRANSCRIPT_REQUEST_MODE'],
  ['manual_transcript_gap_fills','TRANSCRIPT_MODE']
 ] LOOP
  -- Fail schema validation when a required queue is missing; never silently
  -- install a partial fence. Names follow the pilot bootstrap manifest.
  EXECUTE format('CREATE TRIGGER deployment_feature_fence BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fence_deployment_queue(%L)',item[1],item[2]);
 END LOOP;
END $$;

-- Source statement 10
NOTIFY pgrst,'reload schema';

-- Source statement 11
COMMIT;
