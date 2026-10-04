-- F11/F56 forward delta. Requires evidence ownership (063) and scoring integrity (072).
BEGIN;
CREATE TABLE public.telephony_transcript_segments (
  id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES public.telephony_call_attempts(id),
  speaker text NOT NULL CHECK(speaker IN ('agent','customer')), text text NOT NULL,
  captured_at timestamptz NOT NULL, start_ms integer NOT NULL, end_ms integer NOT NULL
);
CREATE INDEX telephony_transcript_segments_attempt ON public.telephony_transcript_segments(attempt_id);
CREATE TABLE public.transcript_score_dispatch (
  call_id uuid PRIMARY KEY REFERENCES public.call_records(id), tenant_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1, delivered_revision bigint NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), last_error text, snapshot_revision text
);
CREATE INDEX transcript_dispatch_due ON public.transcript_score_dispatch(available_at);
ALTER TABLE public.telephony_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_score_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telephony_transcript_segments,public.transcript_score_dispatch FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.telephony_transcript_segments,public.transcript_score_dispatch TO service_role;
CREATE POLICY transcript_segments_service ON public.telephony_transcript_segments TO service_role USING(true) WITH CHECK(true);
CREATE POLICY transcript_dispatch_service ON public.transcript_score_dispatch TO service_role USING(true) WITH CHECK(true);

