# Vendor integrations: operator deployment and onboarding

Nothing in migration 048 seeds a vendor, destination, signing secret, ping key,
or email recipient. Existing availability consumers keep `push_enabled=false`.
No new code sends anything until an active source/consumer has its destination
configured. The separate worker must also be running; telephony and wrap-up do
not depend on it. The default availability JSON contract is unchanged.

## Components and migration

- `supabase/functions/get-availability/handler.js`: JSON/simple/text, state/min,
  header/query keys, HEAD and authentication-method logging. Uses the existing
  authenticated feed RPC and shared routing eligibility.
- **048_vendor_integrations.sql** (after 047): consumer push configuration;
  `lead_sources`, single-use `lead_source_pings`; inbound source fields;
  outbound attempt `call_record_id`; call-record Twilio SID; exact-link and repair
  RPCs; delivery queue, attempt logs, debounce state and daily-report ledger.
  All integration tables/RPCs are service-role only. Signing secrets are stored
  server-side in protected configuration rows; API/ping keys are SHA-256 hashes.
- `telephony/src/vendorMetadata.js`, voice parameters and ping route: accept
  minimal source identifiers and carry canonical parent SID. The source trigger
  performs no network requests and catches errors without failing the call.
- `src/lib/telephonyCallIdentity.js`, session metadata and post-call payload:
  retain SID through disconnect. `netlify/functions/_telephonyLink.js` links by
  SID + tenant + authenticated agent identity. The inbound record and matching
  outbound attempt link to the call record. No phone/time-based guessing.
- `integrations/worker.js`: separate scheduler and delivery loops; persistent
  jobs, leases, HMAC, backoff, daily Eastern reports, reconciliation and logging.
  Outbound traffic cannot block inbound routing or wrap-up. Scheduling runs each
  second independently of vendor response time; the daily check runs each minute.
- `scripts/integrations/`: service-role admin commands (never browser endpoints).
- `docs/vendor-integration.md`: external vendor guide; safe to share.

## Environment variables

