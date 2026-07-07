-- ============================================================
-- SMS MESSAGING + UNIFIED CALL LOG
-- Two-way SMS/MMS threads per contact (written by the telephony
-- service with the service role, read by agents under RLS), plus
-- v_call_log, the unified inbound + outbound call view backing
-- the rebuilt CALLS tab.
-- ============================================================

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
  from_number TEXT,
  to_number TEXT,
  body TEXT,
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  agent_id TEXT, -- outbound sender, availability agent_id convention
  read_at TIMESTAMPTZ, -- inbound only; null = unread
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_contact ON public.messages (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON public.messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (tenant_id)
  WHERE direction = 'inbound' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_twilio_sid ON public.messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

DROP TRIGGER IF EXISTS messages_set_updated_at ON public.messages;
CREATE TRIGGER messages_set_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- message_media (MMS attachments)
-- Storage path convention: {tenant_id}/{message_id}/{filename}
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  media_url TEXT,
  content_type TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_media_message ON public.message_media (message_id);
CREATE INDEX IF NOT EXISTS idx_message_media_tenant ON public.message_media (tenant_id);

-- ------------------------------------------------------------
-- RLS (pattern from 007)
-- ------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_tenant_access" ON public.messages;
CREATE POLICY "messages_tenant_access"
  ON public.messages FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "messages_service_role" ON public.messages;
CREATE POLICY "messages_service_role"
  ON public.messages FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "message_media_tenant_access" ON public.message_media;
CREATE POLICY "message_media_tenant_access"
  ON public.message_media FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "message_media_service_role" ON public.message_media;
CREATE POLICY "message_media_service_role"
  ON public.message_media FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- Extend existing CHECK constraints
-- ------------------------------------------------------------
ALTER TABLE public.contact_activities
  DROP CONSTRAINT IF EXISTS contact_activities_type_check;
ALTER TABLE public.contact_activities
  ADD CONSTRAINT contact_activities_type_check
  CHECK (type IN ('call', 'enrollment', 'note', 'status_change', 'follow_up', 'sms'));

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('fmo_transfer', 'tms', 'manual', 'ghl_import', 'sms_inbound'));

-- ------------------------------------------------------------
-- Storage bucket for MMS media
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "message_media_tenant_read" ON storage.objects;
CREATE POLICY "message_media_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-media'
    AND public.is_current_tenant((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "message_media_service_role" ON storage.objects;
CREATE POLICY "message_media_service_role"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'message-media')
  WITH CHECK (bucket_id = 'message-media');

-- ------------------------------------------------------------
-- v_call_log: unified inbound + outbound call view.
-- security_invoker so RLS on the underlying tables applies.
-- The NOT EXISTS keeps inbound calls (which link a call_record)
-- from appearing twice.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_call_log;
CREATE VIEW public.v_call_log
WITH (security_invoker = true) AS
SELECT
  'cr-' || c.id::text AS log_id,
  c.id AS call_record_id,
  NULL::uuid AS inbound_call_id,
  c.tenant_id,
  COALESCE(c.call_start, c.created_at) AS occurred_at,
  COALESCE(NULLIF(lower(c.call_direction), ''), 'outbound') AS direction,
  c.contact_id,
  NULLIF(btrim(COALESCE(ct.first_name, '') || ' ' || COALESCE(ct.last_name, '')), '') AS contact_name,
  ct.phone AS contact_phone,
  c.call_duration_seconds AS duration_seconds,
  COALESCE(NULLIF(c.writing_agent, ''), c.agent_name) AS agent,
  CASE
    WHEN c.enrollment_completed THEN 'connected'
    WHEN lower(COALESCE(c.call_outcome, '')) IN ('enrolled', 'completed', 'connected') THEN 'connected'
    WHEN lower(COALESCE(c.call_outcome, '')) = '' THEN 'connected'
    ELSE lower(c.call_outcome)
  END AS disposition,
  c.recording_url,
  NULL::text AS recording_storage_path,
  s.overall_score AS compliance_score,
  left(c.transcript_raw, 200) AS transcript_preview,
  c.agent_notes
FROM public.call_records c
LEFT JOIN public.contacts ct ON ct.id = c.contact_id
LEFT JOIN public.compliance_scorecards s ON s.id = c.compliance_scorecard_id
WHERE c.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inbound_calls ic WHERE ic.call_record_id = c.id
  )

UNION ALL

SELECT
  'ic-' || ic.id::text AS log_id,
  ic.call_record_id,
  ic.id AS inbound_call_id,
  ic.tenant_id,
  ic.created_at AS occurred_at,
  'inbound' AS direction,
  ic.contact_id,
  NULLIF(btrim(COALESCE(ct.first_name, '') || ' ' || COALESCE(ct.last_name, '')), '') AS contact_name,
  COALESCE(ct.phone, ic.from_number) AS contact_phone,
  ic.duration_seconds,
  ic.routed_agent_id AS agent,
  CASE ic.status
    WHEN 'accepted' THEN 'connected'
    WHEN 'completed' THEN 'connected'
    WHEN 'voicemail' THEN 'voicemail'
    WHEN 'declined' THEN 'declined'
    ELSE 'missed'
  END AS disposition,
  ic.recording_url,
  ic.recording_storage_path,
  s.overall_score AS compliance_score,
  left(c.transcript_raw, 200) AS transcript_preview,
  c.agent_notes
FROM public.inbound_calls ic
LEFT JOIN public.contacts ct ON ct.id = ic.contact_id
LEFT JOIN public.call_records c ON c.id = ic.call_record_id
LEFT JOIN public.compliance_scorecards s ON s.id = c.compliance_scorecard_id;

GRANT SELECT ON public.v_call_log TO authenticated;
