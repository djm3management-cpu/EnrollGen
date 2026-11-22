# Live-to-fresh data migration: mapping (Phase 1)

Status: **draft for owner review. No migration code exists yet.**
Branch: `feature/live-migration` (from `release/next` at `755d8cc`).

This document maps the production NGHS database (old schema, the historical
migrations as deployed from `main`) onto the fresh-install schema on
`release/next` (`supabase/bootstrap`, migrations through 187). It was produced
entirely on this machine from two local databases:

- **OLD**: `pgvector/pgvector:pg17` container on `127.0.0.1:55432`, restored
  from the production dump (public and storage schemas only).
- **NEW**: a disposable local Supabase stack (CLI workdir outside the repo, never
  linked), installed with `scripts/bootstrap-database.mjs`.

All facts below come from live catalog introspection of both databases and from
aggregate queries over OLD. The dump is treated as the truth about production.
This document contains table and column names, counts, identifiers of schema
objects and hashes only. It contains no row content, no PHI, no secrets and no
connection strings.

## 1. Environment results

| Step | Result |
|---|---|
| OLD restore | 113 s; 154/154 public tables, 10 storage tables, 1,067,183 rows; 232 FKs, 66 triggers, 17 views. 10 errors, all expected: 9 × `schema "auth" does not exist` (policies calling `auth.jwt()`), 1 × `schema "public" already exists`. 146 of 155 policies restored; policies are irrelevant to data. |
| OLD inventory | `~/enrollgen-migration/old-inventory.json` (exact `count(*)`, outside the repo). Zero-row tables are all plausibly unused (IX uploads, policies, leases, retry queues). |
| OLD decryption proof | 5 rows of `contacts.pii_encrypted.phone` decrypt with `OLD_PII_ENCRYPTION_KEY`. Each decrypted value also reproduces its stored `phone_hash` blind index, which independently confirms the key. Output was SHA-256 prefixes only. |
| NEW bootstrap, attempt 1 | **Failed** at `sql/m153.sql` statement 15: `42501 must be owner of table objects` on `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`. In the Supabase Postgres 17.12 image, `storage.objects` is owned by `supabase_storage_admin`, and `postgres` is not a member of that role. The stack was stopped with `--no-backup` and restarted; nothing was resumed. |
| NEW bootstrap, attempt 2 | Ran after one local platform-prep statement as `supabase_admin`: `GRANT supabase_storage_admin TO postgres`. Completed in 6 s. **Cutover blocker (Q1).** |
| NEW drift check | **Exit 1**: 475 differences, all platform-induced (see Q1). Browser-role (`anon`/`authenticated`) routine EXECUTE grants: 0 widened, 0 narrowed. |
| Provisioning | **Held** until Q1 is answered, as instructed ("require exit 0"). |

## 2. Summary

- 154 OLD public tables: **114 migrate** with their own name; **3** are seed
  tables handled by ID remapping (§3.3); **14** are public reference datasets
  (Q6); **2** need a content decision (Q7); **21** are not migrated (secrets,
  provisioning-owned, runtime singletons, vendor configuration, out-of-band
  tables or changed-shape reference data).
- NEW is a superset of OLD for 152 of 154 tables. The differences are mostly
  added `retention_*` columns, about 100 new foreign keys and new checks.
- **Every new foreign key was tested against OLD data: 0 orphans.** Every new
  check/unique constraint was tested: the only violation is 28
  `contact_activities` rows (Q2). No column that NEW makes NOT NULL contains a
  NULL in OLD.
- Every external identifier column exists in NEW with an identical type, so all
  are copied byte for byte (§5).
- All OLD rows belong to a single tenant, `00000000-0000-4000-8000-000000000001`.
  NEW's profile `tenantId` is set to that value at runtime (read from OLD), so no
  `tenant_id` is rewritten.
- The re-encryption scope is six encrypted containers, all under one OLD key id
  (§4).

## 3. Cross-cutting rules

### 3.1 Load order and resumability (Phase 2 design)

Order: tenants (via provisioning) → `enrolled_agents` (copy, before roster
provisioning) → roster provisioning → `tenant_agents` (inactive row) → contacts →
CRM children → calls/sessions/telephony → transcripts/chunks → recordings →
scoring → integrations/vendor history → audit logs. This follows NEW's FK graph.
Batches are keyed on the preserved primary key, and a `migration_ledger` schema
in NEW records per-table cursors, an ID map (for the remaps in §3.3 and the
`agent_availability_log` id change) and rejects.

### 3.2 Triggers during the load

NEW has 494 user triggers. Many have side effects that must not run on
historical rows: compliance enqueue, auto-created MA opportunities, the
completed-intake and UHC-confirmation requirements, GHL snapshot minimization,
the membership write guard, and retention clocks. Proposal: load inside
`SET session_replication_role = replica`, which disables user triggers and FK
triggers. The migration then explicitly computes every column those triggers
would have derived for an insert (§3.5, §4), and `--verify` re-checks every FK in
NEW. Confirm this is acceptable on the hosted target (Q13).

### 3.3 Scoring identity remaps

Canonical template IDs `…000001`, `…000075` and `…000115` are identical in both
databases. Their **item IDs and `compliance_intents` IDs are not**: seeds
generate random UUIDs, so no item or intent ID is shared between OLD and NEW.
Content is proven identical:

- `compliance_intents`: 148/148 match by `intent_code`.
- Canonical items: 423/423 match on (template, `intent_code`, display order,
  points, critical, auto-fail, question-text hash). (template, `intent_code`)
  is unique.
- Production clones versus NEW deterministic clones (content signature over all
  items): `e362ce7e…` ≡ `b0040000-…-000000000141`, `3e4c5eb7…` ≡ `…142`,
  `78659a92…` (active) ≡ `…144` (active). No scorecard references these three.
