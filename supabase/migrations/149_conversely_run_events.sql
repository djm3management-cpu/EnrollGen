BEGIN;
ALTER TABLE public.conversely_worker_status ADD COLUMN next_check_at timestamptz;
CREATE TABLE public.conversely_run_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES public.conversely_runs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 kind text NOT NULL,
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversely_run_events_run ON public.conversely_run_events(run_id,id);
ALTER TABLE public.conversely_run_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversely_run_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.conversely_run_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.conversely_run_events_id_seq TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
