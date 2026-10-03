# Batch 1: evidence access / F04

Branch: `fix/batch1-evidence-access`. Base: `1d5578f`.
Migration: [063_evidence_access.sql](../supabase/migrations/063_evidence_access.sql).
No production writes, deployment, credential rotation, or data deletion are part of this implementation.
Existing D-SNP working changes remain in the original checkout.

## Rollout

1. Review this commit and the final SQL; agent stops after committing.
2. After separate approval, merge and push the code.
3. User confirms the Netlify deployment is live. Server evidence paths must have
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the existing Clerk verifier configuration.
   Imports retain the existing server `OPENAI_API_KEY`; scoring retains its internal job secret.
   No secret values are changed or printed.
4. User runs **only 063** in the Supabase SQL Editor, after code is live.
   Never replay the migration tree. SQL is transactional with a 5-second lock
   timeout; a timeout rolls back the delta and requires a later retry.
5. Run the five-minute checks below and the SELECT-only grant proof.

## Authorization and compatibility

The SELECT-only catalog snapshot was captured at 2026-10-03 04:36:48 UTC.
The fixture [evidence-live-schema.sql](../tests/fixtures/evidence-live-schema.sql)
contains its schema, constraints, policies, and relevant function/trigger definitions;
it contains no customer rows or credentials.
All nine tables had RLS enabled and full grants to anon, authenticated and service_role.
There were 18 permissive PUBLIC policies plus four role-specific policies.
The old tenant helper merely checked whether a tenant existed.

| Table | Deployed path after this change | Access after 063 |
| --- | --- | --- |
| call_transcripts | Netlify post-call and transcript-import write with mandatory service key; Co-Pilot uses a fresh Clerk Supabase-template token | Authenticated own transcript, explicit protected owner or matching protected session |
| transcript_chunks | transcript-import service writes; both existing search RPCs remain SECURITY INVOKER | Authenticated readable-transcript chunks; anon loses RPC EXECUTE |
| sessions | evidence-session service start/end/history/diagnostic; post-call service linkage/finalization | Authenticated own enrolled agent and tenant |
| compliance_flags | evidence-session service insert and history count | Authenticated own session |
| section_scores | evidence-session service insert and history count | Authenticated own session |
| agents | Import/checkpoint service resolves legacy display identity; search joins names | Authenticated SELECT only id/name for readable transcripts |
| enrolled_agents | Service resolves protected subject membership and imports; self provisioning requires configured signed Clerk organization; dashboard uses strict template-token client | Authenticated active member reads tenant roster; no browser mutations |
| agent_availability | Existing live set-availability edge function, telephony, service RPCs and Netlify service handlers | Service only |
| agent_availability_log | Existing availability change trigger under service execution | Service only |

No server evidence client falls back to an anon key. Incoming session, tenant, agent,
call and transcript references are bound to the verified Clerk subject and protected
enrolled row. Mutable CRM call_records/tenant_agents rows do not establish transcript
read ownership. A signed Clerk organization admin may import for another active
enrolled agent in that same tenant; a mutable roster role cannot grant that permission.

Before 063, transcript writers retry without owner_agent_id **only** for a missing
column error. Every import/checkpoint has a protected owned session, so work written
between deployment and migration remains readable afterward. After 063, writers also
store owner_agent_id. Existing evidence is not backfilled or rewritten.
Four legacy transcripts without verifiable session ownership become service-only;
repairing those historical ownership links needs a separate reviewed data change.

The section writer matches the captured live score/max_score/notes schema.
Checklist values become score/max_score; section number, completion and duration
remain in JSON notes. The browser no longer writes nonexistent drifted columns.

### Temporary availability exception for Batch 2

No anon/PUBLIC table privilege remains, including on availability or its log.
The existing deployed set-availability endpoint remains unchanged: it accepts the
shared browser x-api-key and a supplied agent slug, then updates availability with
its **service role key**. This preserves the current toggle, phone leases, active
call protection and trigger logging. Subject-binding this endpoint and retiring
the shared-key workflow belong to Batch 2. No credential is rotated here.

## Validation and limits

