# SOC 2 readiness: operational logging, administrator actions and alerts

Local work on `pilot/release`, starting at `e2a5d53`. No push, deployment, hosted database, real third-party API, dependency addition, vendored file, real environment-file change, historical migration change, stylesheet change, or active-secret-exception change. Validation uses synthetic identities, fake transports, the external-network fence, and in-process PostgreSQL. The only permitted external traffic is the two npm registry audits. P1-3 in the archived pilot readiness report is the originating readiness item.

## Log contract

`telephony/src/lib/logger.js` is the shared output boundary for Netlify functions and libraries, telephony, the integrations worker, and the availability function. Each output line is one JSON object:

```json
{"time":"2026-11-15T12:00:00.000Z","level":"error","service":"telephony","deployment":"sha256:…","event":"recording_copy_failed","correlation_id":"00000000-0000-4000-8000-000000000001","category":"operational","error_type":"OperationalError","code":"08006","message":"Operation failed"}
```

Time and correlation UUIDs are generated server-side. Deployment identifiers and verified subjects are hashed. HTTP requests and worker invocations carry an async context; independent requests never trust a supplied correlation string. UUID resource identifiers remain usable. Cross-request/provider correlation still uses the existing persisted job/call IDs; a new HTTP invocation receives a new request correlation ID.

Every field passes through the existing recursive scrubbing rules, followed by a restrictive scalar projection. Unknown free text, objects, arrays, names, numbers under protected keys, phone numbers, Medicare/SSN/DOB, addresses, message/transcript text, credentials, tokens, signed URLs, request bodies, SQL values and raw errors are dropped. Error text is always the fixed safe message above; machine SQL/network codes are narrowly validated. Operational event names and module fallbacks come from the checked-in code-owned catalog, so personal data cannot become an event name. Browser debug output is unchanged.

The full event-name catalog is `telephony/src/lib/logEvents.js`; regenerate reviewed source instrumentation with `node scripts/logging/catalog.mjs`. Stable events include provider results, queue claims/finishes/deliveries, scoring stages/failures, recording/transcript operations, routing/presence, and alert transitions. Module-specific `*_diagnostic` fallbacks suppress legacy diagnostic prose. ESLint prohibits server console access; the AST regression also rejects direct output writes outside the logger. Operational telemetry persists bounded event dimensions for alert aggregation. A database outage cannot durably record its own failed insert: the safe JSON line remains the independent diagnostic source, and `telemetry_write_failed` reports that gap.

## Security events

All events below use category `security`. A verified subject hash is attached when authentication has established one; failed unverifiable credentials never produce a claimed subject. Authentication headers are never inspected as application payloads.

| Event | Trigger |
|---|---|
| `verification_failed` | Missing or rejected sign-in verification |
| `authorization_denied` | Membership/ownership/admin refusal, including lease refusal; repeated HTTP refusal is counted once per request |
| `admission_rejected` | Rate, connection, or daily request-budget rejection |
| `budget_rejected` | Daily paid-request admission rejection or scoring token-budget refusal |
| `session_lock_failed` | Authenticated browser reports an unlock failure; explicitly diagnostic, not proof of verification |
| `feature_disabled` | Request reaches a switched-off feature |
| `destination_rejected` | Destination URL/allowlist or non-public DNS rejection |
| `configuration_failed` | Invalid deployment/profile/feature/auth/startup configuration |
| `audit_write_failed` | Evidence trail insert cannot be committed |
| `admin_log_write_failed` | Administrator audit boundary is unavailable |
| `upload_rejected` | Bounded spreadsheet ingestion rejects an upload |
| `secret_input_detected` | Bounded application payload contains a secret-shaped value; value is never emitted |

## Administrator trail

New migration **161_operational_logging_alerts.sql** adds `admin_action_log`, separate from `evidence_access_log`. Records contain verified actor, tenant, server time, action, target type/ID, result, request UUID and safe before/after summaries. Only server code can insert. Browser reads require **protected database admin authority**, including when a signed identity-provider claim alone grants an existing mutation. UPDATE, DELETE and TRUNCATE are forbidden to browser, service and ordinary owner operations. The sole private expired-record deletion exception follows the existing evidence-trail retention permit and refuses deletion while any hold remains.

