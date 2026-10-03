# Recording durability: F49 / F10 / requested F16 inspection

Branch: `fix/recordings`. No script wording, routing, admission, Paragon,
contact attribution, call duration, or billing changes. No Twilio deletion.

## Operator rollout

1. Review the commit and full SQL in `supabase/migrations/064_recording_ingestion.sql`
   and `supabase/migrations/065_recording_storage_access.sql`.
2. Run **064 only** in Supabase SQL Editor. This adds service-only recording
   tables/functions/triggers/view and bootstraps protected telephony identities.
   It preserves `call_recordings_tenant_read` and all existing grants/policies.
   The old callback/code keeps working before the new code is deployed.
3. Approve merge/push. Deploy **both Netlify and Railway telephony** from that
   commit. Netlify alone cannot enable outbound recording or the durable callback.
4. Verify the following Netlify variables already used by the application:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Clerk backend verification settings,
   and **`TELEPHONY_BASE_URL` or `VITE_TELEPHONY_BASE_URL`**, pointing to the Railway
   public HTTPS origin. No new secret or credential rotation is required.
5. Railway keeps its existing Twilio/Clerk/Supabase credentials. Optional bounds:
   `RECORDING_MAX_BYTES` (default 268435456 / 256 MiB), `RECORDING_TIMEOUT_MS`
   (default 60000; maximum 120000). Check the project's Storage upload allowance
   if long calls exceed it; failed copies remain retriable and the Twilio download
   remains available. The byte limit applies to ingestion, not provider downloads.
6. Verify playback and downloads before applying 065. Then run **065 only**.
   It removes just `call_recordings_tenant_read`. Repeat playback/download checks.
   New code uses authorized service endpoints in either policy state.

## Five-minute verification on enrollgen.com

- **Minute 1:** CALLS → expand your own existing inbound call → full detail →
  **Recording**. PLAY, seek, and DOWNLOAD WAV. Open the downloaded file and check
  audio. Try DOWNLOAD TWILIO COPY as the independent retained-source path.
- **Minute 2:** Make a short authorized outbound test call, speak on both sides,
  end and save/wrap up. Refresh CALLS after the callback/worker (normally 15–30
  seconds once Twilio completes processing). Download its dual-channel WAV.
- **Minute 3:** Repeat with a short authorized inbound test call. Verify both
  speakers, duration, and the linked call's recording after saving wrap-up.
- **Minute 4:** CONTACTS → that contact → call detail → Recording. Verify the
  same recording. Also test an existing voicemail through the dialer player.
  Voicemail is mono; conversations use dual-channel recording from answer.
- **Minute 5:** CALLS → MISSING RECORDINGS. Inspect pending/failed/unlinked/absent
  states. As an ordinary agent, another agent's recording endpoint must deny
  access. A verified Clerk organization admin can retrieve agency recordings.
  Apply 065 only after these checks succeed, then repeat playback/download.

No live outbound/inbound call is made by the automated tests. Live call creation,
Twilio account retention/external-storage settings, and historical completeness
remain operator verification items. Supabase Storage is a convenience copy; it
is not included in database backups. Twilio must retain the provider copy.

## Pipeline and recovery

- Signed `/twilio/recording` callback validates Account/Call/Recording SID and
  whitelists metadata. `enqueue_recording` commits the durable ledger before
  204. Database failure returns 503; no acknowledged background download.
- Signed attempt-ID callback attribution uses service-written call attempts.
  Unknown callbacks remain quarantined until authoritative attribution exists.
  Mutable CRM tenant/owner/URL fields cannot authorize recording access.
- Two leased ingestion jobs run per worker tick (15 seconds). Download uses a
  temporary file, total timeout, content/stream byte bounds, WAV/channel checks
  and SHA-256. The installed SDK upload transport has an actual abort deadline.
- Download/upload/transient failures back off from 5 seconds to one hour without
  deleting provider audio. Oversized, invalid WAV, channel mismatch, or wrong
  account copies fail visibly; authorized users can retry. Completed copies use
  `call-recordings/{tenant_id}/{parent_call_sid}/{RecordingSid}.wav`. Replays
  overwrite only the same immutable recording identity, never another part.
- Lease tokens fence completion/retry writes. An expired lease can be reclaimed;
  a stale worker cannot replace the newer worker's ledger state.
- Recording-only triggers copy URL and Storage path on callback-before/after-link,
  including the existing link/repair RPC. Periodic link reconciliation recovers
  races. No recording callback writes call/billing duration.
- A separate leased check queue polls Twilio metadata for ended known calls,
  including recordings whose callback never arrived. Pagination persists a token;
  found recordings are rechecked daily for additional parts, missing results use
  backoff. Unknown or provider-absent audio is not reported as successfully saved.
- `calls_missing_recordings` lists expected answered calls and voicemail with
  no callback, absent audio, pending/failed copies, or missing conversation links.
  Legacy Storage references are recognized. The authenticated endpoint filters
  the list by verified subject/organization; its view has no browser grants.

## Authorized playback/download

`GET /.netlify/functions/recordings?call_record_id=UUID` (or `inbound_call_id`)
lists all recording parts and statuses. `GET ...?missing=1&offset=0` lists issues.
POST `{action:"media",call_record_id,recording_id,download:true}` returns a
five-minute private Storage URL or opaque Railway download capability. Optional
`source:"twilio"` bypasses Storage. POST `action:"retry"` requeues failed copies.
No caller-supplied provider URL, tenant, agent, bucket, or path is accepted.

