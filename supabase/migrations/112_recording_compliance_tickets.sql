BEGIN;

-- Independent of five-minute in-app playback tickets. Bearer links may be
-- fetched repeatedly by an external compliance service until expiry.
CREATE TABLE public.recording_compliance_tickets (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recording_id text NOT NULL,
  minted_by text NOT NULL,
  format text NOT NULL CHECK (format IN ('wav','mp3')),
  storage_path text,
  account_sid text CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  recording_sid text CHECK (recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  expected_call_sid text CHECK (expected_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  channels smallint NOT NULL CHECK (channels IN (1,2)),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '24 hours'),
  CHECK (storage_path IS NULL OR
    (format = 'wav' AND split_part(storage_path,'/',1) = tenant_id::text)),
  CHECK (storage_path IS NOT NULL OR
    (account_sid IS NOT NULL AND recording_sid IS NOT NULL AND expected_call_sid IS NOT NULL))
);
CREATE INDEX recording_compliance_ticket_expiry ON public.recording_compliance_tickets(expires_at);
ALTER TABLE public.recording_compliance_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recording_compliance_tickets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recording_compliance_tickets TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
