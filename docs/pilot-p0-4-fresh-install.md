# P0-4: rebuildable fresh installation

This is a new installation artifact for a **separate pilot database**, on
`pilot/release`. It is not a production upgrade or a repair of production history.
No hosted database, provider, deployment, push, environment file, dependency
manifest, lockfile, application styling, phone server or session lock was changed.
The audit and P0-2/P0-5/P0-6 handoffs govern the result. In particular, the opening
approved route in `docs/compliance-overhaul/ROLLOUT.md` supersedes its stale later
instructions: **143 is omitted; 142 → 144 → 145 is intentional**.

## Installation artifact and order

`supabase/bootstrap/manifest.json` is the ordered, SHA-256 checked manifest. It
contains explicit exclusions by historical statement number and replacement
notes. `sql/mNNN.sql` files are separate reviewed copies, with source-statement
markers; original migrations 000–156 are unchanged. `sql/seedNNN.sql` retains the
canonical seeds. No CLI seed-after-migrations behavior is assumed.

1. `platform.sql` checks empty public application tables, Supabase schemas and a
   BYPASSRLS service role; installs pgcrypto and pgvector in `extensions`, and
   Supabase Vault. Platform auth/storage are prerequisites, not recreated here.
2. `base-transcripts.sql` extracts the executable transcript SQL from
   `docs/supabaseschema`, removes its agency default, and supplies both vector
   search signatures required by 063. It includes the vector index and metadata
   indexes, agents, parent transcripts and chunks.
3. `base-missing.sql` supplies new reviewed baseline contracts for legacy
   compliance scores, messaging/MMS attachments, availability and its status log,
   federal QHP and three state-exchange reference tables. These are explicit new
   installation definitions, not claims about the current production catalog.
4. `reference-sep.sql` and `reference-bulletins.sql` supply the existing external
   schema prerequisites before numbered deltas: ZIP/county, stars, SNPs,
   terminations, legacy FEMA and bulletins.
5. Retained numbered deltas run in ascending order, including 000/001 before 002.
   The media-stream SID repair runs immediately after 074. Seeds 001–005 run
   immediately before 075, including compliance intents and the canonical scoring
   template required by 075 and later taxonomy/rubric clones.
6. 143 is absent. 144 and 145 follow 142. 146–149 retain intake, bounded transcript
   recovery, ticket and delivery changes. 150–156 execute **in full**, with exactly
   their original executable statements. 156 runs after the final call-log view
   definitions and the profile/timezone rewrites in 151.
7. `seal.sql` verifies privacy by forcing both buckets private, completes messaging
   foreign keys, grants service access, and closes both global and per-schema
   default privileges for every application object owner. It explicitly publishes
   only read-only state-exchange references. No unknown operational table is open.

The final catalog contains 162 public tables, 20 public views, 254 application
routines across the captured schemas, and two buckets. The expected snapshot also
records columns/defaults, RLS/FORCE flags, policies, table grants, explicit column
ACLs, routines including definitions/owner/SECURITY DEFINER/search_path/ACL,
constraints, indexes, triggers, schema/default ACLs, Realtime publication and
bucket settings. Extension-owned routines are platform dependencies rather than
application RPCs. The snapshot excludes platform auth/storage/Vault internals;
their real-platform equivalence is not claimed. It records application policies
on storage objects and bucket settings. PostgreSQL 18 NOT NULL constraints are
represented through column nullability, avoiding duplicate version-specific
constraint rows.

## Exclusions and replacements

The exact statement inventory is in `manifest.json`; statement numbers count SQL
statements, not lines, and ignore comments while preserving dollar-quoted bodies.
No source webhook value is copied into this artifact, reports or logs.

