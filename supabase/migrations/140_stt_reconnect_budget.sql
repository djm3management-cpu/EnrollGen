-- UNAPPLIED. Shared counter across channels, processes and browser fallbacks.
BEGIN;
CREATE TABLE public.stt_call_reconnects(
 tenant_id uuid NOT NULL REFERENCES tenants(id),call_sid text NOT NULL,
 channels jsonb NOT NULL DEFAULT '{}',
 reconnects integer NOT NULL DEFAULT 0 CHECK(reconnects BETWEEN 0 AND 20),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,call_sid)
);
ALTER TABLE public.stt_call_reconnects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stt_call_reconnects FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.stt_call_reconnects TO service_role;
CREATE POLICY stt_budget_service ON public.stt_call_reconnects TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.reserve_stt_reconnect(p_tenant_id uuid,p_call_sid text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM telephony_call_attempts WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid AND ended_at IS NULL AND answered_at IS NOT NULL) OR EXISTS(SELECT 1 FROM call_conferences WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid AND ended_at IS NULL)) THEN RETURN false; END IF;
 INSERT INTO stt_call_reconnects(tenant_id,call_sid,reconnects) VALUES(p_tenant_id,p_call_sid,1)
 ON CONFLICT(tenant_id,call_sid) DO UPDATE SET reconnects=stt_call_reconnects.reconnects+1,updated_at=clock_timestamp()
 WHERE stt_call_reconnects.reconnects<20;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.reserve_stt_reconnect(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stt_reconnect(uuid,text) TO service_role;
CREATE FUNCTION public.register_stt_stream(p_tenant_id uuid,p_call_sid text,p_channel text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE budget stt_call_reconnects; prior integer;
BEGIN
 IF length(p_channel)>100 OR NOT (EXISTS(SELECT 1 FROM telephony_call_attempts WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid AND ended_at IS NULL AND answered_at IS NOT NULL) OR EXISTS(SELECT 1 FROM call_conferences WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid AND ended_at IS NULL)) THEN RETURN false; END IF;
 INSERT INTO stt_call_reconnects(tenant_id,call_sid) VALUES(p_tenant_id,p_call_sid) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT budget FROM stt_call_reconnects WHERE tenant_id=p_tenant_id AND call_sid=p_call_sid FOR UPDATE;
 prior:=coalesce((budget.channels->>p_channel)::integer,0);
 IF prior>0 AND budget.reconnects>=20 THEN RETURN false; END IF;
 UPDATE stt_call_reconnects SET channels=jsonb_set(channels,ARRAY[p_channel],to_jsonb(prior+1)),reconnects=reconnects+CASE WHEN prior>0 THEN 1 ELSE 0 END,updated_at=clock_timestamp() WHERE tenant_id=p_tenant_id AND call_sid=p_call_sid;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.register_stt_stream(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_stt_stream(uuid,text,text) TO service_role;
CREATE FUNCTION public.append_transcription_gap(p_attempt_id uuid,p_participant_id uuid,p_gap_id uuid,p_start_ms integer,p_end_ms integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records;rid uuid;
BEGIN
 IF p_start_ms<0 OR p_end_ms<=p_start_ms THEN RAISE EXCEPTION 'Invalid capture gap'; END IF;
 IF p_participant_id IS NOT NULL THEN SELECT call_id INTO STRICT rid FROM call_participants WHERE id=p_participant_id;
 ELSE SELECT call_record_id INTO STRICT rid FROM telephony_call_attempts WHERE id=p_attempt_id; END IF;
 SELECT * INTO STRICT c FROM call_records WHERE id=rid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.metadata->'transcription_gaps','[]')) g WHERE g->>'id'=p_gap_id::text) THEN RETURN; END IF;
 UPDATE call_records SET metadata=jsonb_set(coalesce(metadata,'{}'),'{transcription_gaps}',coalesce(metadata->'transcription_gaps','[]')||jsonb_build_array(jsonb_build_object('id',p_gap_id,'start_ms',p_start_ms,'end_ms',p_end_ms,'source','capture_buffer_overflow'))) WHERE id=c.id;
END $$;
REVOKE ALL ON FUNCTION public.append_transcription_gap(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_transcription_gap(uuid,uuid,uuid,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
