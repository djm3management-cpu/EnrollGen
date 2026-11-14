-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS flow text,
  ADD COLUMN IF NOT EXISTS product_line text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_section smallint,
  ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- Source statement 3
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

-- Source statement 4
DROP TRIGGER IF EXISTS sessions_sync_product_fields ON public.sessions;

-- Source statement 5
CREATE TRIGGER sessions_sync_product_fields BEFORE INSERT OR UPDATE
  ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.sync_session_product_fields();

-- Source statement 6
UPDATE public.sessions SET started_at = coalesce(started_at, created_at, now())
WHERE flow IS NULL OR product_line IS NULL OR started_at IS NULL;

-- Source statement 7
ALTER TABLE public.sessions ALTER COLUMN started_at SET DEFAULT now();

-- Source statement 8
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS clerk_user_id text,
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS theme_preference text,
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS preferences jsonb;

-- Source statement 9
ALTER TABLE public.user_preferences ALTER COLUMN theme_preference DROP DEFAULT;

-- Source statement 10
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

-- Source statement 11
DROP TRIGGER IF EXISTS user_preferences_sync_fields ON public.user_preferences;

-- Source statement 12
CREATE TRIGGER user_preferences_sync_fields BEFORE INSERT OR UPDATE
  ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.sync_user_preference_fields();

-- Source statement 13
UPDATE public.user_preferences SET user_id = user_id
WHERE clerk_user_id IS NULL OR user_id IS NULL OR theme_preference IS NULL
  OR theme IS NULL OR preferences IS NULL;

-- Source statement 14
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_clerk_user_id_compat
  ON public.user_preferences (clerk_user_id);

-- Source statement 15
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_compat
  ON public.user_preferences (user_id);

-- Source statement 16
NOTIFY pgrst, 'reload schema';

-- Source statement 17
COMMIT;
