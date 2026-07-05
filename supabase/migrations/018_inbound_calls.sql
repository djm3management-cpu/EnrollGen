-- ============================================================
-- INBOUND CALL PLATFORM
-- Twilio inbound call lifecycle, telephony event log, and the
-- call-recordings storage bucket. Written by the standalone
-- telephony service (service role); read by agents under RLS.
-- ============================================================

-- ------------------------------------------------------------
-- inbound_calls: one row per inbound Twilio call
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inbound_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID REFERENCES public.contacts(id),
  twilio_call_sid TEXT UNIQUE NOT NULL,
  from_number TEXT,
  to_number TEXT,
  routed_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'declined', 'voicemail', 'completed', 'failed')),
  call_record_id UUID,
  recording_url TEXT,
  recording_storage_path TEXT,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.inbound_calls
      ADD CONSTRAINT inbound_calls_call_record_fk
      FOREIGN KEY (call_record_id) REFERENCES public.call_records(id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbound_calls_tenant ON public.inbound_calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_calls_contact ON public.inbound_calls (contact_id);
CREATE INDEX IF NOT EXISTS idx_inbound_calls_agent ON public.inbound_calls (routed_agent_id);

DROP TRIGGER IF EXISTS inbound_calls_set_updated_at ON public.inbound_calls;
CREATE TRIGGER inbound_calls_set_updated_at
  BEFORE UPDATE ON public.inbound_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- telephony_events: append-only lifecycle log from Twilio
-- status callbacks (initiated, ringing, answered, completed,
-- recording events, routing decisions).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telephony_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  inbound_call_id UUID REFERENCES public.inbound_calls(id) ON DELETE CASCADE,
  twilio_call_sid TEXT,
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telephony_events_call ON public.telephony_events (inbound_call_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_telephony_events_sid ON public.telephony_events (twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_telephony_events_tenant ON public.telephony_events (tenant_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.inbound_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbound_calls_tenant_access" ON public.inbound_calls;
CREATE POLICY "inbound_calls_tenant_access"
  ON public.inbound_calls FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "inbound_calls_service_role" ON public.inbound_calls;
CREATE POLICY "inbound_calls_service_role"
  ON public.inbound_calls FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "telephony_events_tenant_read" ON public.telephony_events;
CREATE POLICY "telephony_events_tenant_read"
  ON public.telephony_events FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "telephony_events_service_role" ON public.telephony_events;
CREATE POLICY "telephony_events_service_role"
  ON public.telephony_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- Storage bucket for call recordings.
-- Path convention: {tenant_id}/{twilio_call_sid}.wav
-- Uploads come from the telephony service (service role only).
-- Authenticated agents can read recordings for their tenant.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "call_recordings_tenant_read" ON storage.objects;
CREATE POLICY "call_recordings_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND public.is_current_tenant((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "call_recordings_service_role" ON storage.objects;
CREATE POLICY "call_recordings_service_role"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'call-recordings')
  WITH CHECK (bucket_id = 'call-recordings');