Ownership comes from protected sessions and the service-only
`recording_agent_subjects` snapshot, checked against service-owned call attempts.
064 covers Dylan, Mark and Mike (each has one active enrolled subject in the
SELECT-only preflight). Inactive Miguel is excluded. Provision new agent mappings
through the service/admin provisioning path; changing mutable CRM roster fields
alone does not grant recording access. Unassigned voicemail is available to
active protected members of its verified agency; conversations require subject
attribution. Organization-wide access requires the signed Clerk admin role.

Twilio capabilities are random 256-bit tokens; only SHA-256 hashes/expiry are
stored. Railway verifies expiry/account and fetches provider metadata to verify
RecordingSid → authorized CallSid before streaming. Native byte ranges work.
Basic credentials remain server-side; approved HTTPS media redirects strip
credentials off the Twilio API origin. Provider downloads use the original
channel count. Streaming has a 30-second idle deadline and two-hour transfer
ceiling. Expired capability rows are housekeeping, not audio deletion.

PLAY automatically falls back from failed Storage playback to the retained
Twilio source in the detail panel. DOWNLOAD TWILIO COPY is always explicit when
provider identity exists, including when restored Storage metadata signs a URL
whose underlying file is missing. Multiple recording parts are listed separately.

## SELECT-only verification

```sql
SELECT id, direction, provider_status, copy_status, attempts, last_error_code,
       recording_channels, recording_duration_seconds, stored_bytes,
       call_record_id, storage_path
FROM public.recording_ingestion
ORDER BY first_seen_at DESC LIMIT 30;

SELECT * FROM public.calls_missing_recordings
ORDER BY occurred_at DESC LIMIT 30;

SELECT tenant_id, agent_slug, clerk_user_id
FROM public.recording_agent_subjects ORDER BY agent_slug;

-- After 065 this must return zero rows.
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname='call_recordings_tenant_read';

-- Browser roles must have no ledger/ticket/check/scope table privileges.
SELECT r.role_name, t.table_name, privilege
FROM (VALUES ('anon'),('authenticated')) r(role_name)
CROSS JOIN (VALUES ('recording_ingestion'),('recording_download_tickets'),
  ('recording_reconciliation'),('recording_agent_subjects'),
  ('recording_call_scopes')) t(table_name)
CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
  'REFERENCES','TRIGGER']) p(privilege)
WHERE has_table_privilege(r.role_name,'public.'||t.table_name,privilege);
```

## Scope and consent

No script or consent automation changes. Existing recorded-line wording remains.
MA inbound introduces the recorded line in its first greeting; MA outbound's
name-confirmation prompt precedes the recorded-line introduction. Full permission
wording remains in the existing script positions. This batch does not implement
refusal/stop-recording controls or certify broader F16 compliance.

Twilio deletion was not found in the repository and is never added here.
Account-wide retention, PCI/external-storage configuration, and complete Twilio
inventory could not be verified: Railway API returned HTTP 403 and the browser
connection detached. Do not interpret successful ingestion tests as proof that
historical provider media still exists.

## Automated validation

- Root suite: **168/168 passed**, including 24 recording-specific PostgreSQL,
  authorization, queue/copy/retry, legacy-link and reconciliation tests.
- Telephony suite: **153/153 passed**, including real localhost HTTP WAV
  download/playback/Range, provider CallSid checks, timeout transport, and actual
  inbound/outbound TwiML recording assertions. Existing routing/Paragon tests pass.
- Production Vite build, LLM typecheck, Netlify recording-function esbuild bundle,
  and `git diff --check` pass.
- Full lint still fails on **45 existing errors, zero warnings, zero new
  diagnostics**. Same baseline had 47; removing the old callback removes two
  existing undefined-Buffer findings.
- 064 executes in disposable PostgreSQL over the recording schema fixture.
  Browser/outsider table and RPC privileges are denied; service role works.
  065 is tested afterward: direct authenticated Storage reads disappear while
  the authorized service endpoint still plays/downloads.
- No production migration, deploy, live call, credential rotation, or audio
  deletion was performed. Original dirty/untracked files were excluded.

## Files in this batch

- `docs/recordings-rollout.md`
- `netlify/functions/_recordingAccess.js`
- `netlify/functions/recordings.js`
- `src/components/callDetail/CallDetailPanel.jsx`
- `src/components/callDetail/RecordingPanel.jsx`
- `src/components/callLog/CallLogTab.jsx`
- `src/components/callLog/MissingRecordings.jsx`
- `src/components/contacts/MessagesThread.jsx`
- `src/components/phone/DialerPanel.jsx`
- `src/lib/recordingsApi.js`
- `supabase/migrations/064_recording_ingestion.sql`
- `supabase/migrations/065_recording_storage_access.sql`
- `telephony/README.md`
- `telephony/src/config.js`
- `telephony/src/recordingMedia.js`
- `telephony/src/recordings.js`
- `telephony/src/routes/recordingMedia.js`
- `telephony/src/routes/twilioStatus.js`
- `telephony/src/routes/twilioVoice.js`
- `telephony/src/routes/voiceOutbound.js`
- `telephony/src/server.js`
- `telephony/src/supabase.js`
- `telephony/tests/attributionRoutes.test.js`
- `telephony/tests/recordingMedia.test.js`
- `telephony/tests/recordingTransport.test.js`
- `tests/fixtures/recordings-schema.sql`
- `tests/helpers/evidenceDb.js`
- `tests/helpers/recordingWav.js`
- `tests/recordings.test.js`
