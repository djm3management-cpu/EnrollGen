-- UNAPPLIED. Manual, idempotent gap jobs. No cron/queue consumer is installed.
BEGIN;
CREATE TABLE public.manual_transcript_gap_fills(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE,
 call_id uuid NOT NULL REFERENCES call_records(id),tenant_id uuid NOT NULL REFERENCES tenants(id),
 recording_id uuid NOT NULL REFERENCES recording_ingestion(id),requested_by text NOT NULL,
 source_transcript jsonb NOT NULL,ranges jsonb NOT NULL,channel_speakers jsonb NOT NULL,
 timeline_offset_ms integer NOT NULL,estimated_cost_usd numeric NOT NULL CHECK(estimated_cost_usd>=0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','complete','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),error text
);
CREATE UNIQUE INDEX one_active_manual_gap_fill ON public.manual_transcript_gap_fills(call_id) WHERE status IN ('queued','processing');
CREATE TABLE public.manual_transcript_gap_requests(
 job_id uuid REFERENCES manual_transcript_gap_fills(id),range_index integer NOT NULL,
 request_id uuid NOT NULL UNIQUE,submitted_minutes numeric NOT NULL,completed_at timestamptz,
 provider_request_id text,PRIMARY KEY(job_id,range_index)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['manual_transcript_gap_fills','manual_transcript_gap_requests'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY gap_service_only ON public.%I TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
CREATE FUNCTION public.persist_manual_gap_result(p_job_id uuid,p_expected_transcript jsonb,p_lines jsonb,p_range_index integer,p_provider_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j manual_transcript_gap_fills;c call_records;merged jsonb;body text;
BEGIN
 SELECT cr.* INTO STRICT c FROM call_records cr JOIN manual_transcript_gap_fills g ON g.call_id=cr.id WHERE g.id=p_job_id FOR UPDATE OF cr;
 SELECT * INTO STRICT j FROM manual_transcript_gap_fills WHERE id=p_job_id FOR UPDATE;
 IF j.status<>'processing' OR c.tenant_id<>j.tenant_id THEN RAISE EXCEPTION 'Gap job unavailable'; END IF;
 IF c.transcript_diarized IS DISTINCT FROM p_expected_transcript THEN RAISE EXCEPTION 'Transcript changed during repair'; END IF;
 IF NOT EXISTS(SELECT 1 FROM manual_transcript_gap_requests WHERE job_id=j.id AND range_index=p_range_index AND completed_at IS NULL) THEN RAISE EXCEPTION 'Gap request already consumed'; END IF;
 SELECT jsonb_agg(x ORDER BY (x->>'start_ms')::numeric,(x->>'end_ms')::numeric,x->>'id'),
 string_agg((x->>'speaker')||': '||(x->>'text'),E'\n' ORDER BY (x->>'start_ms')::numeric)
 INTO merged,body FROM jsonb_array_elements(coalesce(c.transcript_diarized,'[]')||p_lines)x;
 -- Set the manual flag in the same update so refresh triggers cannot grant a
 -- second paid pass. Original scorecard versions remain untouched.
 UPDATE call_records SET transcript_diarized=merged,transcript_raw=body,
 metadata=coalesce(metadata,'{}')||jsonb_build_object('manual_gap_fill',true,'last_manual_gap_job',j.id) WHERE id=c.id;
 UPDATE manual_transcript_gap_requests SET completed_at=clock_timestamp(),provider_request_id=p_provider_id
 WHERE job_id=j.id AND range_index=p_range_index;
 RETURN merged;
END $$;
REVOKE ALL ON FUNCTION public.persist_manual_gap_result(uuid,jsonb,jsonb,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_manual_gap_result(uuid,jsonb,jsonb,integer,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
