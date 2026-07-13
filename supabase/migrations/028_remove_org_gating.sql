-- ============================================================
-- Remove Clerk-organization gating (temporary single-tenant mode).
-- is_current_tenant() previously required the signed-in user's Clerk
-- org_id claim to match a tenant's clerk_org_id, falling back to a
-- hardcoded default tenant only when org_id was completely absent.
-- New agents (e.g. Dylan) who were never added to the Clerk
-- Organization tied to the NGHS tenant matched nothing, and got
-- routed into the app's "create your own agency" onboarding flow
-- instead of into the existing NGHS workspace.
--
-- This is used by every tenant-scoped RLS policy in the app (via
-- USING (public.is_current_tenant(tenant_id))), so it's the single
-- place to fix. Per current direction: EnrollGen is single-tenant in
-- practice (NGHS only, agents Mark/Dylan/Mike) — so this drops the
-- org check entirely. Any authenticated user matches any tenant row
-- that exists. Revisit if/when multi-tenant org isolation is needed
-- again.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_current_tenant(check_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = check_tenant_id
  );
$$;

-- Second, independent org-gate found on the tenant-settings UPDATE
-- policy (migration 010) — didn't route through is_current_tenant(),
-- so the fix above alone wouldn't have covered it. Only affects
-- writes to the Tenant Settings page, not sign-in, but same fix
-- applies: drop the org_id match requirement.
DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;
CREATE POLICY "tenants_update_own"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_current_tenant(id))
  WITH CHECK (public.is_current_tenant(id));
