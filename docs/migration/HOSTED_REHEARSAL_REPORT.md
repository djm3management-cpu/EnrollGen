# Hosted rehearsal report: enrollgen-v2

Branch `feature/live-migration`. Target: the Supabase project **enrollgen-v2**
(West US, Oregon), reached only through its session pooler with verified TLS
(project CA certificate, `sslmode=verify-full`). It becomes production on the
night of **Monday, December 7, 2026**.

Current production was never contacted. Nothing was pushed, merged or deployed,
and no Supabase setting was changed by this work. The disk autoscale described in
§4 was done by the platform, and the plan/disk decisions were the owner's. Every
remote action is in `~/enrollgen-migration/actions.log`.

This report contains counts, timings, hashes, object names and placeholders only.
It contains no secrets, PHI, connection strings, project ref or pooler host.

Companion documents:
- [hosted-rehearsal-diagnosis.md](hosted-rehearsal-diagnosis.md) (Phase A)
- [MIGRATION_REPORT.md](../../MIGRATION_REPORT.md) (local rehearsal)
- [live-to-fresh-mapping.md](live-to-fresh-mapping.md)
- [tool README](../../scripts/migration/live-to-fresh/README.md)

**End state:** enrollgen-v2 is **populated**. That is the result of the second full
cycle, which passed `--verify` and app-check. The local OLD container
`enrollgen-old` is stopped.

## Summary

| Gate | Result |
|---|---|
| Bootstrap on hosted (fixed process) | completed, both cycles |
| Drift `--platform supabase-hosted` | **exit 0**, both cycles: 0 remaining, 68 owner-approved rows accepted, 0 unused |
| P0-2 database access matrix + storage boundary, on hosted | **24/24 in one run** (2,489 s) |
| Dry-run rejects | 0 (963,717 rows), both cycles |
| Migration rejects / FK orphans | 0 / 0, both cycles |
| `--verify` | **exit 0**, both cycles |
| App-check | pass, both cycles |
| Storage copy E2E (synthetic) | 10/10 verified, resume re-uploads nothing |
| Reset-to-empty | empty check passes; fingerprint equals day-one baseline |
| Second full cycle | completed; measured peak 2.75 GB of 8 GB (WAL peak 0.92 GB) |
| Suites | migration 35/35; root 1,951/1,951; telephony 790/791 (one throughput-timing test, §7) |

## 1. Blockers B1–B9: how each was resolved

| # | Blocker | Resolution on hosted | Commit |
|---|---|---|---|
| **B1** | Bootstrap could not `ALTER` `storage.objects` (not owner) | Fixed (see detail below) | `5939ee7` |
| **B2** | 180 drift entries from the `name[]` policy-roles serialization | Fixed: the read-only catalog query selects `roles::text[]`, which node-pg parses into an array. Proven on hosted to be serialization only; on both cycles no policy differences remain | `4afab6a` |
| **B3** | `service_role` EXECUTE on 103 routines | **Did not occur on hosted.** The hosted function default ACL is `{postgres=X/postgres}`. No change was made | — |
| **B4** | Browser grants on `storage.objects`/`buckets` survive the seal | **Cannot be fixed on hosted without weakening a control.** Owner-accepted option (a) (see detail below) | `5939ee7`, `9b9789f`, `45b178e`, `fc25528`, `d2b4c5a` |
| **B5** | `pii_vault.encryption_keys` lacked the expected `service_role` grants | Tightened: `seal.sql` revokes them explicitly; the expected catalog was regenerated (7 rows removed). A test proves `service_role` still encrypts and decrypts through the security-definer routines | `cb85b90` |
| **B6** | Default ACLs and schema USAGE | Accepted as exact owner-approved rows (8 default-ACL rows, 2 schema-USAGE rows). The `supabase_admin` default ACLs in `public` cannot be changed by `postgres`. The bootstrap creates no `supabase_admin`-owned object in `public`, and drift would show one | `45b178e` |
| **B7** | `session_replication_role` on hosted | **Resolved, no change.** `SET LOCAL session_replication_role = replica` is allowed for `postgres` (`supautils.privileged_role_allowed_configs`) through the session pooler. It disables user and FK triggers | — |
| **B8** | Fence trigger silently drops rows outside replica mode | Requirement confirmed on hosted (the silent drop was reproduced). The engine loads every batch in replica mode. `--verify` balanced all 13 fenced tables in both cycles | — |
| **B9** | Tools refused non-local hosts | Fixed (see detail below) | `83f8d60`, `31368e6` |

