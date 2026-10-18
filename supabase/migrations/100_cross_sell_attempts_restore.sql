-- Restore only the missing logging table, without replaying migration 015.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cross_sell_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 agent_id uuid REFERENCES public.enrolled_agents(id),
 call_transcript_id uuid REFERENCES public.call_transcripts(id),
 session_id uuid REFERENCES public.sessions(id),
 primary_product text NOT NULL CHECK(primary_product IN ('MA','MedSup','U65')),
 primary_carrier text,
 cross_sell_product text NOT NULL CHECK(cross_sell_product IN ('HIP','Dental','Vision','Dental_Vision','Cancer_CI','Accident')),
 presented boolean NOT NULL DEFAULT false,
 client_response text CHECK(client_response IN ('interested','enrolled','declined','callback')),
 decline_reason text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cross_sell_attempts_session_idx ON public.cross_sell_attempts(session_id);
CREATE INDEX IF NOT EXISTS cross_sell_attempts_agent_created_idx ON public.cross_sell_attempts(agent_id,created_at DESC);
ALTER TABLE public.cross_sell_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cross_sell_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.cross_sell_attempts TO authenticated;
GRANT ALL ON public.cross_sell_attempts TO service_role;
DROP POLICY IF EXISTS cross_sell_attempts_own ON public.cross_sell_attempts;
CREATE POLICY cross_sell_attempts_own ON public.cross_sell_attempts FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.enrolled_agents e WHERE e.id=agent_id AND e.tenant_id=cross_sell_attempts.tenant_id
   AND e.is_active AND e.clerk_user_id=NULLIF(auth.jwt()->>'sub','')))
 WITH CHECK (
 EXISTS(SELECT 1 FROM public.enrolled_agents e WHERE e.id=agent_id AND e.tenant_id=cross_sell_attempts.tenant_id
   AND e.is_active AND e.clerk_user_id=NULLIF(auth.jwt()->>'sub',''))
 AND (session_id IS NULL OR EXISTS(SELECT 1 FROM public.sessions s WHERE s.id=session_id AND s.agent_id=cross_sell_attempts.agent_id AND s.tenant_id=cross_sell_attempts.tenant_id))
 AND (call_transcript_id IS NULL OR EXISTS(SELECT 1 FROM public.call_transcripts t WHERE t.id=call_transcript_id
   AND t.tenant_id=cross_sell_attempts.tenant_id AND t.session_id=cross_sell_attempts.session_id))
 );
NOTIFY pgrst,'reload schema';
COMMIT;
