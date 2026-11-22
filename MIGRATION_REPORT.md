# Live-to-fresh migration report (local rehearsal)

> **Reconciliation note, read first.** The requested split, "migrated 963,435 /
> not migrated 103,748", does **not** reconcile. 963,435 was the per-table
> balance total from `--verify`, and it omits 282 rows that were migrated: 2
> production-only scoring templates and their 280 items, inserted under Q5.
> The exact figures are **963,717 migrated + 0 rejected + 103,466 not migrated
> = 1,067,183**. Every table and every row is accounted for in §3.

Branch `feature/live-migration`. Local only: OLD is a Postgres 17 container on
127.0.0.1:55432 restored from the production dump, and NEW is a disposable local
Supabase stack on 127.0.0.1:54322 installed by `scripts/bootstrap-database.mjs`.
Nothing touched production, `main`, `release/next`, `pilot/release` or any
hosted service. Nothing was pushed or deployed. This report contains counts,
hashes, IDs and column names only: no PHI, no secrets, no connection strings.

Companion documents: [mapping](docs/migration/live-to-fresh-mapping.md), with
Phase 1 decisions Q1–Q17, and the
[tool README](scripts/migration/live-to-fresh/README.md). Private artifacts
outside the repo, in `~/enrollgen-migration/`: `old-inventory.json`,
`verify-report.json`, `app-check.json`, `migration-run.json`,
`storage-manifest.json`, `excluded/*.csv` and `actions.log`.

## 1. Outcome

| Check | Result |
|---|---|
| Rows accounted for | 1,067,183 / 1,067,183 (exact; §3) |
| Rows migrated | 963,717 |
| Rows rejected | **0** (§4) |
| `--verify` | **exit 0**: 129/129 tables balanced, 56/56 external-ID columns identical, 185/185 PII fields hash-identical (OLD key vs NEW key), 0 FK violations across 325 FKs, embeddings byte-identical, 0 missing rubric/template references |
| Idempotency (real data) | Second full pass with every cursor cleared: 0 rows inserted; 216/217 NEW tables byte-identical. The one difference (`tenants.updated_at` restored from production after provisioning had bumped it) is fixed in the tool, so one run now reaches the final state |
| App against NEW | Startup check passes; all 3 agents resolve by Clerk ID; contacts 340 = 340, call records 562 = 562, call log 612 = 612; a migrated call opens with transcript and a 143-item scorecard (§9) |
| Drift check | **exit 1**: 475 platform differences, unchanged by the data load. Cutover blockers, §2 |
| Tests | Migration 20/20; root 1,944/1,944 on rerun; telephony 790/791 on rerun (load-sensitive latency test; §10) |

## 2. Cutover blockers

These items are for a separate session against a real hosted Supabase
project. None of them is resolved here. The drift checker was not modified and
no platform-prep script was added (Q1).

### B1. Bootstrap cannot alter `storage.objects` (ownership)

`sql/m153.sql` statement 15 runs `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`.
On the Supabase Postgres 17.12 image, `storage.objects` is owned by
`supabase_storage_admin` and `postgres` is not a member of that role, so the
bootstrap fails with `42501 must be owner of table objects`. Locally, the
install only completed after one platform-prep statement run as
`supabase_admin`: `GRANT supabase_storage_admin TO postgres`. A hosted project
may not permit that grant. If it does not, the reviewed bootstrap cannot install
on hosted Supabase as written, independent of this data migration.

### B2. Drift: policy `roles` serialization (180 entries: 90 missing + 90 extra)

Every application policy shows as changed only because node-pg returns
`pg_policies.roles` (`name[]`) as the text `{authenticated}`, whereas the
PGlite baseline returned a JS array. Policy names, commands and expressions are
unchanged. This will happen on any real Postgres, so the checker or the
baseline needs a reviewed normalization before the drift gate can ever exit 0.

### B3. Drift: `service_role` EXECUTE on 103 routines (206 entries)

Supabase's default privileges for `postgres` in `public` grant EXECUTE to
`service_role` on every function created. The expected catalog has none of
those grants. Browser roles are unaffected: across all routines, 0
`anon`/`authenticated` grants were widened and 0 were narrowed. `service_role`
is the server key (BYPASSRLS), but this still departs from the sealed design.

### B4. Drift: browser grants on `storage.objects` / `storage.buckets` survive the seal (58 extra + 21 missing)

m153's `REVOKE ALL ... FROM PUBLIC, anon, authenticated` runs as `postgres`, but
the platform grants were made by `supabase_storage_admin`, so the revoke is a
no-op. `anon` and `authenticated` keep SELECT/INSERT/UPDATE/DELETE table grants
on both storage tables; 28 grants show a different grantor. RLS stays enabled,
so access is policy-limited, but the "closed" storage boundary the expected
catalog records is **not** what the platform ends up with. This is
security-relevant.

### B5. Drift: `pii_vault.encryption_keys` lacks the expected `service_role` grants (7)

This is tighter than expected: Supabase sets no global default privileges for
`postgres`. The security-definer PII functions do not need these grants.
Confirm the expectation, not the grant.

### B6. Drift: default privileges and schema USAGE (10 entries)

Platform default-ACL rows (`supabase_admin`-owned defaults in `public`,
per-schema rather than global `postgres` defaults) and a `postgres=U` entry on
`public`. Review them against "close default privileges for every application
owner" in P0-4.

### B7. `session_replication_role` on hosted Supabase

The load runs inside `SET LOCAL session_replication_role = replica`, which
disables user triggers and FK triggers, and then re-derives and re-verifies
everything those triggers would have done (§6). The local `postgres` role is
allowed to set it. **Hosted support for the migration role must be confirmed in
the hosted rehearsal.** Without it, see B8: a normal-mode load loses rows.

### B8. Feature-gate trigger: the load must not run with triggers enabled (requirement)