| Process | Required configuration |
| --- | --- |
| Supabase feed | Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; JWT verification remains false because it authenticates its own keys |
| Telephony | Existing variables unchanged; new ping route uses the existing service client |
| Netlify wrap-up | Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and Clerk auth |
| Integration worker | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Report delivery | `RESEND_API_KEY`, `INTEGRATIONS_REPORT_FROM` (verified sender/domain) on the worker, needed only when email reports are configured |
| Admin commands | `SUPABASE_URL` (or local `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`; optional `DEFAULT_TENANT_ID` (defaults to current NGHS tenant) |

No vendor credentials or endpoints belong in environment variables. They are
per-consumer/source configuration. No global enable flag overrides revocation.
Never put service-role credentials in a browser or vendor configuration.

## Exact deploy order (not executed by this change)

1. Apply migration 048 after 047. Leave all new destination settings empty.
   The migration refactors the feed query into `availability_snapshot`; it does
   **not** replace any claim/release/reroute functions or change presence mode.
2. Deploy the updated `get-availability` function, preserving `verify_jwt=false`.
   Existing keys and default response continue to work.
3. Deploy the telephony service with the parent-SID parameter, minimal source
   metadata, and `/api/leads/ping`. Its Docker context remains `telephony/`.
4. Deploy the web app and Netlify post-call functions together. New telephony
   calls now carry exact SID metadata. Existing in-flight inbound calls can use
   their recorded child SID, if present, for an exact child-to-parent match.
5. Deploy a **separate always-running worker**, with repository root build context:
   `docker build -f integrations/Dockerfile -t enrollgen-integrations .`.
   Run `node integrations/worker.js` with the worker environment above. It is not
   a web service and needs no public listener. The 7 AM Eastern schedule lives
   here; no UTC-only cron/DST edits are required. Use a supervised worker service.
6. Verify the current consumers' original GET responses, new formats/HEAD, and
   exact call-record links in staging. Confirm each agent's roster slug and
   Clerk user ID are mapped; unmatched identities are reported as link issues. Run `npm test --prefix telephony`,
   `node --test tests/*.test.js`, and `npm run build`.
7. Configure each vendor/source only after agreeing on recipients, payload format,
   signing secret, and test endpoints. Start with a test source/consumer and
   complete the vendor-facing guide's checklist before production traffic.

## Consumer administration

```sh
node --env-file=.env.local scripts/integrations/create-consumer.js --name vendor-a
node --env-file=.env.local scripts/integrations/create-consumer.js \
  --name vendor-a --push-url https://vendor.example/availability --push-format simple
# The preceding command configures the URL/secret but leaves new push disabled.
node --env-file=.env.local scripts/integrations/create-consumer.js \
  --name vendor-a --enable-push
node --env-file=.env.local scripts/integrations/create-consumer.js --list
node --env-file=.env.local scripts/integrations/create-consumer.js --name vendor-a --revoke
```

Creation prints the raw availability key once; only its SHA-256 hash is stored.
Configuring a push URL generates and prints a separate HMAC secret once if none
exists. Securely share the correct secret with the intended vendor. Existing
consumer updates do not rotate/reprint API keys. Revocation disables both pull
and push, including queued deliveries when next checked.

## Source administration

```sh
node --env-file=.env.local scripts/integrations/create-lead-source.js \
  --name aggregator-a --type aggregator --number +15551230000 \
  --postback-url https://aggregator.example/dispositions \
  --field-map '{"aggregator_call_id":"vendor_call_id","sale":"converted"}'
node --env-file=.env.local scripts/integrations/create-lead-source.js \
  --name publisher-a --type publisher --aggregator aggregator-a \
  --external-id pub-123 --report-emails reports@publisher.example
node --env-file=.env.local scripts/integrations/create-lead-source.js --list
node --env-file=.env.local scripts/integrations/create-lead-source.js \
  --name publisher-a --deactivate
```

Use `--tenant UUID` when not using the default tenant. An aggregator creation
prints its dedicated ping key once and stores only its hash. A postback URL
creates a signing secret unless `--unsigned-postback` was explicitly requested.
The optional `--report-emails` list is comma-separated. `--number` accepts E.164.
Publisher records require the configured parent aggregator and exact publisher
name/external ID used in transfers. Source names are tenant-unique. Existing
source configuration can be edited by a service-role administrator; creating a
name twice fails rather than silently rotating keys or changing recipients.

## Exactly what partners provide and receive

| Partner/use | Partner supplies | We supply |
| --- | --- | --- |
| Pull vendor | Name; format/state/min requirements; whether headers are supported | Availability URL and unique API key; example GET/HEAD |
| Push vendor | Public HTTPS receiver; json/simple format; successful signature/deduplication test | HMAC secret, payload contract, delivery headers and retry policy; enable push after testing |
| Aggregator | Postback HTTPS URL; exact field map; signature support; publisher IDs; metadata method; their call ID when available | Assigned Twilio transfer number, availability key, optional ping URL/key, postback HMAC secret, sample payload and test call |
| Publisher | Agreed publisher name/ID; parent aggregator; approved email recipients | Source attribution agreement, daily CSV example and 7 AM Eastern schedule |

The existing `/api/leads/incoming` CRM intake remains separate and unchanged;
availability keys do not authorize CRM intake or ping. Use the new per-aggregator
ping credential for attribution-only pings. The Twilio-signed request metadata
wins over a ping; ping matching is tenant/source + phone, newest unused within
five minutes. Unknown numbers remain `direct`, and unrecognized publishers
remain attributed to the configured aggregator rather than another publisher.

## Failure recovery and delivery semantics

- Push changes debounce five seconds, heartbeats every five minutes, retries
  start at 5 seconds and double up to 60 seconds, with a 10-minute deadline.
  New status cancels older pending pushes and prevents superseded in-flight
  sends from retrying; sends are serialized
  per consumer. Format and postback field mappings are frozen per queued event.
- Postbacks are discovered from saved wrap-ups on the next scheduler cycle,
  normally within a second, then delivered asynchronously. Failed sends back
  off from 5 seconds up to one hour, with a 24-hour deadline. Events are unique
  by call record and wrap-up save revision. Only wraps saved after source
  configuration are eligible, avoiding accidental historic exports on onboarding.
- Reports cover the previous **Eastern** day (including 23/25-hour DST days).
  Zero-call days are logged but not emailed. A source/date is queued once;
  the sender uses a stable provider idempotency key. Queue payloads are immutable
  snapshots. Subsequent wrap-up corrections are separate postback events, not
  retroactive CSV edits. After an outage, an initialized report cursor catches
  up missing report dates. A newly configured source starts with yesterday.
- The Resend adapter sends a base64 CSV attachment using the
  [official email API](https://resend.com/docs/api-reference/emails/send-email).
  Confirm sender-domain verification and quotas before adding report recipients.
- Every delivery attempt is recorded before sending, then updated with HTTP
  status/result. A worker crash leaves an auditable started attempt and a lease
  that another worker can recover after 60 seconds. Delivery IDs stay stable for
  retries/replays. Recipients must deduplicate; a crash after remote acceptance
  but before local acknowledgement can cause an at-least-once retry.
- Secrets, URLs, caller phones and response bodies are not written to worker logs.
  Destination URLs require HTTPS, public DNS/IPs, port 443, no URL credentials,
  and no redirects; DNS addresses are validated and pinned for each connection.
- Inspect `integration_deliveries`, `integration_delivery_attempts`, and
  `integration_report_log` with service-role access. Alert on failed deliveries,
  stale pending jobs, link issues, and missing worker heartbeat in your supervisor.

```sh
node --env-file=.env.local scripts/integrations/resend-postback.js --list
node --env-file=.env.local scripts/integrations/resend-postback.js --id FAILED_DELIVERY_UUID
node --env-file=.env.local scripts/integrations/resend-postback.js --link-issues
```

Manual resend resets a failed postback's deadline to 24 hours without changing
its delivery ID or payload. It does not reactivate a deactivated source.
Source/consumer deactivation is checked before every attempt.

Link failures log a call-record ID and safe reason, and are listed in
`integration_link_issues`. The worker retries persisted exact SID/user metadata;
missing SID or conflicting record ownership requires investigation, never a
phone/timestamp guess. Historic records without SID metadata cannot be linked
automatically. Retain integration records according to your approved phone-data
retention policy; this change does not delete historical call data.

Tests use local PGlite and fake transports. They exercise payload privacy,
health-code scrubbing, mappings, CSV formula escaping, HMAC, failure isolation,
queue retries, authentication/filtering, source tagging, exact linking,
DST schedules and dormant defaults. Real multi-process PostgreSQL contention,
Twilio SIP-header forwarding, remote endpoints, sender-domain setup and email
provider acceptance must be verified in staging before onboarding.
