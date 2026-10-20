-- Incident stabilization: production must not enforce an unpublished UI.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.call_wrap_up_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 routing_hold_enabled boolean NOT NULL DEFAULT false,
 disabled_reason text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.call_wrap_up_policy(singleton,routing_hold_enabled,disabled_reason)
 VALUES(true,false,'2026-10-20 incident: disable all migration 105 automation pending own-agent-leg verification and tested dialer UI');
ALTER TABLE public.call_wrap_up_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_wrap_up_policy FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.call_wrap_up_policy TO service_role;
CREATE POLICY call_wrap_up_policy_service ON public.call_wrap_up_policy FOR ALL TO service_role USING(true) WITH CHECK(true);

-- Disable the automation, including its automatic dispositions/session closure.
-- Retain all evidence rows; do not manufacture an outcome for any agent.
ALTER TABLE public.telephony_call_attempts DISABLE TRIGGER track_call_wrap_up;
ALTER TABLE public.call_records DISABLE TRIGGER apply_call_wrap_up;
ALTER TABLE public.call_records DISABLE TRIGGER save_call_wrap_up;
ALTER TABLE public.call_transcripts DISABLE TRIGGER apply_transcript_wrap_up;
CREATE OR REPLACE FUNCTION public.protect_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.wrap_up_call_sid:=NULL;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.refresh_agent_wrap_up(p_agent_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE agent_availability SET wrap_up_call_sid=NULL
  WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NOT NULL;
 UPDATE agent_availability SET wrap_up_call_sid=NULL,status=coalesce(resume_status,'offline'),
  available=coalesce(resume_status,'offline')='available',resume_status=NULL,toggled_at=clock_timestamp()
  WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NULL;
END $$;

-- Dylan first, then all other held agents. A live reservation is never released.
SELECT public.refresh_agent_wrap_up('dylan_maria');
DO $$
DECLARE slug text;
BEGIN
 FOR slug IN SELECT agent_id FROM agent_availability WHERE wrap_up_call_sid IS NOT NULL LOOP
  PERFORM public.refresh_agent_wrap_up(slug);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
