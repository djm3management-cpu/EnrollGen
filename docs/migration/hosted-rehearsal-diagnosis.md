# Hosted rehearsal, Phase A: diagnosis

Branch `feature/live-migration`. Target: the new, empty Supabase project
**enrollgen-v2** (West US, Oregon), reached only through its us-west-2 session
pooler as `postgres`. Production was not contacted. No project setting was
changed, nothing was deployed or pushed, and no row from the production dump was
read in Phase A. Every remote action is in `~/enrollgen-migration/actions.log`,
which records host and ref only.
This document contains object names, counts, SQLSTATEs and platform ACL text.
It contains no secrets, connection strings or PHI.

Companion documents: [MIGRATION_REPORT.md](../../MIGRATION_REPORT.md) (local
rehearsal, blockers B1–B9) and the [mapping](live-to-fresh-mapping.md).

## 0. Target guard (hard rule 3)

These checks ran before the first connection and were logged. All passed:
- The rehearsal ref is a well-formed ref and is not the production ref.
- The pooler user and the API URL both contain the rehearsal ref and do not
  contain the production ref.
- No value in the rehearsal env file names the production ref.
- The DB host is the us-west-2 session pooler.

The first read-only connection then proved the target was empty:
- 0 relations, routines and types in `public`;
- no application schemas;
- 0 policies on `public`/`storage`;
- 0 buckets and 0 objects.

The harness that ran these checks is in the session scratchpad. It is not
committed, and it never prints environment values. Phase B moves the guard into
the reviewed tools (B9).

Platform facts:
- Postgres 17.12. `postgres` is not a superuser and has `CREATEROLE`,
  `BYPASSRLS` and `REPLICATION`.
- `postgres` is a member of `anon`, `authenticated`, `authenticator`,
  `service_role`, `supabase_privileged_role` and `pg_read_all_data`. It is
  **not** a member of `supabase_storage_admin` or `supabase_admin`.
- `storage.objects` and `storage.buckets` are owned by `supabase_storage_admin`,
  with RLS **enabled** and not forced.
- `vector` is not preinstalled. `pgcrypto` is installed in `extensions`, and
  `supabase_vault` 0.3.2 is installed.

## 1. Default privileges and browser-role grants in `public` (step A1)

Recorded read-only on day one. Nothing was changed.

| Default ACL (owner, schema, type) | Value on enrollgen-v2 |
|---|---|
| `postgres`, `public`, tables | `{postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}` |
| `postgres`, `public`, sequences | `{postgres=rwU/postgres}` |
| `postgres`, `public`, functions | `{postgres=X/postgres}` (a schema-level addition; the built-in PUBLIC EXECUTE still applies) |
| `supabase_admin`, `public`, tables / sequences / functions | full rights to `anon`, `authenticated`, `service_role` (`arwdDxtm` / `rwU` / `X`) |
| `postgres`, `storage`, tables / sequences / functions | full rights to `anon`, `authenticated`, `service_role` |
| global (schema 0) rows for `postgres` | **none** |

Schema `public` ACL:
`{pg_database_owner=UC,=U,postgres=U,anon=U,authenticated=U,service_role=U}`.

To confirm the effect, a table and a function were created in `public` inside a
rolled-back transaction:
- the table received `anon=Dxtm, authenticated=Dxtm, service_role=Dxtm`;
- the function kept the built-in ACL (PUBLIC EXECUTE).

**Finding: "grant API access to new tables" is OFF on this project.** New
`postgres`-owned tables in `public` do **not** get SELECT, INSERT, UPDATE or
DELETE for `anon`, `authenticated` or `service_role`. They do still get
TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (`Dxtm`). The bootstrap already
removes these:
- m153 runs a per-table `REVOKE ALL … FROM PUBLIC,anon,authenticated`;
- m154 and seal close the `postgres` defaults;
- seal grants `service_role` explicitly.

So this toggle does not change the security outcome. The Phase B drift check and
P0-2 tests will prove it. The `supabase_admin` defaults cannot be changed by
`postgres` (probe below). They only affect objects that `supabase_admin` creates
in `public`, and the bootstrap creates none (`vector` goes to `extensions`).

