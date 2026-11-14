-- Source statement 1
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

-- Source statement 2
DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;

-- Source statement 3
CREATE POLICY "tenants_update_own"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_current_tenant(id))
  WITH CHECK (public.is_current_tenant(id));
