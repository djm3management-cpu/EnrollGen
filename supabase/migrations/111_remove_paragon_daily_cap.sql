-- Unlimited daily volume. Existing routing, staffed hours, pause and billing
-- rate behavior are unchanged; NULL is the existing unlimited configuration.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.vendor_controls ALTER COLUMN paragon_daily_cap DROP DEFAULT;
UPDATE public.vendor_controls SET paragon_daily_cap=NULL,
 updated_at=clock_timestamp(),updated_by='migration-111-remove-paragon-daily-cap'
 WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND paragon_daily_cap IS NOT NULL;
COMMIT;