| Historical group | Fresh-install treatment |
|---|---|
| 007 tenant/hook/roster INSERTs | Excluded entirely, before materializing bootstrap SQL. Retain tenant/roster schema, tenant columns, indexes, security and views. Remove current-tenant backfills and implicit tenant defaults inside the mixed DO block. |
| 008 internal subscription treatment | Exclude subscription seed. Keep subscription/usage schema and security. Disabled billing follows the existing P0-6 policy; no internal-agency entitlement is seeded. |
| 009 knowledge, 013/014 scripts | Preserve approved script/legal/reference text with neutral agency wording. 013/014 become shared NULL-tenant templates, with no organization selector or tenant-created prerequisite. No existing agency identity is required or inserted. |
| 010 mixed settings DO seed | Exclude agency/org/carrier/co-op/compliance settings writes. Preserve every schema/default/index/trigger change and the authenticated update policy; final P0-2 authority replaces legacy policy behavior. Canonical legal/rubric content remains in retained templates and scoring seeds. |
| 015, 017, 018, 030, 031 fixed tenant defaults | Remove implicit agency identity; NULL never grants tenancy. Service/browser protected paths must provide/derive explicit tenant bindings. Retain all tables, constraints, indexes, fields and security changes. |
| 019, 023, 026 | Exclude availability/roster/NPN/role seed and fixed-agent promotion. Keep the PII/RLS/security statements in 023. |
| 022, 030, 031, 032 name/NPN ownership backfills | Exclude name-derived slug and RTS agent/tenant assignment. Reviewed service provisioning supplies exact subjects, stable UUIDs, slugs, NPNs and provider mappings. No inferred identity joins are imported. |
| 028 legacy org-gating changes | Keep compatibility schema/policy evolution, remove fixed-identity fallback. Final 152–155 enforce protected membership and mutation boundaries. |
| 044 contact access routines | Retain required signatures and functionality; final 152/154 protected resolver/assertions replace the mutable roster-role authority. |
| 047 status consumer | Exclude the preconfigured consumer/key hash. Keep presence policy, feed schema and functions. An operator must create independently scoped credentials. |
| 048, 049, 051–057, 067, 096/097, 111, 126, 131 vendor behavior | Exclude fixed roster/NPN/matrix/configuration seeds, staffed-hour update, existing-ping/billing backfills, cap update and residence-capture enablement seed. Keep vendor schema, leases, auth, service routines and reporting. New controls default paused with empty hours and no rate/cap. Runtime tenant selection reads the protected profile mirror. Vendor source selectors in **functions and views** read private service-managed settings; they contain no installed provider-name selector. 151 still executes in full. |
| 064 and 073 subject snapshots | Exclude copied roster/telephony subject maps and existing-call scope backfills. Keep the actual recording/availability schema, guards, functions, policies and final views. Provision all mappings atomically through 151 instead. |
| 075, 115, 141, 142, 144 wording/selectors | Preserve approved legal changes and canonical IDs `…000001`, `…000075`, `…000115` exactly. Neutralize template display-name selectors consistently. Fresh-only successor clones have deterministic UUIDs ending 141/142/144 in namespace `b0040000-0000-4000-8000`; this changes no production ID or historical file. Original 138-item/255-point source and final 135-item/251-point MA rubric are asserted. |
| 106 fixed-agent refresh | Exclude fixed-agent invocation. Keep routing-hold disable policy and generic wrap-up cleanup, preserving the session-lock work. |
| 143 | Exclude whole abandoned migration. Do not mark it applied. |
| 003/054 and other historical repairs | Retain compatible schema evolution/reference replacement on the empty target. They never operate on production or imported agency records. These are new-project copies, not authorization to replay history on an existing deployment. |
| 060 policy duplication after 037 | Drop the three same-named legacy call-log policies before creating them. Final P0-2 policies still replace all legacy permissive policies. |
| Seeds 003–005 | Retain public routing/carrier reference rows with existing NULL application/reference URL fields. No live application link or agency configuration is introduced. |

`deployment_tenant_id()` and `bootstrap_vendor_source_name()` are service-only
bootstrap adapters to 151's protected mirrors. The latter permits absence of the
later mirror during empty-schema historical repair evaluation; it returns no
vendor until configured. They never derive membership or authorize a browser.
The installed availability snapshot now observes the actual deployment's pause
control rather than comparing its tenant to a removed hardcoded value.

## Missing history and real versus simulated validation

The previous suite reconstructed service ledgers, integration tables and timeline
views. The P0-2 SQL and handler tests now call the complete fresh installer.
They no longer replace the database with those shapes or a simplified timeline.
Their synthetic data supplies actual required transcript/intake fields and actual
contact links. Both vector-search overloads execute real embeddings with an own
result and peer/foreign isolation; the former fake no-argument search is gone.

