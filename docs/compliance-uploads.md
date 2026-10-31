# Compliance uploads

Conversely sampling and schedules are documented in
[conversely-uploads.md](conversely-uploads.md). IX queues every completed UHC MA
enrollment intake on an enrolled/pending-verification call, including separate
household enrollment codes. It does not sample by agent or compliance score.
Call routing and stylesheets are unchanged.

Apply migrations through **128_sunfire_ix_api.sql** before starting the updated
integrations worker and Netlify functions. Migration 128 adds durable SunFire
registration/upload state, terminal statuses, token-checked finishes, corrected-code
requeueing, and updates remediation/reconciliation. Intakes without recordings
queue immediately and wait for a completed recording before consuming attempts.

## Worker environment

- `IX_UPLOAD_ENABLED=false` by default. Enable only when ready to submit.
- `IX_ENV=test` by default; the only other value is `production`.
- `IX_USERNAME` and `IX_PASSWORD`: server-only SunFire credentials for the selected
  environment. Configure separate test and production secret values.
- Existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, Supabase server credentials.
- Existing optional daily summary mail: `RESEND_API_KEY`, `INTEGRATIONS_REPORT_FROM`.

The test auth URL is `https://test-api.sunfirematrix.com/v2/authenticate`, and API
base is `https://test-api.sunfirematrix.com/api`. Production uses
`https://api.sunfirematrix.com/v2/authenticate` and `https://api.sunfirematrix.com/api`.
The old sandbox/base-URL/API-key settings are replaced. Missing IX credentials
leave jobs queued without consuming attempts. Nothing authenticates while the
upload switch is off.

## Type A submission and recovery

The contract is [sunfire-ix-openapi.json](sunfire-ix-openapi.json). The original
[UHC integration notes](UHC_IX_Integration_Spec.md) describe the business workflow;
the supplied OpenAPI contract replaces their earlier stub/TBD details.

Only `POST /ix/callrecordings/internalenrollment` is used. Enrollment details are
resolved by SunFire from the intake's SunFire confirmation code. Previously the
adapter received carrier, plan, contract/plan/segment/enrollment IDs, effective
and submission dates, and applicant name/phone/state/zip; those fields are no
longer sent to IX. Conversely retains its intake-based field mapping.

Registration sends the code plus `callMetadata.recordings`, optional known lead
source/channel/medium/campaign/cost, and team name. Linked inbound source labels
and finalized Paragon per-call charges supply attribution when available. It
never sends `dateSold`, `callType`, `disposition`, or applicant PII. Each completed
recording leg linked to the call is verified against Twilio AccountSid, CallSid,
RecordingSid, two channels, and provider start time/duration. Each leg gets a
stable MP3 filename and UTC timestamps. Audio streams from Twilio directly to
S3 as `audio/mpeg`; it is never written to disk. Household codes register
separately, with the same call recordings.

Auth tokens are cached in memory, refreshed before expiry, and refreshed once on
an API 401. Credentials/tokens are never logged or stored in upload rows. The
registration ID and filename-matched presigned targets are saved under the queue
lease before uploading. Every successful PUT is checkpointed. Retries skip
finished files and never register again after the ID is saved. Finalize accepts
both `finalized` and `already_finalized`, storing the actual ID, receipt and time.
Saved registrations cannot be resumed against a different environment.

The queue uses 30-minute leases, a 20-minute streaming timeout, exponential
60/120/240/480-second retry delays and at most five attempts. Network/5xx errors
retry. A second 401, 400, or 403 is terminal failed. Register 404 becomes
`needs_attention` / `invalid_sunfire_code`; register 409 becomes
`duplicate_on_sunfire`. Expired unfinished targets become `needs_attention` /
`upload_url_expired`. These states do not retry or re-register automatically.
When all PUTs finished, finalize may still proceed after URL expiry. A lost PUT
checkpoint may safely repeat that PUT. A lost register response cannot be
recovered without SunFire support; a subsequent 409 is surfaced for admin review.

## Admin remediation and reconciliation

Calls → Compliance Uploads shows terminal/attention errors and sanitized vendor
messages. Invalid enrollment codes appear immediately in the missing-code queue;
missing codes appear after two hours. **Edit enrollment / SunFire code** opens
the native intake, using its existing owner/admin authorization. Saving a corrected
code resets attempts and requeues the unregistered enrollment. Registered,
expired, duplicate and successful rows are retained for review; editing their
code never silently registers a second recording. Signed upload URLs are service-only
and are never returned by the admin API.

A 15-minute sweep repairs/enqueues eligible rows. Daily ET reconciliation counts
household intakes separately and includes attention/duplicate states in failures.
Prior-day summaries retain durable email idempotency and go to the existing Mike
recipient when mail is configured. No live SunFire calls are made by tests.
