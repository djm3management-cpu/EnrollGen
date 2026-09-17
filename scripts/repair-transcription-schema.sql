-- Run this entire file once in the Supabase SQL editor. Safe to rerun.
-- Combines migrations 040 and 037 in one transaction. No phone routing changes.
-- Compatibility between the original app schema and the live CRM schema.
-- Additive: preserves existing columns, rows, RLS policies and phone routing.
BEGIN;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS flow text,
  ADD COLUMN IF NOT EXISTS product_line text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_section smallint,
  ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE OR REPLACE FUNCTION public.sync_session_product_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.flow IS DISTINCT FROM OLD.flow THEN
      NEW.product_line := CASE lower(NEW.flow)
        WHEN 'ma' THEN 'MA' WHEN 'medsup' THEN 'MedSup'
        WHEN 'aca' THEN 'ACA' WHEN 'u65' THEN 'U65' ELSE NEW.flow END;
    ELSIF NEW.product_line IS DISTINCT FROM OLD.product_line THEN
      NEW.flow := CASE lower(NEW.product_line)
        WHEN 'ms' THEN 'medsup' WHEN 'medsup' THEN 'medsup'
        ELSE lower(NEW.product_line) END;
    END IF;
  END IF;
  NEW.flow := coalesce(NEW.flow, CASE lower(NEW.product_line)
    WHEN 'ms' THEN 'medsup' WHEN 'medsup' THEN 'medsup'
    ELSE lower(NEW.product_line) END);
  NEW.product_line := coalesce(NEW.product_line, CASE lower(NEW.flow)
    WHEN 'ma' THEN 'MA' WHEN 'medsup' THEN 'MedSup'
    WHEN 'aca' THEN 'ACA' WHEN 'u65' THEN 'U65' ELSE NEW.flow END);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sessions_sync_product_fields ON public.sessions;
CREATE TRIGGER sessions_sync_product_fields BEFORE INSERT OR UPDATE
  ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.sync_session_product_fields();

UPDATE public.sessions SET started_at = coalesce(started_at, created_at, now())
WHERE flow IS NULL OR product_line IS NULL OR started_at IS NULL;
ALTER TABLE public.sessions ALTER COLUMN started_at SET DEFAULT now();

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS clerk_user_id text,
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS theme_preference text,
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS preferences jsonb;

-- Let the trigger distinguish an omitted alias from an explicit value.
-- Both schema variants still get defaults via the trigger below.
ALTER TABLE public.user_preferences ALTER COLUMN theme_preference DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.sync_user_preference_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id THEN
      NEW.user_id := NEW.clerk_user_id;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      NEW.clerk_user_id := NEW.user_id;
    END IF;
    IF NEW.theme_preference IS DISTINCT FROM OLD.theme_preference THEN
      NEW.theme := NEW.theme_preference;
    ELSIF NEW.theme IS DISTINCT FROM OLD.theme THEN
      NEW.theme_preference := CASE WHEN NEW.theme = 'dark' THEN 'dark' ELSE 'light' END;
    END IF;
  ELSE
    IF NEW.theme_preference IS NOT NULL THEN NEW.theme := NEW.theme_preference; END IF;
  END IF;
  NEW.clerk_user_id := coalesce(NEW.clerk_user_id, NEW.user_id);
  NEW.user_id := coalesce(NEW.user_id, NEW.clerk_user_id);
  IF NEW.clerk_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Preference user identifiers must match';
  END IF;
  NEW.theme_preference := coalesce(NEW.theme_preference,
    CASE WHEN NEW.theme = 'dark' THEN 'dark' ELSE 'light' END);
  NEW.theme := coalesce(NEW.theme, NEW.theme_preference);
  NEW.preferences := coalesce(NEW.preferences, '{}'::jsonb);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_preferences_sync_fields ON public.user_preferences;
CREATE TRIGGER user_preferences_sync_fields BEFORE INSERT OR UPDATE
  ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.sync_user_preference_fields();

-- No-op assignment invokes the trigger, filling aliases without replacing preferences.
UPDATE public.user_preferences SET user_id = user_id
WHERE clerk_user_id IS NULL OR user_id IS NULL OR theme_preference IS NULL
  OR theme IS NULL OR preferences IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_clerk_user_id_compat
  ON public.user_preferences (clerk_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_compat
  ON public.user_preferences (user_id);

-- Ensure short phone/test calls have a durable log for dashboard activity.
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.enrolled_agents(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  billable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_call_id ON public.call_logs (call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_agent_started ON public.call_logs (agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_billable_started ON public.call_logs (billable, started_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'call_logs' AND policyname = 'call_logs_own') THEN
    CREATE POLICY "call_logs_own" ON public.call_logs FOR ALL
      USING (agent_id IN (SELECT id FROM public.enrolled_agents WHERE clerk_user_id = auth.jwt() ->> 'sub'))
      WITH CHECK (agent_id IN (SELECT id FROM public.enrolled_agents WHERE clerk_user_id = auth.jwt() ->> 'sub'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'call_logs' AND policyname = 'call_logs_principal_read') THEN
    CREATE POLICY "call_logs_principal_read" ON public.call_logs FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.enrolled_agents WHERE clerk_user_id = auth.jwt() ->> 'sub' AND role = 'principal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'call_logs' AND policyname = 'call_logs_principal_insert') THEN
    CREATE POLICY "call_logs_principal_insert" ON public.call_logs FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM public.enrolled_agents WHERE clerk_user_id = auth.jwt() ->> 'sub' AND role = 'principal'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