## 2. Unmodified bootstrap against enrollgen-v2 (step A2)

The CLI `scripts/bootstrap-database.mjs` refuses any non-localhost connection by
design (part of B9), and its `applyBootstrap` deliberately hides error text.
The committed manifest was therefore run through the committed
`bootstrapEntries()` (SHA-256 verified) and `statements()` splitter, with the
same loop, order and stop-on-first-failure. Only the error was captured.
No SQL was changed.

| | |
|---|---|
| Statements executed | 2,291 (210 s over the pooler) |
| Last success | `sql/m153.sql` statement 14 |
| **Failure** | `sql/m153.sql` **statement 15** (the storage seal `DO` block) |
| SQLSTATE / message | `42501` `must be owner of table objects` |
| Context | `SQL statement "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY"`, PL/pgSQL inline block line 6 |

This is the only failure: the bootstrap stops at the first error. Every later
statement that touches platform objects was tested separately in §3.

`m153.sql` runs inside `BEGIN … COMMIT`, so statements 1–14 rolled back. The
committed files m000–m152 remained. A full catalog fingerprint taken before and
after the run listed exactly what they created:

| Created by the failed run | Count / names |
|---|---|
| Schemas | `pii_vault`, `oct_slim_086_rollback`, `oct_slim_088_rollback` |
| `public` relations (tables, views, sequences, indexes) | 637 |
| `public` routines / policies / triggers | 246 / 162 / 79 |
| Storage policy | `storage.objects.call_recordings_service_role` (from m018: **CREATE POLICY on storage.objects succeeded**) |
| Bucket | `call-recordings` (m018, private) |
| Vault secret | `pii_encryption_key_v1` (m022) |
| Extension | `vector` |
| Publication member | `supabase_realtime: public.carrier_rts` |

The platform's temporary namespaces `pg_temp_6`/`pg_toast_temp_6` also appeared.
They are created by any session that uses temp objects, not by bootstrap DDL, so
they were left in place.

The cleanup removed only those objects:
- dropped the three schemas with CASCADE;
- dropped every `public` relation, routine and type (`public` was empty
  before);
- dropped the storage policy, the `vector` extension and the vault secret.

The bucket row could not be deleted with SQL. A platform trigger refuses it
(`42501 Direct deletion from storage tables is not allowed. Use the Storage
API instead.`), so it was deleted through the rehearsal project's Storage API
(HTTP 200).

Proof of empty afterwards:
- the empty-target check passes;
- the extension list matches day one exactly;
- 0 vault secrets;
- default ACLs, schema ACLs and the `storage.objects`/`storage.buckets` owner,
  RLS and ACLs are identical to day one;
- the fingerprint diff against the pre-run state is empty, except for the
  platform temp namespaces.

## 3. What `postgres` may do on hosted (step A3)

All probes ran in one transaction with a savepoint per probe, and the session
ended with ROLLBACK. The fingerprint diff before and after was empty (0 added,
0 changed, 0 removed), so nothing was left behind.

