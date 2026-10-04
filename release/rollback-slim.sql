-- Redeploy the b47e80d frontend/functions before removing its new feature RPCs.
-- Telephony can remain deployed: it has no dependency on these migrations.
-- SECTION 1: CMS database (primary if shared). Removes only the release-created
-- public reference table and its imported rows; the load SQL can recreate them.
BEGIN;
DO $$ BEGIN
  IF to_regclass('oct_slim_088_rollback.state') IS NULL THEN
    RAISE EXCEPTION 'Missing 088 rollback marker; refusing to drop an unverified table';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cms_county_penetration;
DROP SCHEMA oct_slim_088_rollback CASCADE;
COMMIT;

-- SECTION 2: primary database. Restore captured legacy policies and only the
-- automatic owner backfills whose owner has not subsequently been changed.
-- All task rows, new tasks, due dates, reasons and status changes are retained.
BEGIN;
DO $$ BEGIN
  IF to_regclass('oct_slim_086_rollback.state') IS NULL THEN
    RAISE EXCEPTION 'Missing 086 rollback snapshot; refusing an incomplete rollback';
  END IF;
END $$;
DROP POLICY IF EXISTS follow_ups_agent_access ON public.follow_ups;
DROP TRIGGER IF EXISTS follow_up_default_agent ON public.follow_ups;
DROP FUNCTION IF EXISTS public.save_follow_up(uuid,uuid,uuid,timestamptz,text,text);
DROP FUNCTION IF EXISTS public.follow_up_access(uuid,text);
DROP FUNCTION IF EXISTS public.follow_up_default_agent();
UPDATE public.follow_ups f SET agent_id=NULL FROM oct_slim_086_rollback.backfills b
  WHERE f.id=b.task_id AND f.agent_id=b.filled_agent_id;
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT * FROM oct_slim_086_rollback.policies LOOP EXECUTE p.definition; END LOOP;
END $$;
DROP SCHEMA oct_slim_086_rollback CASCADE;
NOTIFY pgrst,'reload schema';
COMMIT;
