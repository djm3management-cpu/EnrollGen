# F18 integrations-worker handoff — 2026-10-03

Scope: isolated clone on `fix/integrations-worker`, based on `f6efa3d`.
No production writes, deliveries, deployment, replay, push enablement or destination changes.
Routing, staffed hours/cap, recordings, billing calculations and UI styling are untouched.

## Diagnosis and limits

SELECT-only Supabase table reads (PostgREST GET/select, no RPC calls) found:

| Delivery | Report date | Calls | Current state | Attempts |
| --- | --- | --- | --- | --- |
| `d0d45d8a-d335-4e57-8301-b23cdd82898f` | 2026-09-28 | 1 | failed, expired, no live lease | 33 |
| `4d7343c1-ad1e-4c65-a79c-d8fa800fc93c` | 2026-10-01 | 5 | failed, expired, no live lease | 33 |

All 66 attempt rows are status 0 / `delivery_error`. The review's earlier 59
attempts have grown by seven, and its pending job is now failed. The Paragon
source is active, has one syntactically valid recipient, and no postback URL.
Paragon's availability consumer is active with push disabled and no push URL.
No addresses, payload contents, signing secrets or credential values are reproduced here.

Both exact report payloads successfully passed the current CSV/email construction
with fixture credentials and a fake transport: one simulated send per job, no
vendor egress. Every call timestamp was valid. This rules out a deterministic CSV
construction failure for these stored payloads on the inspected source; it does
not establish the deployed worker's version or its external environment.

The confirmed code defect is the catch that discards every actual exception.
The delivery ledger cannot recover the lost historical exception. Missing
`RESEND_API_KEY` / `INTEGRATIONS_REPORT_FROM`, database configuration lookup failure,
and DNS/TLS/timeout failure all produce this exact status-0 ledger signature.
A normal Resend rejection for an invalid recipient/key or unverified sender would
produce a nonzero HTTP status and `http_error`, so that is not directly evidenced
by these rows. A production version mismatch cannot be ruled out.

Railway CLI and a Railway connector were unavailable. An attempt to read the
existing Railway browser tab was denied by browser security policy because site
permission was declined. No workaround was attempted. Thus a missing Railway
variable is a candidate, not a proven root cause. No speculative mail fallback,
recipient rewrite or payload/billing change was made.

## Code and SQL

- `integrations/diagnostics.js`: exact allowlisted local exception messages,
  recognized network/database codes, missing variable names, safe Resend error
  codes and canonical sender-domain/test-sender reasons. Arbitrary exception text,
  stacks, URLs, addresses, request/response bodies and secrets are withheld.
- `integrations/worker.js`: persist the diagnostic through `p_error` and include
  the same safe object in delivery logs. Keep status/result/retry semantics intact.
- `integrations/transport.js`: read a bounded (4 KB maximum retained) non-success
  response and forward only error name/message internally to the sanitizer;
  handle aborted/error responses. Successful response bodies remain discarded.
- `supabase/migrations/077_integrations_delivery_diagnostics.sql`: add nullable
  `error_detail jsonb` to the service-only attempt table and replace the finish
  RPC with a defaulted sixth argument. Preserve lease-token checks, all status
  transitions and report-log behavior. Explicitly retain service-only execution.
  Includes commented SELECT diagnostics and a commented proposed two-ID retry.
  **Not applied.** No other migration changes.
- `tests/outbound-canonical.test.js`: add missing `setTranscriptionHealth` stub
  to the shared VM fixture, repairing the three root failures.
- `tests/integrations-diagnostics.test.js`: missing-env capture in ledger/log,
  redaction, CSV/network diagnostics, Resend rejection, stable key, dormant controls.
- `telephony/tests/vendorIntegrations.test.js`: load 077; verify stored diagnostic,
  stale-token exclusion, old five-argument compatibility and worker isolation.
- This handoff document.

## Railway settings to verify/set

On the **integrations-worker service in Production**, not just Netlify or telephony:

