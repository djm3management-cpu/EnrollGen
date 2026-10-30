# Conversely weekly samples

Apply migration 123 before deploying integrations-worker, Netlify and telephony.
No deployment was performed. CONVERSELY_UPLOAD_ENABLED defaults off; only `true`
enables sampling and delivery. Set CONVERSELY_API_KEY, TELEPHONY_BASE_URL,
TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on the worker before enabling it.

The worker samples the last **completed Monday–Sunday week in America/New_York**,
once per week, checking hourly for a missing run. This permits comparison across
the entire week and handles DST boundaries. Enrolled and Enrolled Pending
Verification calls qualify. Each active roster agent receives the highest-scored
eligible call, breaking equal scores by newest call, then call UUID. Agents with
no eligible call are logged and skipped. CONVERSELY_SAMPLES_PER_AGENT defaults to
1; larger values select the top N eligible calls (or all eligible calls if fewer
than N exist). There is no substitution after a selected upload fails, keeping the
sample volume fixed. Retrying a selected upload retains the same provider key.

Calls must have compliance_status=complete, a current linked non-composite
compliance scorecard, and a completed retained provider recording. A bounded
Twilio MP3 range probe verifies playability before reservation. Transient provider
errors or missing Twilio credentials prevent reservation so the run can retry;
a 404/410 recording is ineligible. Durable weekly run and audit tables freeze
selection atomically across worker restarts and concurrent workers. All eligible
alternatives and all skip reasons are persisted and logged as
conversely_weekly_selection; delivery success/failure logs include the call ID.

CONVERSELY_CARRIERS is a comma-separated allowlist of canonical names or aliases:
UnitedHealthcare (UHC, United Healthcare, AARP Medicare Advantage), Devoted
(Devoted Health), WellCare (Centene, Wellcare by Allwell), Zing (Zing Health),
Anthem (Elevance, Anthem Blue Cross), Aetna (Aetna Medicare, CVS), HealthSpring
(Cigna, Cigna HealthSpring), and Humana. Matching is case-insensitive and ignores
spacing and punctuation, but never uses substring matching. Unknown or disallowed
carriers are logged as carrier_not_sms.

CONVERSELY_AGENT_EXCLUSIONS is JSON mapping stable agent slug, UUID or Clerk ID
to excluded carrier names/aliases. The default is {"mark_endres":["Humana"]}, based
on the existing protected recording roster's mark_endres slug. No display-name
check is used. This keeps Mark's AmeriLife Humana enrollments out of SMS samples.
An explicit JSON object replaces the default rules; verify the roster slug when
changing identity mappings. Carrier rules are checked again before each POST.

Delivery POSTs to https://sms.converselyai.com/api/metadata/import with X-API-Key
and Idempotency-Key, Target="New Gen Health Solutions", and the required metadata
fields. Every attempt mints a fresh 24-hour URL ending in
/api/recordings/conversly/:token.mp3. The endpoint verifies the Twilio recording
identity and fetches its .mp3 rendition with audio/mpeg, HEAD and single byte
ranges. Existing WAV links remain supported. Every hit logs a UTC timestamp,
method and token hash, never the bearer token. The token hash correlates with
recording_compliance_tickets; a hit alone does not prove a full download finished.

Payload values come from call_records. metadata.agent_email, contract_id,
segment_id, contract_year and submission_date enrich fields unavailable directly;
unknown optional data is sent as empty strings. SubmissionDate falls back to
created_at and EnrollmentID to enrollment_confirmation_number or call ID. An
unauthenticated endpoint probe returned 403; authenticated vendor acceptance and
X-API-Key semantics still require validation with live credentials.

Both providers use atomic claims, 30-minute leases, token-checked finishes,
exponential backoff starting at 60 seconds, and at most five attempts. A successful
recording/enrollment pair is never reclaimed or enqueued again. Provider
Idempotency-Key must also be honored for recovery after a lost response. The
worker Docker image includes the shared recording-link and streaming helpers.