| Action as `postgres` (session pooler) | `storage.objects` | `storage.buckets` |
|---|---|---|
| `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | **refused** 42501 not owner | **refused** 42501 |
| `ALTER TABLE … FORCE ROW LEVEL SECURITY` | **refused** 42501 | **refused** 42501 |
| `CREATE POLICY` / `DROP POLICY` | allowed (`supautils.policy_grants`) | allowed |
| `REVOKE ALL … FROM PUBLIC,anon,authenticated` | succeeds as a **no-op**: `anon`/`authenticated` keep `arwd` granted by `supabase_storage_admin` | same |
| `REVOKE … GRANTED BY supabase_storage_admin` | **refused** 0A000 grantor must be current user | same |
| Column-level `REVOKE` | allowed (no-op) | allowed |
| `GRANT SELECT … TO authenticated` / `GRANT ALL … TO service_role` | allowed, grantor `postgres` | allowed |
| `INSERT` bucket row / `UPDATE … SET public=false` | n/a | allowed |
| `DELETE` from storage tables | **refused**: Storage API only | **refused** |

| Other action | Result |
|---|---|
| `SET ROLE supabase_storage_admin` / `supabase_admin` | **refused** 42501 |
| `GRANT supabase_storage_admin TO postgres` (the local platform-prep) | **refused** 42501: reserved role, superuser only |
| `SET LOCAL session_replication_role = replica` | **allowed**: listed in `supautils.privileged_role_allowed_configs` |
| Replica mode: temp table with a BEFORE INSERT trigger that returns NULL and an FK to an empty parent | row kept (1) and orphan accepted: user and FK triggers are disabled |
| Normal mode, same fence trigger | row silently dropped (0): the B8 behavior is reproduced |
| `ALTER DEFAULT PRIVILEGES [IN SCHEMA public] REVOKE … FROM PUBLIC,anon,authenticated` (for `postgres`) | allowed |
| `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` | **refused** 42501 |
| `CREATE EXTENSION vector WITH SCHEMA extensions` | allowed |
| `SET LOCAL log_min_error_statement`, `statement_timeout` | allowed |
| `SET LOCAL log_error_verbosity = terse` | **refused** 42501 |

## 4. The 180 policy-roles differences (step A4)

The policies section of the drift checker was run on hosted against a temp table
carrying one policy for each distinct roles set in `catalog.expected.json`. All
90 expected policies use one of two sets: `[authenticated]` or
`[anon, authenticated]`.
- `pg_policies.roles` has type `name[]` (OID 1003). node-pg 8.20 has no parser
  for that type, so it returns the **string** `{authenticated}` or
  `{anon,authenticated}`. The PGlite baseline holds JS arrays.
- Parsed into an array, both strings equal the expected arrays exactly.
- No other drift section returns an unparsed array. `tables.options`,
  `views.options`, `routines.settings` and `buckets.allowed_mime_types` are
  `text[]` (OID 1009), which node-pg parses. ACLs are already cast to text on
  both sides.

**Conclusion:** the 180 entries are purely the `name[]` serialization: every
policy appears once as "missing" and once as "extra". The fix can be proven
complete on hosted only once all 90 policies exist (Phase B). The normalized
checker will then show any remaining difference in names, commands or
expressions, because the normalization changes only the `roles` type.

## 5. Blockers on hosted and proposed fixes (step A5)

### B1. Bootstrap cannot `ALTER` storage tables: confirmed; fixable without weakening

The local workaround (`GRANT supabase_storage_admin TO postgres`) is **not
available on hosted**: the role is reserved. On hosted, RLS on both storage
tables is already enabled by the platform, so the `ALTER` is redundant there.
Everything else in m153 statement 15 is permitted: dropping and creating
policies, the REVOKEs (a no-op on hosted, see B4), the GRANT, and the
bucket UPDATE.

**Fix (in `supabase/bootstrap/sql/m153.sql`, statement 15 only):** run the
`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` only when
`pg_class.relrowsecurity` is false.
- Where RLS is already on, the statement is skipped and the outcome is
  identical.
- Where RLS is off and `postgres` is not the owner, it still fails loudly. It is
  never silently skipped.

**Add (in `supabase/bootstrap/sql/seal.sql`):** a final install assertion that
raises unless all of the following hold:
- RLS is enabled on `storage.objects` and `storage.buckets`;
- no policy on either table applies to `anon`, `authenticated` or PUBLIC;
- `call-recordings` and `message-media` exist and are private.

This makes the property storage actually depends on (see B4) a hard install
check on every platform, which is stricter than today.

Then regenerate the manifest checksums through the repo's process, regenerate
`catalog.expected.json` if it changes (it should not: storage tables are not in
it), and run all fresh-install tests. The PGlite stand-in owns its storage
tables, so it takes the `relrowsecurity=false` path and runs the `ALTER` as
before.

### B2. Policy `roles` serialization: confirmed; fixable

**Fix (in `scripts/lib/database-catalog.js`):** select `roles::text[] AS roles`
in the `policies` query, so node-pg and PGlite both return a JS array. This is a
one-token change in a read-only query. Expected values are unchanged, and no
comparison is relaxed. A unit test will pin it: a `name[]` column read through
node-pg-style text must still compare equal, and a changed role must still
differ. `check-database-drift.mjs` itself does not need to change.

### B3. `service_role` EXECUTE on 103 routines: expected not to reproduce on hosted

The local CLI image's `postgres`/`public` function default granted EXECUTE to
`service_role`. On enrollgen-v2 that default is `{postgres=X/postgres}`, and the
table and sequence defaults also lack `service_role`. No change is proposed. If
Phase B's drift check still shows these rows, I stop and report them.

### B4. Browser grants on `storage.objects`/`storage.buckets`: confirmed; **cannot be fixed without weakening a control**

`anon` and `authenticated` hold SELECT, INSERT, UPDATE and DELETE on both
storage tables, granted by `supabase_storage_admin`. On hosted, `postgres` has
no way to remove them:
- `REVOKE` is a no-op;
- `GRANTED BY` is refused;
- `SET ROLE` is refused;
- the role membership is reserved.

The sealed design's "revoked grants" on storage therefore **cannot hold** on
hosted Supabase. What does hold, and can be proven:
- RLS is enabled on both tables (platform-enforced; `postgres` cannot disable
  it either);
- after m153/m157 there are **zero** storage policies, so `anon` and
  `authenticated` match no rows for any command;
- buckets are private, and the server path uses `service_role` (BYPASSRLS).

The effective access is deny. It rests on one layer (RLS with no policy)
instead of two (grants plus RLS).

Options:
- **(a, recommended)** Accept this as a documented hosted-platform exception,
  with:
  - the B1 install assertion;
  - a hosted access test, run against enrollgen-v2 in Phase B, proving that
    `anon` and `authenticated` read, insert, update and delete 0 storage rows;
  - an exact-row drift allowance (see "Drift exceptions" below) for only these
    platform grant rows.
- (b) Also ask Supabase support to revoke these grants as
  `supabase_storage_admin`. This is a platform change outside my rules. Platform
  storage migrations may restore the grants, so (a)'s test is still required.

### B5. `pii_vault.encryption_keys` lacks the expected `service_role` grants: confirmed by cause; fixable by tightening

The PGlite baseline expects 7 `service_role` grants. They come from a global
default ACL that hosted does not have (no schema-0 rows for `postgres`). No
application code reads this table directly: the security-definer PII functions
own the access.

**Fix (recommended, `supabase/bootstrap/sql/seal.sql`):** add
`REVOKE ALL ON pii_vault.encryption_keys FROM service_role`, regenerate
`catalog.expected.json` and the manifest, and keep the tests passing. Both
platforms then end in the same, tighter state.

The alternative is an exact-row drift allowance for the 7 missing grants.

### B6. Default ACLs and schema USAGE: confirmed by cause; accept as exact rows

The platform keeps per-schema default ACL rows in `public` and `storage` for
`postgres` and `supabase_admin`. The `supabase_admin` rows cannot be altered by
`postgres`. The platform also grants `postgres=U` on `public`. The bootstrap's
own revokes leave the `postgres` rows closed to browser roles.

**Proposal:** exact-row drift allowances for these rows, reviewed in Phase B
before acceptance. Any `public` object owned by `supabase_admin` already shows up
as drift in the `tables`/`routines` owner columns.

### B7. `session_replication_role` on hosted: **resolved, no change**

`SET LOCAL session_replication_role = replica` is permitted for `postgres` via
`supautils.privileged_role_allowed_configs`, through the session pooler, and it
disables both user triggers and FK triggers.

### B8. Fence trigger drops rows outside replica mode: **confirmed; requirement stands, no change**

The silent drop was reproduced on hosted. The engine already loads every batch
under `SET LOCAL session_replication_role = replica`, and `--verify` already
balances the 13 fenced tables. The cutover requirements in MIGRATION_REPORT
§B8 are unchanged.

### B9. Tools refuse non-local hosts: fixable with an explicit, single-host opt-in

The guards in question:
- `lib/args.js` `assertLocalConnection` (`--old`, `--new`);
- `bootstrap-database.mjs` (CLI);
- `app-check.mjs` (`SUPABASE_URL`).

**Proposed:** an opt-in pair, `--remote-host <host> --remote-ref <ref>`, shared
through one new guard module. It is accepted by `index.mjs`, the bootstrap CLI
and `app-check.mjs`, and applies only to the NEW side. `--old` stays
localhost-only. The connection is allowed only if every rule holds:
- The URL host equals `--remote-host` exactly.
- The ref is either part of the pooler user (`postgres.<ref>`) or the
  `db.<ref>.supabase.co` host.
- `SUPABASE_URL` is exactly `https://<ref>.supabase.co`.
- The production ref `qzjtagnpklaxefwurorc` is **always refused**. It is
  checked against the flag value and every URL, user and host string, before
  any connection.
