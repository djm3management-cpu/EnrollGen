# SOC 2 recovery drill, staff access review and recording deletion

Work is local on `pilot/release`, starting at `48a2bc2`. No push, deployment, hosted database, real third-party API, real data deletion, new dependency, third-party vendoring, historical migration edit, stylesheet edit or real environment-file edit. Only npm vulnerability audits may contact `registry.npmjs.org`. The active secret exception and its December 15 review date remain unchanged.

## Backup, restore and recovery targets

The operator wrappers require explicit arguments and accept **localhost only**. They never load an environment file, inherit database credentials, print connection strings, print rows, or forward PostgreSQL diagnostics. Missing/unknown arguments fail closed. Backup refuses an existing output path and creates its archive with mode 0600. Restore refuses a database containing application or platform tables/views/sequences. It never drops an existing target. Prepare a separate empty local database and the required cluster roles, compatible PostgreSQL binaries and extensions first. The native restore is one transaction and stops at the first error. Backup and restore append recovery administrator actions through the common helper; the database must be a provisioned deployment at migration 162. A native restore commits before its new audit event can be inserted: an audit failure returns failure and leaves the restored target intact for operator investigation rather than retrying destructively.

```sh
npm run recovery:backup -- --connection "$LOCAL_SOURCE_DB_URL" --file /private/tmp/pilot-backup.dump
npm run recovery:restore -- --connection "$EMPTY_LOCAL_TARGET_DB_URL" --file /private/tmp/pilot-backup.dump
npm run recovery:drill
```

`pg_dump`/`pg_restore` must be installed by the operator; these commands add no npm packages. The native archive includes database schema and logical data, including any database-managed secrets available to its privileged operator. Treat it as sensitive: encrypt it with the organization's approved backup tooling, restrict access, transfer to independently protected backup storage, set expiry, and test recovery. Keep encryption-key escrow, platform master keys, Vault/pgsodium configuration, database roles, reviewed deployment profile, environment configuration and identity-provider configuration in the separate approved secret/configuration recovery process. A database archive alone does not establish recoverability of a real hosted Vault. Never print or attach such material to a drill report.

The offline drill uses PGlite's existing PostgreSQL 18 harness and platform stand-ins. It constructs the source from the checksummed fresh-install bootstrap, provisions all twelve synthetic staff, and loads contacts/encrypted identifiers, calls, transcripts, intakes, messages, recordings, operational events, evidence audit, administrator audit, holds and alert history, alongside installed reference seeds. It takes a **logical** in-memory archive of every application/private table, storage metadata, sequence positions and the synthetic key stand-in; then bootstraps a second empty instance and restores it. Row JSON remains text during archival so large PostgreSQL numbers are not rounded by JavaScript. Synthetic keys and rows never leave memory. It does not claim to run native `pg_dump`, recreate hosted platform internals, or measure storage-object recovery.

Verification checks the source and restored catalogs against the committed snapshot, per-table counts and SHA-256 content checksums, sequence values/called state, same-material ciphertext decryption, RLS/policies, grants/default privileges and functional UPDATE/DELETE rejection by **both** audit guards as database owner. Catalog comparison also captures trigger enablement. Tests deliberately remove a row, change content, drop a policy, revoke a grant, disable each guard and corrupt ciphertext. Each relevant check fails. A service recovery action is written through the common administrator helper after verification; its UUID is included in the dated, count-only result file under `docs/pilot-recovery-drill-*.json`.

Owner-editable proposed targets are in `config/recovery-targets.json`: **RPO 24 hours**, **RTO 240 minutes**, accountable owner placeholder awaiting replacement. These are proposed operating targets, not a measured service commitment. The measured local cycle is recorded below. **Real recovery targets depend on the hosting plan's backup features**, backup frequency/PITR coverage, secret escrow, database size, object versioning and restore throughput, provider/identity configuration and operator response time. The owner must approve the plan, replace the owner field, measure a representative full recovery and schedule at least quarterly drills and a drill after material platform/key/schema changes. No scheduler or backup service was activated.

## Recording object backup and reconciliation

Database backups include recording references and storage metadata, **not recording bytes**, message attachments, generated exports or the provider's own copies. The operator must supply a separately protected, versioned object backup for the correct private bucket, with checksums, object versions, retention/hold coverage, region/access controls and a manifest tied to the database backup cutoff. Pause writers or use a documented snapshot/version cutoff to prevent database/object skew. Retain versions through the recovery window; prevent a purge from destroying the only recoverable backup version. Restore into a private isolated bucket, preserve exact keys and validate sizes/hashes before releasing any playback capabilities. Provider-copy recovery/retention is a separate contract and is never assumed to substitute for owned storage backup.

A read-only consistency check consumes an explicit local database connection and an **offline read-only JSON array of object keys for the call-recordings bucket**. It does not connect to an object service or change either source. The operator supplies the inventory from an authorized read-only listing of the exact bucket and cutoff. The report is a new 0600 file; logs contain mismatch counts only.