Docker is not installed (`docker` is unavailable), and no local Supabase stack was
started. All builds used independent empty in-memory PGlite PostgreSQL 18.3 /
PGlite 0.5.8 instances. Real components: DDL, PostgreSQL catalogs/roles, BYPASSRLS,
RLS, table/column/default grants, SQL and PL/pgSQL routines, constraints, triggers,
views, vector types/operators/indexes, pgcrypto encryption/decryption, fresh key
generation, queue triggers, leases and finalization. The test-only pgvector WASM
bundle is vendored with provenance and Apache license, pinned to the existing
PGlite peer version; no package/lockfile dependency was added.

Exact stand-ins, confined to `tests/helpers/freshInstall.js`:

- `auth.jwt()`, `auth.role()`, `auth.uid()` read session claims; no Clerk issuer,
  signature verifier, JWKS network, GoTrue or hosted JWT trust is simulated as
  cryptographically verified by this SQL test. The existing auth suites still run.
- `anon`, `authenticated`, `service_role BYPASSRLS` and `authenticator NOINHERIT`
  with its three role memberships model the relevant platform boundary. Hosted
  platform administration roles and their full membership tree are not copied.
- `storage.buckets`, `storage.objects`, storage RLS and `storage.foldername()`
  provide the fields and ownership boundary used by the SQL. There is no object
  server, signed-URL HTTP service, upload transport or hosted storage migration.
- Vault's `create_secret()` and `decrypted_secrets` interface use a private local
  table. The actual 022 SQL generates a new random key and uses real pgcrypto;
  real encrypted Vault storage/pgsodium is not asserted. Only the unavailable
  `CREATE EXTENSION supabase_vault` statements are skipped in the test harness.
  Install SQL requires the real extension and never installs the stand-in.
- `supabase_realtime` is a PostgreSQL publication. No hosted Realtime service,
  logical replication subscriber, PostgREST server or Edge runtime was started.
- The thin Supabase-shaped test adapter encodes parameters and scalar/set results;
  it executes actual SQL for every operation and does not mock authorization,
  encryption, claims, queue outcomes or routine bodies.

The original historical schemas for missing scores/messaging/availability were
not available as an authoritative live catalog. New baseline definitions are
therefore a reviewed fresh-deployment contract, reconciled against documented
DDL, repository service writes, existing schema loaders and later migrations.
They do not assert historical compatibility with unknown production columns.
All literal runtime relations, plus the three dynamic state-exchange table names,
are installed. Public datasets are intentionally not downloaded or populated by
this task; plan-finder data acceptance remains an operator step.

## P0-2 matrix and provisioning results

All **22** P0-2 SQL/handler acceptance cases pass against the actual installed
schema. The denial loops enumerate every installed public table, including tables
outside Appendix D. Hostile legacy OR policies, table grants and identity column
grants are injected before 150–156 and must be removed by the real security SQL.
Inherited platform global table/sequence defaults are also simulated and sealed.

| Principal / attack | Observed result |
|---|---|
| Unprovisioned, wrong org, other tenant, anon | No operational content; all direct INSERT/UPDATE/DELETE denied; protected RPC/provisioning/admin paths denied. |
| Inactive roster, inactive enrolled row, removed subject map | Independently revoke content and mutation access. |
| Ordinary active agent | Own calls/evidence, assigned CRM, own notes/messages/media and authorized attachment read work; peer PII/intake/vendor data and mapping writes deny. |
| Protected principal/admin | Agency evidence and scoped administrative service paths work; direct browser roster/mapping changes and admin service RPC EXECUTE remain denied. |
| Explicit manager | Only approved team's evidence; no implicit agency contact access, peer assignment or write authority. |
| Escalation | Roster role/subject/tenant/org changes, owner/assignment columns, request-header forgeries, feature-header enablement, alternate actor IDs and provisioning payload promotion all deny. |
| Catalog | Every public table has RLS. No open operational browser policy; public reference exceptions are SELECT only. Protected column rights, all public routine browser ACLs, SD search paths and all view invoker options pass. |
| Real final views | Call-log pagination with matching display labels still returns only the protected owner's rows. The actual 064/066/118/156 definitions execute. |

Eight additional fresh-install tests pass: manifest/security order, independent
rebuild/catalog equality, bootstrap/catalog/dump identity scans, fail-fast and
nonempty-target refusal, read-only drift/missing-argument checks, future-object
default grants, platform interfaces, and the provisioning/intake dry run.

