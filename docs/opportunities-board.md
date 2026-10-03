# Opportunities MVP

Implemented on `feat/opportunities-board`. No merge, push, or deployment.
Pre-existing uncommitted CMS/DSNP work is preserved and is outside this change.

## Contacts UI

The existing Contacts tab now has a Contacts / Opportunities switcher. Contacts
remains the default, and its workspace stays mounted when switching views so the
selected contact, search, conversation and drafts survive. The board is linkable
at `/contacts?view=opportunities`; drawer contact links select
`/contacts?contact=<contact UUID>`. Browser Back/Forward updates the selected view.

Opportunities provides a pipeline kanban board with stage counts and estimated
value totals, contact-name search, agent/business/carrier/source filters, and a
list whose twelve columns are sortable. The GHL-style board has equally sized
columns with filled stage-colored headers, counts/totals, collapse controls and
independent vertical scrolling. Cards use a lighter tint of their stage color,
contact names, days pills, and Source/Value rows. The toolbar has an icon-only
board/list switch and a pipeline picker beside the opportunity count pill.
The mobile board scrolls horizontally. Mouse, touch and keyboard movement use
dnd-kit; touch users hold a card for 250ms to drag, and keyboard users pick up/drop
with Space and choose columns with Left/Right. Enter opens the card drawer.

Each card has exactly four outline actions: Call opens the existing dialer with
the contact's number (the dialer's Call button still places the call), Conversation
opens the contact's Conversations thread, Tags opens a persisted contact-tag
popover, and Notes opens/focuses the drawer's notes field. Actions do not open the
card or start a drag. Blue badges show unread messages, tag counts and the saved
opportunity note document (0 or 1); zero badges are hidden. Status falls back to
the stage outcome for incomplete rows, and days always displays a number,
including zero. These fallbacks do not modify stored opportunity data.

The seeded stages use these editable colors as the basis for dark header/card tints and
stage badges:

| Stage | Color | Outcome |
| --- | --- | --- |
| New Lead | Purple `#a78bfa` | Open |
| Contacted | Yellow `#facc15` | Open |
| Pending | Orange `#fb923c` | Open |
| Enrolled | Green `#4ade80` | Won |
| Disenrolled | Red `#f87171` | Lost |

New Opportunity searches existing contacts or creates one using the existing
contact mutation/encryption path. If contact creation succeeds but the opportunity
save fails, the created contact is retained for retry. Duplicate phone errors
offer the existing contact. The form edits every opportunity field; status comes
from the chosen stage. A missing call on creation defaults to the latest related
call when one exists.

The drawer edits the opportunity, displays stage history and related calls,
reuses CallDetailPanel for call inspection, and jumps to its contact. Each contact
has an Opportunities section. Contact activity call records, contact call history
and the Calls tab's expanded records have a manual Create Opportunity button with
contact/call prefill. A call without a linked contact disables that action and
explains that the contact must be linked first; this MVP does not change call
identity or create contacts from calls.

The gear opens pipeline settings. Administrators can create pipelines and
add/rename/reorder/recolor stages or mark stages won/lost. A populated stage
cannot be deleted without choosing another saved stage. The database moves its
opportunities and deletes the stage atomically. Historical stage names remain
readable after renames or deletion. At least one stage must remain.

## Storage and event contract

`058_opportunities_board.sql` is the next migration after the existing maximum,
`057`. It creates pipelines, pipeline_stages, opportunities,
opportunity_stage_history and opportunity_events. Every table carries tenant_id.
Existing contacts, agents, lead sources and call records are referenced by FKs;
no existing tables or functions are altered.

`059_opportunity_contact_tags.sql` adds contact_tags and three identity-bound
read/add/remove RPCs because native contact tags had no existing persistence.
Tags reference contacts, carry tenant_id, are encrypted with the same Vault
helpers, and log reads/edits through pii_access_log. Direct authenticated reads
expose only safe metadata. Case-insensitive duplicate additions return the
existing tag. Contact detail's existing Tags section also reads these tags.
No opportunity stage/write logic is changed by this migration.

Stage updates are optimistic in the UI, with row-level restoration on error.
`move_opportunity_stage` performs a locked, expected-stage-checked update with
stage_entered_at, derived status, history and exactly one event in the same
transaction. Drawer stage edits and move-before-delete use the same internal
operation. No-op moves do not emit events, and stale updates fail without
overwriting another session. Creation records initial history; it does not emit
a stage-change event.

The future subscription point is `public.opportunity_events` with
`event_type = 'opportunity.stage_changed'`. Each event has a unique history_id;
payload contains opportunity_id, from_stage_id, to_stage_id, changed_by and
changed_at. There are no consumers, automation triggers or actions. The explicit
`AUTO_CREATE_OPPS_FROM_CALLS = false` flag and TODO live in src/lib/opportunities.js.

