-- Source statement 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Source statement 2
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Source statement 3
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    ALTER TABLE public.tenants
      ADD COLUMN IF NOT EXISTS ghl_webhook_url TEXT,
      ADD COLUMN IF NOT EXISTS ghl_location_id TEXT,
      ADD COLUMN IF NOT EXISTS coop_rates JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS carrier_options JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS agency_display_name TEXT,
      ADD COLUMN IF NOT EXISTS agency_npn TEXT,
      ADD COLUMN IF NOT EXISTS licensed_states JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS compliance_config JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

    ALTER TABLE public.tenants
      ALTER COLUMN coop_rates SET DEFAULT '{}'::jsonb,
      ALTER COLUMN carrier_options SET DEFAULT '[]'::jsonb,
      ALTER COLUMN licensed_states SET DEFAULT '[]'::jsonb,
      ALTER COLUMN compliance_config SET DEFAULT '{}'::jsonb,
      ALTER COLUMN updated_at SET DEFAULT now();

    DROP TRIGGER IF EXISTS tenants_set_updated_at ON public.tenants;
    CREATE TRIGGER tenants_set_updated_at
      BEFORE UPDATE ON public.tenants
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Source statement 4
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_clerk_org_id_unique
  ON public.tenants(clerk_org_id)
  WHERE clerk_org_id IS NOT NULL;

-- Source statement 5
DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;

-- Source statement 6
CREATE POLICY "tenants_update_own"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_current_tenant(id))
  WITH CHECK (
    clerk_org_id = NULLIF(auth.jwt() ->> 'org_id', '')

  );