**B1 detail.**
- `m153` statement 15 enables RLS only when `relrowsecurity` is false. Hosted
  already enables it, and the statement still fails loudly where RLS is off and
  `postgres` is not the owner.
- The fresh-install test undoes this single reviewed guard and still requires the
  statements to equal migration 153 byte for byte.
- `seal.sql` now asserts the storage boundary at install:
  - no non-RLS privileges for browser roles;
  - RLS-governed privileges only with RLS on;
  - no browser-applicable storage policy;
  - both buckets private.
- Checksums were regenerated with
  `scripts/recovery/rebuild-bootstrap-checksums.mjs`.

**B4 detail.**
- `anon` and `authenticated` keep SELECT/INSERT/UPDATE/DELETE granted by
  `supabase_storage_admin`. REVOKE is a no-op, `GRANTED BY` is refused, `SET ROLE`
  is refused, and the role membership is reserved.
- The boundary is RLS with no browser policy. It is proven on hosted by
  `storage-access-boundary.test.js`: read 0 rows, update 0 rows, delete denied,
  insert denied, and state unchanged, for both roles and both tables.
- The 58 grant rows are exact, category-confined drift exceptions.
- P0-2 line 109 accepts 0 rows on hosted (owner-approved).

**B9 detail.**
- The `--remote-host`/`--remote-ref` opt-in covers the bootstrap CLI,
  `live-to-fresh` (`--new` only; `--old` stays local) and app-check. It requires:
  - the exact host;
  - the ref in the pooler user or direct host;
  - no password in the URL (`PGPASSWORD` only);
  - `verify-full` with a CA file;
  - `SUPABASE_URL` exactly `https://<ref>.supabase.co`.
- The retired production ref is refused in every argument.
- With a remote target, any reject, failed batch or FK orphan stops before commit,
  with no row-by-row retry, and sessions set `log_min_error_statement=panic`.
- This supersedes the P0-4 runbook's "no remote mode" note.

**Supporting tools added and tested in this phase:**
- `scripts/migration/live-to-fresh/storage-copy.mjs` (`daeaf41`)
- `scripts/migration/live-to-fresh/reset-to-empty.mjs` (`2d8c7bf`)
- the opt-in hosted target for the P0-2 matrix: `tests/helpers/hostedAccessTarget.js`
  and `tests/fixtures/hosted-access-env.js` (`fc25528`)

## 2. Default privileges (Phase A step 1)

The project's "grant API access to new tables" option is **off**. On day one:
- `postgres` default ACL for tables in `public`:
  `{postgres=arwdDxtm,anon=Dxtm,authenticated=Dxtm,service_role=Dxtm}`. So new
  tables give browser roles no SELECT/INSERT/UPDATE/DELETE, but they do get
  TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.
- Sequences: `{postgres=rwU}`.
- Functions: `{postgres=X}`, a per-schema addition; the built-in PUBLIC EXECUTE
  still applies.
- `supabase_admin` defaults in `public` grant browser roles everything. These
  apply only to `supabase_admin`-created objects, and `postgres` may not alter them.
- There are no global (schema 0) `postgres` defaults.

The bootstrap's own revokes remove the browser rights:
- the m153 per-table `REVOKE ALL`;
- the m154/seal default-privilege revokes;
- explicit `service_role` grants.

This was proven by the drift check and the hosted P0-2 matrix (24/24). After the
bootstrap, the `postgres` table default in `public` is
`{postgres=arwdDxtm,service_role=Dxtm}`. Nothing was changed in the project's
settings.

