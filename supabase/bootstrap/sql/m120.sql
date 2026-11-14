-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout = '5s';

-- Source statement 3
SET LOCAL statement_timeout = '30s';

-- Source statement 4
CREATE OR REPLACE FUNCTION public.touch_agent_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- Source statement 5
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

-- Source statement 6
DROP TRIGGER IF EXISTS availability_change_trigger ON public.agent_availability;

-- Source statement 7
CREATE TRIGGER availability_touch_trigger BEFORE UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_availability();

-- Source statement 8
CREATE TRIGGER availability_change_trigger AFTER UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.log_availability_change();

-- Source statement 9
CREATE INDEX agent_availability_log_agent_time_idx
  ON public.agent_availability_log(agent_id, changed_at DESC, id DESC);

-- Source statement 10
CREATE INDEX agent_availability_log_time_idx
  ON public.agent_availability_log(changed_at DESC, id DESC);

-- Source statement 11
REVOKE ALL ON FUNCTION public.touch_agent_availability() FROM PUBLIC, anon, authenticated;

-- Source statement 12
REVOKE ALL ON FUNCTION public.log_availability_change() FROM PUBLIC, anon, authenticated;

-- Source statement 13
GRANT EXECUTE ON FUNCTION public.touch_agent_availability() TO service_role;

-- Source statement 14
GRANT EXECUTE ON FUNCTION public.log_availability_change() TO service_role;

-- Source statement 15
COMMIT;
