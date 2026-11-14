-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout='5s';

-- Source statement 3
ALTER TABLE public.call_participants ADD COLUMN stream_requested_at timestamptz;

-- Source statement 4
COMMIT;