## 3. Drift and access matrix

**Drift.** The plain checker on hosted found 68 differences, all in the approved
categories. Owner-approved file: `supabase/bootstrap/platform-supabase-hosted.json`.

| Category | Rows | What they are |
|---|---:|---|
| B4 storage grants | 58 | 16 browser-role grants and 14 `service_role` grants from `supabase_storage_admin`; 14 `postgres` grants WITH GRANT OPTION; 14 expected owner rows absent because `postgres` is not the owner |
| B6 default ACLs | 8 | |
| B6 `public` schema USAGE | 2 | |

With `--platform supabase-hosted`, both cycles returned exit 0: 0 remaining, 68
accepted, 0 unused. Any other difference still exits 1.

**P0-2 access matrix on hosted** (`ACCESS_MATRIX_TARGET=hosted`):
- **24/24 in one run** (2,489 s). That is 12 SQL scenarios, 11 handler scenarios
  and the storage boundary test.
- Each scenario ran inside a rolled-back transaction. Row counts and the catalog
  fingerprint were identical before and after.
- The earlier full run had 21/24. Three tests failed and passed only after fixes,
  not on a plain rerun:
  - **Two RTS handler tests** failed because of a defect in the hosted test
    adapter: concurrent queries from `Promise.all` interleaved savepoints on one
    connection. The adapter now serializes calls.
  - **The ordinary-agent test** expected `42501` on `SELECT * FROM storage.objects`.
    Hosted returns 0 rows (B4). The line was changed with owner approval: hosted
    requires 0 rows, in-process still requires `42501`.
- The hostile pre-150 grants cannot be injected on hosted. The platform's own
  default grants played that role.

## 4. Runtimes over the network

The client is on the operator machine; the database goes through the us-west-2
session pooler with verified TLS.

| Step | Cycle 1 | Cycle 2 |
|---|---:|---:|
| Unmodified bootstrap to its failure (Phase A, 2,291 statements) | 210 s | — |
| Bootstrap (fixed) | 350 s | 348 s |
| Drift check | 3.2 s | 3.5 s |
| P0-2 matrix + storage test (full run) | 2,489 s | not rerun |
| Dry-run (real decrypt/encrypt, no writes) | 85 s | 85 s |
| Run 1 (exports + pre-provision; exit 3) | 5.2 s | 5.6 s |
| Provisioning `--apply` (API) | 1.4 s | 1.4 s |
| Run 2 (full load, 963,717 rows) | 1,231 s + 1,016 s resumed = 2,247 s | 2,647 s |
| `--verify` | 103 s | 105 s |
| App-check | 6.6 s | 6.8 s |
| Storage copy E2E, 10 synthetic files (856,355 bytes) | 5.5 s; resume 0.4 s | — |
| Reset-to-empty (Storage API + SQL + proof) | 81 s | — |

**Cycle 1 run 2 stopped once.** At about 1.86 GB used (database 974 MB, WAL 839 MB),
the platform set `default_transaction_read_only=on`. Stop-on-reject halted the run
before the commit, with 0 rejects. The disk then autoscaled to 8 GB (a 4-hour
cooldown followed). The run resumed from its ledger cursor with no code change.

**Cycle 2 disk.** A read-only watchdog sampled `pg_database_size` plus WAL every
10 s (329 samples), with a kill threshold of 5.0 GB. It never tripped.

| | Measured |
|---|---:|
| Peak, database + WAL | **2.75 GB** (database 1.83 GB + WAL 0.92 GB): 34% of the 8 GB disk |
| **WAL peak** | **0.92 GB** (during run 2; checkpoints reclaimed WAL throughout) |
| Final database | 1.83 GB (the pre-measured estimate was 1.88 GB) |
| Dashboard "System" | ~170 MB more, not visible to SQL |

## 5. Verify and app-check

**`--verify`: exit 0 in both cycles.**

