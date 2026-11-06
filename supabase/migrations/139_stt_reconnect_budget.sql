-- UNAPPLIED. Shared counter across channels, processes and browser fallbacks.
BEGIN;
CREATE TABLE public.stt_call_reconnects(
 tenant_id uuid NOT NULL REFERENCES tenants(id),call_sid text NOT NULL,
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
 IF NOT EXISTS(SELECT 1 FROM telephony_call_attempts WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid AND ended_at IS NULL AND answered_at IS NOT NULL) THEN RETURN false; END IF;
 INSERT INTO stt_call_reconnects(tenant_id,call_sid,reconnects) VALUES(p_tenant_id,p_call_sid,1)
 ON CONFLICT(tenant_id,call_sid) DO UPDATE SET reconnects=stt_call_reconnects.reconnects+1,updated_at=clock_timestamp()
 WHERE stt_call_reconnects.reconnects<20;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.reserve_stt_reconnect(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stt_reconnect(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
