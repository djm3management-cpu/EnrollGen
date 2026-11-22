# live-to-fresh

Copies production rows (old schema, restored locally from a backup) into a
fresh-install database (`supabase/bootstrap`). Mapping and decisions:
[docs/migration/live-to-fresh-mapping.md](../../../docs/migration/live-to-fresh-mapping.md).
Rehearsal results: [MIGRATION_REPORT.md](../../../MIGRATION_REPORT.md).

**Local only.** `--old` and `--new` must point at `localhost`/`127.0.0.1`; any
other host, or a `host`/`hostaddr`/`service` query override, is refused before a
connection is made. No new dependencies are used (Node + `pg`).

## Usage

```sh
# 1. Profile and roster from OLD (written 0600, outside the repo)
node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --emit-provisioning <private dir> \
  [--app-origin https://… --telephony-origin https://…]

# 2. Validate and plan (writes nothing; real decrypt/encrypt calls; per-table counts)
OLD_PII_ENCRYPTION_KEY=… node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_DB_URL" --dry-run

# 3. Run 1: CSV exports, tenants and enrolled_agents; exits 3 until provisioned
OLD_PII_ENCRYPTION_KEY=… node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_DB_URL"

# 4. Provision the roster the documented way
DEPLOYMENT_PROFILE_JSON="$(cat <private dir>/profile.json)" SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
  node scripts/provision-deployment.js <private dir>/roster.json --apply

# 5. Run 2: full load (resumable; rerun the same command after any failure)
OLD_PII_ENCRYPTION_KEY=… node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_DB_URL"

# 6. Verify (exit 0 required), then the application check
OLD_PII_ENCRYPTION_KEY=… node scripts/migration/live-to-fresh/index.mjs --old "$OLD_DB_URL" --new "$NEW_DB_URL" --verify
DEPLOYMENT_PROFILE_JSON=… SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/migration/live-to-fresh/app-check.mjs --old … --new …
```

`--table <name>` runs a single table (after the pre-provision checks).
`--batch-size` defaults to 500. Outputs go to `$MIGRATION_WORKDIR` (default
`~/enrollgen-migration`): `migration-run.json`, `verify-report.json`,
`storage-manifest.json` and `excluded/*.csv`, all mode 0600.

## How it works

- Tables and columns are discovered from both catalogs at runtime. Rows travel
  as `to_jsonb(t)::text` and are parsed losslessly (numbers keep their source
  text). They are written with
  `INSERT … SELECT … FROM jsonb_populate_recordset(…) ON CONFLICT (pk) DO NOTHING`,
  in NEW foreign-key order.
- Each batch is one NEW transaction under `SET LOCAL session_replication_role = replica`.
  NEW's side-effect triggers and feature fences (which silently drop rows while
  a flag is off) must not run on history. Everything those triggers derive on
  insert is computed explicitly: retention anchors (read from `pg_trigger`), the
  contact activity clock, call retention classification and GHL snapshot
  minimization. Identity sequences are advanced, and a post-load sweep moves any
  FK orphan to the reject ledger.
- PII is decrypted in OLD with `OLD_PII_ENCRYPTION_KEY` (bind parameter only)
  and re-encrypted with NEW's own `encrypt_pii_value()`; blind indexes are
  recomputed with NEW's `pii_blind_index()`. Plaintext stays in process memory.
- Output never contains row values or database error text: only table names,
  counts, SQLSTATE codes and constraint names.

## `migration_ledger` schema (in NEW)

| Table | Purpose |
|---|---|
| `runs` | One row per invocation: mode, start/finish, outcome |
| `table_progress` | Per table: PK cursor (JSON array of key text), rows read/inserted/rejected, `done`. Resume continues after the cursor |
| `rejects` | `(table_name, old_pk)` → reason code (for example `invalid_enum:…`, `sql_23502`, `fk_orphan:<constraint>`, `prepare_failed:…`). Never row content |
| `transforms` | `(table_name, old_pk, kind)` → small detail object without values (for example `{"from":"sms","to":"note"}`) |
| `id_map` | `(kind, old_id)` → `new_id` for remapped identities: `compliance_intents`, `scoring_template_items`, `scoring_templates`, `agent_availability_log` |

The schema has no grants to `anon`/`authenticated`. A second run against the
same NEW is a no-op: primary keys and id maps make every insert idempotent, and
the first run's ciphertext is kept.

## Tests

`npm run test:migration` runs `tests/migration/*.test.js` on synthetic PGlite
databases. It covers the mapping functions, the re-encryption round trip,
wrong-key rejection, idempotency, the reject ledger, the identity id map,
lossless numerics and resume after an injected mid-table failure.