| Check | Result |
|---|---|
| Tables | 129/129 balanced (source = migrated + rejected); 963,435 per-table rows, plus the 282-row scoring subset verified separately |
| External-ID columns | 56/56 identical |
| PII | 185/185 fields hash-identical (OLD key vs NEW key); 0 plaintext contact columns; 0 OLD key ids; 0 blind-index mismatches |
| FKs | 0 violations across 325 |
| Embeddings | `transcript_chunks` and `cms_plan_embeddings_py2027` identical |
| Scoring | 0 scorecards, jobs or items missing a template; 25,042 remapped items, all content-identical |
| Roster bindings | `availability_agent_subjects` 3 = 3 and `recording_agent_subjects` 3 = 3, identical |

**App-check: pass in both cycles**, using the app's own server code over the
hosted API:
- Startup check OK, with 3 active roster agents.
- All 3 agents resolve through the app (`rosterIdentity`) and the SQL resolver,
  with enrolled-agent ids preserved.
- Contacts 340 = 340; `call_records` 562 = 562; `v_call_log` 612 = 612.
- A migrated call opens with its transcript (non-empty) and a 143-item scorecard
  (equal to OLD) on an existing template. That call has no Twilio SID, the same
  as in the local rehearsal.

## 6. Reset-to-empty and the second cycle

**Day-one baseline.** The baseline is a catalog fingerprint of the empty project,
taken before the Phase B bootstrap. It is stored privately in
`~/enrollgen-migration/` with mode 0600. After the reset, the script captured a
native baseline itself, and it equals the converted one exactly (440 keys).

**Reset result** (81 s):

| Removed | |
|---|---|
| Storage (via the Storage API, allowlisted ids only) | 2 buckets emptied and deleted |
| Schemas | `pii_vault`, `oct_slim_086_rollback`, `oct_slim_088_rollback`, `migration_ledger` |
| `public` objects | 20 views, 217 tables, 426 routines |
| Other | the `vector` extension; the Vault secret `pii_encryption_key_v1`; seal's `service_role` storage grants |
| Default privileges | 3 statements to restore the day-one default ACLs |

Proof: the empty-target check passes (0 relations, routines, application schemas,
policies, buckets and objects), and the **fingerprint equals the day-one
baseline**.

**Second cycle:** bootstrap → drift (exit 0) → dry-run (0 rejects) → run 1 →
provisioning → run 2 (0 rejects, 0 orphans) → `--verify` (exit 0) → app-check
(pass). It ran under the disk watchdog (§4). The cycle repeats cleanly.

## 7. Test counts

| Suite | Tests | Pass | Fail |
|---|---:|---:|---:|
| `npm run test:migration` | 35 | **35** | 0 |
| Root `npm test -- --test-concurrency=4` | 1,951 | **1,951** | 0 |
| Telephony `npm test --prefix telephony -- --test-concurrency=4` | 791 | 790 | 1 |
| Hosted P0-2 matrix + storage boundary (one run) | 24 | **24** | 0 |

The telephony failure is `tests/pingLoadBaseline.test.js:18`.
- Its load generator sent only 56 pings in the window, under the parallel suite
  load; the test requires at least 60.
- It had 0 errors and 0 double reservations, and p95 latency was 135 ms.
- In isolation it passed 3/3.
- This branch changes no file under `telephony/` compared with `release/next`.
- It is a throughput-timing sensitivity, also seen in the local rehearsal; it is
  not a correctness failure.

## 8. Cutover-night runbook: Monday, December 7, 2026

Read each line fully before doing it. The rules for the whole night:
- Never paste a password, key or connection string into chat, a ticket or a
  document. Values live only in the password manager and in
  `~/enrollgen-migration/hosted.env` / `inputs.env`.
- If any step says **STOP**, go to step 40 (the rollback decision).

Times are measured from this rehearsal unless marked "estimate".

### Before the night (by Sunday, December 6)

1. **Confirm the database gates.**
   - Confirm `feature/live-migration` has been reviewed and merged by the owner.
   - Confirm the application release that targets the fresh-install schema is the
     one `main` will deploy. The app version that runs against current
     production does not match the new schema.
   - This is a release decision outside this rehearsal. Without it, **do not
     start**.
