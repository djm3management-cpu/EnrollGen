-- Record only the final status after reservation and phone-presence guards.
-- The old BEFORE trigger could log an attempted status that was never saved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.touch_agent_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_availability_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.available IS DISTINCT FROM NEW.available OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.agent_availability_log(agent_id, agent_name, status, available, changed_at)
    VALUES (NEW.agent_id, NEW.agent_name, NEW.status, NEW.available, clock_timestamp());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_change_trigger ON public.agent_availability;
CREATE TRIGGER availability_touch_trigger BEFORE UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_availability();
CREATE TRIGGER availability_change_trigger AFTER UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.log_availability_change();

CREATE INDEX agent_availability_log_agent_time_idx
  ON public.agent_availability_log(agent_id, changed_at DESC, id DESC);
CREATE INDEX agent_availability_log_time_idx
  ON public.agent_availability_log(changed_at DESC, id DESC);

REVOKE ALL ON FUNCTION public.touch_agent_availability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_availability_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_agent_availability() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_availability_change() TO service_role;
COMMIT;
