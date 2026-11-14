-- Source statement 1
CREATE TABLE IF NOT EXISTS public.inbound_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
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

-- Source statement 2
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

-- Source statement 3
CREATE INDEX IF NOT EXISTS idx_inbound_calls_tenant ON public.inbound_calls (tenant_id, created_at DESC);

-- Source statement 4
CREATE INDEX IF NOT EXISTS idx_inbound_calls_contact ON public.inbound_calls (contact_id);

-- Source statement 5
CREATE INDEX IF NOT EXISTS idx_inbound_calls_agent ON public.inbound_calls (routed_agent_id);

-- Source statement 6
DROP TRIGGER IF EXISTS inbound_calls_set_updated_at ON public.inbound_calls;

-- Source statement 7
CREATE TRIGGER inbound_calls_set_updated_at
  BEFORE UPDATE ON public.inbound_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 8
CREATE TABLE IF NOT EXISTS public.telephony_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  inbound_call_id UUID REFERENCES public.inbound_calls(id) ON DELETE CASCADE,
  twilio_call_sid TEXT,
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 9
CREATE INDEX IF NOT EXISTS idx_telephony_events_call ON public.telephony_events (inbound_call_id, occurred_at);

-- Source statement 10
CREATE INDEX IF NOT EXISTS idx_telephony_events_sid ON public.telephony_events (twilio_call_sid);

-- Source statement 11
CREATE INDEX IF NOT EXISTS idx_telephony_events_tenant ON public.telephony_events (tenant_id);

-- Source statement 12
ALTER TABLE public.inbound_calls ENABLE ROW LEVEL SECURITY;

-- Source statement 13
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

-- Source statement 14
DROP POLICY IF EXISTS "inbound_calls_tenant_access" ON public.inbound_calls;

-- Source statement 15
CREATE POLICY "inbound_calls_tenant_access"
  ON public.inbound_calls FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 16
DROP POLICY IF EXISTS "inbound_calls_service_role" ON public.inbound_calls;

-- Source statement 17
CREATE POLICY "inbound_calls_service_role"
  ON public.inbound_calls FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 18
DROP POLICY IF EXISTS "telephony_events_tenant_read" ON public.telephony_events;

-- Source statement 19
CREATE POLICY "telephony_events_tenant_read"
  ON public.telephony_events FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

-- Source statement 20
DROP POLICY IF EXISTS "telephony_events_service_role" ON public.telephony_events;

-- Source statement 21
CREATE POLICY "telephony_events_service_role"
  ON public.telephony_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 22
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Source statement 23
DROP POLICY IF EXISTS "call_recordings_tenant_read" ON storage.objects;

-- Source statement 24
CREATE POLICY "call_recordings_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND public.is_current_tenant((storage.foldername(name))[1]::uuid)
  );

-- Source statement 25
DROP POLICY IF EXISTS "call_recordings_service_role" ON storage.objects;

-- Source statement 26
CREATE POLICY "call_recordings_service_role"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'call-recordings')
  WITH CHECK (bucket_id = 'call-recordings');
