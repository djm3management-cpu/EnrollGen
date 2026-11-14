-- Source statement 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Source statement 2
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

-- Source statement 3
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,

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
  assigned_agent_id TEXT,

  do_not_call BOOLEAN NOT NULL DEFAULT false,
  ghl_contact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 4
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_phone
  ON public.contacts (tenant_id, phone)
  WHERE phone IS NOT NULL;

-- Source statement 5
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON public.contacts (tenant_id);

-- Source statement 6
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_status ON public.contacts (tenant_id, status);

-- Source statement 7
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON public.contacts (tenant_id, last_name, first_name);

-- Source statement 8
DROP TRIGGER IF EXISTS contacts_set_updated_at ON public.contacts;

-- Source statement 9
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 10
CREATE TABLE IF NOT EXISTS public.contact_lead_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  lead_score NUMERIC,
  churn_risk TEXT,
  vendor_source TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 11
CREATE INDEX IF NOT EXISTS idx_contact_lead_intel_contact
  ON public.contact_lead_intel (contact_id, received_at DESC);

-- Source statement 12
CREATE INDEX IF NOT EXISTS idx_contact_lead_intel_tenant
  ON public.contact_lead_intel (tenant_id);

-- Source statement 13
DROP TRIGGER IF EXISTS contact_lead_intel_set_updated_at ON public.contact_lead_intel;

-- Source statement 14
CREATE TRIGGER contact_lead_intel_set_updated_at
  BEFORE UPDATE ON public.contact_lead_intel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 15
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id TEXT,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 16
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact
  ON public.contact_notes (contact_id, pinned DESC, created_at DESC);

-- Source statement 17
CREATE INDEX IF NOT EXISTS idx_contact_notes_tenant
  ON public.contact_notes (tenant_id);

-- Source statement 18
DROP TRIGGER IF EXISTS contact_notes_set_updated_at ON public.contact_notes;

-- Source statement 19
CREATE TRIGGER contact_notes_set_updated_at
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 20
CREATE TABLE IF NOT EXISTS public.contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'enrollment', 'note', 'status_change', 'follow_up')),
  ref_id UUID,
  summary TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 21
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact
  ON public.contact_activities (contact_id, occurred_at DESC);

-- Source statement 22
CREATE INDEX IF NOT EXISTS idx_contact_activities_tenant
  ON public.contact_activities (tenant_id);

-- Source statement 23
DROP TRIGGER IF EXISTS contact_activities_set_updated_at ON public.contact_activities;

-- Source statement 24
CREATE TRIGGER contact_activities_set_updated_at
  BEFORE UPDATE ON public.contact_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 25
CREATE TABLE IF NOT EXISTS public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
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

-- Source statement 26
CREATE INDEX IF NOT EXISTS idx_policies_contact ON public.policies (contact_id);

-- Source statement 27
CREATE INDEX IF NOT EXISTS idx_policies_tenant ON public.policies (tenant_id, status);

-- Source statement 28
DROP TRIGGER IF EXISTS policies_set_updated_at ON public.policies;

-- Source statement 29
CREATE TRIGGER policies_set_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 30
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
    DEFAULT NULL::uuid,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id TEXT,
  due_at TIMESTAMPTZ,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 31
CREATE INDEX IF NOT EXISTS idx_follow_ups_contact ON public.follow_ups (contact_id);

-- Source statement 32
CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant_due ON public.follow_ups (tenant_id, status, due_at);

-- Source statement 33
DROP TRIGGER IF EXISTS follow_ups_set_updated_at ON public.follow_ups;

-- Source statement 34
CREATE TRIGGER follow_ups_set_updated_at
  BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 35
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

-- Source statement 36
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Source statement 37
ALTER TABLE public.contact_lead_intel ENABLE ROW LEVEL SECURITY;

-- Source statement 38
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

-- Source statement 39
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

-- Source statement 40
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Source statement 41
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

-- Source statement 42
DROP POLICY IF EXISTS "contacts_tenant_access" ON public.contacts;

-- Source statement 43
CREATE POLICY "contacts_tenant_access"
  ON public.contacts FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 44
DROP POLICY IF EXISTS "contacts_service_role" ON public.contacts;

-- Source statement 45
CREATE POLICY "contacts_service_role"
  ON public.contacts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 46
DROP POLICY IF EXISTS "contact_lead_intel_tenant_access" ON public.contact_lead_intel;

-- Source statement 47
CREATE POLICY "contact_lead_intel_tenant_access"
  ON public.contact_lead_intel FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 48
DROP POLICY IF EXISTS "contact_lead_intel_service_role" ON public.contact_lead_intel;

-- Source statement 49
CREATE POLICY "contact_lead_intel_service_role"
  ON public.contact_lead_intel FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 50
DROP POLICY IF EXISTS "contact_notes_tenant_access" ON public.contact_notes;

-- Source statement 51
CREATE POLICY "contact_notes_tenant_access"
  ON public.contact_notes FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 52
DROP POLICY IF EXISTS "contact_notes_service_role" ON public.contact_notes;

-- Source statement 53
CREATE POLICY "contact_notes_service_role"
  ON public.contact_notes FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 54
DROP POLICY IF EXISTS "contact_activities_tenant_access" ON public.contact_activities;

-- Source statement 55
CREATE POLICY "contact_activities_tenant_access"
  ON public.contact_activities FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 56
DROP POLICY IF EXISTS "contact_activities_service_role" ON public.contact_activities;

-- Source statement 57
CREATE POLICY "contact_activities_service_role"
  ON public.contact_activities FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 58
DROP POLICY IF EXISTS "policies_tenant_access" ON public.policies;

-- Source statement 59
CREATE POLICY "policies_tenant_access"
  ON public.policies FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 60
DROP POLICY IF EXISTS "policies_service_role" ON public.policies;

-- Source statement 61
CREATE POLICY "policies_service_role"
  ON public.policies FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 62
DROP POLICY IF EXISTS "follow_ups_tenant_access" ON public.follow_ups;

-- Source statement 63
CREATE POLICY "follow_ups_tenant_access"
  ON public.follow_ups FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 64
DROP POLICY IF EXISTS "follow_ups_service_role" ON public.follow_ups;

-- Source statement 65
CREATE POLICY "follow_ups_service_role"
  ON public.follow_ups FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