Contact names are hydrated by the existing audited decrypt_pii RPC, never stored
on opportunity rows. Title and notes may contain PII, so they use the existing
encrypt_pii_value/decrypt_pii_value Vault helpers and pii_access_log; their
plaintext columns remain NULL. Authenticated direct reads exclude ciphertext.

Migration 028 deliberately made is_current_tenant permissive. These new tables
use a dedicated tenant-agent/Clerk-subject helper to provide actual cross-tenant
protection without changing existing CRM policies. Authenticated writes require
identity-bound RPCs; direct writes are revoked. Settings RPCs also require an
administrator. Normal service-role access follows the existing CRM pattern.

## Apply only these migrations

Use an existing database that already has the CRM/contact encryption and
lead_sources migrations applied. CLI syntax was checked with Supabase 2.119.0.
The repository has pre-existing duplicate migration versions (including 055),
so execute these files individually rather than applying unrelated pending migrations.

If the project is not already linked:

```sh
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 link --project-ref YOUR_PROJECT_REF
```

Then, from the repository root:

```sh
npx --yes supabase@2.119.0 db query --linked --file supabase/migrations/058_opportunities_board.sql
```

Only after that command succeeds, record its version in migration history:

```sh
npx --yes supabase@2.119.0 migration repair 058 --status applied --linked
```

For an existing local Supabase database, use `--local` in place of `--linked` in
both commands. If 058 has already been applied, skip it. Apply 059 next:

```sh
npx --yes supabase@2.119.0 db query --linked --file supabase/migrations/059_opportunity_contact_tags.sql
```

Only after that succeeds:

```sh
npx --yes supabase@2.119.0 migration repair 059 --status applied --linked
```

Both migrations are wrapped in transactions. Neither has been
applied to a live project during this implementation.

## Files

Added:

- supabase/migrations/058_opportunities_board.sql
- supabase/migrations/059_opportunity_contact_tags.sql
- src/hooks/useOpportunities.js
- src/hooks/useContactTags.js
- src/lib/opportunities.js
- src/lib/dialerUi.js
- src/components/opportunities/OpportunitiesView.jsx
- src/components/opportunities/OpportunityEditor.jsx
- src/components/opportunities/OpportunityDrawer.jsx
- src/components/opportunities/OpportunityDialog.jsx
- src/components/opportunities/PipelineSettings.jsx
- src/components/opportunities/ContactOpportunities.jsx
- src/components/opportunities/ContactTagsPopover.jsx
- tests/opportunities.test.js
- docs/opportunities-board.md

Changed:

- src/components/contacts/ContactsTab.jsx: subviews, contact section, call action.
- src/components/contacts/ContactDetail.jsx: contact section, call action and native tag display.
- src/components/phone/PhoneDropdown.jsx: UI event opens the existing dropdown with contact prefill.
- src/components/phone/DialerPanel.jsx: optional initial contact populates the keypad; call handler unchanged.
- src/components/callLog/CallLogTab.jsx: manual creation from expanded call records.
- src/hooks/useContacts.js: optional tenant scoping for the opportunity contact
  picker; existing callers keep the original behavior.
- src/styles.css: scoped styles using existing theme tokens and CRM controls.
- package.json / package-lock.json: dnd-kit, PGlite for SQL tests, test commands.

## Verification

```sh
npm test
npm run test:opportunities
npm run build
npm run typecheck:llm
```

All 93 existing tests and 15 new tests pass. New tests execute both actual
migrations in PGlite's PostgreSQL with real pgcrypto and the existing contact
encrypt/decrypt functions. Only Supabase's Vault key source and JWT provider are
fixtures. Tests cover stage history/events/status/timing, RLS across every new
table, blocked populated-stage deletion, move-before-delete, event-failure
rollback, stale edits, cross-tenant references, encryption/audit, pipeline
settings, default seeding, tag encryption/deduplication/tenant boundaries, list
status/day fallbacks, and client filtering/sorting/keyboard movement.

Build and the repository's configured typecheck pass. ESLint passes for every
changed/new JavaScript file. Repository-wide `npm run lint` still reports the
same 47 pre-existing errors; several are in prohibited telephony/integrations
files, so they remain untouched.

Browser QA used isolated local fixtures without live CRM data: board rendering,
requested colors, pointer/keyboard movement, failed-move restoration, contact
search/creation, list sorting/filtering, drawer edits/contact links, contact/call
prefill, stage deletion guard and a 390px mobile board.
The restyled board was checked for filled stage colors, four-icon order and badge
visibility, dialer prefill, conversation navigation, tag add/remove, notes focus,
collapse/expand, populated-column moves, failed-move restoration, independent
column scrolling and mobile horizontal overflow. Screenshots described in the
request were not discoverable in the repository; layout follows the detailed
written reference pending their file paths.
