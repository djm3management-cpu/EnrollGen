BEGIN;
SET LOCAL lock_timeout='5s';
-- Keep existing outcome vocabularies and add the short connected-call outcome.
DO $$
DECLARE t text; c text; expression text;
BEGIN
 FOR t,c IN VALUES ('call_records','call_records_call_outcome_check'),('call_transcripts','call_transcripts_disposition_check') LOOP
  SELECT pg_get_expr(conbin,conrelid) INTO expression FROM pg_constraint WHERE conrelid=('public.'||t)::regclass AND conname=c;
  IF expression IS NULL THEN RAISE EXCEPTION 'Missing outcome constraint: %',c; END IF;
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',t,c);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((%s) OR %I=''short_call_hangup'') NOT VALID',
   t,c,expression,CASE t WHEN 'call_records' THEN 'call_outcome' ELSE 'disposition' END);
 END LOOP;
END $$;
ALTER TABLE public.agent_availability ADD COLUMN wrap_up_call_sid text;
CREATE TABLE public.call_wrap_ups (
 attempt_id uuid PRIMARY KEY REFERENCES public.telephony_call_attempts(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 agent_slug text NOT NULL, call_sid text NOT NULL,
 session_id uuid REFERENCES public.sessions(id),
 status text NOT NULL CHECK(status IN ('connected','pending','saved','exempt')),
 outcome text, connected_seconds integer, ended_at timestamptz, saved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX call_wrap_ups_agent_pending ON public.call_wrap_ups(agent_slug,updated_at) WHERE status IN ('connected','pending');
ALTER TABLE public.call_wrap_ups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_wrap_ups FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.call_wrap_ups TO service_role;
CREATE POLICY call_wrap_ups_service ON public.call_wrap_ups FOR ALL TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.refresh_agent_wrap_up(p_agent_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE held_sid text;
BEGIN
 SELECT call_sid INTO held_sid FROM call_wrap_ups WHERE agent_slug=p_agent_slug AND status IN ('connected','pending')
 ORDER BY updated_at DESC LIMIT 1;
 IF held_sid IS NOT NULL THEN
  UPDATE agent_availability SET wrap_up_call_sid=held_sid WHERE agent_id=p_agent_slug;
 ELSE
  UPDATE agent_availability SET wrap_up_call_sid=NULL
   WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NOT NULL;
  UPDATE agent_availability SET wrap_up_call_sid=NULL,status=coalesce(resume_status,'offline'),
   available=coalesce(resume_status,'offline')='available',resume_status=NULL,toggled_at=clock_timestamp()
   WHERE agent_id=p_agent_slug AND wrap_up_call_sid IS NOT NULL AND active_call_sid IS NULL;
 END IF;
END $$;

-- Runs after the existing reservation/presence guards. Neither another tab,
-- explicit outbound dialing nor a late release can bypass a pending outcome.
CREATE FUNCTION public.protect_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.wrap_up_call_sid IS NOT NULL THEN
  IF NEW.active_call_sid IS NOT NULL AND NEW.active_call_sid IS DISTINCT FROM OLD.active_call_sid
   AND NEW.active_call_sid IS DISTINCT FROM NEW.wrap_up_call_sid
   AND EXISTS(SELECT 1 FROM call_wrap_ups WHERE agent_slug=NEW.agent_id AND status IN ('connected','pending')) THEN
   RAISE EXCEPTION 'Save Call Outcome before starting another call';
  END IF;
  IF NEW.active_call_sid IS NULL THEN
   NEW.resume_status:=CASE WHEN NEW.status IN ('available','offline') THEN NEW.status
    ELSE coalesce(NEW.resume_status,OLD.resume_status,CASE WHEN OLD.status<>'busy' THEN OLD.status END,'offline') END;
   NEW.status:='busy'; NEW.available:=false;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_protect_call_wrap_up BEFORE UPDATE ON public.agent_availability
 FOR EACH ROW EXECUTE FUNCTION public.protect_call_wrap_up();

-- Signed telephony evidence owns the exception policy, including callbacks
-- arriving after the browser closes. No historical calls are swept/replayed.
CREATE FUNCTION public.track_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; c call_records; w call_wrap_ups; seconds integer; linked_session uuid; next_status text; next_outcome text;
BEGIN
 SELECT e.id INTO owner_id FROM enrolled_agents e JOIN availability_agent_subjects r
 ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id
 WHERE r.agent_slug=NEW.agent_id AND r.tenant_id=NEW.tenant_id AND r.is_active AND e.is_active;
 IF owner_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO c FROM call_records WHERE tenant_id=NEW.tenant_id AND agent_id=owner_id AND twilio_call_sid=NEW.parent_call_sid ORDER BY created_at LIMIT 1;
 SELECT id INTO linked_session FROM sessions WHERE tenant_id=NEW.tenant_id AND agent_id=owner_id AND twilio_call_sid=NEW.parent_call_sid;
 SELECT * INTO w FROM call_wrap_ups WHERE attempt_id=NEW.id;
 seconds:=CASE WHEN NEW.ended_at IS NOT NULL AND NEW.answered_at IS NOT NULL THEN
  CASE WHEN NEW.talk_seconds>0 THEN NEW.talk_seconds ELSE greatest(0,floor(extract(epoch FROM NEW.ended_at-NEW.answered_at))::integer) END END;
 next_status:=CASE WHEN NEW.answered_at IS NULL OR NEW.status='voicemail' THEN 'exempt' WHEN NEW.ended_at IS NULL THEN 'connected'
  WHEN seconds<15 THEN 'saved' ELSE 'pending' END;
 next_outcome:=CASE WHEN next_status='saved' THEN 'short_call_hangup' ELSE NULL END;
 IF w.status='saved' AND w.outcome IS DISTINCT FROM 'short_call_hangup' THEN
  next_status:='saved'; next_outcome:=w.outcome;
 ELSIF c.metadata->>'wrap_up_saved_at' IS NOT NULL AND c.metadata->>'auto_disposition' IS DISTINCT FROM 'short_call_hangup' THEN
  next_status:='saved'; next_outcome:=c.call_outcome;
 END IF;
 INSERT INTO call_wrap_ups(attempt_id,tenant_id,agent_id,agent_slug,call_sid,session_id,status,outcome,connected_seconds,ended_at,saved_at)
 VALUES(NEW.id,NEW.tenant_id,owner_id,NEW.agent_id,NEW.parent_call_sid,coalesce(c.session_id,linked_session),next_status,next_outcome,seconds,NEW.ended_at,
  CASE WHEN next_status='saved' THEN coalesce(w.saved_at,clock_timestamp()) END)
 ON CONFLICT(attempt_id) DO UPDATE SET session_id=coalesce(EXCLUDED.session_id,call_wrap_ups.session_id),
  status=EXCLUDED.status,outcome=EXCLUDED.outcome,connected_seconds=EXCLUDED.connected_seconds,
  ended_at=EXCLUDED.ended_at,saved_at=EXCLUDED.saved_at,updated_at=clock_timestamp();
 IF next_status IN ('saved','exempt') AND NEW.ended_at IS NOT NULL THEN
  UPDATE sessions SET ended_at=coalesce(ended_at,NEW.ended_at),duration_seconds=seconds,completed=false
   WHERE id=coalesce(c.session_id,linked_session) AND ended_at IS NULL;
 END IF;
 IF next_outcome='short_call_hangup' AND c.id IS NOT NULL THEN
  UPDATE call_records SET call_outcome=next_outcome,metadata=coalesce(metadata,'{}')||jsonb_build_object(
   'wrap_up_saved_at',coalesce(w.saved_at,clock_timestamp()),'auto_disposition',next_outcome)
  WHERE id=c.id;
  UPDATE call_transcripts SET disposition=next_outcome WHERE call_record_id=c.id AND tenant_id=NEW.tenant_id;
 END IF;
 PERFORM refresh_agent_wrap_up(NEW.agent_id);
 RETURN NEW;
END $$;
CREATE TRIGGER track_call_wrap_up AFTER INSERT OR UPDATE OF answered_at,ended_at,talk_seconds,status ON public.telephony_call_attempts
 FOR EACH ROW EXECUTE FUNCTION public.track_call_wrap_up();

CREATE FUNCTION public.apply_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w call_wrap_ups;
BEGIN
 SELECT * INTO w FROM call_wrap_ups WHERE call_sid=NEW.twilio_call_sid AND tenant_id=NEW.tenant_id AND agent_id=NEW.agent_id;
 IF w.status='saved' AND w.outcome='short_call_hangup' AND NEW.metadata->>'wrap_up_saved_at' IS NULL THEN
  NEW.call_outcome:=w.outcome;
  NEW.metadata:=coalesce(NEW.metadata,'{}')||jsonb_build_object('wrap_up_saved_at',w.saved_at,'auto_disposition',w.outcome);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_call_wrap_up BEFORE INSERT OR UPDATE ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.apply_call_wrap_up();

CREATE FUNCTION public.save_call_wrap_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w call_wrap_ups;
BEGIN
 SELECT * INTO w FROM call_wrap_ups WHERE call_sid=NEW.twilio_call_sid AND tenant_id=NEW.tenant_id AND agent_id=NEW.agent_id;
 IF w.attempt_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.metadata->>'wrap_up_saved_at' IS NOT NULL AND NEW.call_outcome IS NOT NULL AND NEW.call_outcome<>'incomplete' THEN
  UPDATE call_wrap_ups SET status='saved',outcome=NEW.call_outcome,session_id=NEW.session_id,
   saved_at=(NEW.metadata->>'wrap_up_saved_at')::timestamptz,updated_at=clock_timestamp() WHERE attempt_id=w.attempt_id;
  UPDATE sessions SET ended_at=coalesce(ended_at,(NEW.metadata->>'wrap_up_saved_at')::timestamptz),
   completed=NEW.call_outcome='enrolled',duration_seconds=coalesce(w.connected_seconds,NEW.call_duration_seconds)
  WHERE id=NEW.session_id AND tenant_id=NEW.tenant_id AND agent_id=NEW.agent_id;
  UPDATE call_transcripts SET disposition=NEW.call_outcome WHERE call_record_id=NEW.id AND tenant_id=NEW.tenant_id;
  PERFORM refresh_agent_wrap_up(w.agent_slug);
 ELSIF NEW.session_id IS DISTINCT FROM w.session_id THEN
  UPDATE call_wrap_ups SET session_id=NEW.session_id WHERE attempt_id=w.attempt_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER save_call_wrap_up AFTER INSERT OR UPDATE OF metadata,call_outcome,session_id ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.save_call_wrap_up();

-- A final transcript segment may arrive after a short call was auto-saved.
CREATE FUNCTION public.apply_transcript_wrap_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM call_records WHERE id=NEW.call_record_id AND tenant_id=NEW.tenant_id
  AND call_outcome='short_call_hangup' AND metadata->>'auto_disposition'='short_call_hangup') THEN
  NEW.disposition:='short_call_hangup';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_transcript_wrap_up BEFORE INSERT OR UPDATE ON public.call_transcripts
 FOR EACH ROW EXECUTE FUNCTION public.apply_transcript_wrap_up();
REVOKE ALL ON FUNCTION public.apply_transcript_wrap_up() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transcript_wrap_up() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_agent_wrap_up(text),public.protect_call_wrap_up(),public.track_call_wrap_up(),
 public.apply_call_wrap_up(),public.save_call_wrap_up() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_agent_wrap_up(text),public.protect_call_wrap_up(),public.track_call_wrap_up(),
 public.apply_call_wrap_up(),public.save_call_wrap_up() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