- `6555110a…` (14 scorecards, 1,988 items) has content identical to `…075`, and
  `93f27a3c…` (1 scorecard, 138 items) has content identical to `…115`. NEW has
  no row with these IDs; they came from production's run of the omitted 143
  route. See Q5.

Remap: `scorecard_items.template_item_id` and `scorecard_items.intent_id`, plus
`intent_detections.intent_id` and `scoring_template_items.intent_id` (all NULL
today), go OLD id → NEW id through the ledger map. `compliance_scorecards.template_id`
and `scoring_jobs.template_id` are never changed.

### 3.4 Agents and roster

- 3 active `tenant_agents` with 3 distinct Clerk user IDs form the roster. They
  are provisioned through `scripts/provision-deployment.js --apply` with their
  OLD `id`, `clerk_user_id`, `agent_slug`, `npn` and `ghl_user_id`. All OLD
  roster IDs are valid v4 UUIDs, so they pass `validateRoster`.
- `enrolled_agents` (6 rows) is copied first with its OLD IDs.
  `provision_deployment_roster` upserts `enrolled_agents` on `clerk_user_id`, so
  the three roster agents keep their OLD IDs, which 577 sessions and other rows
  reference. The 3 non-roster rows are copied inactive. One of them owns 15
  sessions (Q9).
- 1 inactive `tenant_agents` row without a Clerk ID is inserted directly with
  `is_active=false`.
- `agent_slug` values are preserved. Text slug references
  (`contacts.assigned_agent_id`, availability, recording scopes) therefore stay
  valid.

### 3.5 Derived columns NEW computes on insert

- `retention_started_at`: the NEW trigger sets it to the row's anchor column
  (its trigger argument, read from `pg_trigger` at runtime: `created_at` for 39
  tables; `call_start`, `call_date`, `started_at`, `received_at` and others for
  the rest), falling back to `clock_timestamp()`. The migration applies the same
  rule, so retention clocks reflect history, not cutover day.
- Contact blind indexes: see §4.
- New columns with defaults (`coaching_*`, `sandbox`, `complaint_open`, …) take
  NEW's defaults.

### 3.6 In-flight work and leases

All delivery rows are terminal: GHL 11 `uploaded`, integration deliveries 22
`sent` + 2 `failed`, Conversely 1 `uploaded`, post-call jobs 441 `completed`,
post-call requests 10,430 `completed` + 2 `failed`. One scoring job is
`pending`; the scoring fence stays disabled, so it cannot run. Statuses are
copied as-is. Stale `lease_token`/`lease_until` on the 24 integration deliveries
are cleared. All features start off (P0-6), so nothing is re-sent at cutover.

## 4. Encrypted PII

**How OLD encrypts.** Functions in the restored `public` schema:
`encrypt_pii_value(text)` returns `{"c": base64(pgp_sym_encrypt(value, key, 'cipher-algo=aes256')), "k": key_id}`;
`decrypt_pii_value(jsonb)` looks up the key by `k` through
`pii_vault.get_key()`, backed by Supabase Vault secret `pii_encryption_key_v1`.
`pii_vault` and Vault were not in the dump. Every envelope in OLD carries the
**same single key id**, and that key's material is `OLD_PII_ENCRYPTION_KEY`.
The blind index is `HMAC-SHA256(lower(btrim(value)), SHA-256(key || ':blind-index'))`.

**NEW.** The same function signatures and bodies (`encrypt_pii_value`,
`decrypt_pii_value` and `pii_blind_index` are byte-identical by `md5(prosrc)`),
with a fresh Vault key generated by `m022` at install. The blind-index key
derives from the NEW key, so **every blind index must be recomputed**.

| OLD container | Shape | NEW counterpart | Rule |
|---|---|---|---|
| `contacts.pii_encrypted` | object of envelopes: `first_name, last_name, phone, email, dob, address, mbi_full` | same | Decrypt each field with the OLD key in process memory; re-encrypt with NEW `encrypt_pii_value()` in NEW; write via `UPDATE … SET pii_encrypted` after insert (the production pattern, see below) |
| `contacts.phone_hash`, `name_search` | blind indexes | same | Recompute in NEW: `pii_blind_index(normalize_phone_e164(phone))`, `pii_blind_index(concat_ws(' ', first, last))`, exactly as NEW's trigger does |
| `contacts.first_initial, last_initial, phone_last4, email_set, dob_set, mbi_last4` | masked previews | same | Copied (same derivation; not secrets) |
| `contacts.first_name, last_name, phone, email, dob, address` | legacy plaintext mirror (exactly mirrors the envelope: 25/22/339/7/10/2 non-NULL) | same | **NULL in NEW** (Q3) |
| `enrollment_intakes.pii_encrypted` | object: `dob, mbi, medicaidNum` | same | Per-field re-encrypt |
| `opportunities.pii_encrypted` | object: `title, notes` | same | Per-field re-encrypt |
| `contact_tags.name_encrypted` | single envelope | same | Re-encrypt |
| `contact_merge_archive.encrypted_snapshot` | single envelope | same | Re-encrypt |
| `ghl_enrollment_deliveries.payload_encrypted` | single envelope | same | Re-encrypt |

**Trap found.** NEW's `contacts_sync_pii_encrypted` (identical to OLD's) is
`BEFORE INSERT OR UPDATE OF first_name, …, mbi_last4`. On insert it **replaces**
`pii_encrypted` with envelopes built only from the plaintext columns. A naive
insert would therefore drop `mbi_full` (6 contacts) and, with plaintext NULLed,
every field. Production's own `update_pii_field` avoids this by writing
`pii_encrypted` in a separate UPDATE, because that column is not in the
trigger's column list. The migration does the same (or loads in replica mode,
§3.2). Either way it writes envelopes and blind indexes explicitly.

