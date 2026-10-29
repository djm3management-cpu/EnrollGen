# Combine Calls

Branch: `feat/combine-calls`.

Combining groups disconnected calls or callbacks into one Calls panel. Each segment keeps its own recording, transcript, timestamp, duration, and provider data. Audio files are never joined. The primary keeps its contact, agent, outcome, and compliance results.

## Existing code reused

The repository had no CRM call merge/parent relationship or uncombine action. Existing Twilio parent/child SIDs identify telephony legs, not combined CRM records. This feature extends `call_records`, migration 066's `v_call_log`, the existing `contact_activities` trail, Clerk/recording ownership checks, and `CallTranscriptPlayer`. It leaves telephony, routing, sticky routing, provider ingestion, and compliance dispatch unchanged.

## Apply the exact migration SQL

1. Open the correct Supabase project → **SQL Editor** → **New query**.
2. Copy and run the **entire contents** of [`118_combine_calls.sql`](../supabase/migrations/118_combine_calls.sql), from `BEGIN;` through `COMMIT;`. That file is the exact SQL, including the nullable FK with `ON DELETE SET NULL`, partial index, guarded service-only transaction, audit fields, and read models. Prerequisites are the existing migrations through 117, including 064 and 066. Apply 118 once.
3. Deploy the feature branch after the migration succeeds. No production migration or deployment was performed during implementation. Follow the repository's normal main-push deployment workflow when the branch is approved for release.
4. Refresh `/crm/calls` and verify the smoke checks below using test calls.

Migration 118 renames the existing raw view to `v_call_log_entries` and recreates `v_call_log` as its filtered wrapper. Existing clients still read `v_call_log`. Children are excluded before filtering, pagination, export and counts. Existing reporting views and dashboard/nightly/coaching queries also exclude children. Historical stored analytics are refreshed by their existing scheduled jobs. No stored call duration is rewritten.

## Files changed

- `supabase/migrations/118_combine_calls.sql`: parent relationship, one-level guard, measured/recording facts, filtered list/reporting views, atomic preview/combine/uncombine RPC, and activity logging.
- `netlify/functions/combine-calls.js`: authenticated picker, protected children/transcripts, and RPC endpoint. Uses the existing tenant/admin and recording ownership rules; combining does not grant recording access to another agent's calls.
- `src/components/callLog/{CallLogTab,CombineCallsModal,CombinedCalls}.jsx`: row selection/menu/detail actions, side-by-side confirmation, explicit different-contact acknowledgement, dated child players, and uncombine.
- `src/components/callDetail/CallDetailPanel.jsx`, `src/styles.css`: shared detail integration and existing-theme responsive styling.
- `netlify/functions/call-log.js`, `src/hooks/useDashboardData.js`, `netlify/functions/{nightly-analytics,weekly-coaching}.js`: preserve combined measured talk display and omit children from call metrics.
- `tests/combine-calls*.test.js`, `tests/helpers/evidenceDb.js`, `tests/{crm-workspace,recording-panel}.test.js`: database/UI integration coverage and updated existing action-layout fixtures.

## Behavior and smoke checks

- Select exactly two saved records. **Combine Calls** appears only for two selections. Calls without a saved `call_records` row remain visible, with selection disabled until their existing pipeline creates a record.
- **Combine with…** in the row menu or expanded detail offers that contact's latest 100 list entries with saved records. Cross-contact selections are available through the checkboxes.
- The server previews the primary from the longest completed recording. If either duration is missing, or the two durations tie, compare original measured talk, then the earlier call timestamp, then ID for a stable exact tie. A changed winner requires another preview.
- Confirm the two dates and 12-hour times, agents, recording/talk durations and dispositions. Different contacts require an explicit checkbox, enforced again in the transaction.
- After combine, only the primary remains in the list/search/count. Talk shows the sum. Expand it to see the primary's own dated player and **Combined Calls**, with a separate dated audio/transcript player per child.
- Combine two existing groups: all children go directly under the winning primary. No nested chains.
- **Uncombine** restores the selected child and its original talk duration to the list; other children remain linked. Audit entries include the verified Clerk subject, timestamp, both IDs, and affected group IDs for each affected contact (or a tenant event for a call without a contact).
- Outcome, primary attribution, original durations, transcripts, recording rows, Twilio and Deepgram fields remain unchanged. Combining does not queue compliance. The existing Enrolled / Enrolled Pending Verification rules remain in effect.

## Validation

`npm test`: 584 passing tests. New coverage includes SQL primary/tie/missing selection, hidden list and filtered counts, restore, both-group re-parenting, different-contact preview/confirmation, ownership/tenant isolation, browser write/RPC denial, stale selection, audit rollback, contactless action auditing, parent deletion behavior, selection UI, confirmation UI, and independent child players. `npm run build`, targeted ESLint, and `git diff --check` pass. The confirmation and dated child-player layout were also checked in Chrome against local sample data.
