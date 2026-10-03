# Opportunities source permission fix

Branch: `fix/opps-lead-sources`. No merge, push, deployment or production SQL
application is part of this fix.

## Cause and fix

There was one direct authenticated source read: `useOpportunities.refresh`
selected `id, name, active` from `lead_sources`. This shared hook supplies the
board, filters, opportunity editor, contact sections and call creation actions.
Migration 048 deliberately revokes source-table privileges from authenticated
users because the table contains vendor credentials and configuration. The
failed metadata request prevented the hook from setting pipelines, stages and
opportunity rows.

Migration `061_opportunity_source_reader.sql` adds an identity-bound
`SECURITY DEFINER` reader matching the existing secure CRM RPC pattern. It
validates the tenant and requesting agent against the signed-in Clerk subject
using `opportunities_assert_agent`, restricts rows to that tenant and returns
exactly `id` and `name`. Anonymous execution is revoked. Existing source-table
grants, policies, vendor functions, delivery jobs and Paragon behavior are not
changed. Migrations 058 and 059 are not edited.

The frontend metadata loader requests all source labels and the active-only
subset through this RPC. Cards and filters retain inactive source labels, while
the editor still offers active sources plus an existing opportunity's selected
inactive source. No `active` or configuration field is returned to the browser.

## Production schema and permission audit

Read-only catalog queries confirmed these source columns and permissions. No
customer records, credential values or vendor configuration values were read.

| Columns | Classification |
| --- | --- |
| `id`, `name` | Allowed CRM identity/display label; the only returned columns |
| `ping_key_hash`, `postback_secret` | Sensitive credential hash/secret; excluded |
| `postback_url`, `postback_field_map` | Sensitive delivery endpoint/configuration; excluded |
| `report_emails`, `twilio_number` | Private recipient/routing contact information; excluded |
| `tenant_id`, `external_id`, `parent_source_id` | Internal tenant/vendor relationships; excluded |
| `type`, `active`, `report_cursor`, `created_at` | Internal source state; excluded |

The production authenticated role has no source-table SELECT privileges and
there is no authenticated source RLS policy. That boundary remains intact.

| Remaining read path | Result |
| --- | --- |
| Pipelines, stages and stage history | Migration 058 explicitly grants authenticated reads with its tenant policy |
| Agents | Existing tenant provider reads an explicit roster projection, filtered by tenant; production SELECT is allowed |
| Contacts | Picker uses `CONTACT_SAFE_COLUMNS`; details use audited `read_contact_details`; production permits these reads |
| Calls | Editor/drawer select explicit columns filtered by tenant and contact; production permits every selected column |
| Contact intelligence, activities, messages and media | Existing CRM hooks; production SELECT is allowed |
| Opportunity title/notes and tag contents | Already read through encrypted, identity-bound RPCs; no direct ciphertext read added |

No second locked-table permission failure was found. Production currently has
broad existing contact grants; the regression smoke test also checks the picker
and audited detail reader with stricter safe-column-only contact grants.

## Apply before deploying the frontend

Use the linked CRM database with migrations 058/059 already applied. Execute only
061 because the repository contains unrelated pending/duplicate migration
versions:

```sh
npx --yes supabase@2.119.0 db query --linked --file supabase/migrations/061_opportunity_source_reader.sql
```

Only after that succeeds, record the migration:

```sh
npx --yes supabase@2.119.0 migration repair 061 --status applied --linked
```

Use `--local` instead of `--linked` for an existing local Supabase database.
The migration is transactional and notifies PostgREST to reload its schema.

## Changed files and validation

- `supabase/migrations/061_opportunity_source_reader.sql`: safe source-label RPC.
- `src/lib/opportunities.js`: shared frontend metadata loader using the RPC.
- `src/hooks/useOpportunities.js`: consume metadata and active source labels.
- `src/components/opportunities/OpportunityEditor.jsx`: retain active/selected source choices.
- `tests/opportunities.test.js`: production-like locked source grants and real source schema; authenticated frontend loader, tenant/identity/anonymous boundaries, denied sensitive reads, preserved service access, and contact/agent/call/timeline smoke reads.
- `docs/opportunities-source-permissions.md`: this audit and application guide.

Tests run real PostgreSQL through PGlite, using the actual 048 source table schema,
061 migration and frontend loader. The original fixture's incorrect authenticated
source grant is removed.

Validation passed: all 111 tests (including 18 Opportunities tests), production
catalog/grant inspection, build, configured `typecheck:llm`, scoped ESLint and
`git diff --check`. Protected files and migrations 058/059 have no changes.
