-- v_call_log is the canonical call activity read model. Remove only the
-- temporary compatibility view; preserve any real call_logs table used by
-- the call timer and its existing migrations.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.call_logs')
      AND relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.call_logs';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
