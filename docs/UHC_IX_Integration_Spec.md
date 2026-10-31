# EnrollGen: UHC IntelligenceX Call Recording Integration

## Goal
Automatically upload every UHC Medicare Advantage enrollment call recording from EnrollGen to UHC's IntelligenceX (IX) instance, daily at minimum. SMS internal deadline: Nov 15, 2026. UHC hard deadline: Dec 1, 2026.

## Integration type
NGHS is **Type A** (UHC enrollments submitted through SunFire Blaze). The only required metadata per recording is the **SunFire Enrollment Confirmation Code** (also labeled External App ID / ExternalEnrollmentId in IX docs). IX pulls all other enrollment metadata itself.

A recording with a missing or wrong code is an **automatic failed audit** if not fixed within 48 hours of being selected for audit.

## Delivery method
Customer Post API (pre-signed S3), run from the existing integrations-worker Railway service.

1. Call IX API with enrollment metadata (confirmation code).
2. IX returns a pre-signed S3 URL.
3. Stream the recording from Twilio to that URL.
4. Record IX's receipt confirmation.

Spec: https://app.compliancex.ai/docs/sunfire-api (requires IX login; credentials and sandbox come from SunFire after kickoff). Exact endpoints, auth, payload schema, and accepted audio formats are TBD until then. Build everything else now and stub the client.

## Build

### 1. Capture the confirmation code
1. When an agent dispositions a call Enrolled or Enrolled Pending Verification with carrier = UHC, require a field: SunFire Confirmation Code.
2. Validate format once the format is known; for now, required, trimmed, non-empty.
3. Allow multiple codes per call (household enrollments on one call each get their own upload of the same recording).
4. Allow the code to be added or edited after disposition.

### 2. Data model (new migration)
Table `ix_uploads`:
1. id, call_id (FK), twilio_recording_sid, confirmation_code
2. status: pending, uploading, uploaded, failed, missing_code
3. attempts, last_error, ix_receipt_id, uploaded_at, created_at, updated_at
4. Unique on (call_id, confirmation_code)

### 3. Worker job
1. Trigger on UHC enrollment disposition with code present, plus a scheduled sweep every 15 minutes for pending/failed rows.
2. Retry with exponential backoff, max 5 attempts, then flag failed.
3. Idempotent: never upload the same (recording, code) pair twice after a successful receipt.
4. Kill switch env var: `IX_UPLOAD_ENABLED`.
5. Separate `IX_ENV` for sandbox vs production base URL and credentials.

### 4. Recording source
1. Pull audio from Twilio by recording SID; stream directly to S3 URL, no persisting to disk.
2. Do not delete from Twilio until the separate recordings storage project is done.
3. Confirm full call audio (both channels) is what gets sent; format conversion only if IX requires it.

### 5. Missing-code queue
1. Any UHC-enrolled call older than 2 hours without a code shows in an admin queue in the CRM Calls view.
2. Daily summary to Mike: uploaded count, failed count, missing codes.

### 6. Reconciliation
Daily count of UHC enrollments vs successful IX uploads; mismatch surfaces in the same admin view. Needed for SunFire's production validation (call count must match expected volume over 3 to 5 days).

## Testing (SunFire checklist)
1. Single test call in sandbox: audio received, code mapped, processing succeeds.
2. Batch test in sandbox; get SunFire staging sign-off.
3. Production: one day of live calls, verify counts and no errors.
4. 3 to 5 days consistent delivery, then SunFire and UHC production sign-off.

## Contacts
SunFire integration leads: Miles Bloomenkranz (miles.bloomenkranz@sunfireinc.com), Kevin Jerger (kevin.jerger@sunfireinc.com). Implementation lead: Max Latkovski (max.latkovski@sunfireinc.com).
