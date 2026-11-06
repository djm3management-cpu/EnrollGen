-- UNAPPLIED. Apply only after review, with scoring disabled on both services.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.compliance_scorecards
 ADD COLUMN rules_version text,
 ADD COLUMN scoring_state text NOT NULL DEFAULT 'legacy',
 ADD COLUMN scoring_duration_ms integer,
 ADD COLUMN tokens_used integer,
 ADD COLUMN estimated_cost_usd numeric,
 ADD COLUMN request_attempts integer,
 ADD COLUMN supersedes_id uuid REFERENCES public.compliance_scorecards(id),
 ADD COLUMN auto_fail_item_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.scorecard_items
 ADD COLUMN rule_id text,
 ADD COLUMN decided_by text CHECK(decided_by IN ('Code','AI','Admin')),
 ADD COLUMN evidence_end_ms integer,
 ADD COLUMN segment_id text,
 ADD COLUMN missing_reason text;
-- New cards must never contain evidence-free hard failures. Historical cards
-- are preserved and identified as legacy, not silently rewritten.
CREATE FUNCTION public.validate_new_compliance_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.auto_fail_triggered AND EXISTS(SELECT 1 FROM compliance_scorecards c
  WHERE c.id=NEW.scorecard_id AND c.scoring_state<>'legacy') AND
  (NEW.decided_by IS DISTINCT FROM 'Code' OR nullif(trim(NEW.evidence_text),'') IS NULL
   OR NEW.evidence_timestamp_ms IS NULL) THEN
  RAISE EXCEPTION 'Auto-fail requires code decision and timestamped evidence';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_new_compliance_item BEFORE INSERT OR UPDATE ON public.scorecard_items
 FOR EACH ROW EXECUTE FUNCTION public.validate_new_compliance_item();

CREATE TABLE public.compliance_llm_passes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),call_id uuid NOT NULL REFERENCES call_records(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id),request_id uuid NOT NULL UNIQUE,
 mode text NOT NULL CHECK(mode IN ('automatic','manual','legacy')),
 requested_by text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','running','complete','failed','legacy'))
);
ALTER TABLE public.compliance_scorecards ADD COLUMN llm_pass_id uuid REFERENCES compliance_llm_passes(id);
CREATE UNIQUE INDEX compliance_one_automatic_pass ON public.compliance_llm_passes(call_id) WHERE mode='automatic';
CREATE TABLE public.compliance_llm_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pass_id uuid NOT NULL REFERENCES compliance_llm_passes(id),
 request_id uuid NOT NULL UNIQUE,model text NOT NULL,attempt integer NOT NULL,
 reserved_tokens integer NOT NULL CHECK(reserved_tokens>0),input_tokens integer,output_tokens integer,
 estimated_cost_usd numeric,error_code text,fallback boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 UNIQUE(pass_id,attempt)
);
CREATE TABLE public.compliance_daily_budget(
 day date PRIMARY KEY, reserved_tokens bigint NOT NULL DEFAULT 0,token_cap bigint NOT NULL CHECK(token_cap>0)
);
-- No seeded cap or legacy ledger mutation in this migration. The rollout
-- requires an explicitly reviewed legacy-import plan before enabling scoring.
CREATE FUNCTION public.claim_compliance_pass(p_call_id uuid,p_tenant_id uuid,p_request_id uuid,p_mode text,p_requested_by text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; p compliance_llm_passes; n integer;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 SELECT * INTO p FROM compliance_llm_passes WHERE request_id=p_request_id;
 IF FOUND THEN
  IF p.call_id<>c.id THEN RAISE EXCEPTION 'Request belongs to another call'; END IF;
  RETURN jsonb_build_object('status','already_reserved','id',p.id);
 END IF;
 IF p_mode='automatic' AND (EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id)
  OR EXISTS(SELECT 1 FROM compliance_scorecards WHERE call_id=c.id)
  OR EXISTS(SELECT 1 FROM usage_records WHERE metadata->>'call_record_id'=c.id::text)) THEN
  RETURN jsonb_build_object('status','paid_pass_already_exists');
 END IF;
 IF p_mode NOT IN ('automatic','manual') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id AND status IN ('reserved','running')) THEN
  RETURN jsonb_build_object('status','busy');
 END IF;
 IF p_mode='manual' THEN
  IF nullif(p_requested_by,'') IS NULL THEN RAISE EXCEPTION 'Verified administrator required'; END IF;
  SELECT count(*) INTO n FROM compliance_llm_passes WHERE call_id=c.id AND mode='manual'
   AND created_at >= date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF n>=3 THEN RETURN jsonb_build_object('status','daily_manual_limit'); END IF;
 END IF;
 INSERT INTO compliance_llm_passes(call_id,tenant_id,request_id,mode,requested_by)
 VALUES(c.id,c.tenant_id,p_request_id,p_mode,p_requested_by) RETURNING * INTO p;
 RETURN jsonb_build_object('status','claimed','id',p.id);