The dry run imports **the actual `provisionDeployment` export from
`scripts/provision-deployment.js`**, supplies the synthetic example profile and
12 synthetic roster rows, and executes its service-only SQL on the built DB.
All 12 roster/enrolled/availability/recording bindings agree and start offline.
Roster payloads leave everyone an ordinary agent. An explicit service transaction
then provisions `deployment_authorities` admin and manager rows, with a bounded
manager team; the protected resolver confirms both. The default pipeline is
created by `save_opportunity_pipeline`, then marked default by the protected
operator connection and verified by `ensure_opportunities_pipeline`.

A real Request runs through `createEnrollmentIntakesHandler`, scoped contact/call
lookups, validation, encryption, stable writing-agent resolution and
`save_enrollment_intake`. With all features off the intake succeeds and no delivery
row is created. An explicit local GHL opt-in and server feature header then creates
a durable delivery. The actual worker claims its lease, decrypts the snapshot,
sends exactly once to an injected **in-process test sink**, and marks it uploaded
with one attempt. A repeat claim sends nothing. Admin test-enrollment mode remains
excluded from delivery, and IX/Conversely stay empty. Global fetch is forbidden
throughout, so no provider, hosted endpoint or network delivery can occur. This is
HTTP-handler-to-worker acceptance with an in-process sink, not deployed HTTP or
provider acceptance. The provisioned synthetic logical dump also passes the
forbidden-identity scan. Raw Vault/key material is never exported or logged.

## Validation results

- Full root `npm test -- --test-concurrency=4`: **1,179 passed**, zero failures/skips (1,171 baseline + eight new acceptance tests), 71.88 seconds on the final run. The initial unconstrained run also passed all 1,179.
- Full `npm test --prefix telephony`: **323 passed**, zero failures/skips; its independent import-boundary check passed. The first sandbox attempt denied synthetic loopback listeners; the successful run used loopback permission, 34.63 seconds.
- Environment-free source-copy `npm run build`: **passed**, 28.76 seconds, using only PATH and the synthetic example server profile. No developer environment file was copied or read by the build.
- P0-2 + bootstrap focused matrix: **30 passed**, zero failures/skips; the final focused run including the existing profile/identity suite passed **37**. Changed JavaScript ESLint and `git diff --check` passed.
- Docker/local Supabase: unavailable/not used. Every in-process database was closed; no stack or application service was started or left running.

No actual Clerk/Supabase trust configuration, real Vault encryption backend,
hosted PostgREST/Realtime/storage signing, deployed route/Edge function, provider
receipt, public-dataset load or load/restore drill was verified. Those explicit
platform/provider gates remain in the future runbook. No test skip or
weakened denial assertion is used to accommodate the new schema. The expected
snapshot is compared against two independent empty builds. A deliberately added
catalog object is detected without any write by the drift checker. A deliberately
failed first statement proves the installer never proceeds to a second one.

## Numbered operator runbook — future separate project, not executed here

1. Record the reviewed `pilot/release` commit. Independently approve the **new**
   project/domain allowlist, new tenant UUID and Clerk organization. Keep the
   production branch, deployment linkage and historical ledger separate. Complete
   remaining pilot release items and agreements before real data or live traffic.
2. Create the separate Supabase project and choose a compatible PostgreSQL/extension
   version. Inspect its auth/storage/Vault schemas, platform role memberships,
   migration owner, inherited default ACLs, backups and region. Configure Clerk's
   independent app, invite-only organization, authorized parties/audience and
   Supabase third-party JWT trust. Establish only the first operator initially.
3. Run the same empty-install validation on a disposable real local Supabase stack
   when Docker is available: use a **new temporary CLI workdir** with no historical
   migrations, `npx supabase init` and `npx supabase start`, never a linked project.
   Pass its explicitly observed localhost database URL to
   `node scripts/bootstrap-database.mjs --connection "$LOCAL_DB_URL"`. Run the
   catalog/denial/provisioning checks through a real SQL/PostgREST connection;
   verify actual Vault encryption, storage signing, role memberships and extension
   placement. Stop that stack with `npx supabase stop` in that temporary workdir.
   The committed WASM tests are repeatable evidence, not a substitute for this
   platform acceptance gate.
