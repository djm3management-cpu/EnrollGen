# SOC 2 readiness: retention, deletion and legal holds

Local work on `pilot/release`, starting at `705ec98`. No push, deploy, hosted database, real provider request, real data deletion, dependency addition, vendoring, stylesheet change, historical migration edit, or real environment-file edit. `.env.example` adds only the default-off retention switch. The active secret exception and its December 15 review deadline are unchanged.

**Recording deletion is deliberately blocked for the existing HTTP object store.** PostgreSQL and the existing Supabase Storage HTTP remove operation cannot commit atomically. The job reports `atomic_storage_unavailable` and preserves both object and row. Tests prove atomic success and rollback using synthetic bytes in the *same PostgreSQL transaction*. No ordinary HTTP callback is accepted as an atomic adapter. This closes the unsafe partial-deletion path, but complete recording cleanup is an outstanding implementation/owner gate; enabling the switch alone cannot remove those recordings. Twilio copy deletion retains its existing independent opt-in and is untouched.

## Schedule and sources

The controlling source for the numbers is the owner's retention schedule in this work item. The compliance floors below are enforced as deployment policy, rather than claiming SOC 2 itself mandates these numbers. Regulatory references already present in the repository include `src/compliance/rules/cmsBasis.js` (42 CFR 422.2274(g)(2)(ii), scope rules and CMS enrollment guidance). No external legal source was fetched under the local-only restriction. The owner must confirm current federal, state, carrier and contract applicability before activation, especially the reduced non-enrollment rule.

| Data class | Default / profile field | Starts at | Rule or business choice; source |
|---|---|---|---|
| Enrollment-call recordings | 10 calendar years; `enrollmentRecordingYears` | Immutable call date | Requested compliance floor; CMS enrollment-record guidance is the regulatory reference for owner review. |
| Enrollment-call transcripts | 10 calendar years; `enrollmentTranscriptYears` | Immutable call date | Requested compliance floor; same enrollment evidence policy. |
| Medicare sales/marketing audio without enrollment | 10 calendar years; `marketingRecordingYears` | Immutable call date | Conservative business choice above the optional reduced federal schedule supplied in this item. |
| Medicare sales/marketing transcripts without enrollment | 10 calendar years; `marketingTranscriptYears` | Immutable call date | Conservative business choice; same source. |
| Optional reduced MA/Part D non-enrollment schedule | Explicit `reducedMarketingRule:true` defaults audio to 3 years, transcripts to 6 years total | Immutable call date | Reduced federal rule supplied in this item; 42 CFR 422.2274 / 423.2274 are the applicability references. Audio remains until a complete, retained transcript is certified by a protected admin. Transcripts remain through years 4–6. Unknown product/content and other product lines never use this reduction. |
| Scope of Appointment | 10 years; `scopeOfAppointmentYears` | Immutable call anchor for the stored SOA evidence | Requested compliance floor; CMS SOA recordkeeping guidance is the source for owner review. A service label cannot shorten a call containing SOA evidence. |
| Enrollment intakes, confirmations, policies and enrollment-related compliance scores | 10 years; `enrollmentYears`, with call evidence using its enrollment fields | Immutable submission/creation anchor, or immutable call date for call-linked scores | Requested compliance floor; CMS enrollment evidence/recordkeeping policy. Enrollment intake/confirmation/sale signals make linked call evidence enrollment evidence. |
| Evidence access trail, PII access log and session lock events | 10 years; `evidenceAuditYears` | Server-stored event time | Business choice in this item: evidence about evidence. Session locks are the existing `telephony_events` rows, not a new event sink. |
| Explicit general/customer service calls without enrollment, sales, SOA or retained consent content | 2 years; `serviceCallYears` | Immutable call date | Business choice in this item. Unknown classifications conservatively retain 10 years. |
| Text messages and associated media / consent evidence | 5 years; `textConsentYears` | Immutable creation anchor | Business choice in this item, not a claim of one universal consent-retention law. PTC/consent-bearing call evidence gets at least five years, even on a service call. Consent embedded in longer-lived enrollment/SOA/contact evidence follows that longer record. Contacts are never purged. |
| Operational event, routing, replay, admission, job and delivery ledgers | 90 days; `operationalDays` | Immutable original event/creation anchor | Business choice in this item. Incoming references from retained evidence/enrollment extend retention transitively. Active legal holds override expiry. |
| Contacts | Never automatically deleted; review after 10 inactive years; `contactReviewYears` | Server-maintained last activity plus linked activity times | Business choice in this item. The job flags `retention_review_due`; it never deletes contacts. |