END $$;
CREATE FUNCTION public.reserve_compliance_request(p_pass_id uuid,p_request_id uuid,p_model text,p_tokens integer,p_daily_cap bigint,p_fallback boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p compliance_llm_passes; b compliance_daily_budget; n integer; result uuid;
BEGIN
 SELECT * INTO STRICT p FROM compliance_llm_passes WHERE id=p_pass_id FOR UPDATE;
 IF p.status NOT IN ('reserved','running') OR p_tokens<1 THEN RAISE EXCEPTION 'Pass unavailable'; END IF;
 SELECT id INTO result FROM compliance_llm_requests WHERE request_id=p_request_id AND pass_id=p.id;
 IF FOUND THEN RAISE EXCEPTION 'Provider request already reserved; never replay'; END IF;
 SELECT count(*) INTO n FROM compliance_llm_requests WHERE pass_id=p.id;
 -- One request per pass. No retry or Terra fallback can silently add a pass.
 IF n>=1 OR p_fallback THEN RAISE EXCEPTION 'Paid request limit reached'; END IF;
 IF p_daily_cap IS NULL OR p_daily_cap<1 THEN RAISE EXCEPTION 'Daily scoring cap not configured'; END IF;
 INSERT INTO compliance_daily_budget(day,token_cap) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,p_daily_cap) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM compliance_daily_budget WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date FOR UPDATE;
 IF NOT FOUND OR b.reserved_tokens+p_tokens>least(b.token_cap,p_daily_cap) THEN RAISE EXCEPTION 'daily_scoring_token_cap'; END IF;
 UPDATE compliance_daily_budget SET reserved_tokens=reserved_tokens+p_tokens WHERE day=b.day;
 UPDATE compliance_llm_passes SET status='running' WHERE id=p.id;
 INSERT INTO compliance_llm_requests(pass_id,request_id,model,attempt,reserved_tokens,fallback)
 VALUES(p.id,p_request_id,p_model,n+1,p_tokens,p_fallback) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE TABLE public.compliance_review_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scorecard_item_id uuid NOT NULL REFERENCES scorecard_items(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id),request_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK(decision IN ('confirm','dismiss')),decided_by text NOT NULL,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),note text,
 replacement_scorecard_id uuid REFERENCES compliance_scorecards(id)
);
-- Browser clients cannot forge admin decisions or paid authorizations.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['compliance_llm_passes','compliance_llm_requests','compliance_daily_budget','compliance_review_decisions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY service_only ON public.%I TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_compliance_pass(uuid,uuid,uuid,text,text),public.reserve_compliance_request(uuid,uuid,text,integer,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_compliance_pass(uuid,uuid,uuid,text,text),public.reserve_compliance_request(uuid,uuid,text,integer,bigint,boolean) TO service_role;
-- Child visibility follows the parent card, including tenant membership.
-- Replace all old browser policies to prevent a permissive legacy OR bypass.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname,tablename FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('scorecard_items','intent_detections','phi_redactions')
 AND ('authenticated'=ANY(roles) OR 'public'=ANY(roles) OR 'anon'=ANY(roles)) LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY scorecard_item_parent_read ON public.scorecard_items FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM compliance_scorecards c WHERE c.id=scorecard_id AND public.is_current_tenant(c.tenant_id)));
CREATE POLICY detection_parent_read ON public.intent_detections FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM compliance_scorecards c WHERE c.call_id=intent_detections.call_id AND public.is_current_tenant(c.tenant_id)));
CREATE POLICY redaction_parent_read ON public.phi_redactions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM compliance_scorecards c WHERE c.call_id=phi_redactions.call_id AND public.is_current_tenant(c.tenant_id)));
NOTIFY pgrst,'reload schema';
COMMIT;