```sh
npm run recovery:storage-check -- --connection "$LOCAL_RESTORED_DB_URL" \
  --objects /private/tmp/call-recordings-inventory.json --file /private/tmp/storage-mismatches.json
```

It compares recording ledger and legacy call/inbound references with the inventory and lists row UUIDs with missing objects and orphan keys with no reference. Investigate both directions; do not automatically delete orphans. A held-missing tombstone is an expected missing-object finding requiring investigation, not permission to erase evidence. This script covers the recording bucket; separately reconcile attachments/derived artifacts before declaring a complete deployment restored.

## Staff access review

Protected database administrators use **Agency Settings → Staff access review → Generate review**, then inspect staff and exceptions, export **CSV** or the **Printable page**, and choose **I attest this access review is complete**. The page reuses the existing Settings classes; the same unchanged `src/styles.css` is emitted as `/styles.css` for printable exports. Printing works through the browser's Print command. Export links retain the exact stored review ID being signed off.

The API equivalents use the existing verified Clerk request authentication:

- `GET /api/access-review?format=json`, `format=csv` or `format=html` creates and logs a review.
- Add `reviewId=<UUID>` to export that stored report again; exports are also logged.
- `POST /api/access-review` with `{"action":"signoff","attest":true,"reviewId":"<UUID>"}` signs off once. The server uses the stored exception count, verified reviewer and server time; a repeat sign-off does not add another sign-off event.

Review **every 90 days**, after staffing/authority changes and before pilot approval. Investigate every exception, remove unnecessary authority through the existing audited provisioning process, regenerate after remediation, and retain the signed report with the review evidence. `ACCESS_REVIEW_MAX_ADMINS` is server-only, defaults to 3, and accepts integer values 1–100; `.env.example` documents it. An invalid threshold fails report generation.

Reports list each roster/enrolled identity (including inactive and unmatched identities), roster UUID, display name where recorded, subject binding, active status, roster/enrolled role, separately protected authority, manager team UUIDs, provisioning time, last recorded staff activity and last access change recoverable from `admin_action_log`. Activity comes from staff actor audit events or hashed operational subject events; **there is no invented Clerk last-sign-in timestamp** and no external identity lookup. Null means not recorded. Batch provisioning records identify affected roster UUIDs; new direct authority-change audit records resolve the subject's roster UUID. Historical events that did not record enough identity detail cannot be reconstructed.

Exceptions are inactive identities retaining protected authority, active identities with no recorded activity in 90 days (including unknown activity), excess administrators, authority without a roster row and duplicate subject bindings. Service sections name Netlify functions, telephony, integrations and operators using the privileged database role, required core platform services and feature-switched outside services. Switch state is configuration evidence, not proof of provider-account access or successful connectivity. No consumer name, phone, identifier, transcript, intake, protected field or provider payload enters the report. CSV cells escape quotes and neutralize spreadsheet formulas. Protected SQL rechecks prevent non-admin, foreign and browser-role report/sign-off access; browser identity-provider admin claims alone are insufficient.

## Crash-safe recording deletion

Migration **162_recovery_access_recording_purge.sql** is new, copied verbatim into the bootstrap with regenerated checksums, routine inventory and catalog. Earlier migrations and the ordinary audit append-only boundaries remain intact.

The existing expiry/classification/reference/hold planner and session advisory lock remain the eligibility boundary. Dry run remains the default. `--delete` **and** exact `RETENTION_PURGE_ENABLED=true` are both required. HTTP recording objects now use three phases:

1. Under `retention_lock_batch()` in one transaction, re-plan expiry, holds and in-period references, require a settled stored copy, mark `deletion_pending_at`, revoke ingestion leases, invalidate existing media/export ticket expiry, upsert the one `retention_recording_purges` receipt and log `recording_purge_pending` through the shared admin helper. Commit before touching bytes.
2. Lock and re-plan again. Check object existence; delete bytes if present, treating 404 as success. Commit `object_deleted_at` in the receipt. The bounded object call occurs while the existing locks exclude concurrent holds. The HTTP operation is idempotent; it is not represented as a shared object/database transaction.
3. Lock and re-plan once more. Clear stale legacy recording references, delete the ledger row, finalize the same receipt and log `recording_purge_complete` in one transaction.

Pending rows are omitted from listings and public availability, denied by fresh media/export grants and rechecked on redemption of already-issued capabilities, including provider fallback. SQL rejects new tickets for a pending identity/path/SID. New ingestion claims exclude pending rows. Delayed ingestion callbacks cannot recreate completed purges, and pending rows cannot change storage paths/copy status. Preexisting directly minted storage URLs or already-streaming responses cannot be recalled by PostgreSQL; the application serves its own revocable capabilities, and any separately distributed storage URLs need expiry/rotation handling by the operator.

If interrupted after marking, the next enabled deletion run resumes the receipt. If interrupted after HTTP removal but before the database checkpoint, existence returns false and recovery continues. If interrupted after final commit, the row is absent and the unique recording UUID receipt remains complete. A database failure after bytes disappear leaves the pending row and receipt for retry; bytes are never claimed rolled back. Pending rows over **one hour** feed the existing `purge_failures` alert independently of a new purge run; failed runs also retain their existing failure-count alerting. The injected worker API additionally accepts `pendingThresholdSeconds` for local jobs; the SQL monitor's operational threshold is one hour.