`fence_deployment_queue` is a BEFORE INSERT OR UPDATE trigger on 23 NEW
tables. It returns NULL whenever the gating feature flag is off, which
**silently discards the row with no error**. All flags are off at install (P0-6),
so a normal-mode insert of history into these tables succeeds while storing
nothing. In this data, 2,253 OLD rows in 13 tables would have vanished:

| Table | Gating flag | OLD rows |
|---|---|---:|
| `paragon_billing_events` | `PARAGON_ENABLED` | 1,591 |
| `paragon_call_billing` | `PARAGON_ENABLED` | 337 |
| `scoring_jobs` | `SCORING_ENABLED` | 100 |
| `paragon_residence_jobs` | `PARAGON_ENABLED` | 75 |
| `paragon_report_email_log` | `PARAGON_ENABLED` | 53 |
| `paragon_report_email_days` | `PARAGON_ENABLED` | 52 |
| `integration_deliveries` | `PARAGON_ENABLED` | 24 |
| `ghl_enrollment_deliveries` | `GHL_ENABLED` | 11 |
| `transcript_recovery_alerts` | `OPERATIONAL_EMAIL_ENABLED` | 4 |
| `conversely_runs` | `CONVERSELY_UPLOAD_ENABLED` | 2 |
| `conversely_weekly_runs` | `CONVERSELY_UPLOAD_ENABLED` | 2 |
| `conversely_submissions` | `CONVERSELY_UPLOAD_ENABLED` | 1 |
| `paragon_callback_tasks` | `PARAGON_ENABLED` | 1 |

The other 10 fenced tables have no OLD rows: `compliance_daily_summaries`,
`compliance_llm_passes`, `ix_uploads`, `lead_source_pings`,
`manual_transcript_gap_fills`, `manual_transcript_gap_requests`,
`paragon_residence_sep_inputs`, `post_call_coaching`,
`post_call_webhook_claims` and `provider_alert_throttle`.

**Cutover requirement:**
1. The data load must run in `session_replication_role = replica` (B7), or
   under an equivalent reviewed mechanism that bypasses only this trigger.
   Never turn feature flags on temporarily to load history: that would also
   arm the delivery workers.
2. `--verify` must balance these 13 tables (source = migrated + rejected)
   before sign-off. Here they balance exactly.
3. Because the trigger also fires on UPDATE, any post-cutover maintenance
   UPDATE to these rows while the flag is off is silently skipped. Operators
   must not use ad-hoc UPDATEs to "fix" vendor/GHL history with flags off.

### B9. The migration tool only writes to localhost

By hard rule, `index.mjs` refuses any `--old`/`--new` URL that isn't
`localhost`/`127.0.0.1`. Pointing it at a hosted NEW on cutover night requires
an explicitly reviewed change to that guard (or an approved alternative). That
decision belongs with the hosted-rehearsal session.

## 3. Row reconciliation (every OLD row)

OLD total (exact `count(*)` over all 164 restored tables, public and storage) = **1,067,183**.

| Category | Rows |
|---|---:|
| Migrated | 963,717 |
| Rejected | 0 |
| Public reference, NEW shape changed; left for operator import (Q6): `qhp_landscape_2026` 97,082, `sbe_plans_pa_2025` 1,435, `sbe_plans_va_2025` 419, `sbe_plans_nj_2025` 275 | 99,211 |
| Excluded by decision, exported to CSV (Q8): `cms_snp_conditions` 1,800, `quiz_leads` 18 | 1,818 |
| Seed replaced by content-identical NEW rows, ids remapped (Q5/Q7): `scoring_template_items` 779, `compliance_intents` 148, `knowledge_base` 118, `scoring_templates` 6 | 1,051 |
| Derived/runtime, recomputed: `knowledge_updates` 769 (job log), `conversely_worker_status` 1 | 770 |
| Storage platform: `storage.objects` 472 (files listed in the manifest; storage recreates rows when files are uploaded), `storage.migrations` 81 (Supabase internal), `storage.buckets` 2 (NEW seal creates both) | 555 |
| Excluded by decision, vendor configuration (Q11): `vendor_agent_state_eligibility` 41, `vendor_controls` 1, `vendor_routing_config` 1, `paragon_residence_settings` 1 | 44 |
| Recreated by roster provisioning: `agent_availability` 3, `availability_agent_subjects` 3, `recording_agent_subjects` 3 (bindings verified identical to OLD) | 9 |
| Excluded, secrets: `availability_consumers` 3, `paragon_report_tokens` 1 | 4 |
| Singletons carried into NEW's existing install row (Q15): one row each in `call_wrap_up_policy`, `telephony_presence_policy`, `compliance_runtime_control`, `integration_push_state` | 4 |
| **Total** | **1,067,183** |

Not migrated: 103,466 rows. Migrated + rejected + not migrated = 1,067,183
exactly. The per-table breakdown is Appendix A, and each of its lines also sums
exactly.

## 4. Rejects and row transformations

**Rejects: 0.** One correction for transparency: the first full load rejected
all 2,267 `agent_availability_log` rows with `sql_22P02`. That was a tool bug:
the OLD uuid `id` still reached `jsonb_populate_recordset` against NEW's bigint
identity. The bug was fixed and covered by a regression test. The bug-caused
reject and progress entries for that one table were cleared (logged in
`actions.log`), and the table was rerun with `--table`: 2,267/2,267 migrated.

Recorded row-level transformations (`migration_ledger.transforms`, old PK + kind, no values):

| Table | Transformation | Rows |
|---|---|---:|
| `section_scores` | `notes` JSON split into `section_number/completed/duration_seconds` | 446 |
| `call_records` | Google API `key` parameter stripped from `recording_url` (Q12) | 69 |
| `contact_activities` | `type` `sms` → `note`; original type and old PK in ledger (Q2) | 28 |
| `integration_deliveries` | stale `lease_token/lease_until` cleared (Q14) | 24 |
| `message_media` | signed storage URL removed from `media_url` | 5 |
| `enrolled_agents` | non-roster agents set `is_active=false` (Q9) | 3 |
| `tenants` | `ghl_webhook_url` set to NULL | 1 |

