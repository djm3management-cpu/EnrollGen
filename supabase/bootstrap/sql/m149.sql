-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.conversely_worker_status ADD COLUMN next_check_at timestamptz;

-- Source statement 3
CREATE TABLE public.conversely_run_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES public.conversely_runs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 kind text NOT NULL,
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Source statement 4
CREATE INDEX conversely_run_events_run ON public.conversely_run_events(run_id,id);

-- Source statement 5
ALTER TABLE public.conversely_run_events ENABLE ROW LEVEL SECURITY;

-- Source statement 6
REVOKE ALL ON public.conversely_run_events FROM PUBLIC,anon,authenticated;

-- Source statement 7
GRANT ALL ON public.conversely_run_events TO service_role;

-- Source statement 8
GRANT USAGE,SELECT ON SEQUENCE public.conversely_run_events_id_seq TO service_role;

-- Source statement 9
NOTIFY pgrst,'reload schema';

-- Source statement 10
COMMIT;
