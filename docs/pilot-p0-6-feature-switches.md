# P0-6: deployment feature switches

Implemented on `pilot/release` for an isolated pilot. No deployment, push, environment-file edit, live database operation, or real provider request is part of this change. `PILOT_READINESS.md` P0-6, §1, “Required deployment feature switches,” Appendix B, and `PILOT_FIT.md` §6 govern the scope. Styling is unchanged.

The single parser is `telephony/src/lib/deploymentFeatures.js`. It lives inside the independently packaged telephony service; Netlify, the worker, and the availability Edge Function import that same source. Only the exact string `true` enables a feature. Unset, empty, and `false` are off. Every other value throws a startup/build configuration error naming the flag without echoing its value. No feature secret or credential is exposed through a `VITE_` setting.

| Flag | Default | Exact boundary | Services enforcing behavior |
|---|---|---|---|
| `PARAGON_ENABLED` | false | Vendor ping and availability feed, identified Paragon lead ingress, state routing, billing event enqueue/claim/verification/retry, residence discovery/enqueue/claim/retry, callback/review/report HTTP routes, vendor pause/routing controls, availability/postback/report scheduling and delivery, daily email, and vendor/residence UI/outbox | Railway telephony; integrations worker; Netlify; availability Edge Function; frontend receives public state |
| `PARAGON_STATE_ROUTING_ENABLED` | false | Existing state-routing algorithm; requires `PARAGON_ENABLED` too. This remains a subordinate routing setting, not the complete vendor switch | Railway telephony; availability Edge Function |
| `GHL_ENABLED` | false | Post-call webhook claim/send/result action; intake-triggered durable delivery enqueue; worker claims, sends and retries; test endpoint; CRM integration settings | Netlify; integrations worker; frontend |
| `STRIPE_BILLING_ENABLED` | false | Checkout, portal and webhook routes, billing UI. Off supplies explicit `billing_disabled` active/full-plan entitlement with 1,000,000 seats, without subscription reads or internal-agency identity assumptions | Netlify; frontend |
| `DAILY_VERSE_ENABLED` | false | Daily Verse navigation, hover preload, direct panel rendering, Biblia HTTP proxy | Netlify; frontend |
| `CONVERSELY_UPLOAD_ENABLED` | false | Weekly/manual selection, playback probes, reservations/enqueue, claims, upload/retry/finalization, manual-run HTTP actions and provider UI | Integrations worker; Netlify; frontend |
| `IX_UPLOAD_ENABLED` | false | Trigger/sweeper enqueue, claims, registration/authentication, Twilio download, audio PUT, finalize, retry/correction HTTP actions, reconciliation UI; also required for summary mail | Integrations worker; Netlify; frontend |
| `IX_REPORT_ENABLED` | false | Daily IX summary reads, durable summary records and mail; requires uploads and operational email enabled too | Integrations worker |
| `CONFERENCE_CALLING_ENABLED` | false | Capabilities, status/actions, signed callback and hold routes, new upgrades, provider operations, media admission, recovery watchdog and controls | Railway telephony; frontend |
| `SCORING_ENABLED` | false | Durable scoring enqueue/claim, dispatcher delivery, automatic/manual scoring routes and LLM scoring path; rescore UI | Railway telephony; Netlify; frontend |
| `TRANSCRIPT_GAP_FILL_ENABLED` | false | Manual repair enqueue, claim, recording download, paid transcription and Fill transcript gaps UI | Netlify; frontend |
| `TRANSCRIPT_AUTO_RECOVERY_ENABLED` | false | Automatic repair reservation/claim/download/transcription and recovery dispatch. Independent from manual repair, and scoring retains its existing runtime/database fences | Netlify |
| `OPERATIONAL_EMAIL_ENABLED` | false | Fixed-recipient provider/quota/STT/recovery alerts, worker/vendor daily reports, Paragon daily email and IX summaries, including alert/report claims and retries | Netlify; Railway telephony; integrations worker |

All server transports validate the whole flag set. Credentials, destinations, tenant settings, signed requests and queue contents cannot override an off switch. Disabled feature handlers return HTTP 503 JSON with `status: disabled` and the feature name before work; mixed compliance/review endpoints gate each mutation independently while retaining authorized ordinary review. Both `/api/…` aliases and direct function handlers are covered; `/vendor/paragon` uses the same guarded handler. Existing authorization, subscription checks when billing is enabled, scoring runtime fences, and enabled provider behavior remain in place.

The authenticated, uncached `/api/deployment-features` endpoint returns only public booleans and the billing-disabled entitlement. The tenant context starts with no enabled features. Disabled panels do not mount, preload or poll; disabled conference controls do not discover capabilities or dispatch. These UI checks are cosmetic; server checks remain authoritative. Upload/report switches have no extra browser control where none existed.

