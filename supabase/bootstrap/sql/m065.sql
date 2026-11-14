-- Source statement 1
BEGIN;

-- Source statement 2
DROP POLICY IF EXISTS call_recordings_tenant_read ON storage.objects;

-- Source statement 3
COMMIT;