`adminActions.js` supplies the common request, mutation, external-dispatch and operator boundaries. Database mutations execute the original reviewed routine or scoped table operation and insert their audit in the same transaction; an audit failure rolls back that mutation. The original ownership, feature, lease, encryption and budget fences remain in force. A request uses one immutable record, shared across its database stages. Its before/after summaries describe the first committed stage; subsequent stages retain the same request identity. Existing multi-stage HTTP operations remain multi-stage and are not represented as a new distributed transaction.

External calls cannot join a PostgreSQL transaction. Their record is written **before** dispatch with result `authorized`, distinguishing authorization from provider acceptance. If it cannot be written, dispatch is refused. Provider outcomes are operational diagnostics under the same correlation context. The trail contains no provider credentials, payloads, hold reasons or protected intake data.

| Handler/operator action | Logged mutation |
|---|---|
| `tenant_settings` | Whitelisted tenant settings |
| `contact_assignment` | Contact reassignment |
| `pipeline_settings` | Pipeline save and stage deletion |
| `script_settings` | Script template changes |
| `vendor_pause` | Vendor pause/resume |
| `compliance_review` | Manual deterministic review, rescoring, paid pass/gap-fill approval and retry state |
| `compliance_uploads` | Confirmation-code correction, manual vendor runs and IX retries |
| `post_call_admin` | Manual post-call/transcript/scoring retry |
| `retention_holds` | Hold placement/release and complaint flag/resolution |
| `trigger_knowledge_update` | Authorized manual knowledge run and resulting draft mutations |
| `rts_ingest` | Administrator ingestion commit |
| `recordings` | Administrator compliance-link minting; ordinary playback remains in the evidence trail |
| `enrollment_intakes` | Administrator intake/test-mode changes |
| `transcript_import` | Privileged import for another enrolled agent |
| `set_availability` | Administrator availability changes |
| `test_ghl_webhook` | Authorized administrator webhook test |
| `stripe_checkout`, `stripe_portal` | Authorized billing session dispatch |
| `paragon_residence` | Administrator residence-review mutation |
| Operator provisioning | Roster provisioning, deactivation, protected authority, tenant/vendor profile/settings, vendor eligibility and contact reassignment; SQL triggers also cover direct service-operator changes |
| `operator_operational_profile` | Numeric retention periods, approved-override count, feature switches and alert thresholds applied by the provisioning command; reasons and credentials are excluded |

The handler-enumeration regression requires both the shared request boundary and mutation/dispatch boundary for every classified administrator handler, and rejects newly introduced unclassified guarded mutations. Roster provisioning/deactivation batches record the active roster UUIDs and counts before and after in one transaction. Direct operator changes are also audited transactionally by SQL triggers. Administrator records use `evidenceAuditYears` in the retention inventory (default **10 calendar years**), with the same hold and guarded override behavior as evidence auditing.

## Alert evaluation and delivery

The integrations worker's production scheduler invokes the evaluator independently of optional vendor delivery switches, every **60 seconds** by default. `alertPolicy.js` names all thresholds; `DEPLOYMENT_PROFILE_JSON.alerting.thresholds` overrides them. Evaluation uses a **900-second** event window. Delivery failures retry no more often than **300 seconds**. SQL serializes transitions, deduplicates active conditions, records raised/cleared history, and leases delivery. Successful channels are remembered so a failed second channel does not resend the first. Both channels use a stable event idempotency key. An unchanged active condition creates no new alert; a clear condition creates one recovery notice.

| Rule | Pilot default |
|---|---|
| `queue_depth` | 50 outstanding jobs in one queue |
| `queue_age` | Oldest outstanding job at least 300 seconds |
| `exhausted_jobs` | 1 terminal failed job |
| `lease_conflicts` | 3 lease refusals/conflicts within the event window |
| `audit_failures` | 1 evidence/admin audit boundary failure |
| `subject_denials` | 5 denials/failed verifications for one verified subject within the window |
| `rate_rejections` | 20 admission rejections within the window |
| `provider_error_rate` | At least 20% failures with at least 5 measured requests |
| `paid_budget` | 80% of a configured deployment daily paid-request budget or the existing scoring reservation cap; does not estimate new prices or raise caps |
| `purge_failures` | 1 failed purge run within the window |
| `routing_anomalies` | 1 sweep/routing anomaly, stale phone-session expiry or flagged false overflow |
| `secret_review` | Active secret exception within 14 days of its unchanged **2026-12-15** review date, including overdue dates |

Queues cover integration delivery, post-call jobs/requests, scoring, recording ingestion, Conversely, IX, GHL, manual transcript gap fill and residence jobs. Operational aggregation projects identifiers/counters/status only; protected evidence is never returned to the evaluator. The review-date regression binds the worker's metadata to the exact unchanged active secret exception. Alert history is readable by protected admins and service operators.

Email and webhook delivery are both off by default. To connect email in a future authorized environment, configure the existing profile `email` section (`from`, `replyTo`, `recipients`, `endpoint`), allowlist its destination host, provide the existing server-only `RESEND_API_KEY`, set `OPERATIONAL_EMAIL_ENABLED=true`, and set `alerting.email=true`. Either missing switch prevents sending. No recipient or credential enters alert content.

For a paging tool, configure a server-held webhook independently:

```json
{"alerting":{"email":false,"webhook":{"url":"https://paging.example/ingest","secret":"REPLACE_WITH_A_SERVER_ONLY_RANDOM_SIGNING_SECRET"},"thresholds":{"queueDepth":50,"queueAgeSeconds":300}}}
```

Add `paging.example` to `allowedHosts`. A configured webhook requires a signing secret of at least 32 characters. It uses the existing allowlist, HTTPS/public-DNS pinning, bounded timeout, and no redirects. The receiver verifies `X-Alert-Signature: sha256=<hex HMAC-SHA256>` over `X-Alert-Timestamp + '.' + raw_body`, using the configured secret, and enforces timestamp freshness and idempotency using the alert ID. The payload contains only alert ID, rule, raised/cleared state, count and threshold. URLs and signing material never appear in logs. Removing webhook configuration disables it. Transitions evaluated while delivery is disabled remain reviewable and are not replayed as new alerts merely because delivery is later enabled.

## Operator status

`GET /api/deployment-status` and the existing status page require authentication and protected admin authority. The response is explicitly projected to queue depths/oldest ages, failed-job count, active-alert count, each recorded scheduled-job success time, last completed purge dry-run counts, and feature-switch booleans. It includes no roster, agent names, contacts, transcripts, recipients, destinations, credentials or subject hashes. The page reuses existing classes and styling; `styles.css` is unchanged. Never-run jobs have a null successful timestamp. A completed scheduling invocation does not imply every queued item was delivered.

## Local verification and limits

Final counts and the 10-step verification result are recorded below before commit. Baseline: **1,411 root tests** and **329 telephony tests**. The initial restricted telephony run hit sandbox listener denials; subsequent synthetic runs have localhost permission and retain the external-network fence.

Not verified locally: hosted migration/PostgREST/RLS behavior, real identity-provider claims, email receipt, a real paging-tool receiver, real provider failure rates, deployment log ingestion/retention, remote DNS behavior, native PostgreSQL process contention/crashes, or browser acceptance against hosted infrastructure. No rollout occurred. The evaluator cannot page about its own stopped process or a total database outage without an independently configured hosting monitor. That external monitor and routing-flag correctness remain operator acceptance items. Existing pilot reports' provider/platform/retention storage limitations remain in force; the active secret exception is neither changed nor marked rotated.


## Final validation

| Check | Result |
|---|---|
| Root tests | **1,481 passed**, zero failures/skips; baseline 1,411 (+70). |
| Telephony tests and independent import boundary | **329 passed**, zero failures/skips; baseline 329. |
| `npm run verify` | **PASS, 10/10**, on the final implementation before commit. |
| Fresh install, catalog snapshot and access matrix | Passed against synthetic in-process databases; separate bootstrap step passed all nine tests. |
| Environment-free build, built headers and language-model types | Passed. Browser carrier aliases and feature parsing remain pure; server logging stays out of browser bundles. |
| ESLint | Passed, with only the three existing React hook warnings. |
| Root and telephony npm audits | Zero vulnerabilities at every severity; registry audit requests were the only authorized external traffic. |
| Agency and tracked secret scans | Passed, zero findings; the same active exception and December 15 review deadline remain. |
| Scope | `pilot/release`; no push/deploy, real environment changes, dependency changes, `styles.css` changes, historical migration edits or active-exception edits. |

The new migration, its verbatim bootstrap entry, the bootstrap seal's narrow grants, checksums, routine inventory and regenerated catalog snapshot are included together. Private administrator permits are excluded from the retention inventory, and the real retention suite still passes without relaxing its storage, hold, expiry or rollback checks.
