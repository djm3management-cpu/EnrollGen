# Conversely weekly samples

Apply migrations through **127_conversely_manual_runs.sql** before releasing the updated integrations worker and Netlify functions/UI.
No deployment was performed. CONVERSELY_UPLOAD_ENABLED defaults off; only `true`
enables sampling and delivery. Set CONVERSELY_API_KEY, TELEPHONY_BASE_URL,
TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on the worker before enabling it.

The automatic scheduler has **no fixed cron day/time**. The Railway worker
checks on process startup and then at 60-minute intervals measured from each
check; its scheduler loop wakes every second. Once Monday **00:00
America/New_York** has passed, the first eligible check selects the last
completed week: previous Monday 00:00 inclusive through the following Monday
00:00 exclusive (all of Sunday included). If the worker restarts or is enabled
later, its startup check evaluates the latest closed week. Downtime does not
cause every historical missed week to be replayed. DST boundaries use New York
calendar arithmetic, not a fixed 168-hour UTC window.

Each active enrolled agent receives at most **one** weekly submission: the
highest-scored eligible call, breaking equal scores by newest call, then call
UUID. Production scheduling and manual runs enforce this cap in both selection
and SQL; the legacy CONVERSELY_SAMPLES_PER_AGENT setting cannot raise it. There
is no substitution after a selected upload fails. Retries retain that same job
and provider idempotency key.

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

Migration 125 changes enrollment/applicant metadata to completed
`enrollment_intakes` records. Calls without one are ineligible. Call, agent and
recording details still come from their original sources. See
[Native Medicare enrollment intake](enrollment-intakes.md) for the exact before/after
field mapping and household enrollment keys. An unauthenticated endpoint probe
returned 403; authenticated vendor acceptance and X-API-Key semantics still
require validation with live credentials.

Both providers use atomic claims, 30-minute leases, token-checked finishes,
exponential backoff starting at 60 seconds, and at most five attempts. A successful
recording/enrollment pair is never reclaimed or enqueued again. Provider
Idempotency-Key must also be honored for recovery after a lost response. The
worker Docker image includes the shared recording-link and streaming helpers.

## Run Conversely now

The admin-only CRM Calls compliance uploads panel can request a run for the
**current ongoing Monday-based week**, through the request timestamp. This
intentionally differs from the automatic scheduler's closed-week window. The
Netlify endpoint authenticates a tenant administrator and inserts a durable
request; it does not send applicant data or provider credentials from the
browser. The existing Railway worker checks requests on its next scheduler
iteration (normally about one second), selects candidates and drains the usual
compliance queue immediately without waiting for the next hourly check.

The worker remains the source of CONVERSELY_UPLOAD_ENABLED, carrier allowlist
and agent exclusions. It publishes only enabled/heartbeat state every 30 seconds;
the API rejects new requests while disabled or when its heartbeat is over five
minutes old. No duplicate provider configuration is needed in Netlify. The
worker rechecks its enable flag before selection and delivery, and current
carrier/agent rules before each POST, including exclusions keyed by Clerk ID.

Migration 127 adds durable runs, per-agent results, and a unique weekly slot for
each tenant/agent. It backfills slots/history from existing audit/submission
records, preferring successful legacy submissions. Concurrent clicks reuse an
active request. Repeated runs reuse a pending/failed job and skip an already
successful agent; they can still select an agent previously skipped for lack of
eligible calls. A later automatic closed-week run uses the same slots, so an
earlier manual submission cannot be duplicated. Manual runs do not stamp the
week as automatically evaluated, allowing the later scheduler to evaluate
agents with no slot. Five-attempt terminal failures remain visible; this button
does not reset exhausted provider attempts.

The panel shows the latest run's requested/started time in Eastern Time, week,
trigger, stage, and per-agent submitted/skipped/failed outcomes and reasons.
Queued/uploading jobs are shown honestly as pending/uploading until the provider
responds. Transient failures remain failed with retry state until the original
job succeeds or exhausts attempts. While a run is active, the panel polls every
three seconds. Historical automatic runs are included in the backfilled history.
All new tables/RPCs are service-only; browser roles cannot create selections or
claim jobs directly. Call routing and the IX pipeline are unchanged.

Verification covers startup/hourly timing, Monday/DST boundaries, enabled and
stale-worker gates, admin/tenant scope, concurrent request deduplication, current
week cutoff, completed-intake eligibility, carrier rules/exclusions, the one-agent
weekly cap, manual/automatic coordination, historical success backfill, retries,
last-run results and panel controls. Tests use local PostgreSQL and synthetic
provider transports; no live submission or deployment was performed.
