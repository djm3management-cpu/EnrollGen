-- ============================================================
-- Add the missing tenant_agents row for Mike Shiomos.
-- Migration 023 tried to flag this account as admin but only ever
-- ran an UPDATE (matching by clerk_user_id) — with no row to match,
-- it was a silent no-op. That also meant agent_slug never existed
-- for this account, so decrypt_pii()/update_pii_field()/
-- search_contacts_secure() had no tenant_agents.id to resolve,
-- and PII reveal/edit failed for this user specifically.
-- ============================================================

INSERT INTO public.tenant_agents (tenant_id, name, clerk_user_id, agent_slug, role, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Mike Shiomos',
  'user_3GFfUFxZKbXCJvdE5uu8ZqU2tB6',
  'mike_shiomos',
  'admin',
  true
)
ON CONFLICT (tenant_id, name) DO UPDATE
SET clerk_user_id = EXCLUDED.clerk_user_id,
  agent_slug = EXCLUDED.agent_slug,
  role = EXCLUDED.role,
  is_active = true;