4. Review the platform/version drift and exact source checksums. For the later
   authorized remote installation, use an independently reviewed operator SQL
   connection, verify the allowlisted new host and empty application schema,
   and execute the manifest files **sequentially** with error-stop enabled, e.g.
   `psql "$PILOT_DB_URL" -X -v ON_ERROR_STOP=1 -f <each-manifest-file>`.
   There is intentionally no remote mode in `bootstrap-database.mjs`. Do not use
   `supabase link`, `db push`, `db remote`, the legacy migration tree or a production
   connection. Abort on any failure; discard a partial new installation and begin
   with an empty separate project rather than skipping failed statements.
5. Run `node scripts/check-database-drift.mjs --connection "$PILOT_DB_URL"` using
   an operator account with complete catalog visibility. This script is read-only
   from connection startup and uses a rolled-back read-only transaction. Review
   every version/platform difference; do not blindly overwrite the expected
   snapshot to hide drift. Verify all public RLS, routine ACLs/search paths, view
   security-invoker options, default privileges for **all** application owners,
   `carrier_rts` in `supabase_realtime`, and both private buckets:
   **`call-recordings`**, **`message-media`**. Optional Nextcloud buckets
   `call-summaries` and `call-transcripts` are not core prerequisites and are not
   created; create them private only with an approved export pipeline.
6. Load independently approved public reference datasets as described below, then
   check source vintage, row/category/state counts, versions, sample lookups and
   plan-finder RPCs. An empty reference schema is not a populated plan finder.
   Preserve original rubric IDs, original 138/255 source and final 135/251 active
   MA rubric. Keep the database scoring fence disabled.
7. Supply a new validated `DEPLOYMENT_PROFILE_JSON`, stable roster JSON and all
   feature flags explicitly off. Provide server credentials out of band, never in
   a public Vite variable or tracked environment file. Initialize no vendor,
   consumer, live delivery destination, billing treatment or production identity.
   Migration 022 creates a fresh Vault `pii_encryption_key_v1`; never copy a key
   from another agency or expose it in a dump.
8. Provision the full reviewed roster using
   `node scripts/provision-deployment.js "$PILOT_ROSTER_FILE" --preview`, then
   `--apply` with the new project's explicit `SUPABASE_URL` and server key supplied
   by the operator's isolated environment. Roster JSON is not an authority source.
   In a protected service transaction, grant the first verified subject admin
   authority in `deployment_authorities` (or protected principal membership),
   confirm the active enrolled/roster/org/availability/recording joins, and grant
   each manager an explicit approved enrolled-agent UUID team. Never promote from
   names, unverified metadata or a browser-writable roster role. Verify revocation
   and duplicate-binding failure before inviting the remaining agents.
9. Call service-only `save_opportunity_pipeline` with the verified active roster
   actor, reviewed stage JSON and explicit tenant. Mark that resulting pipeline
   default through the protected service connection; confirm the read-only
   `ensure_opportunities_pipeline` returns it. Customize approved neutral scripts
   and legal wording only under the existing legal review rules. Do not leave
   literal neutral placeholders as the actual spoken agency identity.
10. Provision separate Twilio/Clerk/Deepgram/LLM and enabled integration accounts,
    numbers, quotas, retention/processor approvals and spend limits. Configure
    new Netlify and Railway services only in the later separately authorized
    release workflow. Do not reuse production-main auto-deployment or linked local
    state. Verify callback origins, signed webhooks, scoped API authentication and
    invite-only access before repointing numbers. No such action occurred here.
11. Deploy only the active Supabase Edge function **`get-availability`** after
    independent approval; `verify_jwt=false` relies on its hashed revocable
    consumer-key authorization. Do not deploy the historical `set-availability`
    snapshot; writes use the authenticated Netlify route. Provision independently
    scoped status/feed consumers and rotate/revoke test credentials. The exact
    SQL routine signatures and all Netlify function-source names are listed in
    `supabase/bootstrap/operator-objects.json`; SQL definitions/owners/ACLs are in
    `catalog.expected.json`. Keep optional functions unable to make provider
    requests while disabled.