The evidence suite uses real PostgreSQL roles, ACLs, RLS, FKs, PL/pgSQL and the
captured policy drift. It tests the new handlers on both sides of 063, verifies
existing rows survive unchanged, checks all nine anon/PUBLIC read/write denials
(including TRUNCATE and column privileges), authenticated write denial, own-agent
reads, peer/foreign/inactive/unknown subject denial, ownership precedence, both
search RPCs, Co-Pilot citations, imports/admin targeting, membership spoofing,
session/flag/section/history/diagnostic, checkpoint retry/finalization, browser
token refresh/sign-out, and session-start sequencing.
Availability exercises the captured service toggle/logging, heartbeat,
claim/retry/release and lease expiry paths. Full telephony tests run separately.

Final checks:

- Root suite: 144 passed, including 26 evidence checks.
- Telephony suite: 145 passed.
- LLM typecheck: passed.
- Vite production build: passed using non-secret fixture build variables.
- Node 20 / esbuild bundles for all four affected evidence/scoring handlers: passed.
- Full lint: 47 existing errors, zero warnings; all diagnostics match the base
  commit exactly. Changed/new files introduce no additional lint diagnostics.
- Git whitespace check: passed. styles.css is unchanged.

PGlite has no bundled pgvector. A test-only vector domain and constant-distance
operator execute both real search function bodies with real RLS. These tests
verify retrieval authorization, not vector ranking accuracy. Clerk verification,
model responses and browser token minting are isolated fixtures; no live
beneficiary call, production import or vendor delivery is performed.

### Existing scoring issue (F13), outside this batch

The real classifier/scorer and background handler persist the fixture scorecard
and item with identical results before/after 063 and no additional permission
failure. However, the intent catalog includes the 53-character code
`agent_advises_surrendering_existing_policy_separately`; a SELECT-only live catalog
check confirmed `intent_detections.intent_code` is still varchar(50).
The bulk detection insert returns 22001, and the existing generator ignores it
and reports completion. The regression test explicitly records this failure on
both sides of 063. Passing Batch 1 tests does **not** prove durable detection
evidence or resolve F13. QA schema/persistence repair remains a separate batch.

## Five-minute post-migration check on enrollgen.com

Use your normal enrolled agent account and non-beneficiary test text.

1. **0:00–1:00 — availability.** Open [enrollgen.com](https://enrollgen.com),
   sign in, and connect the phone so its normal heartbeat is active.
   Toggle unavailable → available → unavailable; verify each state settles
   without an error, then restore your intended state. A disconnected phone
   correctly cannot become routable.
2. **1:00–2:00 — call history.** Select **MS → COMPLIANCE**. The Call History
   panel should load your existing sessions without a permission error.
   Other agents' sessions should not appear.
3. **2:00–3:00 — own transcript fixture.** In that MS COMPLIANCE panel's
   **Upload Transcript**, select yourself, today's date, product MA, any
   test carrier, duration 3:00, manual source, and non-enrollment disposition.
   Paste: “Agent: This call is recorded. We discuss Medicare plan benefits,
   provider networks, premiums, and prescription drug coverage.”
   Submit; expect upload success and a positive chunk count. This creates
   clearly synthetic test content under your own identity; it sends no call.
4. **3:00–4:00 — Co-Pilot references.** Return to **MA → Script** and ask
   Co-Pilot about provider networks/premiums using transcript references.
   Check the displayed [R#] source/excerpt belongs to your uploaded or existing
   own transcript. No other agent's transcript should appear. A generic AI
   answer without any source is not a successful retrieval check; retry the
   fixture wording and inspect for a retrieval/auth error.
5. **4:00–5:00 — session tracking.** In MA Script, click **Start Call**,
   progress through a section with test inputs, then leave the flow normally
   by switching to **MS → COMPLIANCE**. Refresh once. Call History should show
   your new MA session with its end/duration and the section count when a
   section completed. Verify there is no evidence save error. Restore your
   normal flow and availability state.

Do not delete existing evidence to clean up this check. Actual outbound calls,
beneficiary data, enrollment webhooks and vendor delivery are unnecessary.

## SELECT-only grant proof

Run [063_anon_grants.sql](../supabase/validation/063_anon_grants.sql).
Expect exactly nine rows, all table_present=true and both privilege columns=false.
The checks include privileges inherited from PUBLIC and any role membership,
plus column ACLs; a missing table or NULL result is not a passing proof.