2. **Supabase dashboard → enrollgen-v2.**
   - Confirm the disk shows 8 GB and no disk cooldown is in progress.
   - Confirm Database → SSL shows the same CA, saved as
     `~/enrollgen-migration/enrollgen-v2-ca.crt`.
3. **Check the private files.**
   - `~/enrollgen-migration/hosted.env` holds the enrollgen-v2 values.
   - `~/enrollgen-migration/inputs.env` holds `OLD_PII_ENCRYPTION_KEY`.
   - `~/enrollgen-migration/enrollgen-v2-day-one-baseline.json` exists.
4. **Collect the three GHL user IDs** for the three roster agents (one is missing
   today), from the GHL account owner.
5. **Collect the real values the profile needs:**
   - `appOrigin` and `telephonyOrigin` (the real HTTPS origins);
   - `ghl.postCallUrl` and `ghl.enrollmentUrl`;
   - the Paragon settings in step 33.
   Keep them in the password manager.
6. **Record every current production setting you will change, in the password
   manager under "rollback: production".**
   - Netlify: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (and `SUPABASE_SERVICE_ROLE_KEY`
     / `SUPABASE_SERVICE_KEY` if present), `VITE_SUPABASE_URL`,
     `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`),
     `DEPLOYMENT_PROFILE_JSON` and the feature flags.
   - Railway: the same server variables for the telephony service and the
     integrations worker.
   - Twilio: a screenshot of each phone number's Voice and Messaging URLs and
     status callbacks, and of the TwiML App's Voice URL.
   - Netlify: the id of the current production deploy.
7. **Tell agents the maintenance window** (proposed: 8:00 p.m. – midnight ET; the owner confirms), no calls.

### T+0:00. Freeze and reset

8. **8:00 p.m.**
   - Set all agents unavailable in the app.
   - Ask the vendor (Paragon) to stop sending traffic for the window.
   - From now on, nothing may write to current production.
9. Open a terminal in the repository, on the merged branch:
   - `cd ~/Code/EnrollGen && git status` must say clean.
   - Then `set -a; . ~/enrollgen-migration/hosted.env; set +a`
   - and `export PGPASSWORD="$REHEARSAL_DB_PASSWORD"`.
   - Then:
     `NEW_URL="postgresql://$REHEARSAL_DB_USER@$REHEARSAL_DB_HOST:5432/postgres?sslmode=verify-full&sslrootcert=$HOME/enrollgen-migration/enrollgen-v2-ca.crt"`
     and `REMOTE="--remote-host $REHEARSAL_DB_HOST --remote-ref $REHEARSAL_PROJECT_REF"`.
10. **Reset enrollgen-v2 to empty** (about 1.5 minutes):
    `TARGET_SUPABASE_SECRET_KEY="$REHEARSAL_SECRET_KEY" node scripts/migration/live-to-fresh/reset-to-empty.mjs --baseline ~/enrollgen-migration/enrollgen-v2-day-one-baseline.json --connection "$NEW_URL" $REMOTE --api-url "$REHEARSAL_SUPABASE_URL" --confirm-reset "$REHEARSAL_PROJECT_REF"`.
    It must end with "fingerprint equals day-one baseline: true". Otherwise
    **STOP**.

### T+0:05. Fresh production dump

11. **Take a fresh dump** (operator, with production credentials from the password
    manager, on this machine only):
    `pg_dump -Fc --no-owner --no-privileges --schema=public --schema=storage -f ~/enrollgen-migration/prod-2026-12-07.dump "<production URL from password manager>"`.
    Then `shasum -a 256` the file and write the hash in the cutover log.
12. **Recreate OLD from it:** follow MIGRATION_REPORT §14 steps 2–4, with the new
    dump file. The restore takes about 2 minutes. Expect exactly the 10 known
    restore errors.
