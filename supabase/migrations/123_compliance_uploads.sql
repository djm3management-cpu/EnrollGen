BEGIN;
-- Both providers share the same durable queue and lease contract.
CREATE TABLE public.conversely_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 call_id uuid NOT NULL REFERENCES public.call_records(id),
 twilio_recording_sid text NOT NULL,
 enrollment_key text NOT NULL,
 confirmation_code text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploading','uploaded','failed','missing_code')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 last_error text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz,
 ix_receipt_id text, uploaded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,twilio_recording_sid,enrollment_key)
);
CREATE FUNCTION public.claim_compliance_upload(p_provider text) RETURNS SETOF public.conversely_submissions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; BEGIN
 tab := CASE p_provider WHEN 'conversely' THEN 'conversely_submissions' WHEN 'ix' THEN 'ix_uploads' ELSE NULL END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Invalid provider'; END IF;
 -- A lost final lease must still become terminal after five attempts.
 EXECUTE format('UPDATE %I SET status=''failed'',last_error=''lease_expired'',updated_at=now() WHERE status=''uploading'' AND lease_until<now() AND attempts>=5',tab);
 RETURN QUERY EXECUTE format('UPDATE %I q SET status=''uploading'',attempts=q.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval ''30 minutes'',updated_at=now()
 WHERE id=(SELECT id FROM %I WHERE attempts<5 AND ((status IN (''pending'',''failed'') AND next_attempt_at<=now()) OR (status=''uploading'' AND lease_until<now()))
 ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING q.*',tab,tab);
END; $$;
CREATE FUNCTION public.finish_compliance_upload(p_provider text,p_id uuid,p_token uuid,p_success boolean,p_error text DEFAULT NULL,p_receipt text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; BEGIN
 tab:=CASE p_provider WHEN 'conversely' THEN 'conversely_submissions' WHEN 'ix' THEN 'ix_uploads' ELSE NULL END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Invalid provider'; END IF;
 EXECUTE format('UPDATE %I SET status=CASE WHEN $3 THEN ''uploaded'' WHEN attempts>=5 THEN ''failed'' ELSE ''pending'' END,
 last_error=CASE WHEN $3 THEN NULL ELSE $4 END,ix_receipt_id=$5,uploaded_at=CASE WHEN $3 THEN now() ELSE NULL END,
 next_attempt_at=now()+make_interval(secs=>60*power(2,attempts-1)::integer),lease_until=NULL,lease_token=NULL,updated_at=now()
 WHERE id=$1 AND lease_token=$2 AND status=''uploading''',tab) USING p_id,p_token,p_success,p_error,p_receipt;
END; $$;

ALTER TABLE public.conversely_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversely_submissions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.conversely_submissions TO service_role;
CREATE INDEX conversely_submission_due ON public.conversely_submissions(next_attempt_at) WHERE status IN ('pending','failed','uploading');
CREATE TABLE public.conversely_weekly_runs (
 week_start date PRIMARY KEY, samples_per_agent integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversely_weekly_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL REFERENCES public.conversely_weekly_runs(week_start),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 agent_slug text, call_id uuid REFERENCES public.call_records(id), recording_sid text, enrollment_key text,
 score numeric, eligible boolean NOT NULL, selected boolean NOT NULL,reason text NOT NULL,sample_rank integer,
 submission_id uuid REFERENCES public.conversely_submissions(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(week_start,tenant_id,agent_id,sample_rank)
);
CREATE FUNCTION public.conversely_week_candidates(p_week date)
 RETURNS TABLE(tenant_id uuid,agent_id uuid,agent_slug text,clerk_user_id text,call_id uuid,carrier_name text,
 call_start timestamptz,compliance_status text,score numeric,recording_id uuid,recording_sid text,account_sid text,
 callback_call_sid text,recording_channels smallint,enrollment_key text,already_submitted boolean)
 LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT a.tenant_id,a.id,subjects.agent_slug,a.clerk_user_id,c.id,c.carrier_name,c.call_start,c.compliance_status,
 card.overall_score,r.id,r.recording_sid,r.account_sid,r.callback_call_sid,r.recording_channels,
 coalesce(nullif(c.enrollment_confirmation_number,''),c.id::text),
 EXISTS(SELECT 1 FROM conversely_submissions s WHERE s.tenant_id=c.tenant_id AND s.twilio_recording_sid=r.recording_sid
 AND s.enrollment_key=coalesce(nullif(c.enrollment_confirmation_number,''),c.id::text))
 FROM enrolled_agents a
 LEFT JOIN LATERAL(SELECT ras.agent_slug FROM recording_agent_subjects ras WHERE ras.tenant_id=a.tenant_id AND ras.clerk_user_id=a.clerk_user_id LIMIT 1) subjects ON true
 LEFT JOIN call_records c ON c.tenant_id=a.tenant_id AND c.agent_id=a.id
 AND c.call_start >= (p_week::timestamp AT TIME ZONE 'America/New_York')
 AND c.call_start < ((p_week+7)::timestamp AT TIME ZONE 'America/New_York')
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 LEFT JOIN compliance_scorecards card ON card.id=c.compliance_scorecard_id AND card.call_id=c.id AND card.tenant_id=c.tenant_id
 AND NOT coalesce(card.is_thread_composite,false)
 LEFT JOIN LATERAL(SELECT ri.* FROM recording_ingestion ri WHERE ri.tenant_id=c.tenant_id AND ri.call_record_id=c.id
 AND ri.provider_status='completed' AND ri.copy_status<>'absent' AND ri.recording_sid IS NOT NULL
 ORDER BY ri.recording_duration_seconds DESC NULLS LAST,ri.first_seen_at,ri.id LIMIT 1) r ON true
 WHERE a.is_active;
$$;
CREATE FUNCTION public.reserve_conversely_week(p_week date,p_samples integer,p_decisions jsonb)
 RETURNS SETOF public.conversely_weekly_audit LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE decision jsonb; submission uuid; BEGIN
 IF p_samples<1 OR p_samples>100 OR extract(isodow FROM p_week)<>1
 OR p_week+7>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Invalid weekly run'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('conversely-week:'||p_week::text,0));
 IF EXISTS(SELECT 1 FROM conversely_weekly_runs WHERE week_start=p_week) THEN RETURN; END IF;
 INSERT INTO conversely_weekly_runs(week_start,samples_per_agent) VALUES(p_week,p_samples);
 FOR decision IN SELECT value FROM jsonb_array_elements(p_decisions) LOOP
  submission:=NULL;
  IF (decision->>'selected')::boolean THEN
   IF (decision->>'sample_rank')::integer NOT BETWEEN 1 AND p_samples THEN RAISE EXCEPTION 'Invalid sample rank'; END IF;
   INSERT INTO conversely_submissions(tenant_id,call_id,twilio_recording_sid,enrollment_key)
    VALUES((decision->>'tenant_id')::uuid,(decision->>'call_id')::uuid,decision->>'recording_sid',decision->>'enrollment_key')
    ON CONFLICT DO NOTHING RETURNING id INTO submission;
  END IF;
  INSERT INTO conversely_weekly_audit(week_start,tenant_id,agent_id,agent_slug,call_id,recording_sid,enrollment_key,score,eligible,selected,reason,sample_rank,submission_id)
   VALUES(p_week,(decision->>'tenant_id')::uuid,(decision->>'agent_id')::uuid,decision->>'agent_slug',(decision->>'call_id')::uuid,
   decision->>'recording_sid',decision->>'enrollment_key',(decision->>'score')::numeric,(decision->>'eligible')::boolean,
   (decision->>'selected')::boolean,decision->>'reason',(decision->>'sample_rank')::integer,submission);
 END LOOP;
 RETURN QUERY SELECT * FROM conversely_weekly_audit WHERE week_start=p_week ORDER BY agent_id,call_id;
END; $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['conversely_weekly_runs','conversely_weekly_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_compliance_upload(text),public.finish_compliance_upload(text,uuid,uuid,boolean,text,text),
 public.conversely_week_candidates(date),public.reserve_conversely_week(date,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_compliance_upload(text),public.finish_compliance_upload(text,uuid,uuid,boolean,text,text),
 public.conversely_week_candidates(date),public.reserve_conversely_week(date,integer,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
