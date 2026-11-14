# Fresh installation, separate database only

Use `manifest.json` in order. These are reviewed **fresh-install copies**, not a
migration ledger or an upgrade path. Historical migrations are untouched. Never
run the historical directory as the pilot bootstrap, and never mark 143 applied.

`node scripts/bootstrap-database.mjs --connection "$LOCAL_DB_URL"` verifies every
SHA-256 before executing any SQL, accepts localhost only, requires an empty public
application schema on an initialized Supabase platform, and stops on the first
failed statement. Earlier files can have committed their own transactions: dispose
of a failed empty installation and start again; do not resume into a partial DB.
No environment file, linked project, default connection or automatic remote target
is consulted. No data, credential or SQL query text is printed on errors.

The installer leaves all optional features and database scoring disabled. There
is no agency/roster/vendor/status-consumer seed. Provision configuration separately.
The bootstrap requires `auth`, `storage`, platform roles and Supabase Vault; the
WASM test harness supplies the documented stand-ins **only in tests**, never in the
installation SQL. It uses real pgcrypto and pgvector in `extensions`.

`catalog.expected.json` captures the application catalog (and application storage
policies/buckets). Table ACLs and explicit column ACLs are separate; PostgreSQL
also inherits table privileges onto columns. Tests check effective column rights.
Extension-owned routines are platform dependencies, excluded from the application
routine inventory. Supabase platform internals are not asserted to equal WASM
stand-ins. The baseline is PostgreSQL 18.3 / PGlite 0.5.8: operators must review
version/platform differences on the separate real platform before acceptance.

`node scripts/check-database-drift.mjs --connection "$EXPLICIT_DB_URL"` is read-only,
reports safe object identifiers, and exits 0 for a match, 1 for drift, 2 for a
connection/argument/check failure. It never defaults to environment configuration.
Its connection is read-only from startup and all catalog reads run inside a
read-only transaction which rolls back. Nothing here connects remotely by itself.

Run `node --import ./tests/fixtures/deployment-env.js --test tests/fresh-install.test.js tests/database-access-sql.test.js tests/database-access-handlers.test.js`.
See [the P0-4 report](../../docs/pilot-p0-4-fresh-install.md) for exclusions,
verification boundaries, reference import and the future operator runbook.
