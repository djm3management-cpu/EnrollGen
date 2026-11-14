-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout='5s';

-- Source statement 3
CREATE TABLE public.call_wrap_up_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 routing_hold_enabled boolean NOT NULL DEFAULT false,
 disabled_reason text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Source statement 4
INSERT INTO public.call_wrap_up_policy(singleton,routing_hold_enabled,disabled_reason)
 VALUES(true,false,'2026-10-20 incident: disable all migration 105 automation pending own-agent-leg verification and tested dialer UI');

-- Source statement 5
ALTER TABLE public.call_wrap_up_policy ENABLE ROW LEVEL SECURITY;

-- Source statement 6
REVOKE ALL ON public.call_wrap_up_policy FROM PUBLIC,anon,authenticated;

-- Source statement 7
GRANT ALL ON public.call_wrap_up_policy TO service_role;

-- Source statement 8
CREATE POLICY call_wrap_up_policy_service ON public.call_wrap_up_policy FOR ALL TO service_role USING(true) WITH CHECK(true);

-- Source statement 9
ALTER TABLE public.telephony_call_attempts DISABLE TRIGGER track_call_wrap_up;

-- Source statement 10
ALTER TABLE public.call_records DISABLE TRIGGER apply_call_wrap_up;

-- Source statement 11
ALTER TABLE public.call_records DISABLE TRIGGER save_call_wrap_up;

-- Source statement 12
ALTER TABLE public.call_transcripts DISABLE TRIGGER apply_transcript_wrap_up;

-- Source statement 13
CREATE OR REPLACE FUNCTION public.protect_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.wrap_up_call_sid:=NULL;
 RETURN NEW;
END $$;

-- Source statement 14
CREATE OR REPLACE FUNCTION public.refresh_agent_wrap_up(p_agent_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE agent_availability SET wrap_up_call_sid=NULL
  WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NOT NULL;
 UPDATE agent_availability SET wrap_up_call_sid=NULL,status=coalesce(resume_status,'offline'),
  available=coalesce(resume_status,'offline')='available',resume_status=NULL,toggled_at=clock_timestamp()
  WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NULL;
END $$;

-- Source statement 16
DO $$
DECLARE slug text;
BEGIN
 FOR slug IN SELECT agent_id FROM agent_availability WHERE wrap_up_call_sid IS NOT NULL LOOP
  PERFORM public.refresh_agent_wrap_up(slug);
 END LOOP;
END $$;

-- Source statement 17
NOTIFY pgrst,'reload schema';

-- Source statement 18
COMMIT;