- TLS is required.
- The password is never part of argv. It comes from `PGPASSWORD` in the child
  environment, which keeps it out of `ps` and shell history.

Tests cover:
- localhost unchanged;
- remote without flags refused;
- host or ref mismatch refused;
- the production ref refused in every position.

### Drift exceptions (B4, B6, and B5 if not tightened)

**Proposed:** a reviewed file, `supabase/bootstrap/platform-supabase-hosted.json`.
It lists each tolerated difference as the **exact** drift row (section, change
and full object), each with a reason. `check-database-drift.mjs` applies it only
with an explicit `--platform supabase-hosted`. It still exits 1 on any other
difference, and it prints the accepted rows separately.

Matching is exact, so any further widening still fails, for example:
- a new grantee;
- a privilege added;
- a policy on storage.

The file's contents are taken from the Phase B hosted run, limited to the
categories you approve here, and shown to you before acceptance.

## 6. Other findings

1. **TLS to the pooler is not verifiable with system CAs.** Verification fails
   with `SELF_SIGNED_CERT_IN_CHAIN`: Supabase uses its own root CA. Phase A ran
   with encryption but without certificate verification, and no PHI moved.
   Before real rows are sent in Phase B, I recommend verified TLS using the
   project's CA certificate, which is a download from the dashboard and not a
   setting change.
