-- Run ONLY after authorized playback/download is verified on both Netlify
-- and Railway. The new code uses the service key with or without this policy.
BEGIN;
DROP POLICY IF EXISTS call_recordings_tenant_read ON storage.objects;
COMMIT;