**No plaintext at rest.** Plaintext exists only in Node process memory and in
parameterized queries over localhost. It is never written to a temp table,
file, log or console. Before Phase 2 runs, NEW's `log_statement`,
`log_min_duration_statement` and `log_parameter_max_length*` are checked so that
parameters cannot reach server logs. Verification compares SHA-256 of OLD-key
plaintext with SHA-256 of NEW-key plaintext and prints hashes only.

**Plaintext by NEW design (Q4).** These columns are plaintext in NEW's schema
(P0-8 inventory) and are copied as-is: `call_records.customer_*` (≤5 rows),
`enrollment_intakes.data` (11 rows with identity keys), `inbound_calls.from_number`,
`messages.body`, transcripts and segments, `post_call_requests.payload`, and
others listed in P0-8.

## 5. External identifiers preserved byte for byte

Every column below exists in NEW with the identical type. The migration copies
them verbatim, and `--verify` compares order-independent checksums per column.

- **Clerk**: `tenants.clerk_org_id`, `tenant_agents.clerk_user_id`, `enrolled_agents.clerk_user_id`, `availability_agent_subjects.clerk_user_id/clerk_org_id` (re-created by provisioning; `--verify` checks equality with OLD), `recording_agent_subjects.clerk_user_id` (same), `pii_access_log.clerk_user_id`, `post_call_jobs.clerk_user_id/clerk_org_id/clerk_session_id`, `contact_activities.actor_clerk_user_id`, `carrier_rts.clerk_user_id`, `user_preferences.clerk_user_id`.
- **Twilio calls/conferences**: `call_records.twilio_call_sid`, `sessions.twilio_call_sid`, `inbound_calls.twilio_call_sid`, `telephony_events.twilio_call_sid`, `telephony_call_attempts.parent_call_sid/child_call_sid`, `call_conferences.twilio_conference_sid/parent_call_sid`, `call_participants.twilio_call_sid/stream_sid`, `call_wrap_ups.call_sid`, `stt_call_reconnects.call_sid`, `recording_call_scopes.call_sid`, `integration_link_issues.twilio_call_sid`, `agent_availability.active_call_sid/wrap_up_call_sid` (not migrated, live state), `paragon_ping_decisions.matched_call_sid`.
- **Twilio recordings/messages**: `recording_ingestion.recording_sid/parent_call_sid/callback_call_sid/account_sid`, `recording_reconciliation.parent_call_sid/account_sid`, `call_participants.recording_sid`, `conversely_submissions.twilio_recording_sid`, `conversely_weekly_audit.recording_sid`, `ghl_enrollment_deliveries.twilio_recording_sid`, `messages.twilio_message_sid`.
- **Conversely / IX**: `conversely_submissions.id/confirmation_code/ix_receipt_id`, `conversely_run_agents/week_slots/weekly_audit.submission_id`, `ghl_enrollment_deliveries.confirmation_code/ix_receipt_id`, `ix_uploads` (0 rows).
- **GHL**: `contacts.ghl_contact_id`, `tenant_agents.ghl_user_id`, `tenants.ghl_location_id`.
- **Stripe**: `subscriptions.stripe_customer_id/stripe_subscription_id`.
- **Paragon/vendor**: `paragon_call_billing.parent_call_sid/account_sid`, `paragon_billing_events.parent_call_sid`, `inbound_calls.aggregator_call_id`, `lead_sources.external_id/twilio_number`, `paragon_report_email_log.provider_message_id`.
- **Internal primary keys**: preserved for every migrated table except `agent_availability_log.id` (uuid → bigint identity; no inbound references) and the seed remaps in §3.3.

## 6. Storage

NEW keeps the same two private buckets, `call-recordings` and `message-media`.
NEW's recording path builder (`telephony/src/recordings.js:185`) is
`${tenant_id}/${parent_call_sid}/${recording_sid}.wav`, the same layout as OLD.
Because the tenant ID is preserved, **every object keeps its bucket and path**.
This task writes the manifest (`~/enrollgen-migration/storage-manifest.json`,
outside the repo) and copies no files.

| Bucket | Path shape | Objects | Bytes | Referenced by |
|---|---|---:|---:|---|
| `call-recordings` | `<tenant>/<CA sid>/<RE sid>.wav` | 438 | 2,135,653,860 | `recording_ingestion.storage_path` (438/438, all `copy_status=stored`); `call_records.recording_storage_path` (394 rows, 0 missing objects) |
| `call-recordings` | `<tenant>/<CA sid>.wav` (legacy) | 28 | 71,410,836 | **no row** (orphans, Q17) |
| `message-media` | `<tenant>/outbound/<uuid>.gif` | 5 | 549,748 | `message_media.storage_path` |
| `message-media` | `<tenant>/<uuid>/0.bin` | 1 | 892,784 | `message_media.storage_path` |
| **Total** | | **472** | **2,208,507,228** | |

`storage.buckets` rows are not copied, because NEW's seal creates both buckets
private. Other row-level references: 436 `call_records.recording_url` on
`api.twilio.com` (auth-gated, copied); 69 on Google Drive with an embedded API
key (Q12); 43 `recording_ingestion` rows with `copy_status=failed` and 5
`absent` (audio never stored; rows copied as-is).

## 7. Secrets and capability URLs: not migrated (operator re-enters)

Names only. No value is copied, logged or reproduced.