12. Review every schedule against current code. The audit's fixed UTC analytics
    times predate P0-5's timezone polling; **current `netlify.toml` records**:
    `nightly-analytics` and `weekly-coaching` poll at `0 * * * *` and handlers admit
    the deployment-local window; `sync-bulletins` is `0 10 * * *`;
    `sync-fema` is `0 9 * * *`; `paragon-daily-email` polls at
    `0,15,30 * * * *` with feature/local-window checks. Telephony sweeps presence
    every 15 seconds, starts recording/status/transcript reconciliation workers,
    and gates Paragon residence/billing and conference recovery (15 seconds) by
    their flags. The integrations worker schedules and delivers on its one-second
    loop, including its gated GHL, vendor, IX and Conversely work. Review each
    worker's internal retry/lease cadence in source before startup. The audit's
    fixed-time schedule inventory conflicts with P0-5's later profile-aware polling;
    preserve the completed P0-5 changes and obtain owner reconciliation of these
    schedule requirements before enabling them. There is no
    application-installed Supabase pg_cron/pg_net job. Optional Nextcloud's default
    five-minute sync remains undeployed and opt-in.
13. Before enabling a vendor, use `configure_deployment_vendor` through the
    protected provisioner for the new source/consumer/hash/token, staffed hours,
    rate/cap and approved licensing/carrier matrix. Newly created controls stay
    paused. If residence capture is approved, explicitly initialize
    `paragon_residence_settings` with the agreed cutover time; bootstrap does not
    turn it on. Review unpausing separately. Use synthetic destinations first.
14. Repeat the P0-2 denial/catalog matrix through actual PostgREST/Clerk, storage
    signing, Edge functions and deployed routes. Repeat the 12-agent intake test
    with a controlled sink before enabling a real delivery destination. Preserve
    admin-only test-mode classification, IX carrier/code safeguards, durable
    leases, feature headers and recording access controls. Run the audit's
    separate load/failure plan, restore drill and PII/secret-free log review.
15. Owner reviews unresolved platform/provider/reference acceptance, training,
    access, backup/restore and processor requirements. Only then authorize selected
    integrations/scoring, live numbers and external invitations. This document
    authorizes none of those actions.

## Secrets and configuration inventory (names only)

The authoritative cross-service classification is Appendix B of
`PILOT_READINESS.md`, with P0-5's profile precedence. Supply only the names needed
for approved features; never copy another deployment's values.

- Database/platform: `PILOT_DB_URL`, `LOCAL_DB_URL`, `SUPABASE_DB_URL`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_SECRET_KEY`, compatibility aliases
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, Edge aliases
  `ENROLLGEN_SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEYS`; Vault
  `pii_encryption_key_v1`. Connection URLs can contain credentials.
- Authentication/telephony: `CLERK_SECRET_KEY`, `AGENT_WS_SIGNING_SECRET`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SECRET`, `INBOUND_VENDOR_API_KEY`,
  `DEEPGRAM_API_KEY`.
- LLM/jobs (owner decision follow-up: `RTS_INGESTION_OPENAI_MODEL`, `KNOWLEDGE_UPDATE_OPENAI_MODEL`): `OPENAI_API_KEY`, `SCORE_CALL_JOB_SECRET`,
  `KNOWLEDGE_UPDATE_SECRET`, `BACKFILL_SECRET`. Historical Appendix B classified
  `SCORING_DAILY_TOKEN_CAP` as secret; it is an approved limit, never authority to
  raise the code-owned budget.
- Optional processors: `CONVERSELY_API_KEY`, `IX_USERNAME`, `IX_PASSWORD`,
  `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GIPHY_API_KEY`,
  `BIBLIA_API_KEY`, `HUD_USER_TOKEN`; `CSG_API_KEY` only through the authorized
  server path, never `VITE_CSG_API_KEY` (the public key guard rejects it).
- Secret-bearing server profile fields: `ghl.postCallUrl`, `ghl.enrollmentUrl`,
  `paragon.pushSecret`, `paragon.postbackSecret`; independently generated credential
  hashes `paragon.pingKeyHash`, `paragon.availabilityKeyHash`,
  `paragon.reportTokenHash`, and the raw scoped consumer credentials held out of
  band. `DEPLOYMENT_PROFILE_JSON` stays server-only; its public projection is
  deliberately narrower. `GHL_ENROLLMENT_WEBHOOK_URL` is a historical Appendix B
  name, not a permitted replacement for P0-5's explicit profile destination.
- Optional office deployment only: `DB_PASSWORD`, `MYSQL_PASSWORD`,
  `MYSQL_ROOT_PASSWORD`, `NEXTCLOUD_ADMIN_PASSWORD`, `NEXTCLOUD_APP_TOKEN`.
  Nextcloud remains unprovisioned.

