-- ============================================================
-- AGENT AVAILABILITY ROSTER UPDATE
-- The agent_availability table exists only in the remote project
-- (no local migration defines it). Verified schema:
--   id uuid, agent_id text, agent_name text, available boolean,
--   status text, toggled_at timestamptz, updated_at timestamptz
-- Changes:
--   1. Ensure mark_endres exists (no-op if present).
--   2. Add dylan_maria (missing from seed data).
--   3. Remove miguel_mejia (agent departed).
-- All statements are guarded so the file is safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.agent_availability') IS NULL THEN
    RAISE EXCEPTION 'agent_availability table not found; run this in the project that hosts the availability edge functions';
  END IF;

  -- Ensure mark_endres exists
  IF NOT EXISTS (SELECT 1 FROM public.agent_availability WHERE agent_id = 'mark_endres') THEN
    INSERT INTO public.agent_availability (agent_id, agent_name, available, status, toggled_at)
    VALUES ('mark_endres', 'Mark Endres', false, 'offline', now());
  END IF;

  -- Add dylan_maria
  IF NOT EXISTS (SELECT 1 FROM public.agent_availability WHERE agent_id = 'dylan_maria') THEN
    INSERT INTO public.agent_availability (agent_id, agent_name, available, status, toggled_at)
    VALUES ('dylan_maria', 'Dylan Maria', false, 'offline', now());
  END IF;

  -- Remove miguel_mejia: set offline first so any cached UI state
  -- reconciles cleanly, then delete the row.
  UPDATE public.agent_availability
  SET available = false, status = 'offline', toggled_at = now()
  WHERE agent_id = 'miguel_mejia';

  DELETE FROM public.agent_availability
  WHERE agent_id = 'miguel_mejia';
END $$;

-- Deactivate Miguel Mejia in the tenant_agents roster as well.
UPDATE public.tenant_agents
SET is_active = false
WHERE name = 'Miguel Mejia';
