-- Source statement 1
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

-- Source statement 2
NOTIFY pgrst, 'reload schema';