13. **Start OLD and set its URL:** `docker start enrollgen-old`. Set
    `OLD_DB_URL="postgresql://postgres:<local OLD password>@127.0.0.1:55432/old"`;
    the password is the one you chose in step 12.
14. **Take the exact OLD inventory.** Compare per-table counts with
    `old-inventory.json`. New rows since the rehearsal are expected; explain any
    table that shrank or is new. Otherwise **STOP**.

### T+0:20. Bootstrap

15. **Bootstrap** (about 6 minutes):
    `node scripts/bootstrap-database.mjs --connection "$NEW_URL" $REMOTE`.
    It must print "Fresh-install bootstrap completed". Otherwise **STOP**.
16. **Drift check** (seconds):
    `node scripts/check-database-drift.mjs --connection "$NEW_URL" --platform supabase-hosted`.
    It must exit 0 with `"matches": true` and `unusedPlatformExceptions` empty.
    Otherwise **STOP**.

### T+0:30. Provisioning inputs

17. **Emit the profile and roster:**
    `node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --emit-provisioning ~/enrollgen-migration/cutover-provision --app-origin <real appOrigin> --telephony-origin <real telephonyOrigin>`.
18. **Add the GHL user IDs.** Open `~/enrollgen-migration/cutover-provision/roster.json`
    and put the three GHL user IDs from step 4 into each agent's `ghl_user_id`.
    Save. Do not change anything else.
19. **Add the GHL URLs.** In `profile.json`, add `ghl.postCallUrl` and
    `ghl.enrollmentUrl` from step 5. Keep `GHL_ENABLED` off until step 34.
20. **Preview:**
    `DEPLOYMENT_PROFILE_JSON="$(cat ~/enrollgen-migration/cutover-provision/profile.json)" GHL_ENABLED=true node scripts/provision-deployment.js ~/enrollgen-migration/cutover-provision/roster.json --preview`.
    It must show 3 active agents, and the GHL validation must pass. Otherwise
    **STOP**.

### T+0:35. Migration

21. **Load the OLD key:** `set -a; . ~/enrollgen-migration/inputs.env; set +a`.
22. **Dry-run** (about 1.5 minutes):
    `node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_URL" $REMOTE --dry-run`.
    Every table must say `rejected 0`. Otherwise **STOP**.
23. **Run 1:** the same command without `--dry-run`. It exits with code 3 and says
    provisioning is needed. That is correct.
24. **Provision** (seconds):
    `DEPLOYMENT_PROFILE_JSON="$(cat ~/enrollgen-migration/cutover-provision/profile.json)" SUPABASE_URL="$REHEARSAL_SUPABASE_URL" SUPABASE_SECRET_KEY="$REHEARSAL_SECRET_KEY" node scripts/provision-deployment.js ~/enrollgen-migration/cutover-provision/roster.json --apply`.
    It must print "Deployment roster provisioned".
25. **Run 2, the full load** (about 40–45 minutes): the step-23 command again.
    - If it stops, read the message. A `25006` (read-only) means disk:
      **STOP**.
    - For anything else, rerun the same command once. It resumes from where it
      stopped.
    - Any "rejected" greater than 0 is a **STOP**.
26. **Verify** (about 2 minutes): the step-23 command with `--verify`. It must exit
    0 with unbalanced 0, mismatched 0 and FK violations 0. Otherwise **STOP**.
27. **App-check** (seconds):
    `DEPLOYMENT_PROFILE_JSON="$(cat …/profile.json)" SUPABASE_URL="$REHEARSAL_SUPABASE_URL" SUPABASE_SECRET_KEY="$REHEARSAL_SECRET_KEY" node scripts/migration/live-to-fresh/app-check.mjs --old "$OLD_DB_URL" --new "$NEW_URL" $REMOTE`.
    It must show startup ok and all agents true. Contacts, calls and call log new
    must equal old. Otherwise **STOP**.

### T+1:30. Storage copy of the real recordings and media

