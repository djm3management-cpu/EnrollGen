-- Durable connection grace for Media Streams, which support create/stop but
-- have no list/fetch REST operation. No provider-side enumeration is needed.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.call_participants ADD COLUMN stream_requested_at timestamptz;
COMMIT;