-- One canonical record per inbound attempt. Lock also serializes browser init with media finals.
CREATE FUNCTION public.ensure_inbound_transcript_record(p_attempt_id uuid, p_session_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a telephony_call_attempts; owner enrolled_agents; rid uuid;
BEGIN
 SELECT * INTO STRICT a FROM telephony_call_attempts WHERE id=p_attempt_id AND direction='inbound' FOR UPDATE;
 SELECT e.* INTO STRICT owner FROM enrolled_agents e JOIN tenant_agents t
 ON t.tenant_id=e.tenant_id AND t.clerk_user_id=e.clerk_user_id
 WHERE t.tenant_id=a.tenant_id AND t.agent_slug=a.agent_id AND e.is_active AND t.is_active;
 rid:=a.call_record_id;
 IF rid IS NULL THEN
  SELECT id INTO rid FROM call_records WHERE tenant_id=a.tenant_id AND twilio_call_sid=a.parent_call_sid
   AND agent_id=owner.id ORDER BY created_at LIMIT 1;
 END IF;
 IF rid IS NULL THEN
  INSERT INTO call_records(tenant_id,agent_id,agent_name,call_direction,call_type,product_type,
   call_start,twilio_call_sid,contact_id,metadata)
  VALUES(a.tenant_id,owner.id,owner.name,'inbound','enrollment','MA',a.created_at,a.parent_call_sid,a.contact_id,
   jsonb_build_object('telephony_call',true,'transcript_source','deepgram_server')) RETURNING id INTO rid;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM call_records WHERE id=rid AND tenant_id=a.tenant_id AND agent_id=owner.id) THEN
  RAISE EXCEPTION 'Transcript record owner mismatch';
 END IF;
 IF p_session_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM sessions WHERE id=p_session_id AND tenant_id=a.tenant_id AND agent_id=owner.id
   AND (call_record_id IS NULL OR call_record_id=rid)) THEN RAISE EXCEPTION 'Transcript session mismatch'; END IF;
  UPDATE call_records SET session_id=p_session_id WHERE id=rid AND (session_id IS NULL OR session_id=p_session_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Transcript already belongs to another session'; END IF;
  UPDATE sessions SET call_record_id=rid WHERE id=p_session_id;
  UPDATE call_transcripts SET session_id=p_session_id WHERE call_record_id=rid AND tenant_id=a.tenant_id;
 END IF;
 UPDATE telephony_call_attempts SET call_record_id=rid WHERE id=a.id;
 UPDATE inbound_calls SET call_record_id=rid WHERE id=a.inbound_call_id AND tenant_id=a.tenant_id;
 RETURN rid;
END $$;

CREATE FUNCTION public.persist_telephony_transcript(p_attempt_id uuid,p_segment_id uuid,p_speaker text,
 p_text text,p_captured_at timestamptz,p_start_ms integer,p_end_ms integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; c call_records; tid uuid; aid uuid; v_agency text; body text; entries jsonb;
BEGIN
 rid:=ensure_inbound_transcript_record(p_attempt_id);
 INSERT INTO telephony_transcript_segments VALUES(p_segment_id,p_attempt_id,p_speaker,p_text,p_captured_at,
  greatest(0,p_start_ms),greatest(0,p_end_ms)) ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN rid; END IF;
 SELECT * INTO STRICT c FROM call_records WHERE id=rid FOR UPDATE;
 SELECT string_agg(upper(speaker)||': '||text,E'\n' ORDER BY captured_at,s.id),
  jsonb_agg(jsonb_build_object('speaker',speaker,'text',text,'start_ms',start_ms,'end_ms',end_ms) ORDER BY captured_at,s.id)
 INTO body,entries FROM telephony_transcript_segments s JOIN telephony_call_attempts a ON a.id=s.attempt_id
 WHERE a.call_record_id=rid;
 tid:=c.transcript_id;
 IF tid IS NULL THEN
  SELECT coalesce(agency_display_name,name) INTO v_agency FROM tenants WHERE id=c.tenant_id;
  SELECT id INTO aid FROM agents WHERE name=c.agent_name AND agents.agency=v_agency LIMIT 1;
  IF aid IS NULL THEN INSERT INTO agents(name,agency,is_active) VALUES(c.agent_name,v_agency,true) RETURNING id INTO aid; END IF;
  INSERT INTO call_transcripts(tenant_id,agent_id,owner_agent_id,call_record_id,session_id,call_date,
   direction,product_line,transcript_text,source_system,source_id,phi_scrubbed,last_checkpoint_at)
  VALUES(c.tenant_id,aid,c.agent_id,rid,c.session_id,c.call_start,'inbound',c.product_type,body,
   'deepgram_server',rid::text,true,now()) RETURNING id INTO tid;
 ELSE
  UPDATE call_transcripts SET transcript_text=body,last_checkpoint_at=now(),updated_at=now() WHERE id=tid AND tenant_id=c.tenant_id;
 END IF;
 UPDATE call_records SET transcript_id=tid,transcript_raw=body,transcript_diarized=entries,
  metadata=coalesce(metadata,'{}')||jsonb_build_object('transcript_source','deepgram_server'),updated_at=now() WHERE id=rid;
 -- Late Deepgram finals advance the dispatch revision after terminal status.
 IF c.metadata->>'transcript_finalized_at' IS NOT NULL THEN
  INSERT INTO transcript_score_dispatch(call_id,tenant_id,available_at,snapshot_revision)
   SELECT id,tenant_id,now()+interval '5 seconds',md5(scoring_transcript_snapshot(call_records)::text) FROM call_records WHERE id=rid
  ON CONFLICT(call_id) DO UPDATE SET revision=transcript_score_dispatch.revision+1,available_at=excluded.available_at,snapshot_revision=excluded.snapshot_revision;
 END IF;
 RETURN rid;
END $$;

CREATE FUNCTION public.finalize_telephony_transcript(p_call_sid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; rid uuid;
BEGIN
 FOR a IN SELECT id,direction,call_record_id FROM telephony_call_attempts WHERE parent_call_sid=p_call_sid LOOP
  -- No speech: keep the missing-evidence reconciliation visible, don't fabricate a transcript.
  IF a.direction='inbound' THEN
   IF NOT EXISTS(SELECT 1 FROM telephony_transcript_segments WHERE attempt_id=a.id) THEN CONTINUE; END IF;
   rid:=ensure_inbound_transcript_record(a.id);
  ELSE
   rid:=a.call_record_id;
   IF NOT EXISTS(SELECT 1 FROM call_records WHERE id=rid AND transcript_id IS NOT NULL
    AND nullif(trim(transcript_raw),'') IS NOT NULL) THEN CONTINUE; END IF;
  END IF;
  UPDATE call_records c SET metadata=coalesce(c.metadata,'{}')||jsonb_build_object('transcript_finalized_at',now()),
   call_end=coalesce(c.call_end,(SELECT max(ended_at) FROM telephony_call_attempts WHERE call_record_id=rid)),
   call_duration_seconds=coalesce(c.call_duration_seconds,(SELECT nullif(max(talk_seconds),0) FROM telephony_call_attempts WHERE call_record_id=rid))
   WHERE c.id=rid;
  INSERT INTO transcript_score_dispatch(call_id,tenant_id,available_at,snapshot_revision)
   SELECT id,tenant_id,now()+interval '5 seconds',md5(scoring_transcript_snapshot(call_records)::text) FROM call_records WHERE id=rid
   ON CONFLICT(call_id) DO NOTHING;
 END LOOP;
END $$;

CREATE FUNCTION public.reconcile_telephony_transcripts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid record;
BEGIN
 FOR sid IN SELECT DISTINCT a.parent_call_sid FROM telephony_call_attempts a
 LEFT JOIN inbound_calls i ON i.id=a.inbound_call_id AND i.tenant_id=a.tenant_id
 LEFT JOIN call_records c ON c.id=a.call_record_id AND c.tenant_id=a.tenant_id
 WHERE (i.ended_at IS NOT NULL OR a.ended_at IS NOT NULL)
 AND (c.metadata->>'transcript_finalized_at' IS NULL
  OR (c.call_duration_seconds IS NULL AND a.talk_seconds>0))
 AND (EXISTS(SELECT 1 FROM telephony_transcript_segments s WHERE s.attempt_id=a.id)
  OR (a.direction='outbound' AND c.transcript_id IS NOT NULL AND nullif(trim(c.transcript_raw),'') IS NOT NULL))
 LOOP PERFORM finalize_telephony_transcript(sid.parent_call_sid); END LOOP;
 -- Wrap-up timing corrections or late finals also invalidate the scoring snapshot.
 UPDATE transcript_score_dispatch d SET revision=d.revision+1,
  snapshot_revision=md5(scoring_transcript_snapshot(c)::text),available_at=now()+interval '5 seconds'
 FROM call_records c WHERE c.id=d.call_id AND c.tenant_id=d.tenant_id
 AND d.snapshot_revision IS DISTINCT FROM md5(scoring_transcript_snapshot(c)::text);
 UPDATE transcript_score_dispatch d SET delivered_revision=d.revision,last_error=NULL,available_at='infinity'::timestamptz
 FROM call_records c WHERE c.id=d.call_id AND c.tenant_id=d.tenant_id AND EXISTS(
  SELECT 1 FROM scoring_jobs j WHERE j.call_id=c.id AND j.tenant_id=c.tenant_id
  AND j.status='complete' AND j.transcript_revision=md5(scoring_transcript_snapshot(c)::text));
END $$;
REVOKE ALL ON FUNCTION public.reconcile_telephony_transcripts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_telephony_transcripts() TO service_role;

-- Service-only, tenant-bearing operational exception queue, including historical missing evidence.
CREATE VIEW public.telephony_missing_transcripts WITH(security_invoker=true) AS
 SELECT a.tenant_id,a.id AS attempt_id,a.parent_call_sid,a.call_record_id,coalesce(a.ended_at,i.ended_at) AS ended_at,
  CASE WHEN c.transcript_id IS NULL THEN 'missing_transcript' ELSE 'empty_transcript' END AS reason
 FROM telephony_call_attempts a LEFT JOIN call_records c ON c.id=a.call_record_id AND c.tenant_id=a.tenant_id
 LEFT JOIN inbound_calls i ON i.id=a.inbound_call_id AND i.tenant_id=a.tenant_id
 WHERE coalesce(a.ended_at,i.ended_at) < now()-interval '2 minutes' AND a.answered_at IS NOT NULL
 AND (c.transcript_id IS NULL OR nullif(trim(c.transcript_raw),'') IS NULL);
REVOKE ALL ON public.telephony_missing_transcripts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.telephony_missing_transcripts TO service_role;
REVOKE ALL ON FUNCTION public.ensure_inbound_transcript_record(uuid,uuid),
 public.persist_telephony_transcript(uuid,uuid,text,text,timestamptz,integer,integer),
 public.finalize_telephony_transcript(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_inbound_transcript_record(uuid,uuid),
 public.persist_telephony_transcript(uuid,uuid,text,text,timestamptz,integer,integer),
 public.finalize_telephony_transcript(text) TO service_role;

-- CMS sanctions are not present in the county landscape source.
CREATE OR REPLACE VIEW public."cms_plans_PY2027" WITH (security_invoker = true) AS
SELECT plan_year::text AS "Contract Year", category AS "Contract Category Type",
  state_code AS "State Territory Abbreviation", county_name AS "County Name",
  county_fips AS "County FIPS", carrier AS "Organization Marketing Name",
  carrier AS "Parent Organization Name", carrier AS "Contract Name",
  contract_id AS "Contract ID", plan_id AS "Plan ID", segment_id AS "Segment ID",
  contract_id || '_' || plan_id AS "ContractPlanID",
  contract_plan_segment_id AS "ContractPlanSegmentID",
  'Unknown'::text AS "Sanctioned Plan", plan_name AS "Plan Name", plan_type AS "Plan Type",
  snp_type AS "SNP Type", part_d_coverage AS "Part D Coverage Indicator",
  dsnp_integration_status AS "Dual Eligible SNP (D-SNP) Integration Status",
  dsnp_aip_identifier AS "D-SNP Applicable Integrated Plan (AIP) Identifier",
  part_c_premium::text AS "Part C Premium", part_d_premium::text AS "Part D Total Premium",
  monthly_premium::text AS "Monthly Consolidated Premium (Part C + D)",
  part_d_deductible::text AS "Annual Part D Deductible Amount",
  in_network_moop::text AS "In-Network Maximum Out-of-Pocket (MOOP) Amount",
  overall_star_rating::text AS "Overall Star Rating",
  part_c_star_rating::text AS "Part C Summary Star Rating",
  part_d_star_rating::text AS "Part D Summary Star Rating"
FROM public.cms_plans_py2027 WHERE plan_year = 2027;
GRANT SELECT ON public."cms_plans_PY2027" TO anon, authenticated;

COMMIT;