Systematic mappings that apply to every eligible row, rather than to individual
rows, are not listed above: 472 PII envelopes re-encrypted (§5), 25,042
scorecard items remapped (§6) and retention columns derived on every table
(§6).

## 5. PII re-encryption

- **OLD scheme:** `encrypt_pii_value()` wraps `pgp_sym_encrypt(value, key, 'cipher-algo=aes256')` as `{"c": base64, "k": key_id}`, keyed through `pii_vault` and Supabase Vault (neither was in the dump). Every OLD envelope carries one key id; its material is `OLD_PII_ENCRYPTION_KEY`. Before relying on the key, 5 rows decrypted with it, and each decrypted phone reproduced its stored blind index.
- **Method:** decrypt in OLD with the key as a bind parameter; re-encrypt in NEW with NEW's own `encrypt_pii_value()`, which uses the Vault key that `m022` generated at install. Plaintext exists only in Node process memory and in bind parameters over localhost. NEW's logging (`log_statement=ddl`, duration logging off, `log_parameter_max_length_on_error=0`) cannot record those parameters.
- **Scope:** 472 envelopes in total: `contacts.pii_encrypted` 407 fields over 340 rows (including 6 `mbi_full`); `enrollment_intakes.pii_encrypted` 24; `opportunities.pii_encrypted` 27; `contact_tags.name_encrypted` 1; `contact_merge_archive.encrypted_snapshot` 2; `ghl_enrollment_deliveries.payload_encrypted` 11. GHL snapshots were reduced by NEW's P0-8 allowlist, which is read from `minimize_ghl_delivery_snapshot` at runtime, exactly as that trigger would have done.
- **Contacts:** legacy plaintext columns `first_name, last_name, phone, email, dob, address` are NULL in NEW (Q3); 0 non-NULL after the load. `phone_hash` and `name_search` were recomputed with NEW's blind-index key: 0 mismatches against recomputation over all 340 contacts.
- **Verification:** a random sample of 100 contacts (120 fields) plus every row of the other five tables (65 fields). The OLD-key plaintext SHA-256 equals the NEW-key plaintext SHA-256 for 185/185 fields (GHL compared after minimization). 0 OLD key ids remain in NEW.
- **Known trap, handled:** NEW's `contacts_sync_pii_encrypted` rebuilds `pii_encrypted` from plaintext columns on INSERT, which would discard every envelope (and always `mbi_full`) once plaintext is NULL. The replica-mode load writes envelopes directly; outside the migration, production's own pattern (a separate UPDATE of `pii_encrypted`) is required.

## 6. Mapping summary