28. **Copy the files.** Run 472 objects, 2.2 GB, including the 28 unreferenced
    legacy recordings:
    `SOURCE_SUPABASE_SECRET_KEY="<production server key from password manager>" TARGET_SUPABASE_SECRET_KEY="$REHEARSAL_SECRET_KEY" node scripts/migration/live-to-fresh/storage-copy.mjs --manifest ~/enrollgen-migration/storage-manifest.json --ledger ~/enrollgen-migration/storage-copy-ledger.json --source-url "<production API URL from password manager>" --target-url "$REHEARSAL_SUPABASE_URL" --target-ref "$REHEARSAL_PROJECT_REF" --include-unreferenced`.
    - The run regenerates the manifest. Use the one written by step 25.
    - Estimate: up to 60 minutes. Real-data speed was not measured, because no
      real recording was read in the rehearsal.
    - It must end with `failed 0`. If it stops, rerun the same command: it resumes
      from its ledger.
    - It can run in a second terminal while steps 29–33 proceed.

### T+2:00. Authority, secrets, keys, vendor

29. **Grant admin authority.** Supabase dashboard → enrollgen-v2 → SQL editor. Run:
    `BEGIN; INSERT INTO public.deployment_authorities(tenant_id, clerk_user_id, authority, team_agent_ids) VALUES ('<tenantId from profile.json>', '<Clerk user id of the admin agent>', 'admin', '{}'); COMMIT;`
    Then run
    `SELECT authority FROM public.resolve_deployment_subject('<same Clerk user id>', '<organizationId from profile.json>');`.
    It must return `admin`.
30. **Confirm the default pipeline.** In the same editor, run
    `SELECT public.ensure_opportunities_pipeline('<tenantId>', '<admin roster id>');`.
    It must return the migrated default pipeline's id.
31. **Re-enter secrets** (names only here; values from the password manager):
    - the GHL post-call and enrollment URLs (already in the profile);
    - new availability consumer credentials (issue new ones; do not reuse old);
    - a new Paragon report token (set `paragon.reportTokenHash`);
    - Paragon push/postback URLs and secrets;
    - all server credentials in Railway and Netlify (Twilio, Clerk, Deepgram,
      OpenAI, Conversely, IX, Resend, Stripe, agent WS signing secret, inbound
      vendor key).
32. **Rotate the Google API key.**
    - In Google Cloud Console → APIs & Services → Credentials, create a new
      restricted key for Drive.
    - **Delete the old key** that was embedded in the 69 Drive recording URLs.
    - Record the date in the cutover log.
33. **Paragon re-enable checklist** (MIGRATION_REPORT §11). In profile `paragon.*`,
    set:
    - rate 28.00; daily cap none; cap mode soft;
    - staffed hours Mon–Fri 10:15–17:15 ET;
    - plan year 2027; reservation TTL 30 s;
    - allowed states AR, DE, FL, GA, NJ, OH, SC, TX, VA;
    - required carriers aetna, humana, uhc, wellcare, devoted, healthspring;
      critical carriers uhc, humana;
    - the 41-row eligibility matrix.

    Then turn `PARAGON_ENABLED=true` and re-run step 24: it creates the vendor
    control **paused**. Unpause only after the smoke test (step 39) passes and the
    owner says so. Initialize residence capture only if approved.
34. **Feature flags.** Set each flag in Netlify and Railway per the P0-6 inventory.
    - Turn on only what the owner approved for launch night.
    - `GHL_ENABLED=true` only once the three GHL user IDs are in (step 18).
    - Scoring: decide whether to keep `compliance_runtime_control.enabled = true`
      as migrated (MIGRATION_REPORT §12) before turning on `SCORING_ENABLED`.

### T+2:30. Repoint the services

35. **Twilio** (console → Phone Numbers, and → TwiML Apps):
    - For each number and the TwiML App, change **only the host part** of every
      Voice URL, status callback and Messaging URL to the real `telephonyOrigin`.
      Keep the paths exactly as recorded in step 6 (for example `/twilio/voice`,
      `/twilio/status`, `/twilio/sms`, `/twilio/sms-status`).
    - If the telephony origin is unchanged, confirm each value still matches and
      change nothing.
