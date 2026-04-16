-- ============================================================
--  CALL LOGS
--  Tracks websocket-backed call timing for billable transfers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.enrolled_agents(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  billable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_call_id ON public.call_logs (call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_agent_started
  ON public.call_logs (agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_billable_started
  ON public.call_logs (billable, started_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_logs_own"
  ON public.call_logs FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "call_logs_principal_read"
  ON public.call_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

CREATE POLICY "call_logs_principal_insert"
  ON public.call_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );
