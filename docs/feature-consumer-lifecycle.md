# Consumer lifecycle file

Local feature on `pilot/release`, after `3b3de69`. Default off. No push, deploy, hosted database, real third-party API, new dependency, vendoring, historical migration edit, real environment-file edit, stylesheet change, or active-secret-exception change. Migration **163_consumer_lifecycle.sql** is new; its exact bootstrap copy, manifest checksums, catalog and operator routine inventory are regenerated using the existing in-process PostgreSQL harness.

## Events and source records

The server assembles events at read time. There is no stored lifecycle snapshot or protected-content replica. Summaries are fixed phrases. Message bodies, contact names, numbers, DOB, Medicare/SSN fields, transcript text, free-text notes/reasons, provider diagnostics, encrypted fields, storage paths and capabilities are excluded from the projection. Existing text redaction additionally protects attribution, plan and confirmation fields. Opaque UUIDs and checksums retain their exact values. Staff identifiers are the recorded enrolled/roster UUID, slug or verified subject; absent authors remain absent.

| Event type | Existing source tables and fields |
|---|---|
| `arrival` | `contacts.created_at,source`; first known contact is the earliest linked call, inbound call or message time, rather than the most recent connection. |
| `attribution` | `contact_lead_intel.received_at,vendor_source`; `call_records.lead_source` and the explicit vendor/campaign metadata keys; `inbound_calls` joined to same-tenant `lead_sources` for source/vendor names and explicit campaign keys. No whole vendor payload is returned. |
| `consent` | `call_records.ptc_on_file,ptc_date,ptc_expiry`; the recorded PTC/consent source or lead source, falling back to the source table. An undated true flag is shown at the source row time with unknown status and cannot establish prior consent. |
| `soa` | `call_records.soa_on_file,soa_date` and recorded SOA source. Undated flags remain visible with unknown status and cannot establish prior scope; no inferred agreement is invented. |
| `call` | Canonical `call_records`; unbound `inbound_calls`; unbound outbound/standalone `telephony_call_attempts`. Canonical links/provider SID suppress duplicate inbound representations. Includes direction, protected owner identifier, duration (including zero), disposition, and recording/transcript presence. |
| `message` | Each inbound/outbound `messages` row, with direction/channel/status/time/actor and `message_media` evidence identifiers. No body or attachment URL. |
| `recording` | Linked `recording_ingestion`, including immutable-copy status, availability and its stored SHA-256 when applicable. Pending deletion is unavailable. |
| `transcript` | Linked `call_transcripts`, with capture time and source identifier. Opening text uses the existing `read_evidence_call_transcripts` or `read_evidence_call_records` audited browser path. Inline call transcript presence is also reflected on the call. |
| `disclosure` | `scorecard_items`, their `scoring_template_items` and `compliance_intents` references, joined to a linked `compliance_scorecards` record. Includes disclosure/opening/scope/consent categories and CALL_OPEN/SOA/ENROLL/PECL/IMPACT rules, their recorded result and rule identifier; excludes quoted speech. |
| `review` | `compliance_scorecards` pass/fail/score; `compliance_review_decisions` decision/actor/time; legacy session `compliance_scores` numerical result. |
| `enrollment` | `enrollment_intakes` submission and current plan/carrier/effective date/confirmation; `policies`; legacy completed/written/confirmed `call_records` without a native intake. Protected intake fields are never decrypted. |
| `revision` | Native intake `updated_at` marker and applicable `admin_action_log` enrollment actions, retaining the recorded actor/time/reference. No missing historical version is fabricated. |
| `delivery` | `ghl_enrollment_deliveries`, `ix_uploads`, `conversely_submissions`, only while the corresponding existing destination switch is enabled. Current delivery status and latest upload/update time, without payloads, credentials or errors. |
| `task` / `callback` | `follow_ups` creation/update and due date; call-linked `followup_queue`; `paragon_callback_tasks` linked through the consumer's inbound call. Free-text reasons are excluded. |
| `activity` | `contact_activities` time/type/actor/reference; its unrestricted summary is excluded. |
| `opportunity` | Current `opportunities` stage/time/source, exact transitions in `opportunity_stage_history`, and `opportunity_events`. Stage identifiers come from the existing records. |
| `reassignment` | Existing `admin_action_log` contact-assignment records, including previous/next protected enrolled-agent UUIDs. |
| `hold` | Existing `retention_holds` placement and release, including contact/call/agent holds applicable to the consumer's calls. No legal basis/reason text. |
| `complaint` / `complaint_resolution` | Complaint-source `retention_holds` placement and release, using the existing complaint resolution routine's history. |
| `retention` | Existing `retention_recording_purges` receipt, plus minimal `retention_purge_items` provenance captured within the existing retention job/savepoint. |

All entries have a stable source/type key, stored time, type, nullable recorded staff identifier, short summary, status and evidence identifiers/times. Unrecognized statuses are `unknown`, not arbitrary legacy prose. Links to source metadata recheck the same lifecycle scope; transcript/audio links use the existing audited retrieval paths and retain their existing authorization. No direct storage URL is issued.

Some tables hold only the current state. A revision/update marker establishes that an update occurred; it cannot recover an earlier plan, consent, disposition, assignment, delivery attempt or task status that was never retained. Provider/call/session duplicate representations are not asserted to be independent calls. Unlinked rows with no trustworthy consumer relationship are excluded rather than joined by name or phone.

## Completeness

Each recorded enrollment has six checks. Labels are only **present**, **missing** or **not applicable**. They describe stored evidence, without a legal conclusion. Checks use the full authorized consumer history through that enrollment, independently of the event filter/page. Each includes the source references it relied on; recording/transcript checks additionally include per-call results.

| Check | Rule |
|---|---|
| Consent before contact | Every recorded outbound contact before the enrollment needs an earlier dated PTC record which has not expired. Inbound-only/no-outbound history is not applicable. Missing/undated permission stays missing. |
| Scope before plan discussion | Each MA/MAPD/PDP/SNP sales/enrollment call (including an unknown product conservatively) needs an earlier recorded SOA. Other product/service-only histories are not applicable. A stored date alone cannot establish ordering within the same calendar day; same-day date-only evidence stays missing. The call start is the conservative plan-discussion anchor. |
| Recording | Every sales/enrollment call needs recorded audio availability from its retained ingestion/legacy evidence. Pending deletion does not qualify. No sales/enrollment calls is not applicable. A retention marker is evidence of removal, not proof of current audio availability. |
| Transcript | Every sales/enrollment call needs a stored nonempty linked or inline transcript. No sales/enrollment calls is not applicable. Presence does not certify transcript completeness. |
| Required disclosures | Uses the existing active compliance rule catalog and product matcher, selecting TPMO, enrollment/recording consent, impact and required topic methods from the existing CMS basis. Every applicable rule on every sales/enrollment call needs a recorded pass/met or explicit not-applicable result; the latest result for that rule supersedes earlier revisions. A single passing item or overall call score cannot establish the whole set. Products with no applicable catalog rules are not applicable; absent/unscored required results are missing. |
| Confirmation | A native/legacy enrollment needs a nonempty stored confirmation. A policy-only record with no submission/confirmation contract is not applicable. |

## Access, audit and pagination

`GET /api/consumer-lifecycle?contact_id=<UUID>` and the direct function URL share one handler. Verified Clerk authentication disallows bypass. The existing `resolveCallAccessIdentity` resolves complete active deployment membership. The service-only database routine independently calls `resolve_deployment_subject`, checks the feature header, tenant and consumer assignment: own assigned slug for an agent, a member of the protected explicit `team_agent_ids` for a manager, or protected agency admin. A foreign org, unknown/unprovisioned/inactive binding or out-of-team assignment fails closed. Browser/anonymous roles cannot call the source or impersonate a service actor; the private source projection has no service EXECUTE grant either.

The lifecycle tab can read the selected consumer UUID without requiring a separately permitted contact decrypt. This lets an approved manager open the lifecycle file from an existing consumer URL while preserving the older contact-detail rules. It does not expand contact decrypt or recording/transcript authorization.

One successful HTTP read/page/source-metadata open writes exactly one `consumer_lifecycle` evidence-access event through the existing shared boundary. Nested service RPC reads share that request grant. A failed trail write returns no lifecycle data. The handler is registered in the existing administrator-handler inventory; normal logging uses the existing structured request/logger context. No parallel access/admin/logger implementation exists.

Admins receive the consumer's access history from `evidence_access_log`; other roles receive no access history. Access pages contain at most 100 rows with an opaque continuation. Trail rows are not copied to the timeline. As with existing evidence paths, prior browser-local bytes or opening a downloaded packet cannot be observed by the server.

Timeline pages default to 50 and cap at 200, ascending by stored time and stable source/type key under C collation. Opaque continuations bind consumer/type and retain the initial time cutoff. Every page reauthorizes. A type filter affects events only. This is a read-time view of mutable canonical rows, not a retained historical database snapshot; corrections can change current values. There is no offset paging or new persisted protected dataset. Large real-world query latency/concurrent writes remain an acceptance item.

## Audit packet

Admins use **Export audit packet**, or POST `{"action":"export"}` to the same consumer endpoint. Protected database admin authority is required for both the export read and stored-file manifest; an identity-provider admin claim alone is insufficient. The existing `admit`/`consume_admission` path enforces the new `lifecycleExport` route: 3/minute per subject, 30/subject UTC day, 300/deployment UTC day. Existing profile `admissionLimits.lifecycleExport` overrides retain its strict positive-integer validation. Exhaustion is 429; unavailable admission fails closed.

The installed **jsPDF** produces one PDF:

1. Cover with deployment-profile agency name, opaque consumer UUID and read cutoff.
2. Complete authorized timeline, across all event pages and types.
3. Enrollment completeness checks and their evidence/per-call results.
4. Deduplicated evidence index: source table, identifier, stored time and SHA-256 for stored files. Recording immutable-copy hashes come from `recording_ingestion`; legacy inbound/call files and stored message attachments without a ledger hash are hashed through the existing audited storage client. No paths, signed URLs, message bodies, protected identifiers, recordings or attachments are embedded.

Recording references continue to use existing audited play/download. Missing/unreadable stored files without a ledger hash fail the packet rather than invent a checksum. Non-file database evidence has `not available` for the file checksum. The packet is generated in server memory, sent with private/no-store headers, and not stored as another protected artifact. Bounds are 20,000 timeline events; hashing without a stored hash is at most 64 MiB per file/128 MiB aggregate. Exceeding bounds refuses the export without truncating it.

Before bytes are returned, the existing `logAdminDispatch` appends `consumer_lifecycle` with the verified actor and consumer UUID, and the evidence boundary appends its export event. Either log failure withholds bytes. The admin record is an authorized-generation record, not proof the recipient opened the download. No new audit sink or recording delivery capability is created.

## Retention provenance

The existing schedule, classification, holds, locks, dry-run/default-off behavior and recording three-phase deletion protocol remain authoritative. New UUID-only purge provenance is captured before any member of a deferred/cyclic group disappears, inside its existing transaction/savepoint; deletion failure rolls it back. BEFORE DELETE hooks also cover the inventoried consumer evidence tables. Receipts contain tenant/contact/source/resource/call UUIDs and database deletion time, never content. They are internal `retention_` provenance, excluded from ordinary planner roots in the same way as the existing recording purge receipts, so they cannot keep their own deleted targets alive. The recording receipt also retains its surviving consumer/call UUID and preexisting stored hash.

Historical count-only purge runs cannot identify which consumer's rows disappeared. Historical recording receipts with no surviving consumer/path association cannot be assigned to a consumer reliably. This feature does not invent that history or claim to repair an unknowable old gap. New deletions retain the required markers. Current-state source rows and existing log retention limits bound historical reconstruction.

## Outside sources

`netlify/lib/lifecycle/source.d.ts` defines `ConsumerLifecycleSource`, `LifecycleEvent` and `LifecycleEvidence`. A future adapter receives an already scoped, read-only tenant/consumer/actor context, cutoff, keyset continuation and bound; it returns the same timed, attributed, safe-summary/status/evidence shape. A future carrier integration must use its canonical ledger, existing authorization/audit/transport/switch boundaries and stable source keys. No adapter, fake carrier event, provider credential, carrier connection or carrier request is registered by this feature.

## Enablement

In a separately authorized environment, apply reviewed migration 163 (or the complete checksummed bootstrap for a fresh installation), retain the existing protected deployment/subject provisioning, and set server **`CONSUMER_LIFECYCLE_ENABLED=true`**. It uses the existing strict parser: unset/empty/`false` is off, only exact `true` enables, any other value fails configuration. The server factory supplies its own trusted database feature header; a browser cannot enable it. The public feature projection controls the tab, starts off, and does not expose configuration or credentials. With the switch off, read/export URLs return 404 before authentication/client construction and the tab/component is absent. Existing destination switches independently control delivery events.

No actual environment was edited or enabled here. `.env.example` documents the default-off server switch. No deploy or push is part of enablement in this session.

## Local validation and limits

Baseline confirmed before implementation: **1,504 root tests**, **331 telephony tests**, zero failures/skips. Synthetic tests retain the external-network fence; only localhost listeners and npm registry vulnerability audits are allowed. Final counts and the 10-step verification result are recorded below before commit.

The local suite exercises chronological heterogeneous events, safe projection, real database and endpoint access matrices, nested single-event auditing and failure refusal, product/date-aware completeness, retention markers, stable non-overlapping pages, admin-only bounded PDF/checksums/both logs, strict switch-off absence, bootstrap/catalog and the earlier access/security/retention regressions. PDFKit locally rendered the synthetic full packet for visual inspection, without adding a library.

Not verified: hosted identity/PostgREST/storage behavior, real carrier/processor delivery, production database contents or migration rollout; native PostgreSQL concurrent sessions/crash behavior and large real-history latency; browser visual acceptance in Terminal/light themes because the computer-use browser host is unavailable. The isolated synthetic UI bundle builds using the unchanged styles/theme files, with external connections blocked. Existing pilot launch, secret-rotation and provider/platform acceptance limits remain unchanged.

Final local results before commit:

| Check | Result |
|---|---|
| Root suite | **1,539 passed**, zero failures/cancellations/skips; baseline 1,504 (+35). |
| Telephony suite and independent import boundary | **331 passed**, zero failures/cancellations/skips; baseline 331. |
| `npm run verify` on final staged code | **PASS, 10/10 steps**. |
| Lifecycle acceptance tests | **30 passed**, including real scoped SQL, both audit failure paths, 2,000-message paging, historical result supersession, undated flags, timestamp offsets and stored-file manifests/hashes. |
| Final focused lifecycle/recording/retention/recovery run | **106 passed**, zero failures/skips. |
| Separate bootstrap/catalog gate | **9 passed**; earlier database access matrix remains passing in the full root suite. |
| Lint, language-model types, environment-free build and built headers | Passed; only the three preexisting React hook warnings. |
| Root and telephony npm audits | Zero vulnerabilities at every severity; only `registry.npmjs.org` audit traffic. |
| Agency/secret scans and staged diff check | Passed; zero findings, with the same one active secret exception and unchanged review date. |
| PDF/layout | Full nine-page synthetic packet rendered locally and inspected; sections, wrapping, page breaks, checksums and absence of media/protected identifiers checked. |
| Scope | `pilot/release`; no push, deploy, real environment/dependency/style/historical-migration/active-exception change. |