| Variable | Value / requirement |
| --- | --- |
| `RESEND_API_KEY` | Valid server-side Resend sending key authorized for the verified `newgenhealthsolutions.com` domain. Enter its actual secret through Railway; never use a `VITE_` variable. |
| `INTEGRATIONS_REPORT_FROM` | `reports@newgenhealthsolutions.com` (the existing documented report sender); domain must be verified in the same Resend account/key scope. |
| `SUPABASE_URL` | Production Supabase project URL already used by this worker. |
| `SUPABASE_SERVICE_ROLE_KEY` | Corresponding server-side production service-role key; do not substitute the anon key. |

Current presence/validity on Railway is unverified. Do not rotate credentials or
replace valid settings merely on suspicion. Check sender-domain verification and
key scope in Resend before setting the sender. The report recipient is stored in
`lead_sources.report_emails`, not an environment variable; the configured recipient
passed syntax checks, so no recipient change is proposed. A separate Netlify email
success does not prove this independent worker has the two mail variables.

Resend documents sender verification failures and key errors in its
[error reference](https://resend.com/docs/api-reference/errors). Its
[idempotency window is 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Paragon handoff — report only

For optional disposition postbacks Paragon must supply a public HTTPS receiver,
agreed canonical field map, signature support and publisher/call-ID requirements.
We would supply the agreed payload contract, HMAC secret if signing is supported,
stable delivery ID/idempotency headers, retry policy and a controlled acceptance test.
The postback URL is currently missing; field-map agreement and secret readiness
were not verified by this read (secrets intentionally excluded).

For optional availability push Paragon must supply a public HTTPS receiver and
json/simple format choice, and demonstrate signature verification and deduplication.
We would supply the payload contract and HMAC secret (required by push), delivery
headers and retry behavior. The push URL is missing and push remains disabled;
secret readiness was not queried. Existing pull availability remains independent.
Do not set either destination or enable push as part of F18.

## Proposed retry and rollout order — not executed

1. Pause only integrations-worker and let any current delivery lease expire.
2. Review/apply **077 only**, after verifying the deployed 048 finish function
   still matches the preserved implementation. Do not run an automatic schema push.
   Its default NULL argument supports the old worker during transition. Refresh
   PostgREST schema cache through the normal migration process if required.
3. Verify/set the Railway variables above and deploy this worker commit using the
   existing root-context `integrations/Dockerfile`. Keep the worker paused until
   settings and provider receipts have been reviewed.
4. Check Resend receipts for both report dates/source and confirm neither was
   accepted. Expired provider idempotency keys cannot guarantee historical deduplication.
   If acceptance is uncertain, reconcile with the recipient before replay.
5. Once replay is separately authorized, use only the commented guarded retry in
   077 for these two failed report IDs. Expect exactly two affected rows; rollback
   if the guard or state differs. Preserve job ID, dedupe key, payload and attempts;
   extend expiry 24h and clear expired leases. Do not call `resend_disposition`
   (it handles postbacks only), reset source cursors, bulk retry, or create new IDs.
6. Resume the worker; confirm new attempt diagnostics or HTTP acceptance, job
   `sent`, report-log `sent`, and provider receipt. Provider HTTP acceptance is
   distinct from mailbox delivery. If a new failure identifies a missing variable,
   transport or provider configuration, fix that specific cause before more retries.

Code rollback: old worker remains compatible with migrated finish RPC. Leave the
additive diagnostic column/defaulted RPC in place; do not erase attempt history.

## Validation

- `node --test --test-concurrency=1 tests/*.test.js`: **259 passed, 0 failed**.
  Includes all three repaired outbound fixture tests and four new diagnostic tests.
- `node --test --test-concurrency=1 telephony/tests/vendorIntegrations.test.js`:
  **25 passed, 0 failed**, including migration 077 in local PGlite.
- The original unconstrained baseline had three missing-stub failures plus one
  concurrent test-file failure; serial root execution passes the complete suite.
- Both production report snapshots serialized successfully against a fake transport.
- No production SQL mutation, provider email, job replay or Railway setting write ran.