1. GHL post-call webhook URL (`tenants.ghl_webhook_url`, 1 row): set to NULL; re-entered as profile `ghl.postCallUrl`. The migration-007 seeded webhook is also never reproduced.
2. GHL enrollment destination: profile `ghl.enrollmentUrl`.
3. Availability consumer credentials (3 consumers with key hashes in `availability_consumers`): re-issue scoped consumers (P0-4: excluded).
4. Paragon report token (`paragon_report_tokens`, 1 hash): re-issue; profile `paragon.reportTokenHash`.
5. Paragon push/postback URLs and secrets, ping/availability key hashes (profile `paragon.*`); `lead_sources` has none set.
6. Google API key embedded in 69 `call_records.recording_url` values (Q12).
7. 5 signed storage URLs in `message_media.media_url`: set to NULL (re-signed on demand from `storage_path`).
8. Server credentials per P0-4/P0-5 (Twilio, Clerk, Deepgram, OpenAI, Conversely, IX, Resend, Stripe and so on) are outside the database and never part of this data.

## 8. Per-table mapping

Dispositions: **migrate** = same-named NEW table with the column notes shown;
§3 rules apply to every migrated table. "0 orphans" means the new FK was tested
against all OLD rows.

| OLD table | rows | disposition | NEW table | column notes |
|---|---:|---|---|---|
| `agent_availability` | 3 | not migrated | `agent_availability` | Live presence state: provisioning creates one offline row per active roster agent |
| `agent_availability_log` | 2,267 | migrate | `agent_availability_log` | `id` uuid → NEW bigint identity (no inbound references); OLD uuid recorded in ledger map |
| `agent_coaching` | 10 | migrate | `agent_coaching` | identical shape, verbatim |
| `agent_compliance_profiles` | 3 | migrate | `agent_compliance_profiles` | identical shape, verbatim |
| `agent_phone_sessions` | 0 | migrate | `agent_phone_sessions` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `agents` | 7 | migrate | `agents` | identical shape, verbatim |
| `autoresearch_iterations` | 0 | migrate | `autoresearch_iterations` | identical shape, verbatim |
| `availability_agent_subjects` | 3 | not migrated | `availability_agent_subjects` | Created by roster provisioning (151); `--verify` checks equality with OLD by slug and Clerk ID |
| `availability_consumers` | 3 | not migrated | `availability_consumers` | Secrets: consumer key hashes/push secrets. P0-4 excludes the preconfigured consumer; operator issues new scoped credentials |
| `bulletin_feed_status` | 23 | reference (Q6) | `bulletin_feed_status` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `bulletins` | 777 | reference (Q6) | `bulletins` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `bulletins_duplicate_archive` | 0 | migrate | `bulletins_duplicate_archive` | identical shape, verbatim |
| `calibration_overrides` | 2 | migrate | `calibration_overrides` | `retention_started_at` ← NEW trigger anchor (§3.5); 3 new FK(s), 0 orphans |
| `calibration_runs` | 3 | migrate | `calibration_runs` | identical shape, verbatim |
| `call_conferences` | 6 | migrate | `call_conferences` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `whisper_conversion`; 2 new FK(s), 0 orphans |
| `call_disposition_opportunity_log` | 12 | migrate | `call_disposition_opportunity_log` | identical shape, verbatim |
| `call_insights` | 546 | migrate | `call_insights` | identical shape, verbatim |
| `call_participants` | 15 | migrate | `call_participants` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `call_records` | 562 | migrate | `call_records` | Verbatim incl. `twilio_call_sid`, recording paths. 69 `recording_url` values on Google Drive embed an API `key=` → key parameter stripped (Q12). New retention columns from `created_at`/defaults |
| `call_threads` | 0 | migrate | `call_threads` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `call_transcripts` | 434 | migrate | `call_transcripts` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `retention_certified_at`; 2 new FK(s), 0 orphans |
| `call_wrap_up_policy` | 1 | not migrated | `call_wrap_up_policy` | Runtime singleton; NEW fresh-install default governs, OLD value reported (Q15) |
| `call_wrap_ups` | 3 | migrate | `call_wrap_ups` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `carrier_rts` | 156 | migrate | `carrier_rts` | Verbatim; new RTS columns NULL |
| `cms_county_penetration` | 3,186 | reference (Q6) | `cms_county_penetration` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `cms_plan_embeddings_py2027` | 158,280 | reference (Q6) | `cms_plan_embeddings_py2027` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `cms_plans_py2027` | 158,280 | reference (Q6) | `cms_plans_py2027` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `cms_snp_conditions` | 1,800 | not migrated | — | OLD-only table created out-of-band (no repo migration/code); no NEW destination (Q8) |
| `compliance_daily_budget` | 0 | migrate | `compliance_daily_budget` | identical shape, verbatim |
| `compliance_daily_summaries` | 0 | migrate | `compliance_daily_summaries` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `compliance_flags` | 1,023 | migrate | `compliance_flags` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `compliance_intents` | 148 | remap only | `compliance_intents` | Canonical seed already in NEW (148/148 by `intent_code`). Not copied; OLD id → NEW id by `intent_code` |
| `compliance_llm_passes` | 0 | migrate | `compliance_llm_passes` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `compliance_llm_requests` | 0 | migrate | `compliance_llm_requests` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `compliance_review_decisions` | 0 | migrate | `compliance_review_decisions` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `compliance_runtime_control` | 1 | not migrated | `compliance_runtime_control` | Scoring fence; runbook requires it to stay disabled at install (Q15) |
| `compliance_scorecards` | 162 | migrate | `compliance_scorecards` | Verbatim; `template_id` preserved (all 5 referenced IDs exist in NEW after Q5) |
| `compliance_version_requests` | 0 | migrate | `compliance_version_requests` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `conference_media_leases` | 0 | migrate | `conference_media_leases` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `contact_activities` | 474 | migrate | `contact_activities` | Verbatim. 28 rows with `type=sms` violate NEW check (Q2) |
| `contact_lead_intel` | 0 | migrate | `contact_lead_intel` | identical shape, verbatim |
| `contact_merge_archive` | 2 | migrate | `contact_merge_archive` | `encrypted_snapshot` decrypted (OLD key) and re-encrypted (NEW key) |
| `contact_notes` | 0 | migrate | `contact_notes` | identical shape, verbatim |
| `contact_tags` | 1 | migrate | `contact_tags` | `name_encrypted` decrypted with OLD key and re-encrypted with NEW `encrypt_pii_value` |
| `contacts` | 340 | migrate | `contacts` | Re-encryption (see §4). Plaintext `first_name,last_name,phone,email,dob,address` → NULL (Q3). `pii_encrypted` rebuilt with NEW key; `phone_hash`, `name_search` recomputed with NEW blind-index key; `first_initial,last_initial,phone_last4,email_set,dob_set,mbi_last4` copied (identical derivation). New retention columns: `retention_started_at` from `created_at`; others NEW default |
| `conversely_run_agents` | 12 | migrate | `conversely_run_agents` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `conversely_run_events` | 9 | migrate | `conversely_run_events` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `conversely_runs` | 2 | migrate | `conversely_runs` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `conversely_submissions` | 1 | migrate | `conversely_submissions` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `conversely_week_slots` | 1 | migrate | `conversely_week_slots` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `conversely_weekly_audit` | 17 | migrate | `conversely_weekly_audit` | `retention_started_at` ← NEW trigger anchor (§3.5); 3 new FK(s), 0 orphans |
| `conversely_weekly_runs` | 2 | migrate | `conversely_weekly_runs` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `conversely_worker_status` | 1 | not migrated | `conversely_worker_status` | Worker heartbeat; runtime state recomputed by worker |
| `corrective_actions` | 124 | migrate | `corrective_actions` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `cross_sell_attempts` | 0 | migrate | `cross_sell_attempts` | `retention_started_at` ← NEW trigger anchor (§3.5); 4 new FK(s), 0 orphans |
| `csnp_carrier_verification` | 0 | reference (Q6) | `csnp_carrier_verification` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `dsnp_eae_lookup` | 949 | reference (Q6) | `dsnp_eae_lookup` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `enrolled_agents` | 6 | migrate | `enrolled_agents` | Copied **before** provisioning with OLD ids so provisioning (`ON CONFLICT (clerk_user_id)`) updates in place. 3 rows whose Clerk IDs are not on the roster are copied `is_active=false` (Q9) |
| `enrollment_intakes` | 81 | migrate | `enrollment_intakes` | `pii_encrypted.{dob,mbi,medicaidNum}` re-encrypted per field; `data` jsonb copied as-is (plaintext by NEW design, Q4) |
| `fema_disasters` | 8 | reference (Q6) | `fema_disasters` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `fema_feed_snapshot` | 1 | reference (Q6) | `fema_feed_snapshot` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `follow_ups` | 9 | migrate | `follow_ups` | identical shape, verbatim |
| `followup_queue` | 22 | migrate | `followup_queue` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `ghl_enrollment_deliveries` | 11 | migrate | `ghl_enrollment_deliveries` | `payload_encrypted` re-encrypted; all 11 rows terminal (`uploaded`). `minimize_ghl_delivery_snapshot` trigger not fired (replica load); snapshot preserved as-is |
| `inbound_calls` | 452 | migrate | `inbound_calls` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `integration_deliveries` | 24 | migrate | `integration_deliveries` | Verbatim; stale `lease_token/lease_until` on 24 terminal rows cleared |
| `integration_delivery_attempts` | 88 | migrate | `integration_delivery_attempts` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `integration_link_issues` | 5 | migrate | `integration_link_issues` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `integration_push_state` | 1 | not migrated | `integration_push_state` | Worker cursor singleton; NEW default governs (Q15) |
| `integration_report_log` | 58 | migrate | `integration_report_log` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `intent_detections` | 18,830 | migrate | `intent_detections` | `intent_id` remapped by `intent_code` (all currently NULL in OLD) |
| `ix_upload_retries` | 0 | migrate | `ix_upload_retries` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `ix_uploads` | 0 | migrate | `ix_uploads` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `knowledge_base` | 118 | decision (Q7) | `knowledge_base` | NEW seeds 94 neutralized rows (same 90 keys). OLD 118 rows contain agency wording (Q7) |
| `knowledge_updates` | 769 | not migrated | `knowledge_updates` | Job log of the knowledge refresh job; derived (Q7) |
| `lead_source_pings` | 0 | migrate | `lead_source_pings` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `lead_sources` | 1 | migrate | `lead_sources` | Verbatim (no secrets are set on the one row); new `sandbox`=false |
| `manual_transcript_gap_fills` | 0 | migrate | `manual_transcript_gap_fills` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `manual_transcript_gap_requests` | 0 | migrate | `manual_transcript_gap_requests` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `media_stream_leases` | 0 | migrate | `media_stream_leases` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `message_media` | 6 | migrate | `message_media` | Verbatim except `media_url`: 5 signed storage URLs (token-bearing) → NULL; `storage_path` is the canonical reference |
| `messages` | 28 | migrate | `messages` | Verbatim; NULL `body` (none observed) → `''`; new `error_code,error_message` NULL |
| `opportunities` | 26 | migrate | `opportunities` | `pii_encrypted.{title,notes}` re-encrypted per field; all else verbatim |
| `opportunity_events` | 16 | migrate | `opportunity_events` | identical shape, verbatim |
| `opportunity_stage_history` | 42 | migrate | `opportunity_stage_history` | identical shape, verbatim |
| `paragon_agent_reservations` | 0 | migrate | `paragon_agent_reservations` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_billing_events` | 1,591 | migrate | `paragon_billing_events` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_call_billing` | 337 | migrate | `paragon_call_billing` | `retention_started_at` ← NEW trigger anchor (§3.5); 3 new FK(s), 0 orphans |
| `paragon_callback_tasks` | 1 | migrate | `paragon_callback_tasks` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `paragon_contact_zip_origin` | 1 | migrate | `paragon_contact_zip_origin` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_control_changes` | 0 | migrate | `paragon_control_changes` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_ping_decisions` | 8,608 | migrate | `paragon_ping_decisions` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_report_access` | 492 | migrate | `paragon_report_access` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_report_email_days` | 52 | migrate | `paragon_report_email_days` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_report_email_log` | 53 | migrate | `paragon_report_email_log` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `paragon_report_tokens` | 1 | not migrated | `paragon_report_tokens` | Secrets: report token hash. Operator re-issues (profile `paragon.reportTokenHash`) |
| `paragon_residence_jobs` | 75 | migrate | `paragon_residence_jobs` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `paragon_residence_sep_inputs` | 0 | migrate | `paragon_residence_sep_inputs` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `paragon_residence_settings` | 1 | not migrated | `paragon_residence_settings` | Vendor configuration: bootstrap never enables residence capture; operator initializes if approved (Q11) |
| `phi_redactions` | 0 | migrate | `phi_redactions` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `pii_access_log` | 109,967 | migrate | `pii_access_log` | Verbatim audit history |
| `pipeline_stages` | 5 | migrate | `pipeline_stages` | Verbatim with IDs |
| `pipelines` | 1 | migrate | `pipelines` | Verbatim with IDs (opportunities reference them); default marked through the protected path, confirmed with `ensure_opportunities_pipeline` |
| `plan_terminations` | 192,500 | reference (Q6) | `plan_terminations` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `policies` | 0 | migrate | `policies` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `post_call_jobs` | 441 | migrate | `post_call_jobs` | Verbatim. `dispatch_token` is NOT NULL in NEW; all 441 jobs are `completed` so their tokens are spent |
| `post_call_requests` | 10,432 | migrate | `post_call_requests` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `post_call_status_tickets` | 0 | migrate | `post_call_status_tickets` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `post_call_webhook_claims` | 0 | migrate | `post_call_webhook_claims` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `provider_alert_throttle` | 0 | migrate | `provider_alert_throttle` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `qhp_landscape_2026` | 97,082 | not migrated | `qhp_landscape_2026` | Public reference dataset (Q6); NEW shape drops many columns, operator imports per P0-4 runbook |
| `quiz_leads` | 18 | not migrated | — | OLD-only out-of-band table with plaintext lead PII; no NEW destination; unknown external writer (Q8) |
| `recording_agent_subjects` | 3 | not migrated | `recording_agent_subjects` | Created by roster provisioning (151); `--verify` checks equality with OLD by slug and Clerk ID |
| `recording_call_scopes` | 497 | migrate | `recording_call_scopes` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `recording_compliance_tickets` | 0 | migrate | `recording_compliance_tickets` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `grant_id` |
| `recording_download_tickets` | 0 | migrate | `recording_download_tickets` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `actor_id`, `grant_id`, `storage_path`, `recording_id`, `purpose` |
| `recording_ingestion` | 486 | migrate | `recording_ingestion` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `deletion_pending_at`; 3 new FK(s), 0 orphans |
| `recording_reconciliation` | 563 | migrate | `recording_reconciliation` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `sbe_plans_nj_2025` | 275 | not migrated | `sbe_plans_nj_2025` | Public reference dataset (Q6); NEW shape changed, operator imports per runbook |
| `sbe_plans_pa_2025` | 1,435 | not migrated | `sbe_plans_pa_2025` | Public reference dataset (Q6); NEW shape changed, operator imports per runbook |
| `sbe_plans_va_2025` | 419 | not migrated | `sbe_plans_va_2025` | Public reference dataset (Q6); NEW shape changed, operator imports per runbook |
| `scorecard_items` | 25,042 | migrate | `scorecard_items` | `template_item_id` and `intent_id` remapped via §3.3 maps; everything else verbatim |
| `scoring_jobs` | 100 | migrate | `scoring_jobs` | `retention_started_at` ← NEW trigger anchor (§3.5); 4 new FK(s), 0 orphans |
| `scoring_manual_retries` | 0 | migrate | `scoring_manual_retries` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `scoring_segment_progress` | 137 | migrate | `scoring_segment_progress` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `scoring_template_items` | 1,059 | partial + remap | `scoring_template_items` | Items of canonical/clones remapped by (template, `intent_code`); items of the 2 production-only templates inserted with original IDs (Q5) |
| `scoring_templates` | 8 | partial + remap | `scoring_templates` | Canonical/clone templates already in NEW (content-identical). Only the 2 production-only referenced templates are inserted with original IDs (Q5) |
| `script_templates` | 4 | decision (Q7) | `script_templates` | OLD has 4 tenant-specific scripts; NEW seeds 5 shared neutral ones (Q7) |
| `section_scores` | 446 | migrate | `section_scores` | `notes` (JSON text) split into NEW `section_number`, `completed`, `duration_seconds` (446/446 parse); `score,max_score` (all NULL) dropped; `checklist_total/done` NULL |
| `sessions` | 577 | migrate | `sessions` | `status` (all `active`) and `updated_at` dropped; all else verbatim |
| `snp_plans_by_county` | 53,952 | reference (Q6) | `snp_plans_by_county` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `snp_routing_rules` | 0 | reference (Q6) | `snp_routing_rules` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `star_ratings_by_county` | 38,820 | reference (Q6) | `star_ratings_by_county` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |
| `stt_call_reconnects` | 84 | migrate | `stt_call_reconnects` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `subscriptions` | 1 | migrate | `subscriptions` | Verbatim, Stripe customer/subscription IDs preserved; billing stays behind `STRIPE_BILLING_ENABLED` |
| `telephony_call_attempts` | 534 | migrate | `telephony_call_attempts` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `telephony_events` | 4,110 | migrate | `telephony_events` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `telephony_presence_policy` | 1 | not migrated | `telephony_presence_policy` | Runtime singleton; NEW default governs, OLD value reported (Q15) |
| `telephony_routing_responses` | 966 | migrate | `telephony_routing_responses` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `telephony_transcript_segments` | 41,657 | migrate | `telephony_transcript_segments` | `retention_started_at` ← NEW trigger anchor (§3.5); 2 new FK(s), 0 orphans |
| `tenant_agents` | 4 | migrate | `tenant_agents` | 3 active rows via roster provisioning with OLD `id`, `clerk_user_id`, `agent_slug`, `npn`, `ghl_user_id`, `role` preserved; new `identity_aliases` = [name], `licensed_states` from vendor eligibility (Q10), `team/sunfire_agent_id/ams_producer_id` NULL. 1 inactive row (no Clerk ID) inserted directly with `is_active=false` |
| `tenants` | 1 | migrate | `tenants` | Row created by provisioning from the profile (`id` = OLD tenant id, `clerk_org_id`, names); migration then sets `coop_rates, carrier_options, licensed_states, compliance_config, agency_npn, ghl_location_id, created_at, updated_at` from OLD. `ghl_webhook_url` → NULL (capability URL; re-entered as profile `ghl.postCallUrl`). New `coaching_settings, client_recap_templates, practice_settings` take NEW defaults |
| `training_completions` | 0 | migrate | `training_completions` | identical shape, verbatim |
| `transcript_chunks` | 65 | migrate | `transcript_chunks` | Verbatim; `embedding vector(1536)` copied byte-for-byte, never recomputed |
| `transcript_recovery_alerts` | 4 | migrate | `transcript_recovery_alerts` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `transcript_score_dispatch` | 81 | migrate | `transcript_score_dispatch` | `retention_started_at` ← NEW trigger anchor (§3.5); new (default/NULL): `coaching_state`, `coaching_generation`, `coaching_attempts`, `coaching_available_at`, `coaching_queued_at`, `coaching_token`, `coaching_lease_until`, `coaching_reserved_day`, `coaching_revision`; 1 new FK(s), 0 orphans |
| `transcription_incidents` | 0 | migrate | `transcription_incidents` | `retention_started_at` ← NEW trigger anchor (§3.5); 1 new FK(s), 0 orphans |
| `usage_records` | 68,764 | migrate | `usage_records` | `retention_started_at` ← NEW trigger anchor (§3.5) |
| `user_preferences` | 4 | migrate | `user_preferences` | identical shape, verbatim |
| `vendor_agent_state_eligibility` | 41 | not migrated | `vendor_agent_state_eligibility` | Vendor matrix: supplied as profile `paragon.eligibility` and provisioned; also the source for roster `licensed_states` (Q10/Q11) |
| `vendor_control_audit` | 4 | migrate | `vendor_control_audit` | Verbatim audit history |
| `vendor_controls` | 1 | not migrated | `vendor_controls` | Vendor configuration: created paused by `configure_deployment_vendor` from the profile; OLD values (rate/cap/hours) reported for the operator (Q11) |
| `vendor_routing_config` | 1 | not migrated | `vendor_routing_config` | Vendor configuration, as above (Q11) |
| `zip_county_crosswalk` | 54,571 | reference (Q6) | `zip_county_crosswalk` | Public reference dataset (Q6): identical shape; proposed verbatim copy (embeddings as-is) or operator load |

### Tables only in NEW

65 NEW tables have no OLD source (for example `call_logs`, `sales_log`,
`compliance_scores`, `deployment_settings`, the `ping_*`/`lead_*`/`exchange_*`
platform, retention, supervisor, practice and coaching tables). They stay empty
apart from what bootstrap seeds and provisioning writes.

Production also never had `main`'s `call_logs` table (migrations 037/060), so
there is nothing to carry over.

### Production schema drift from `main` (informational)

- `contact_activities_type_check` in production allows `'sms'`, but no repo migration adds it.
- `quiz_leads` and `cms_snp_conditions` exist in production but in no repo migration or code.
- `call_logs` from 037/060 is absent in production.
- The production scorecard templates `6555110a…` and `93f27a3c…` come from the 143 route that P0-4 omits.

## 9. Open questions for the owner

Each has a recommendation. Phase 2 will not start until these are answered.

**Q1. Drift gate and the storage ownership blocker.**
- The bootstrap cannot run on the current Supabase image without
  `GRANT supabase_storage_admin TO postgres`, because `m153` alters
  `storage.objects`. A hosted project may not permit that grant, which would
  make this a cutover-night blocker independent of the data migration.
- The drift check then reports 475 differences:
  - 180 are a checker serialization artifact: node-pg returns policy `roles`
    (`name[]`) as text, and PGlite returns arrays. This happens on any real
    Postgres.
  - 103 routines show `service_role` EXECUTE added by Supabase default
    privileges. Browser-role grants are unchanged.
  - 58 storage grants remain: m153's REVOKE runs as `postgres`, but the grants
    were made by `supabase_storage_admin`, so `anon`/`authenticated` keep table
    grants on `storage.objects`/`buckets`. RLS is still forced.
  - 7 `pii_vault.encryption_keys` grants to `service_role` are absent (tighter
    than expected).
  - 4 are default-ACL or schema-USAGE platform differences.
- Options:
  - **(a, recommended)** Accept these as documented platform drift for this
    local rehearsal, proceed with provisioning and Phase 2, and record the
    blocker and the storage-grant gap for the P0-4 owner.
  - (b) Before proceeding, add (new files only) a normalizing fix to the
    checker's `name[]` handling and a reviewed platform-prep script that revokes
    the storage grants as `supabase_storage_admin`. This touches the hardening
    tooling and needs your sign-off.

**Q2. 28 `contact_activities` rows with `type='sms'`** violate NEW's check. Options:
- (a, recommended) Write them to the rejects ledger and report them.
- (b) Map them to `'note'`, keeping the original type in the ledger.

No schema change is possible under the rules.

**Q3. Legacy plaintext contact columns.** Recommended: NULL in NEW (your "no
plaintext" rule). Only the envelope and recomputed blind indexes carry PII. All
reviewed lookups (`match_contacts_by_phone`, `search_contacts_secure`,
`outbound_dnc_status`, `reshop_rows`) use `phone_hash`. Only `lead_post_accept`
(the new ping platform, no OLD data, feature off) compares plaintext
`contacts.phone`, so those duplicate-lead checks would not see migrated
contacts. Note that NEW's own trigger still writes plaintext for contacts created
after cutover.

**Q4. Columns that are plaintext by NEW's design** (`call_records.customer_*`,
`enrollment_intakes.data`, transcripts, messages, inbound numbers, post-call
payloads). Recommended: copy as-is. Encrypting them would break NEW's readers.
P0-8 tracks their retirement separately.

**Q5. Production-only scoring templates.** Recommended:
- Insert `6555110a…` and `93f27a3c…` as **inactive** historical templates with
  their original template IDs and original item IDs, referencing NEW intent
  IDs, so 15 scorecards and 2,126 items keep their exact references.
- Remap canonical items and intents as in §3.3.
- Do not copy the three clones that NEW's deterministic clones replace (nothing
  references them).

The alternative is to repoint those 15 scorecards to `…075`/`…115`, which
rewrites history and is not recommended.

**Q6. Public reference datasets** (≈560k rows, including 158,280 CMS plans with
1536-dimension embeddings):
- (a, recommended) Copy the 14 identical-shape tables verbatim (embeddings
  as-is, saving the paid re-embedding) and record source counts.
- (b) Leave them empty for the operator's independent load (P0-4 runbook
  step 6).

QHP/SBE tables changed shape and go to the operator either way.

**Q7. Agency content.**
- `script_templates`: OLD has 4 tenant-specific scripts and NEW has 5 shared
  neutral ones. Recommended: migrate the 4 tenant rows with their IDs, so NGHS
  keeps its approved spoken wording as tenant overrides.
- `knowledge_base`: NEW seeds 94 neutralized rows with the same 90 keys.
  Recommended: keep NEW's seed and do not migrate OLD's 118.

**Q8. `quiz_leads` (18 rows, Aug 2026, plaintext lead PII) and
`cms_snp_conditions`.** No repo code writes them, so another system writes to
the production database. Recommended: do not migrate them; export them
separately if the business needs them; and identify and repoint that external
writer before cutover.

**Q9. Non-roster `enrolled_agents`** (3; one owns 15 sessions). Recommended:
copy all three with `is_active=false` (references need the rows; membership
needs an active roster binding, so they grant nothing).

**Q10. Roster fields OLD lacks.**
- `identity_aliases` = `[name]`.
- `licensed_states` derived from `vendor_agent_state_eligibility` per agent.
- `team`, `sunfire_agent_id`, `ams_producer_id` NULL.
- One active agent has no `ghl_user_id`, so the roster fails validation if
  `GHL_ENABLED=true`. The local rehearsal runs with all features off.
- Profile values not stored in OLD: `agencyLineLabel` (proposed "Agency main
  line"), and `allowedHosts`/`appOrigin`/`telephonyOrigin`. For the local run
  I'd use synthetic non-NGHS `.example` origins; at cutover the operator
  supplies the real ones.
- Derived from OLD at runtime: `tenantId`, `organizationId`, `agencyName`,
  `documentName`, `agencyAliases`, `agencyLine`, `textSender` (the single
  inbound number, which is also the only outbound sender), `timezone` and
  `staffedHours` (from `vendor_controls.staffed_hours`). P0-5 notes that vendor
  hours historically differed from script hours, so confirm which to use.

**Q11. Vendor configuration** (`vendor_controls`, routing config, eligibility,
residence settings). Recommended: do not copy. Configure through
`configure_deployment_vendor` from the profile when Paragon is enabled, which
creates it paused. OLD rate, cap mode and hours are reported for the operator.
Vendor history tables (billing, pings, reports, audits) are migrated.

**Q12. 69 Google Drive recording URLs with an embedded API key** (all from
2026-03-29; that audio exists only on Drive). Options:
- (a, recommended) Strip the `key` parameter, keeping the file reference.
- (b) NULL them.

Either way, the key is listed for rotation.

**Q13. Trigger handling.** Confirm a replica-mode load (§3.2) with explicit
derivation and post-load FK verification. It depends on the target allowing
`session_replication_role` for the migration role. The fallback is a normal-mode
load, which fires side-effect triggers and is not recommended.

**Q14. Queue state.** Copy terminal statuses as-is, clear stale leases, and
leave the 1 pending scoring job pending behind the disabled fence. Confirm.

**Q15. Runtime singletons** (`call_wrap_up_policy`, `telephony_presence_policy`,
`compliance_runtime_control`, `integration_push_state`). Recommended: keep NEW's
install defaults and report the OLD values.

**Q16. Embeddings coverage** (informational). Only 3 of 434 transcripts have
chunks (65 embeddings). They are copied as-is and never recomputed, as you
specified.

**Q17. 28 orphan legacy recordings** (71 MB, no row references them).
Recommended: list them in the manifest flagged `unreferenced` and let the
operator decide whether to copy them.