If a hold arrives between committed phases and bytes still exist, clear the pending timestamp, mark the receipt cancelled and log cancellation without deleting bytes. Existing capabilities stay expired; newly authorized ones can be minted. If bytes are already gone, mark the receipt `held_missing`, record the missing-object fact in its timestamp and administrator log, and retain a pending tombstone until the hold is released. Release permits the next re-planned run to finish the same receipt. Reference changes that make a pending row ineligible are handled conservatively in the same way. Holds and database finalization serialize on the existing locks. Internal purge receipts retain provenance without recursively creating a new retention obligation for their own target.

The existing same-database transactional adapter remains supported for synthetic bytes and other artifacts; it still passes its original success/rollback tests. Unknown external artifacts remain blocked. Provider-copy deletion remains behind its original independent opt-in; retention never calls Twilio deletion.

For a disposable local Supabase object service, supply both explicit storage arguments (no environment file is loaded):

```sh
RETENTION_PURGE_ENABLED=true node scripts/retention/run.mjs \
  --connection "$LOCAL_RETENTION_DB_URL" --delete \
  --storage-url http://127.0.0.1:54321 --storage-key-file /private/tmp/local-service-key
```

Both database and storage arguments reject remote hosts. The key file is operator-provided and never logged. Each HTTP request has a 15-second bound. Trusted callers can inject `recordingObjectStore(client)` into `runRetention`; without an explicit adapter, external objects remain preserved and failure-counted. No real object service was called here. Large database scans/table-lock duration and concurrent native PostgreSQL operations require representative local performance/crash testing before scheduling an authorized deployment job.

## Session evidence and remaining acceptance

Baseline root tests: **1,481 passed**. Baseline telephony tests: **329 passed**, confirmed against the unchanged HEAD source archive with the network fence. Initial restricted checks encountered localhost-listener and npm DNS sandbox restrictions; authorized reruns retain the synthetic external-network fence.

The final dated [drill result](pilot-recovery-drill-2026-11-16T00-03-34-111Z.json) records **PASS, 382/382 checks**, 28.345 seconds, **3,206,417 bytes**, **185 tables / 1,255 rows**, from `2026-11-16T00:03:34.111Z` to `2026-11-16T00:04:02.455Z` (UTC; November 15 locally). Its administrator action UUID is `ff45cac1-9bad-439d-83f0-c392ed75d666`. The drill's source is synthetic and disposed after the run; the result file preserves the durable local evidence. Native operator backup/restore actions are logged in their provisioned source/target database.

| Recovery target (owner-editable) | Proposed value | Measured local evidence |
|---|---:|---|
| RPO | 24 hours | Synthetic offline drill cannot measure backup-service RPO; local whole-cycle duration was 28.345 seconds. |
| RTO | 240 minutes | 28.345 seconds for this small synthetic whole cycle, including source build, backup, restore, verification and disposal; native/full-size recovery remains unmeasured. |

| Final check | Result |
|---|---|
| Root suite | **1,504 passed**, zero failures/cancellations/skips; baseline 1,481 (+23). |
| Telephony and independent import boundary | **331 passed**, zero failures/cancellations/skips; baseline 329 (+2). |
| `npm run verify` | **PASS, 10/10 steps** before commit on staged source. |
| Fresh bootstrap/catalog and access matrix | Passed, including the separate nine-test bootstrap check. |
| Lint, language-model types, environment-free build and built headers | Passed; only the three preexisting React hook warnings remain. |
| Root and telephony npm audits | Zero vulnerabilities at all severities. Only `registry.npmjs.org` was contacted. |
| Agency/secret scans | Zero findings; the same single active secret exception remains. A negative-test connection marker is assembled at runtime rather than committed as a literal password-bearing URI. |
| Focused recovery/access/evidence/UI checks | 78 passed; after the URI fixture-only correction, its refusal/redaction test was rerun separately. |
| Scope/diff | `pilot/release`; no push/deploy, historical migration/real environment/style/dependency/active-exception edit. `.env.example` adds the server-only admin-count setting. |


Unverified locally: native PostgreSQL binaries and `pg_dump`/`pg_restore` execution (not installed); Docker/local Supabase HTTP storage, hosted Vault/pgsodium and master-key recovery; hosted identity/PostgREST/Realtime/storage signing; backup-service/PITR behavior and hosting-plan guarantees; provider-account privileges, real recording copies or third-party delivery; real object versions/full-size recovery throughput; operating-system process crashes and multi-connection lock contention; hosted browser acceptance and log/backup retention. The in-process drill verifies actual PostgreSQL DDL, roles, RLS, grants, encryption, triggers, constraints and application routines with the earlier report's documented platform stand-ins. It is not full production disaster-recovery acceptance. No rollout or provider/platform acceptance gate is marked complete by this work.