2. **Server logs can capture row values on constraint errors.** On hosted,
   `postgres` cannot set `log_error_verbosity`. Constraint errors can therefore
   write `DETAIL: Failing row contains (…)` to the project's Postgres logs.
   Related settings are already safe or settable:
   - `log_parameter_max_length_on_error=0` is already set;
   - `log_statement=ddl` does not log INSERTs;
   - `log_min_error_statement` is settable.

   The local run had 0 rejects, so no such lines are expected. The engine will
   set `log_min_error_statement=panic` per session. Any rejects on hosted would
   leave DETAIL lines in the logs of the project that will hold this PHI after
   cutover anyway. Treat any hosted reject as a stop.
3. **`statement_timeout` is 120 s for `postgres`.** It can be set per
   transaction, if a verify aggregate over the network needs longer.
4. **The reset-to-empty script (Phase B7) must use the Storage API** for objects
   and buckets, because SQL deletes are refused. Vault secrets, schemas,
   `public` objects, storage policies and the `vector` extension can be removed
   with SQL, as the Phase A cleanup showed.
5. **`max_connections` is 60**, which is ample for the tool's two connections.

## 7. Decisions needed before Phase B

1. **B1:** approve the guarded `ALTER` in m153 plus the new storage install
   assertion in seal.
2. **B4:** accept RLS-with-no-policy as the hosted storage boundary (option a),
   and say whether to also raise option (b) with Supabase.
3. **B2:** approve the `roles::text[]` normalization in `database-catalog.js`.
4. **Drift exceptions:** approve the exact-row `--platform supabase-hosted`
   mechanism, limited to the B4 storage grant rows and the B6 default-ACL and
   schema-USAGE rows. Any other remaining difference stops Phase B.
5. **B5:** tighten with an explicit revoke and regenerate the expected catalog
   (recommended), or accept the 7 rows as exceptions.
6. **B9:** approve the `--remote-host/--remote-ref` opt-in design, with the
   password via `PGPASSWORD` only.
7. **TLS:** provide the project CA certificate (for example
   `~/enrollgen-migration/enrollgen-v2-ca.crt`) for verified TLS, or approve
   unverified TLS for the rehearsal.