Calendar years use UTC anniversaries (February 29 becomes February 28); operational days are 24-hour days. A record is eligible only strictly **after** its anniversary/cutoff. Exactly-at-cutoff records remain. `recording_ingestion.retention_until` can extend, never shorten, a computed period.

`DEPLOYMENT_PROFILE_JSON.retention` is validated by the existing shared startup/build parser in Netlify, telephony, the integrations worker and Vite. Missing fields take the conservative defaults in `telephony/src/lib/retentionPolicy.js`; the complete example is in `config/deployment-profile.example.json`. The schedule and override reasons never enter the public profile projection. Unknown fields, non-integers, invalid booleans and unreasonable bounds fail. A period below its policy minimum fails unless the *same field* has an explicit override:

```json
{"retention":{"enrollmentYears":9,"overrides":{"enrollmentYears":{"approved":true,"reason":"Owner-approved documented exception with applicable basis"}}}}
```

This is configuration syntax, not a recommendation to shorten a compliance period. Minimum defaults apply even to the business-choice periods unless a reasoned override exists. Reduced marketing is its own explicit opt-in, with 3/6-year floors; an unreasoned 6-year setting on the ordinary default schedule fails.

## Immutable dates and inventory

New migration **160_retention_and_holds.sql** adds server-created `retention_started_at` anchors to the explicit policy inventory in `scripts/retention/inventory.js`. Backfill copies the original stored date with existing user-trigger states preserved transactionally; it deletes no data. Insert triggers capture the server source date, browser-created records use server time, and update triggers reject anchor changes even from service code. Browser roles have no column grant or content-RPC field for these anchors, complaints, certification or review/activity metadata. Existing audit `occurred_at` stays behind its append-only boundary.

Calls (including inbound timeline rows) and their derivative transcripts/scores use the immutable call anchor. Stored enrollment/marketing markers are monotonic, so browser disposition corrections cannot erase an established longer retention class. The planner recognizes declared foreign keys plus soft UUID, hashed identifier, grant, provider SID, object path and JSON references; references are followed transitively. Unknown/unclassified tables are retained and act as reference roots. Persistent settings/roster/reference datasets, CRM free-text/archives and hold history without an approved class are not silently assigned a deletion period. Their dependencies can keep classified records longer. The owner must inventory any additional legacy JSON relationship before allowing deletion; absence of a foreign key is not proof that no relationship exists.

The current planner reads a deployment snapshot into trusted server memory and locks public tables for each batch; it emits no row contents. This is conservative and has not been load-tested on a large database. An owner must approve an operating window and measure scan memory/lock time on a disposable local dataset before scheduling it.

## Holds and complaints

`POST /api/retention-holds` (and the direct function URL) requires authenticated active membership and **protected database admin authority**, then invokes service-only routines that resolve that subject and organization again. Body tenant/actor/admin fields confer no authority. Ordinary, foreign, inactive and browser database callers cannot place or release holds. A hold target must be a same-tenant contact, call or enrolled agent UUID. Reasons are required, bounded to 1,000 characters, and should describe the administrative basis without beneficiary content.

Supported bodies:

