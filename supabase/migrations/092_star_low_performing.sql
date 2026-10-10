BEGIN;
ALTER TABLE public.star_ratings_by_county
  ADD COLUMN IF NOT EXISTS low_performing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_performing_reason text;
COMMENT ON COLUMN public.star_ratings_by_county.low_performing IS
  'CMS Low Performing Contracts designation; never inferred from a single annual Overall rating.';
COMMIT;
