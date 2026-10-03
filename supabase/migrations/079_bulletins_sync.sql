BEGIN;

-- Block concurrent writers between duplicate selection and constraint creation.
LOCK TABLE public.bulletins IN SHARE ROW EXCLUSIVE MODE;

-- Keep the newest version of each non-null source key; preserve every removed
-- row in a service-role-only archive before deleting it from the live table.
CREATE TABLE IF NOT EXISTS public.bulletins_duplicate_archive (
  bulletin_id bigint PRIMARY KEY,
  row_data jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bulletins_duplicate_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bulletins_duplicate_archive FROM anon, authenticated;
GRANT ALL ON public.bulletins_duplicate_archive TO service_role;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY source_id
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  ) AS position
  FROM public.bulletins
  WHERE source_id IS NOT NULL
), archived AS (
  INSERT INTO public.bulletins_duplicate_archive (bulletin_id, row_data)
  SELECT b.id, to_jsonb(b)
  FROM public.bulletins b JOIN ranked r ON r.id = b.id
  WHERE r.position > 1
  ON CONFLICT (bulletin_id) DO UPDATE SET row_data = EXCLUDED.row_data
  RETURNING bulletin_id
)
DELETE FROM public.bulletins b USING archived a WHERE b.id = a.bulletin_id;

ALTER TABLE public.bulletins
  ADD CONSTRAINT bulletins_source_id_unique UNIQUE (source_id);

CREATE TABLE public.bulletin_feed_status (
  feed_id text PRIMARY KEY,
  label text NOT NULL,
  carrier text NOT NULL,
  url text NOT NULL,
  checked_at timestamptz NOT NULL,
  last_success_at timestamptz,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  error text,
  upserted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0
);
ALTER TABLE public.bulletin_feed_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY bulletin_feed_status_read ON public.bulletin_feed_status
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.bulletin_feed_status TO anon, authenticated;
GRANT ALL ON public.bulletin_feed_status TO service_role;

COMMIT;