```json
{"action":"create","targetType":"contact","targetId":"<contact UUID>","reason":"Administrative basis"}
{"action":"release","holdId":"<hold UUID>","reason":"Release basis"}
{"action":"flag_complaint","contactId":"<contact UUID>","reason":"Complaint review required"}
{"action":"resolve_complaint","contactId":"<contact UUID>","reason":"Resolution basis"}
```

Contact/call/agent holds propagate over linked evidence. Agent identity aliases come from protected enrolled/roster/subject mappings, including actors on session-lock events. A linked component is retained while held, regardless of age. This can conservatively retain other records on the same contact. Released holds remain as history. Both create and release append `hold_create` / `hold_release` trail events with verified actor, hold UUID and reason in the same transaction; trail failure rolls the action back. Releasing a hold twice adds no duplicate release.

Setting the server-owned `contacts.complaint_open` flag creates one automatic complaint hold transactionally. Changing ordinary contact status does not clear it. Only `retention_resolve_complaint` can clear the flag and release the complaint hold, with protected admin authority and an audited reason. An ordinary hold-release request cannot release a complaint hold. Other manual holds remain active after complaint resolution.

For a future reduced-rule rollout, the protected service-only `retention_certify_transcript(actor,org,transcript,reason)` routine records an admin's completeness certification for a nonempty transcript on an ended call. It appends a `retention_certify` trail event. Editing transcript text invalidates certification. The job retains audio if its replacement transcript is absent, uncertified, empty or no longer in period while the six-year transcript obligation is still active. Once that obligation itself expires, a missing transcript does not indefinitely block otherwise eligible audio. No automatic transcription/provider request is made by retention.

## Dry run and deletion

No environment file is loaded by the CLI. Supply a reviewed server profile in the process environment and an explicit disposable **localhost** PostgreSQL URL. The wrapper refuses remote hosts, URL options, fragments and unknown arguments. It selects the existing protected service role; it does not bootstrap/provision a database or start a scheduler.

```sh
node scripts/retention/run.mjs --connection "$LOCAL_RETENTION_DB_URL"
```

This records a dry run and prints only mode, counts by class, held/reference skips, review count and fixed failure counts. `--delete` with the switch unset/false is still a dry run. Merely enabling the switch also leaves invocations in dry-run mode. Both explicit controls are required:

```sh
RETENTION_PURGE_ENABLED=true node scripts/retention/run.mjs \
  --connection "$LOCAL_RETENTION_DB_URL" --delete --batch-size 100 --max-batches 10
```

The existing strict switch parser accepts only exact `true`; missing, empty and `false` are off; other values fail startup. Limits are 1–500 rows per batch and 1–100 batches per invocation. A session advisory lock prevents overlapping jobs; each batch re-reads holds, dates and references under table locks. Connected reference cycles delete in a single closed group; groups larger than the bound remain and report dependency failures. Relevant FKs remain immediately checked by default, become deferred only within the purge transaction, and validate before group success. The job never intentionally relies on a cascade into an unselected record.

Each group uses a savepoint. A storage or row failure rolls back the entire group. Successful deletions and summary checkpoints commit together, and retries select only remaining records. Stop/disconnect rolls back the active database batch; a run interrupted after earlier commits retains its checkpoint with `status=running`. `retention_runs` records start/end time, mode, selected/deleted counts by class, skipped holds/references, fixed-code failures and status, without content, paths, recipient names, exception messages or provider diagnostics. Initial counts describe the invocation's initial eligible set; `deleted` describes committed progress. A bounded invocation can leave further work for a subsequent invocation. Inspect both counts and failures; `complete` means the invocation finished, not that all stored records disappeared.

The audit remains immutable to ordinary application operations: no service/browser UPDATE, DELETE or TRUNCATE grant, and the statement guard still rejects direct mutation even by the table owner. The sole retention exception is a private transaction permit inside `retention_delete_audit`, requiring the service role, enabled strict database feature fence, expired policy period, and any required reasoned override. It refuses deletion while any active hold exists, conservatively protecting audit evidence. The permit itself has no service/browser privileges. Normal access auditing remains fail-closed.

