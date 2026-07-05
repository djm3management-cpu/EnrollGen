-- ============================================================
-- CRM CONTACTS FOUNDATION
-- First-class customer entity. Every call, transcript, scorecard,
-- enrollment, note, and follow-up attaches to a contact instead of
-- dying with the session.
-- All tables are tenant-scoped with RLS matching migration 007.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Phone normalization helper. Server code normalizes to E.164
-- before writing; this function backs the matching rule
-- (tenant + normalized phone) for SQL-side callers.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    WHEN regexp_replace(raw, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      THEN '+' || regexp_replace(raw, '[^0-9]', '', 'g')
    WHEN regexp_replace(raw, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
      THEN '+1' || regexp_replace(raw, '[^0-9]', '', 'g')
    WHEN btrim(raw) ~ '^\+[0-9]{8,15}$'
      THEN btrim(raw)
    ELSE NULL
  END;
$$;

-- ------------------------------------------------------------
-- contacts
-- MBI strategy: store last 4 only (mbi_last4). The full MBI keeps
-- living on call_records.customer_mbi via the service-role write
-- path; contacts avoid a new PHI-at-rest surface.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  first_name TEXT,
  last_name TEXT,
  phone TEXT, -- E.164, normalized by writers via normalize_phone_e164
  email TEXT,
  dob DATE,
  zip TEXT,
  county TEXT,
  state TEXT,
  mbi_last4 TEXT CHECK (mbi_last4 IS NULL OR length(mbi_last4) = 4),
  medicare_parts TEXT CHECK (medicare_parts IN ('none', 'a', 'b', 'ab')),
  current_carrier TEXT,
  current_plan TEXT,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'client', 'former')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('fmo_transfer', 'tms', 'manual', 'ghl_import')),
  assigned_agent_id TEXT, -- availability agent_id convention, e.g. mark_endres
  do_not_call BOOLEAN NOT NULL DEFAULT false,
  ghl_contact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_phone
  ON public.contacts (tenant_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON public.contacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_status ON public.contacts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON public.contacts (tenant_id, last_name, first_name);

DROP TRIGGER IF EXISTS contacts_set_updated_at ON public.contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- contact_lead_intel: raw FMO scoring payloads. payload jsonb keeps
-- every field the vendor sends so nothing is lost when they add more.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_lead_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  lead_score NUMERIC,
  churn_risk TEXT,
  vendor_source TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_lead_intel_contact
  ON public.contact_lead_intel (contact_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_lead_intel_tenant
  ON public.contact_lead_intel (tenant_id);

DROP TRIGGER IF EXISTS contact_lead_intel_set_updated_at ON public.contact_lead_intel;
CREATE TRIGGER contact_lead_intel_set_updated_at
  BEFORE UPDATE ON public.contact_lead_intel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- contact_notes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id TEXT,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact
  ON public.contact_notes (contact_id, pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_notes_tenant
  ON public.contact_notes (tenant_id);

DROP TRIGGER IF EXISTS contact_notes_set_updated_at ON public.contact_notes;
CREATE TRIGGER contact_notes_set_updated_at
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- contact_activities: the timeline feed. ref_id points at the row
-- named by type (call_records id, policies id, contact_notes id, etc).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'enrollment', 'note', 'status_change', 'follow_up')),
  ref_id UUID,
  summary TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_activities_contact
  ON public.contact_activities (contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_tenant
  ON public.contact_activities (tenant_id);

DROP TRIGGER IF EXISTS contact_activities_set_updated_at ON public.contact_activities;
CREATE TRIGGER contact_activities_set_updated_at
  BEFORE UPDATE ON public.contact_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- policies: written business per contact
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  carrier TEXT,
  plan_name TEXT,
  plan_id TEXT,
  product_line TEXT CHECK (product_line IN ('MA', 'MS', 'ACA', 'U65', 'ANC')),
  effective_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'lapsed', 'cancelled')),
  writing_agent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policies_contact ON public.policies (contact_id);
CREATE INDEX IF NOT EXISTS idx_policies_tenant ON public.policies (tenant_id, status);

DROP TRIGGER IF EXISTS policies_set_updated_at ON public.policies;
CREATE TRIGGER policies_set_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- follow_ups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id TEXT,
  due_at TIMESTAMPTZ,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_contact ON public.follow_ups (contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant_due ON public.follow_ups (tenant_id, status, due_at);

DROP TRIGGER IF EXISTS follow_ups_set_updated_at ON public.follow_ups;
CREATE TRIGGER follow_ups_set_updated_at
  BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Link existing call records and sessions to contacts
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.call_records
      ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id);
    CREATE INDEX IF NOT EXISTS idx_call_records_contact ON public.call_records (contact_id);
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    ALTER TABLE public.sessions
      ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id);
    CREATE INDEX IF NOT EXISTS idx_sessions_contact ON public.sessions (contact_id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- RLS: tenant access for authenticated, full access for service_role
-- (pattern from 007_multi_tenant_foundation.sql)
-- ------------------------------------------------------------
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_lead_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_tenant_access" ON public.contacts;
CREATE POLICY "contacts_tenant_access"
  ON public.contacts FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "contacts_service_role" ON public.contacts;
CREATE POLICY "contacts_service_role"
  ON public.contacts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_lead_intel_tenant_access" ON public.contact_lead_intel;
CREATE POLICY "contact_lead_intel_tenant_access"
  ON public.contact_lead_intel FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "contact_lead_intel_service_role" ON public.contact_lead_intel;
CREATE POLICY "contact_lead_intel_service_role"
  ON public.contact_lead_intel FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_notes_tenant_access" ON public.contact_notes;
CREATE POLICY "contact_notes_tenant_access"
  ON public.contact_notes FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "contact_notes_service_role" ON public.contact_notes;
CREATE POLICY "contact_notes_service_role"
  ON public.contact_notes FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_activities_tenant_access" ON public.contact_activities;
CREATE POLICY "contact_activities_tenant_access"
  ON public.contact_activities FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "contact_activities_service_role" ON public.contact_activities;
CREATE POLICY "contact_activities_service_role"
  ON public.contact_activities FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "policies_tenant_access" ON public.policies;
CREATE POLICY "policies_tenant_access"
  ON public.policies FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "policies_service_role" ON public.policies;
CREATE POLICY "policies_service_role"
  ON public.policies FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "follow_ups_tenant_access" ON public.follow_ups;
CREATE POLICY "follow_ups_tenant_access"
  ON public.follow_ups FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "follow_ups_service_role" ON public.follow_ups;
CREATE POLICY "follow_ups_service_role"
  ON public.follow_ups FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