## Database and restart behavior

`150_deployment_feature_switches.sql` is a **new, unapplied migration**. No historical migration changed. It must be reviewed and included in the isolated pilot bootstrap before end-to-end acceptance. It adds guards to current enqueue/claim routines without replacing their enabled bodies, and fences queue inserts and claim/retry updates. In particular, saving a native intake still saves the intake/follow-up while suppressing disabled GHL and IX queue writes. Trigger-driven scoring also stops at enqueue. Old queue rows are parked without consuming attempts, creating disabled rows, or generating retry loops. Disabled report rows cannot block enabled non-mail deliveries.

Server Supabase transports overwrite `x-enrollgen-features` on every request using their own environment. The SQL fence accepts enablement only from service-role requests and exact JSON booleans. An authenticated browser cannot enable a queue by forging the header. Missing headers (including older service clients) fail closed. There is no persistent database flag value to become stale or race between services. Keep deployment values consistent across Netlify, Railway, worker and availability Edge deployments; restart/redeploy each separately in a future authorized rollout. Existing database scoring runtime controls are additional restrictions, never substitutes for these switches.

Core recording ingestion and transcript reconciliation remain active independently of paid scoring; the scoring dispatcher performs reconciliation but does not claim scoring or deliver when disabled. Core analytics/reference-data schedules are unchanged. The optional Paragon daily schedule exits before constructing a database client when disabled.

Conference off now parks existing conferences too: callbacks, provider cleanup and watchdog recovery do no work. Before a future flag-off restart, an operator must drain active conferences while enabled. Previously the conference switch allowed drain-side provider work; that exception conflicts with this task's explicit zero-outbound off-state requirement. Enabled conference behavior is preserved.

Nextcloud stays **undeployed and opt-in**. This change adds no startup, orchestration or sync path. Enabling it later requires a separate approved deployment, restricted export scope, pilot-only resources, retention and acceptance testing as required by the audit.

## Later NGHS compatibility rollout

These are the exact values for the **new gates** needed to preserve the source's previously ungated integrations, routes and emails. This is configuration documentation only, not authorization to roll out to production.

| Flag | Value |
|---|---|
| `PARAGON_ENABLED` | true |
| `GHL_ENABLED` | true |
| `STRIPE_BILLING_ENABLED` | true |
| `DAILY_VERSE_ENABLED` | true |
| `IX_REPORT_ENABLED` | true |
| `OPERATIONAL_EMAIL_ENABLED` | true |

The seven pre-existing switches must retain their actual deployed values: `PARAGON_STATE_ROUTING_ENABLED`, `CONVERSELY_UPLOAD_ENABLED`, `IX_UPLOAD_ENABLED`, `CONFERENCE_CALLING_ENABLED`, `SCORING_ENABLED`, `TRANSCRIPT_GAP_FILL_ENABLED`, and `TRANSCRIPT_AUTO_RECOVERY_ENABLED`. Their live values cannot be established from repository defaults or historical rollout instructions. Production inspection is prohibited in this task, so a complete verified current-production value table cannot honestly be supplied. A later authorized operator must inventory those seven values before any rollout; do not turn them on merely to match the new-gate table. Newly gated features that were unused can instead remain false after that inventory.

## Offline verification and limits

Tests cover strict defaults and malformed startup, credentials-present zero-delivery workers, enqueue/claim/retry SQL fencing in isolated PGlite, real historical integration-claim SQL with mail disabled, direct/alias handler shutdown, scheduled early exits, feature-state/entitlement responses, UI absence and no polling, and existing enabled behavior with explicit test opt-ins. Provider transports are mocked; HTTP/WebSocket tests use localhost only. Authentication/authorization and session-lock regression suites remain part of the full tests.

No live schema, deployed configuration, provider acceptance, Edge deployment packaging, or hosted Netlify redirect/background-function behavior was verified. Tests invoke the actual handler exports for aliases/direct paths. Netlify's `-background` platform can acknowledge an invocation before executing its handler; the handler performs no disabled work, but its HTTP response behavior requires separate staging verification. No production catalog or migration replay is claimed.

Final local validation:

- `npm test -- --test-concurrency=4`: **1,139 passed**, zero failed/skipped.
- `npm test --prefix telephony`: **322 passed**, zero failed/skipped; independent import-boundary check passed.
- `npm run build`: passed.
- `git diff --check`: passed. Environment files, `styles.css`, historical migrations, login/authentication safeguards and session-lock implementation were not modified.
