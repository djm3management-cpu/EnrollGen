# Compliance uploads

Conversely sampling and SMS contract rules are documented in
[conversely-uploads.md](conversely-uploads.md). Those rules apply only to Conversely.
IX continues to queue **every UHC Medicare Advantage enrolled/pending-verification
call**, including every household confirmation code, without score-based sampling.

Apply migration 123, then 124, before deploying Netlify, telephony and
integrations-worker. Both upload switches default to off. No push or deployment
was performed. The initial IX sweep includes existing enrolled calls with linked
completed recording_ingestion rows. No call routing or stylesheet changes.

SunFire codes use the existing sunfire_code field. Commas, semicolons and newlines
separate household codes; duplicate and surrounding whitespace are removed for
queueing. UHC enrollment disposition saves require a non-empty code, even while
uploads are disabled. Agents can edit codes later in Calls → optional details;
admins can repair missing codes in Calls → Compliance Uploads. Historical calls
missing a code appear after two hours, including calls without a recording.

IX_ENV accepts sandbox or production, default sandbox. ixConfiguration reads only
the matching IX_SANDBOX_BASE_URL / IX_SANDBOX_API_KEY or IX_PRODUCTION_BASE_URL /
IX_PRODUCTION_API_KEY. The StubIxClient reports unavailable, so even setting
IX_UPLOAD_ENABLED=true leaves jobs queued without consuming attempts or inventing
receipts. Implement the client interface after SunFire supplies its contract.
createUpload accepts confirmationCode and idempotencyKey and returns a pre-signed
S3 URL; confirmUpload must return a real receiptId. Set available=true on the
implemented adapter. No IX endpoint, auth scheme or accepted-format contract is
invented by the stub.

The transport verifies AccountSid, RecordingSid, CallSid and two recording
channels; streams WAV directly from Twilio into S3; records the receipt; never
persists audio or deletes from Twilio. The longest completed recording is selected
per call. Validate complete-call coverage and accepted format with SunFire before
production. Conversion is deferred until IX requires it. TWILIO_ACCOUNT_SID and
TWILIO_AUTH_TOKEN must be available on integrations-worker.

IX rows enqueue on disposition/code changes and recording arrival, with a sweep
every 15 minutes. Both providers use the same queue columns, atomic claims,
30-minute leases, token-checked finishes, exponential delays and five-attempt
limit. IX streaming has a 20-minute timeout. Successful recording/code pairs are
never reclaimed; IX also has the required call/confirmation unique constraint.
Provider idempotency keys must be honored to recover from lost responses. A
removed code is checked before upload and never sent; successful historical rows
are preserved, and current-code reconciliation excludes obsolete successes.

The admin view requires a signed organization admin/owner role and server-side
tenant scoping. It shows up to 200 upload errors, 200 missing-code calls and 30
days of UHC reconciliation. Expected volume counts household codes separately;
a missing-code enrollment contributes one expected upload. Missing recordings
appear as gaps rather than fabricated uploads. Gap = expected uploads minus
successfully receipted current codes. Conversely failures share this same view.

Prior ET-day cohort summaries go daily to mike@newgenhealthsolutions.com through
existing RESEND_API_KEY and INTEGRATIONS_REPORT_FROM settings. A durable
compliance_daily_summaries row and email idempotency key prevent repeat sends.
The summary includes enrolled, expected-upload, uploaded, failed and missing-code
counts even when IX remains disabled. Without mail configuration the admin
reconciliation remains available. SunFire sandbox, batch and production sign-offs
in docs/UHC_IX_Integration_Spec.md remain outstanding until credentials arrive.