The old one-day admission-counter sweeper is parked, and expired recording-ticket bulk cleanup is removed from recording ingestion: their retained rows now use the reviewed retention path. Expiry still denies stale capabilities. Single-use authorization-token consumption and live coordination-lease release remain authentication/routing operations, not a bulk evidence purge; no existing security expiry or Twilio provider-copy opt-in was weakened.

## Owner decisions before enabling deletion

1. Approve the schedule's product/state/carrier/contract applicability, effective dates, override reasons and whether the reduced MA/Part D rule is permitted. Certify retained transcripts before any reduced audio cutoff.
2. Resolve the **atomic storage implementation gate**. The current HTTP object store has no shared PostgreSQL transaction; it remains blocked. A later implementation must support crash-safe atomic removal of bytes and rows, or the owner must authorize a separately reviewed change to this strict atomicity requirement. A normal HTTP delete plus a database transaction is insufficient. Decide policy for attachments, inline artifact paths, derived exports, backups, restores and processor-held copies too.
3. Inventory legacy soft/JSON references and unclassified CRM/archive/configuration tables, choose any additional schedule classes, and review a count-only dry run. Investigate every failure or unexpected retained class. Confirm complaint and legal-hold ownership, review cadence and release procedure.
4. Approve the run frequency, maximum batch/group size, operating window, monitoring and recovery procedure. Benchmark snapshot memory, lock contention and resumability on a disposable local dataset. No timer is enabled by this change.
5. Review/apply migration 160 only in a separately authorized environment, with backup/restore rehearsal and the existing platform/access acceptance gates. The fresh-install bootstrap includes its exact copy before the seal; checksums, catalog and routine/function inventory are regenerated in-process. No hosted migration or actual storage acceptance was performed here.

## Local evidence

Baseline: **1,373 root / 329 telephony tests**, all passing. Synthetic-only retention tests exercise every cutoff, reduced-rule transcript protection, enrollment/SOA precedence, immutable anchors, foreign tenants, holds and complaints, live audit references, strict profile/switch validation, default dry runs, exact enabled deletion, cyclic references, idempotence, transactional object success, storage-failure rollback, database-delete rollback, and scoped audit deletion versus direct mutation denial. Existing fresh-install/catalog, access matrix and upload/feature safeguards remain in the complete verification run.

Final validation on the staged implementation:

| Check | Result |
|---|---|
| Full root suite | **1,411 passed**, zero failures/skips; baseline 1,373 (+38). |
| Telephony suite and import boundaries | **329 passed**, zero failures/skips; baseline 329. |
| Retention acceptance cases | **37 passed**, including exact reduced 3/6-year boundaries and actual contact-review flag persistence. |
| Fresh bootstrap and complete catalog | **9 passed**, including two independent empty builds, original migration comparisons, protected provisioning/intake and upload behavior. |
| `npm run verify` | **PASS, 10/10 steps** on the complete implementation before commit. |
| ESLint / LLM types / environment-free build and built headers | Passed; only the three existing React hook warnings. |
| Root and telephony npm audits, including development dependencies | Zero vulnerabilities in both. Registry audit requests were the only permitted external traffic. |
| Agency and tracked secret scans | Passed, zero findings; the same active secret exception warning and deadline remain. |
| Diff / scope checks | Passed; no historical migration, real environment file, stylesheet, dependency manifest/lockfile or active secret exception changed. Branch remains `pilot/release`. |

Hosted identity/storage/Vault/PostgREST behavior, real provider copies and native PostgreSQL contention/crash behavior were not exercised. The current HTTP recording-store deletion path is **intentionally unavailable**, rather than claimed verified: a transaction-capable storage implementation is still required for complete recording cleanup. All deletions performed by tests were synthetic, in-process database data and synthetic object bytes. No push or deployment occurred.
