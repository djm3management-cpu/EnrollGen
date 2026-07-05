-- ============================================================
-- USER PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
  clerk_user_id TEXT PRIMARY KEY,
  theme_preference TEXT NOT NULL DEFAULT 'light'
    CHECK (theme_preference IN ('light', 'dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS user_preferences_set_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_set_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_own" ON public.user_preferences;
CREATE POLICY "user_preferences_own"
  ON public.user_preferences FOR ALL TO authenticated
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_preferences_service_role" ON public.user_preferences;
CREATE POLICY "user_preferences_service_role"
  ON public.user_preferences FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