Details: [docs/migration/live-to-fresh-mapping.md](docs/migration/live-to-fresh-mapping.md).
- 131 OLD tables were copied into same-named NEW tables, plus 2 partial seed tables (scoring templates/items). Primary keys and every external identifier are preserved; the only id change is `agent_availability_log.id` (uuid → NEW bigint identity, 2,267 entries in `migration_ledger.id_map`).
- Tenant id preserved; profile `tenantId` = OLD tenant id, read at runtime. Roster provisioned through `scripts/provision-deployment.js --apply`, keeping OLD `tenant_agents.id`, Clerk user IDs, slugs, NPNs and GHL user IDs. OLD `enrolled_agents` ids were loaded before provisioning, so its upsert by Clerk ID kept them. The 3 non-roster agents are inactive.
- **Scoring (Q5):** intents remapped by `intent_code` (148/148). Template items remapped by (template, `intent_code`) (1,059 mapped, 0 unmatched). Production-only `6555110a…` and `93f27a3c…` were inserted as inactive templates with original template and item IDs. All 25,042 `scorecard_items` reference NEW items whose intent, points and question-text hash equal the original (25,042 same, 0 different). All 5 template IDs referenced by 162 scorecards exist in NEW.
- **Derived on load** (replica mode skips triggers):
  - `retention_started_at` from each table's NEW trigger anchor column (read from `pg_trigger`);
  - `contacts.retention_last_activity_at`;
  - `call_records.retention_enrollment_evidence/retention_marketing_evidence` (NEW's classification expression);
  - GHL minimization;
  - identity sequences moved past copied ids;
  - post-load FK sweep (0 orphans).
- `section_scores` (Q-mapped), `sessions` (dropped `status`, `updated_at`), the `contact_activities` sms mapping (Q2), signed and credential URLs removed (Q12), and stale leases cleared (Q14): see §4.
- **Embeddings:** `transcript_chunks` 65 and `cms_plan_embeddings_py2027` 158,280, `vector(1536)`, copied as-is, never recomputed. Per-row digests are identical.
- **Content (Q7):** the 4 OLD tenant-specific `script_templates` were migrated with their IDs (NEW now 5 shared + 4 tenant). `knowledge_base`: every OLD key (90 distinct) already exists in NEW's neutral seed, so 0 rows qualified for tenant-scoped migration and no keys are listed as left out. NEW's `knowledge_base` does have a `tenant_id` column.
- **Reference (Q6):** 14 identical-shape public datasets copied verbatim (661,347 rows). QHP/SBE tables were left for the operator.

## 7. Secrets and capability URLs the operator re-enters by hand

Names only; no value was copied, logged or reproduced.
1. GHL post-call webhook URL (formerly `tenants.ghl_webhook_url`): set in profile `ghl.postCallUrl`. The migration-007 seeded webhook is not reproduced anywhere.
2. GHL enrollment destination: profile `ghl.enrollmentUrl`; GHL location id is preserved in `tenants.ghl_location_id`.
3. Availability/status consumers (3 consumers in OLD with key hashes): issue new scoped consumer credentials.
4. Paragon report token: re-issue; profile `paragon.reportTokenHash`.
5. Paragon push/postback URLs and secrets, ping and availability key hashes: profile `paragon.*` (no lead-source secrets were set in OLD).
6. **Google API key embedded in 69 Drive recording URLs: rotate.** It is stripped from NEW; the recordings for those 69 calls (all from 2026-03-29) exist only on Drive.
7. 5 signed storage URLs: removed from NEW and regenerated on demand from `storage_path`.
8. Server credentials outside the database (P0-4 inventory): Twilio, Clerk, Deepgram, OpenAI, Conversely, IX, Resend, Stripe, agent WS signing secret, inbound vendor key, Supabase server key.

## 8. Storage manifest

`~/enrollgen-migration/storage-manifest.json` (outside the repo, mode 0600).
Buckets and paths are unchanged in NEW (`call-recordings`, `message-media`; path
`<tenant>/<parent call SID>/<recording SID>.wav`). Every entry is marked `copy: true`.

| | Objects | Bytes |
|---|---:|---:|
| `call-recordings` | 466 | 2,207,064,696 |
| `message-media` | 6 | 1,442,532 |
| **Total** | **472** | **2,208,507,228** |
| of which flagged `unreferenced` (legacy `<tenant>/<CA sid>.wav`, Q17) | 28 | 71,410,836 |

Row references without an object: 0. Rows pointing at recordings never stored
(provider-side failures, copied as-is): 43 `recording_ingestion` rows with
`copy_status=failed` and 5 with `absent`.

## 9. Verification (Phase 3)

`node scripts/migration/live-to-fresh/index.mjs --verify` exited 0 (119 s). Full JSON: `verify-report.json`.

| Check | Result |
|---|---|
| Per table, source = migrated + rejected | 129/129 tables balanced; 963,435 rows (the 282 scoring-subset rows are verified separately: 2 templates and 280 items present with original IDs) |
| External-ID checksums | 56/56 columns identical (Clerk, Twilio call/conference/recording/message SIDs, Conversely/IX, GHL, Stripe, Paragon parent call SIDs) |
| PII hash comparison | 185/185 fields equal; 0 plaintext contact columns; 0 OLD key ids; 0 blind-index mismatches |
| Foreign keys in NEW | 325 checked, 0 violations |
| Embeddings | `transcript_chunks` 65 = 65, `cms_plan_embeddings_py2027` 158,280 = 158,280; dims 1536; digests identical |
| Rubric/template references | 0 scorecards, 0 scoring jobs and 0 scorecard items reference missing templates or items |
| Roster bindings | `availability_agent_subjects` 3 = 3 and `recording_agent_subjects` 3 = 3 identical (slug and Clerk ID) |

**Application against NEW** (`scripts/migration/live-to-fresh/app-check.mjs`, app code over the local API):
- **Telephony/worker startup check:** `verifyDeploymentConfiguration` (profile mirror equals service profile, roster valid) passes, with 3 active agents.
- **Agents:** all 3 resolve by Clerk ID to their own roster entry, through both the app's `rosterIdentity` and the protected SQL resolver `resolve_deployment_subject`, with enrolled-agent IDs preserved.
- **Counts:** CRM contacts 340 = 340; Calls: `call_records` 562 = 562 and `v_call_log` 612 = 612.
- **One migrated call:** opens with its transcript (non-empty) and its compliance scorecard (143 items, same as OLD) on a template that exists in NEW.
- **`npm run dev`** (the documented local command) boots with the migration profile and the local stack: HTTP 200, and the public deployment module is generated (Vite validates the profile at startup).
- **Not done: an interactive signed-in UI session.** Signing in needs the real Clerk app and Clerk third-party auth on the local stack; their keys live only in env files, which this task may not read. The checks above use the same server code paths without a browser session.

## 10. Tests

| Suite | Run | Tests | Pass | Fail |
|---|---|---:|---:|---:|
| `npm run test:migration` (new, synthetic PGlite only) | final | 20 | **20** | 0 |
| Root `npm test -- --test-concurrency=4` (deployment-profile fixture preloaded; covers the integrations worker tests) | 1: machine loaded by concurrent migration tests | 1,944 | 1,943 | 1 (`tests/pilot-limits.test.js:53`) |
| Root, same command | 2: rerun | 1,944 | **1,944** | 0 |
| `npm test --prefix telephony -- --test-concurrency=4` (import-boundary check passed) | 1: concurrent load | 791 | 789 | 2 (`tests/pingLoadBaseline.test.js:18`, `tests/pingParityS9.test.js:67`) |
| Telephony, same command | 2: rerun | 791 | **790** | 1 (`tests/pingLoadBaseline.test.js:18`) |

All failures are timing assertions:
- `pilot-limits:53` counts admissions from 12 concurrent calls against a time-windowed limiter.
- `pingLoadBaseline:18` requires mixed pings to decide "well under a second"; its p95 was 1,061 ms under load.
- `pingParityS9:67` re-runs the load baseline.

This branch changes no file these tests import: 0 files under `telephony/` differ from `release/next`, and outside the new migration files the only change is one `package.json` script line.

**Flake check on a clean `release/next`** (detached worktree at `755d8cc` in `/tmp/enrollgen-baseline`, existing `node_modules` symlinked so nothing was installed, removed afterwards):

| Test | `release/next`, 3 isolated runs | This branch, 3 isolated runs (idle machine) |
|---|---|---|
| `tests/pilot-limits.test.js:53` | 3 pass / 0 fail | 3 pass / 0 fail |
| `telephony/tests/pingLoadBaseline.test.js` | 3 pass / 0 fail | 3 pass / 0 fail |
| `telephony/tests/pingParityS9.test.js` | 3 pass / 0 fail | not rerun (wraps the load baseline) |

**Conclusion: not proven pre-existing.** The flake did not reproduce on
`release/next` in 3 runs, and it also did not reproduce on this branch in 3
idle runs. On this branch, `pilot-limits:53` failed only while the machine
carried other test load: 1 of 3 isolated runs during the root suite, and once
inside the loaded full suite. Identical code plus load-only failures point to
timing sensitivity, not to this branch, but 3 runs cannot establish that. A
fair test is the same N runs under the same load on both checkouts.

## 11. Paragon re-enable checklist (cutover night, Q11)

Vendor configuration was not copied. NEW has no vendor control until
`configure_deployment_vendor` runs (through `provision-deployment.js` when
`PARAGON_ENABLED=true`), and it creates the control **paused**. OLD values to
reproduce in profile `paragon.*`:

| Setting | OLD value |
|---|---|
| Pause state | **not paused** (`vendor_pause=false`); NEW starts paused, so unpause only after review |
| Rate | 28.00 |
| Daily cap | none (NULL) |
| Cap mode | soft |
| Staffed hours | Mon–Fri 10:15–17:15, Sat/Sun off, `America/New_York` (the same hours the profile `staffedHours` now uses) |
| Plan year / reservation TTL | 2027 / 30 s |
| Allowed states | AR, DE, FL, GA, NJ, OH, SC, TX, VA |
| Required carriers / critical carriers | aetna, humana, uhc, wellcare, devoted, healthspring / uhc, humana |
| Eligibility matrix | 41 agent-state rows over 3 agents and 16 states (`vendor_agent_state_eligibility`) → profile `paragon.eligibility` |
| Residence capture | enabled in OLD (`paragon_residence_settings.enabled_at` set); NEW does not enable it, so initialize it explicitly if approved |
| Source / consumer / credentials | re-issue (§7 items 3–5) |

## 12. Singletons carried (Q15)

All columns matched, so every value was carried; nothing failed to carry over.

| Table | Columns carried | Changed from NEW default |
|---|---|---|
| `call_wrap_up_policy` | `routing_hold_enabled`, `disabled_reason`, `updated_at` | none (already equal) |
| `telephony_presence_policy` | `enforced` | none |
| `compliance_runtime_control` | `enabled` | **`false` → `true`** |
| `integration_push_state` | `fingerprint`, `changed_at` | `changed_at` only |

**Attention:** copying production's `compliance_runtime_control.enabled = true`
overrides the P0-4 runbook instruction "keep the database scoring fence
disabled". Scoring still also requires the P0-6 `SCORING_ENABLED` flag, which
is off. If both are on, the 1 migrated `pending` scoring job and new calls will
be scored.

## 13. Findings

1. **`lead_post_accept` compares plaintext `contacts.phone`** (`c.phone = duplicate_phone_key(lead_phone)`). With migrated contacts' plaintext NULL (Q3), the ping platform's duplicate and repeat-shopper checks will not see migrated contacts. All other reviewed phone lookups use `phone_hash`.
2. **NEW still writes plaintext for new contacts.** `contacts_sync_pii_encrypted` encrypts from the plaintext columns and leaves them populated, so contacts created after cutover will have plaintext PII alongside the envelope, unlike migrated ones.
3. **Admin authority is not migrated.** OLD `tenant_agents` marks one active agent `role=admin`; NEW roster provisioning never grants authority from roster roles (P0-2), so all three are ordinary agents. Grant admin through `deployment_authorities` in a protected service transaction (runbook step 8).
4. **Agent without a GHL user mapping:** Mike Shiomos. If `GHL_ENABLED=true`, roster validation will refuse the roster until a mapping is supplied.
5. **Production schema drift from `main`:** `quiz_leads` and `cms_snp_conditions` exist only in production, and an external system appears to write `quiz_leads` (plaintext lead data). `contact_activities` allowed `sms` without any repo migration. `main`'s `call_logs` table was never created in production.
6. **Feature gate silently drops writes:** see B8.
7. Only 3 of 434 transcripts have chunks or embeddings (65 rows). They were copied as-is and not recomputed.
8. **Bugs found and fixed while building** (all covered by tests):
   - skipped columns leaking into `jsonb_populate_recordset`;
   - lossy bigint cursors, which caused an infinite loop on keys above 2^53 (not present in production data);
   - provisioning re-touching the tenant row after the pre-provision step;
   - a verify aggregation over the 1 GB string limit.

## 14. Cutover-night command sequence (against a fresh backup)

Variables hold explicit local URLs; none is a default. Steps 1, 13 and the
hosted target depend on B1–B9 being resolved first.

1. Operator: take a fresh `pg_dump -Fc --no-owner --no-privileges` of the `public` and `storage` schemas from production. Record its SHA-256 and restore-test it.
2. Start OLD: `docker run -d --name enrollgen-old -e POSTGRES_PASSWORD=<local> -e POSTGRES_DB=old -p 127.0.0.1:55432:5432 -v <dump>:/dump/prod.dump:ro pgvector/pgvector:pg17`
3. In OLD: `CREATE SCHEMA extensions; CREATE EXTENSION vector SCHEMA public; CREATE EXTENSION pgcrypto SCHEMA extensions; CREATE EXTENSION "uuid-ossp" SCHEMA extensions;`, NOLOGIN roles `anon, authenticated, service_role BYPASSRLS, supabase_storage_admin`, and `ALTER DATABASE old SET search_path = public, extensions`.
4. `docker exec enrollgen-old pg_restore -U postgres -d old --no-owner --no-privileges --no-acl -j 4 /dump/prod.dump`. Expect exactly the 10 known errors (9 × `auth` schema, 1 × `public` exists).
5. Exact inventory, then compare with this rehearsal's `old-inventory.json` and explain any delta.
6. NEW: empty target, `node scripts/bootstrap-database.mjs --connection "$NEW_DB_URL"` (B1 must be resolved), then `node scripts/check-database-drift.mjs --connection "$NEW_DB_URL"` (B2–B6 reviewed).
7. `node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --emit-provisioning <private dir> --app-origin <real> --telephony-origin <real>`. Review `profile.json` and `roster.json` (add `ghl_user_id` if GHL is enabled).
8. `DEPLOYMENT_PROFILE_JSON="$(cat <private dir>/profile.json)" node scripts/provision-deployment.js <private dir>/roster.json --preview`
9. With `OLD_PII_ENCRYPTION_KEY` sourced from the private inputs file: `node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_DB_URL" --dry-run`. Expect 0 rejects; compare the per-table counts with Appendix A.
10. `... index.mjs --old ... --new ...` (run 1). This writes the CSV exports, `tenants` and `enrolled_agents`, then **exits 3** asking for provisioning.
11. `SUPABASE_URL=<NEW API> SUPABASE_SECRET_KEY=<from secret store> DEPLOYMENT_PROFILE_JSON=... node scripts/provision-deployment.js <private dir>/roster.json --apply`
12. `... index.mjs --old ... --new ...` (run 2: full load; resumable, so after any failure rerun the same command).
13. `... index.mjs --old ... --new ... --verify` must exit 0. Then run `app-check.mjs`.
14. Operator: copy the storage objects listed in `storage-manifest.json` (including the 28 unreferenced), then compare object count and bytes.
15. Protected service transaction: grant admin authority (§13.3); mark/confirm the default pipeline with `ensure_opportunities_pipeline`; re-enter secrets (§7); rotate the Google API key; Paragon checklist (§11); feature flags per the P0-6 inventory.

## 15. Measured local runtime (this machine, Docker)

| Step | Time |
|---|---:|
| Restore 1.1 GB dump into OLD | 113 s |
| Bootstrap NEW | 6 s |
| `--dry-run` (full mapping, real decrypt/encrypt, no writes) | 70 s |
| Run 1 (exports + pre-provision) | ~2 s |
| Provisioning `--apply` | ~10 s |
| Run 2 full load (963k rows, incl. 158k embeddings) | 1,386 s (contended: test suites ran concurrently) |
| Second full pass (idempotency, all cursors cleared) | 289 s |
| `--verify` | 119 s |

Plan for roughly 25–30 minutes of database time for steps 9–13 on similar
hardware. That excludes the storage copy of 2.2 GB.

## 16. Decisions needed before cutover

1. B1–B9 in the hosted rehearsal, in particular storage ownership (B1), the storage grants (B4), `session_replication_role` (B7) and the localhost guard (B9).
2. Q15 consequence: keep the scoring fence enabled as in production, or follow the runbook (§12).
3. `quiz_leads` and `cms_snp_conditions` (CSV exports in `~/enrollgen-migration/excluded/`): owner decision; identify and repoint the external writer of `quiz_leads`.
4. Whether to fix `lead_post_accept`'s plaintext comparison and NEW's plaintext writes for new contacts (§13.1–2) before relying on Q3.
5. Admin authority grant, the GHL mapping for the agent without one, and real origins for the profile.
6. QHP/SBE reference import by the operator (shape changed).
7. The 69 Drive-only recordings: import them into storage, or accept Drive as their only copy.

## Appendix A. Per-table reconciliation

Every line satisfies OLD rows = migrated + rejected + not migrated.

| Table | OLD rows | Migrated | Rejected | Not migrated | Category |
|---|---:|---:|---:|---:|---|
| `public.agent_availability` | 3 | 0 | 0 | 3 | recreated by provisioning |
| `public.agent_availability_log` | 2,267 | 2,267 | 0 | 0 | migrated |
| `public.agent_coaching` | 10 | 10 | 0 | 0 | migrated |
| `public.agent_compliance_profiles` | 3 | 3 | 0 | 0 | migrated |
| `public.agent_phone_sessions` | 0 | 0 | 0 | 0 | migrated |
| `public.agents` | 7 | 7 | 0 | 0 | migrated |
| `public.autoresearch_iterations` | 0 | 0 | 0 | 0 | migrated |
| `public.availability_agent_subjects` | 3 | 0 | 0 | 3 | recreated by provisioning |
| `public.availability_consumers` | 3 | 0 | 0 | 3 | excluded: secrets |
| `public.bulletin_feed_status` | 23 | 23 | 0 | 0 | migrated |
| `public.bulletins` | 777 | 777 | 0 | 0 | migrated |
| `public.bulletins_duplicate_archive` | 0 | 0 | 0 | 0 | migrated |
| `public.calibration_overrides` | 2 | 2 | 0 | 0 | migrated |
| `public.calibration_runs` | 3 | 3 | 0 | 0 | migrated |
| `public.call_conferences` | 6 | 6 | 0 | 0 | migrated |
| `public.call_disposition_opportunity_log` | 12 | 12 | 0 | 0 | migrated |
| `public.call_insights` | 546 | 546 | 0 | 0 | migrated |
| `public.call_participants` | 15 | 15 | 0 | 0 | migrated |
| `public.call_records` | 562 | 562 | 0 | 0 | migrated |
| `public.call_threads` | 0 | 0 | 0 | 0 | migrated |
| `public.call_transcripts` | 434 | 434 | 0 | 0 | migrated |
| `public.call_wrap_up_policy` | 1 | 0 | 0 | 1 | singleton carried |
| `public.call_wrap_ups` | 3 | 3 | 0 | 0 | migrated |
| `public.carrier_rts` | 156 | 156 | 0 | 0 | migrated |
| `public.cms_county_penetration` | 3,186 | 3,186 | 0 | 0 | migrated |
| `public.cms_plan_embeddings_py2027` | 158,280 | 158,280 | 0 | 0 | migrated |
| `public.cms_plans_py2027` | 158,280 | 158,280 | 0 | 0 | migrated |
| `public.cms_snp_conditions` | 1,800 | 0 | 0 | 1,800 | excluded by decision (CSV export) |
| `public.compliance_daily_budget` | 0 | 0 | 0 | 0 | migrated |
| `public.compliance_daily_summaries` | 0 | 0 | 0 | 0 | migrated |
| `public.compliance_flags` | 1,023 | 1,023 | 0 | 0 | migrated |
| `public.compliance_intents` | 148 | 0 | 0 | 148 | seed replaced |
| `public.compliance_llm_passes` | 0 | 0 | 0 | 0 | migrated |
| `public.compliance_llm_requests` | 0 | 0 | 0 | 0 | migrated |
| `public.compliance_review_decisions` | 0 | 0 | 0 | 0 | migrated |
| `public.compliance_runtime_control` | 1 | 0 | 0 | 1 | singleton carried |
| `public.compliance_scorecards` | 162 | 162 | 0 | 0 | migrated |
| `public.compliance_version_requests` | 0 | 0 | 0 | 0 | migrated |
| `public.conference_media_leases` | 0 | 0 | 0 | 0 | migrated |
| `public.contact_activities` | 474 | 474 | 0 | 0 | migrated |
| `public.contact_lead_intel` | 0 | 0 | 0 | 0 | migrated |
| `public.contact_merge_archive` | 2 | 2 | 0 | 0 | migrated |
| `public.contact_notes` | 0 | 0 | 0 | 0 | migrated |
| `public.contact_tags` | 1 | 1 | 0 | 0 | migrated |
| `public.contacts` | 340 | 340 | 0 | 0 | migrated |
| `public.conversely_run_agents` | 12 | 12 | 0 | 0 | migrated |
| `public.conversely_run_events` | 9 | 9 | 0 | 0 | migrated |
| `public.conversely_runs` | 2 | 2 | 0 | 0 | migrated |
| `public.conversely_submissions` | 1 | 1 | 0 | 0 | migrated |
| `public.conversely_week_slots` | 1 | 1 | 0 | 0 | migrated |
| `public.conversely_weekly_audit` | 17 | 17 | 0 | 0 | migrated |
| `public.conversely_weekly_runs` | 2 | 2 | 0 | 0 | migrated |
| `public.conversely_worker_status` | 1 | 0 | 0 | 1 | derived/runtime |
| `public.corrective_actions` | 124 | 124 | 0 | 0 | migrated |
| `public.cross_sell_attempts` | 0 | 0 | 0 | 0 | migrated |
| `public.csnp_carrier_verification` | 0 | 0 | 0 | 0 | migrated |
| `public.dsnp_eae_lookup` | 949 | 949 | 0 | 0 | migrated |
| `public.enrolled_agents` | 6 | 6 | 0 | 0 | migrated |
| `public.enrollment_intakes` | 81 | 81 | 0 | 0 | migrated |
| `public.fema_disasters` | 8 | 8 | 0 | 0 | migrated |
| `public.fema_feed_snapshot` | 1 | 1 | 0 | 0 | migrated |
| `public.follow_ups` | 9 | 9 | 0 | 0 | migrated |
| `public.followup_queue` | 22 | 22 | 0 | 0 | migrated |
| `public.ghl_enrollment_deliveries` | 11 | 11 | 0 | 0 | migrated |
| `public.inbound_calls` | 452 | 452 | 0 | 0 | migrated |
| `public.integration_deliveries` | 24 | 24 | 0 | 0 | migrated |
| `public.integration_delivery_attempts` | 88 | 88 | 0 | 0 | migrated |
| `public.integration_link_issues` | 5 | 5 | 0 | 0 | migrated |
| `public.integration_push_state` | 1 | 0 | 0 | 1 | singleton carried |
| `public.integration_report_log` | 58 | 58 | 0 | 0 | migrated |
| `public.intent_detections` | 18,830 | 18,830 | 0 | 0 | migrated |
| `public.ix_upload_retries` | 0 | 0 | 0 | 0 | migrated |
| `public.ix_uploads` | 0 | 0 | 0 | 0 | migrated |
| `public.knowledge_base` | 118 | 0 | 0 | 118 | seed replaced |
| `public.knowledge_updates` | 769 | 0 | 0 | 769 | derived/runtime |
| `public.lead_source_pings` | 0 | 0 | 0 | 0 | migrated |
| `public.lead_sources` | 1 | 1 | 0 | 0 | migrated |
| `public.manual_transcript_gap_fills` | 0 | 0 | 0 | 0 | migrated |
| `public.manual_transcript_gap_requests` | 0 | 0 | 0 | 0 | migrated |
| `public.media_stream_leases` | 0 | 0 | 0 | 0 | migrated |
| `public.message_media` | 6 | 6 | 0 | 0 | migrated |
| `public.messages` | 28 | 28 | 0 | 0 | migrated |
| `public.opportunities` | 26 | 26 | 0 | 0 | migrated |
| `public.opportunity_events` | 16 | 16 | 0 | 0 | migrated |
| `public.opportunity_stage_history` | 42 | 42 | 0 | 0 | migrated |
| `public.paragon_agent_reservations` | 0 | 0 | 0 | 0 | migrated |
| `public.paragon_billing_events` | 1,591 | 1,591 | 0 | 0 | migrated |
| `public.paragon_call_billing` | 337 | 337 | 0 | 0 | migrated |
| `public.paragon_callback_tasks` | 1 | 1 | 0 | 0 | migrated |
| `public.paragon_contact_zip_origin` | 1 | 1 | 0 | 0 | migrated |
| `public.paragon_control_changes` | 0 | 0 | 0 | 0 | migrated |
| `public.paragon_ping_decisions` | 8,608 | 8,608 | 0 | 0 | migrated |
| `public.paragon_report_access` | 492 | 492 | 0 | 0 | migrated |
| `public.paragon_report_email_days` | 52 | 52 | 0 | 0 | migrated |
| `public.paragon_report_email_log` | 53 | 53 | 0 | 0 | migrated |
| `public.paragon_report_tokens` | 1 | 0 | 0 | 1 | excluded: secrets |
| `public.paragon_residence_jobs` | 75 | 75 | 0 | 0 | migrated |
| `public.paragon_residence_sep_inputs` | 0 | 0 | 0 | 0 | migrated |
| `public.paragon_residence_settings` | 1 | 0 | 0 | 1 | excluded by decision: vendor configuration |
| `public.phi_redactions` | 0 | 0 | 0 | 0 | migrated |
| `public.pii_access_log` | 109,967 | 109,967 | 0 | 0 | migrated |
| `public.pipeline_stages` | 5 | 5 | 0 | 0 | migrated |
| `public.pipelines` | 1 | 1 | 0 | 0 | migrated |
| `public.plan_terminations` | 192,500 | 192,500 | 0 | 0 | migrated |
| `public.policies` | 0 | 0 | 0 | 0 | migrated |
| `public.post_call_jobs` | 441 | 441 | 0 | 0 | migrated |
| `public.post_call_requests` | 10,432 | 10,432 | 0 | 0 | migrated |
| `public.post_call_status_tickets` | 0 | 0 | 0 | 0 | migrated |
| `public.post_call_webhook_claims` | 0 | 0 | 0 | 0 | migrated |
| `public.provider_alert_throttle` | 0 | 0 | 0 | 0 | migrated |
| `public.qhp_landscape_2026` | 97,082 | 0 | 0 | 97,082 | reference: shape change, operator import |
| `public.quiz_leads` | 18 | 0 | 0 | 18 | excluded by decision (CSV export) |
| `public.recording_agent_subjects` | 3 | 0 | 0 | 3 | recreated by provisioning |
| `public.recording_call_scopes` | 497 | 497 | 0 | 0 | migrated |
| `public.recording_compliance_tickets` | 0 | 0 | 0 | 0 | migrated |
| `public.recording_download_tickets` | 0 | 0 | 0 | 0 | migrated |
| `public.recording_ingestion` | 486 | 486 | 0 | 0 | migrated |
| `public.recording_reconciliation` | 563 | 563 | 0 | 0 | migrated |
| `public.sbe_plans_nj_2025` | 275 | 0 | 0 | 275 | reference: shape change, operator import |
| `public.sbe_plans_pa_2025` | 1,435 | 0 | 0 | 1,435 | reference: shape change, operator import |
| `public.sbe_plans_va_2025` | 419 | 0 | 0 | 419 | reference: shape change, operator import |
| `public.scorecard_items` | 25,042 | 25,042 | 0 | 0 | migrated |
| `public.scoring_jobs` | 100 | 100 | 0 | 0 | migrated |
| `public.scoring_manual_retries` | 0 | 0 | 0 | 0 | migrated |
| `public.scoring_segment_progress` | 137 | 137 | 0 | 0 | migrated |
| `public.scoring_template_items` | 1,059 | 280 | 0 | 779 | seed replaced |
| `public.scoring_templates` | 8 | 2 | 0 | 6 | seed replaced |
| `public.script_templates` | 4 | 4 | 0 | 0 | migrated |
| `public.section_scores` | 446 | 446 | 0 | 0 | migrated |
| `public.sessions` | 577 | 577 | 0 | 0 | migrated |
| `public.snp_plans_by_county` | 53,952 | 53,952 | 0 | 0 | migrated |
| `public.snp_routing_rules` | 0 | 0 | 0 | 0 | migrated |
| `public.star_ratings_by_county` | 38,820 | 38,820 | 0 | 0 | migrated |
| `public.stt_call_reconnects` | 84 | 84 | 0 | 0 | migrated |
| `public.subscriptions` | 1 | 1 | 0 | 0 | migrated |
| `public.telephony_call_attempts` | 534 | 534 | 0 | 0 | migrated |
| `public.telephony_events` | 4,110 | 4,110 | 0 | 0 | migrated |
| `public.telephony_presence_policy` | 1 | 0 | 0 | 1 | singleton carried |
| `public.telephony_routing_responses` | 966 | 966 | 0 | 0 | migrated |
| `public.telephony_transcript_segments` | 41,657 | 41,657 | 0 | 0 | migrated |
| `public.tenant_agents` | 4 | 4 | 0 | 0 | migrated |
| `public.tenants` | 1 | 1 | 0 | 0 | migrated |
| `public.training_completions` | 0 | 0 | 0 | 0 | migrated |
| `public.transcript_chunks` | 65 | 65 | 0 | 0 | migrated |
| `public.transcript_recovery_alerts` | 4 | 4 | 0 | 0 | migrated |
| `public.transcript_score_dispatch` | 81 | 81 | 0 | 0 | migrated |
| `public.transcription_incidents` | 0 | 0 | 0 | 0 | migrated |
| `public.usage_records` | 68,764 | 68,764 | 0 | 0 | migrated |
| `public.user_preferences` | 4 | 4 | 0 | 0 | migrated |
| `public.vendor_agent_state_eligibility` | 41 | 0 | 0 | 41 | excluded by decision: vendor configuration |
| `public.vendor_control_audit` | 4 | 4 | 0 | 0 | migrated |
| `public.vendor_controls` | 1 | 0 | 0 | 1 | excluded by decision: vendor configuration |
| `public.vendor_routing_config` | 1 | 0 | 0 | 1 | excluded by decision: vendor configuration |
| `public.zip_county_crosswalk` | 54,571 | 54,571 | 0 | 0 | migrated |
| `storage.bucket_lifecycle_states` | 0 | 0 | 0 | 0 | storage platform |
| `storage.buckets` | 2 | 0 | 0 | 2 | storage platform |
| `storage.buckets_analytics` | 0 | 0 | 0 | 0 | storage platform |
| `storage.buckets_vectors` | 0 | 0 | 0 | 0 | storage platform |
| `storage.lifecycle_abandoned_artifacts` | 0 | 0 | 0 | 0 | storage platform |
| `storage.migrations` | 81 | 0 | 0 | 81 | storage platform |
| `storage.objects` | 472 | 0 | 0 | 472 | storage platform |
| `storage.s3_multipart_uploads` | 0 | 0 | 0 | 0 | storage platform |
| `storage.s3_multipart_uploads_parts` | 0 | 0 | 0 | 0 | storage platform |
| `storage.vector_indexes` | 0 | 0 | 0 | 0 | storage platform |
| **Total** | **1,067,183** | **963,717** | **0** | **103,466** | |
