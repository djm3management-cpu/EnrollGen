-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout='5s';

-- Source statement 3
ALTER TABLE public.vendor_controls ALTER COLUMN paragon_daily_cap DROP DEFAULT;

-- Source statement 5
COMMIT;
