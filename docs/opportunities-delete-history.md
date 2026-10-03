# Opportunities delete, history and board width

Branch: `feat/opps-delete-and-history-check`, based on main at `4df92f7`.
No merge, push, deployment or production migration application.

## Delete behavior

There was no existing opportunity delete control. The drawer now has a Delete
button; the list has an Actions row menu with Open and Delete. Both delete paths
show a confirmation containing the contact name and opportunity title. Cancel
keeps the record, and an RPC error keeps the record and displays the error.

Migration `062_opportunity_soft_delete.sql` adds nullable `deleted_at` and
`deleted_by` fields and an identity-bound `delete_opportunity` RPC. Ownership
means the assigned agent. Agents can delete their own assigned opportunities;
administrators can delete any opportunity in their tenant, including unassigned
ones. Tenant/Clerk identity checks use the existing `opportunities_assert_agent`.
The RPC checks the confirmed row's version and serializes with existing writes.
Retries preserve the original deletion actor and time.

The existing reader RPC and authenticated opportunity RLS exclude deleted rows,
so board/list rows, stage counts, values, filters and contact opportunity sections
exclude them. The UI removes the row after a successful RPC and refreshes other
mounted opportunity sections through the existing update notification. The
database retains opportunity history and events. Deletion does not insert a
history row or emit `opportunity.stage_changed`. Later edits/moves are blocked;
direct authenticated inserts, updates and hard deletes remain revoked.

If a pipeline stage is removed, only live opportunities take the existing
move-before-delete path. Retained deleted opportunities' inert stage FK is
relinked to the chosen destination (or first surviving stage), allowing stage
removal without modifying their history, clocks, status or events. Existing
history stage FKs become null on stage removal as before, but name/color
snapshots remain readable.

## Stage history verification

All write/read checks use the authenticated role in real PostgreSQL through
PGlite, with the production-like grants from 058/059/061 and a locked source
table. The UI uses the same existing write entry points:

| Path | Verified result |
| --- | --- |
| Drag/drop (`move_opportunity_stage`) | Exactly one move history row and one event; from/to stage, actor and time match the move |
| Drawer stage edit (`save_opportunity`) | Exactly one move history row/event; a fields-only save and same-stage move add none |
| Move before stage delete (`delete_opportunity_stage`) | Exactly one move history row/event per live opportunity; deleted opportunities add none |
| Drawer timeline | Authenticated SELECT works; newest-first time/ID ordering; names/colors survive rename, recolor and removal |

The real display gap was missing timeline colors. 062 adds color snapshots to
the existing history table and captures them in existing create/move RPCs. The
drawer reuses stage badges with the recorded names/colors. A rename/recolor
preserves previous history labels/colors, and future moves use the updated
stage values. The stage-history transaction/event logic is otherwise unchanged.

Old history has no recorded historical color: the migration backfills colors
from surviving stages at application time. Rows whose stages were already
removed use the existing purple fallback; their original color cannot be
reconstructed from the database.

## Board layout

Only the Opportunities subview gains the full-width workspace override. It
removes unused rail padding and the parent width cap, while leaving Contacts
list styling/behavior unchanged. Toolbar, filters and board share that width.
Columns use `flex: 1 1 0`, a 220px minimum and 12px gaps, regardless of stage
count. Below `n * 220 + (n - 1) * 12` available pixels, the board scrolls
horizontally; each column continues scrolling vertically on its own.

An overflow-only scroll range stays visible below the board, even when macOS
hides native overlay scrollbars. Its proportional thumb tracks native scrolling
and supports dragging and keyboard input. Five stages require 1,148px; narrower
layouts scroll instead of clipping the final stage.

Chrome checks render the actual React Opportunities components and application
styles with offline hook fixtures, never production records. Effective CSS
viewport widths and device scale reproduce 80%, 90%, 100%, 110% and 125% page
zoom at 1,366px, 1,440px and 1,920px desktop widths. All 60 combinations with
1/3/5/8 stages pass equal-width, minimum-width, full-width alignment, overflow and
last-stage reachability checks. Mobile at 390px also passes, including keyboard
scroll-to-end and a persistent scrollbar. Independent column scrolling, drawer
history badges, delete cancel/error/success and list-menu keyboard/delete paths
pass in the same offline browser fixture.

## Apply before deploying

With 058/059/061 already applied, execute only 062; 060 is reserved for DSNP and
the repository contains unrelated pending/duplicate migration versions:

```sh
npx --yes supabase@2.119.0 db query --linked --file supabase/migrations/062_opportunity_soft_delete.sql
```

Only after success, record it:

```sh
npx --yes supabase@2.119.0 migration repair 062 --status applied --linked
```

Use `--local` instead of `--linked` for an existing local Supabase database.
The SQL is transactional and reloads the PostgREST schema. Existing migrations
are unchanged; no telephony, integrations-worker, Paragon or Co-Pilot code edits.

## Files

- `supabase/migrations/062_opportunity_soft_delete.sql`
- `src/lib/opportunities.js`
- `src/hooks/useOpportunities.js`
- `src/components/opportunities/DeleteOpportunityDialog.jsx`
- `src/components/opportunities/OpportunityRowMenu.jsx`
- `src/components/opportunities/OpportunityDrawer.jsx`
- `src/components/opportunities/OpportunitiesView.jsx`
- `src/components/contacts/ContactsTab.jsx` (subview CSS marker only)
- `src/styles.css` (scoped Opportunities styling)
- `tests/opportunities.test.js`
- `docs/opportunities-delete-history.md`

Validation: all 118 tests pass, including 25 Opportunities tests. Build,
configured `typecheck:llm`, scoped ESLint and diff whitespace checks pass.
