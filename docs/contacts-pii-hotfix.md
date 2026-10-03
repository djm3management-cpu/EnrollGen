# Contacts PII hotfix — 2026-10-03

## Confirmed root cause

Read-only production REST inspection found eight contacts. One contact, created
2026-10-03 at 15:19 UTC, contains JSON null for `email` and `last_name` inside
`pii_encrypted`. No malformed non-null envelopes were found. Decrypting the affected
contact reproduced HTTP 400 / P0001 / `PII encryption key <NULL> not found`.
A healthy encrypted field decrypted successfully through the service-only primitive;
SQL NULL also returned successfully. No contact data or keys were printed or changed.
The failed audited contact read aborts before writing its audit record.

The exception originates in `public.decrypt_pii_value(jsonb)` (migration 022).
It extracts `(p_encrypted->>'k')::uuid`, calls `pii_vault.get_key`, and raises the
exception when no material is found. This is the envelope's UUID, not a tenant ID,
RPC parameter, setting name, or currently active key UUID. `get_key` resolves
`pii_vault.encryption_keys.key_id` through `vault_secret_id` to
`vault.decrypted_secrets.id`. Initial key bootstrap uses the secret name
`pii_encryption_key_v1`; decryption resolves by stored UUID and supports older keys.

The create form sends empty strings for optional names/email. `encrypt_pii_value`
returns SQL NULL for empty strings. `contacts_sync_pii_encrypted` wraps that value
with `jsonb_build_object`, creating JSON null inside the object. SQL `IS NULL` does
not match JSON null. Extracting `k` from JSON null returns SQL NULL, explaining the
exact exception. The key itself is present and readable.

`decrypt_pii` loops through these fields; `read_contact_details` calls it for every
contact in a batch. A single blank field can fail the whole list. The detail hook
and list hook independently fail, explaining repeated UI messages. A contact insert
can persist successfully while subsequent hydration fails, making creation appear
broken; check the existing list before retrying the same phone.

Migrations 063–069 do not replace the PII primitives, trigger, or key lookup. 063
changes evidence grants and policies, not Vault/key access. 070 adds only the DNC
RPC and calls the existing blind index; it does not replace PII functions or grants.
The outbound batch's change to `useContacts.js` only replaces a silent missing-agent
search error with a visible message. No RPC parameter was renamed or removed.
F09 also enables the previously broken dialer contact reads, exposing existing bad
fields there. Reverting F21/070 would not repair `/contacts` and would remove DNC
protection. Fix forward with 071.

## Separate 401 and CallStore issue

Read-only production access with a valid service role returned HTTP 404 / PGRST205:
`Could not find the table 'public.call_logs' in the schema cache`. CallStore still
attempts to insert into that legacy relation; the canonical call activity model is
`v_call_log` and durable telephony attempts. Migration 041 drops a compatibility
`call_logs` view if present; 063–070 do not recreate a missing `call_logs` table.

CallStore calls `getAuthToken()` without the `supabase` JWT template and passes the
result to `getAuthSupabase`, which pins that token. The CRM tenant client instead
requests `getToken({template: 'supabase'})` and refreshes it per request. A default
Clerk session JWT or expired pinned JWT can produce a Supabase 401 independently
of the PII SQL error. The exact reported 401's URL/body was not provided, so its
specific source is not proven. Even with a corrected token, the absent `call_logs`
relation prevents persistence. Do not rotate the PII key, loosen grants, or recreate
legacy billing tables as part of this contact fix. CallStore persistence needs a
separate decision about retiring or replacing that legacy write; it remains unfixed
in this hotfix. No call timing, admission, hours/caps or recordings were changed.

## Minimal fix and rollout

Apply `supabase/migrations/071_contacts_pii_json_null.sql` once, before any optional
code release. This SQL-only fix makes the decrypt primitive return SQL NULL for
both SQL NULL and JSON null. It keeps malformed non-null envelope and missing-key
errors. No key rotation, data rewrite, RLS/grant change, schema-cache reload or browser
release is needed. Existing affected contacts work immediately after SQL commit;
refresh `/contacts`. Leave 070 and the outbound DNC code deployed.

The migration was NOT applied to production by this task. The branch is committed
for review and was not merged or pushed. Revert SQL, if ever needed, by restoring
migration 022's `decrypt_pii_value` definition; that restores the blank-field bug.

## Validation

`tests/contacts-pii-null.test.js` loads the actual 022 encryption/decryption/key
functions, 024 contact trigger, 043 phone normalization, 044 detail/search RPCs and
023 phone-match RPC in isolated PostgreSQL/PGlite with real pgcrypto and fixture
Vault metadata. It reproduces the exact pre-fix exception and verifies post-fix
create + detail, mixed batch hydration, caller phone match + decrypted details,
SQL/JSON null handling, unchanged ciphertext/grants, cross-tenant/identity denial,
restricted primitive access, and preserved errors for malformed or missing keys.

Full app tests: 215 passed. Full telephony tests: 158 passed. Production build and
`git diff --check` passed. No live production contact creation or SQL mutation was
performed; authenticated end-user browser validation after rollout remains required.