Public/non-secret configuration is still independently selected: `SUPABASE_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY`,
optional CMS URL/key variables, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY`,
`CLERK_AUTHORIZED_PARTIES`, `CLERK_AUDIENCE`, Twilio account/API-key/TwiML IDs,
`CORS_ALLOW_ORIGIN`, all profile identifiers/origins and feature flags. No bypass
flag is valid in a deployed pilot. P0-5 owns profile contact/timezone/destination
precedence; stale legacy variables must not restore current-agency defaults.

## Reference-data loading, future operator procedure only

No public dataset download, remote loader, embedding request or live verification
was run. Supply the chosen validated `DEPLOYMENT_PROFILE_JSON` to Node loaders that import
shared server modules, without enabling optional integrations. Use an environment-free
source copy and an explicitly selected database
argument/endpoint. Do not let older helpers load local `.env` files. The commands
below show **variable names only**; none is a configured target.

1. Prepare the existing local CY2027 archive and Census mapping with
   `python3 scripts/prepare_cms_landscape_2027.py "$LANDSCAPE_CSV" "$PREPARED_LANDSCAPE_JSONL"`. Record input hashes,
   vintage and prepared JSONL count. `docs/cms-landscape-2027-counts.md` records
   158,280 county-plan rows for its September 2026 source; that is a comparison
   baseline, not a fresh-download or new-project validation result.
2. The bootstrap already includes 054 and later CMS changes. **Do not run
   `apply_cms_landscape_2027.mjs` over the completed bootstrap**. For an approved
   import, explicitly supply `SUPABASE_URL="$PILOT_SUPABASE_URL"` and a server key
   from the operator's secret store to
   `node scripts/upload_cms_landscape_2027.mjs "$PREPARED_LANDSCAPE_JSONL"`.
   This existing uploader targets `cms_plans_py2027` explicitly and rejects
   non-2027 rows. Its documented old apply-order comment is not installation
   authority. Run `SUPABASE_DB_URL="$PILOT_DB_URL" node scripts/verify_cms_landscape_2027.mjs`; compare counts/categories/state
   totals and sample counties. Its legacy strict exit condition also requires full
   embedding coverage: a schema-only or deliberately unembedded dataset will not
   pass that final check. Record this as pending paid-data acceptance, not a reason
   to enable embedding work or ignore failed data checks.
3. Populate crosswalk/stars/SNP/termination datasets using the existing
   `scripts/sep-data/ingest-zip-crosswalk.js`, `ingest-star-ratings.js`,
   `ingest-snp-plans.js` and `ingest-plan-crosswalk.js` interfaces. Supply explicit `SUPABASE_URL` and server credentials
   in that environment-free copy. Prefer `--landscape-file` on derived loaders
   so source inputs are local and versioned; never silently read another CMS
   project. Review FEMA/bulletin source snapshots and sync handlers before their
   schedules start. Validate SEP lookup RPCs with known ZIP/county examples.
4. Federal QHP and SBE legacy uploaders are **not safe publication commands**:
   `upload_qhp_landscape.cjs` and `upload_sbe_plans.cjs` drop/recreate tables and
   continue after failed batches. Use them only on an explicitly selected,
   disposable **reference-import database**, with
   `SUPABASE_DB_URL="$REFERENCE_IMPORT_DB_URL"` and the selected CSV path (plus
   staging table name for SBE). Require zero batch errors and independent source
   counts, export the approved application columns, and import them with
   `psql "$PILOT_DB_URL" -X -v ON_ERROR_STOP=1` / `\copy` into the **existing**
   bootstrap QHP/SBE tables inside a reviewed transaction. Do not let these old
   scripts replace the pilot's RLS, grants or schema. Inspect source headers and
   review any additional required columns before a schema change. Existing table
   names include 2025/2026; names alone are no claim of current data vintage.
5. Existing `parse_cms_dsnp.js` and `parse_cms_penetration.js` also require an
   explicit `SUPABASE_DB_URL`; inspect their current input paths first, import
   only approved public data and reconcile counts/version/publication rules.
   `populate_cms_support_2027.sql` is a separate explicit operator step after
   source validation, not permission to replay old CMS schema migrations.
6. Embeddings are optional paid work. `embed_cms_landscape_2027.mjs` requires
   separate approval, an explicit dataset target and `OPENAI_API_KEY`; it was not
   run. Recheck catalog drift and public SELECT-only policies after all data
   imports. Leave unknown/absent integration evidence as verification-required.