36. **Railway** (telephony service and integrations worker): set
    - `SUPABASE_URL` to the enrollgen-v2 API URL;
    - `SUPABASE_SECRET_KEY` to the enrollgen-v2 server key (also any legacy
      `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_KEY` the service still reads);
    - `DEPLOYMENT_PROFILE_JSON` to the final profile;
    - the flags from step 34.

    Redeploy both. Each service refuses to start if its profile does not match the
    provisioned mirror. A start failure is a **STOP**.
37. **Netlify** (site → Environment variables): set `SUPABASE_URL`,
    `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (and
    `VITE_SUPABASE_ANON_KEY` if present), `DEPLOYMENT_PROFILE_JSON` and the flags.
38. **Publish the newest Netlify deploy.** Netlify → Deploys → "Trigger deploy →
    Clear cache and deploy site".
    - The `VITE_` values are baked in at build time, so a rebuild is required.
    - Do not use the `netlify deploy --prod` CLI: production builds come from
      `main`.
    - Wait for "Published".

### T+3:00. Smoke test

39. **Smoke test** (about 20 minutes):
    1. Each of the three agents logs in and sees their name, their contacts and
       the call log.
    2. Place **one inbound** test call to the main number. It must ring an agent,
       connect, and appear in the call log.
    3. Place **one outbound** test call from the app. It must connect and appear.
    4. Open one migrated call record. The transcript must show, and the score must
       show its items.
    5. In the enrollgen-v2 SQL editor, `SELECT count(*) FROM call_records` must be
       2 higher than app-check's number.
    6. Open one migrated recording: it must play. This proves the storage copy.

    If everything passes, announce the end of maintenance and unpause Paragon only
    on the owner's word. Stop OLD with `docker stop enrollgen-old`.

### Rollback (decide by 11:30 p.m. ET; it takes about 20 minutes)

40. **When to roll back.** If any STOP cannot be fixed by 11:30 p.m. ET, or the
    smoke test fails, the owner says "roll back".
    - Current production was never modified, so it is intact.
    - Everything written to enrollgen-v2 after step 39 started will not be in
      production. List it afterwards with `created_at` after the cutover time, so
      it can be re-entered.
41. **Netlify.**
    - Restore every variable from "rollback: production" (step 6):
      `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the legacy keys,
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY`,
      `DEPLOYMENT_PROFILE_JSON`, and the flags.
    - Then Deploys → open the production deploy recorded in step 6 → "Publish
      deploy". About 2 minutes.
42. **Railway.** Restore the same variables on the telephony service and the
    integrations worker, and redeploy the previous deployment of each. About
    5 minutes.
43. **Twilio.** Only if step 35 changed anything, set every URL back to the step-6
    screenshot values. About 5 minutes.
44. **Paragon and GHL.**
    - Tell Paragon to resume against the old setup.
    - Revoke the new consumer credentials and the new Paragon report token issued
      in step 31.
    - Keep the Google key rotation: the old key was exposed and must stay deleted.
45. **Verify the rollback.**
    - One agent logs in to the old app.
    - One inbound and one outbound test call.
    - Announce the end of maintenance.
    - Leave enrollgen-v2 as it is for diagnosis, and reset it (step 10) before the
      next attempt.

## Notes

- **Process deviation.** A read-only `actions.log` tail shown in a tool result
  during Phase B displayed the rehearsal project ref and pooler host once, in the
  session transcript. Neither is a credential; the log itself is allowed to hold
  them. No password, key or connection string was printed.
- **Stale inventory (not changed here).** `operator-objects.json`'s Netlify module
  list does not include three newer function files (`_pingPortal.js`,
  `ping-buyer.js`, `ping-operator.js`). Refresh it in its own change.
- **Superseded note.** `docs/pilot-p0-4-fresh-install.md` runbook step 4 says
  there is "intentionally no remote mode" in `bootstrap-database.mjs`. The
  owner-approved B9 opt-in supersedes it.
