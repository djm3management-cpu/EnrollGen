# MA dispositions and opportunities

Feature branch: `fix/ma-disposition-opportunities`.
Migration: **119**, [`119_ma_disposition_opportunities.sql`](../supabase/migrations/119_ma_disposition_opportunities.sql).
That file is the complete, exact SQL. It has not been applied to a live database.

## Disposition selection

`pending` and `incomplete` are internal call lifecycle values, not selectable
agent outcomes. Previously, passing one to the native outcome select supplied a
value without a matching option. The browser displayed the first enabled option,
Enrolled. `CallOutcomeEditor` now normalizes these and unknown values to the blank
“Choose disposition” option. Existing saved outcomes, including legacy Not
Enrolled, remain visible. Opening a call does not save or enroll anything.
The phone form already starts with a blank disposition.

## MA synchronization

The database trigger runs on explicit disposition saves and late call/contact
linkage. It covers Calls edits and phone saves through the same transaction.
Only calls explicitly marked `product_type = MA` qualify.

| Saved disposition | Opportunity behavior |
| --- | --- |
| Enrolled | Move a related MA opportunity to its pipeline's won stage; prefer Enrolled. Create a won MA opportunity if none exists. |
| Enrolled Pending Verification | Create Pending/Open if needed. Preserve manually set stages and existing closed opportunities. A stage managed by this automation can move to Pending. |
| A change away from Enrolled | Log the old/new disposition and retain the current stage, including a manual stage. This takes precedence over moving to Pending. |
| Other dispositions or non-MA calls | No automatic creation or stage move. |

The trigger first finds the same call's MA opportunity, then an existing open MA
opportunity for that contact in a compatible pipeline. It never reuses another
business's opportunity or an unrelated won sale. Deleted opportunities are not
restored or recreated by repeated saves. Missing contacts/agents or a mismatched
linked contact are logged without inventing contact identity.

`opportunities.stage_change_source` defaults to `manual`, preserving existing
board decisions. A stage move through the board or drawer marks it manual. The
disposition transaction marks its own successful stage moves `call_disposition`.
This marker is stored on the locked opportunity, so manual-stage protection does
not rely on timestamps or guessed history ordering. Authenticated users cannot
write the marker directly.

`call_disposition_opportunity_log` records the actor, call, opportunity, old/new
disposition, action, reason and before/after stage. Reads are tenant scoped;
authenticated clients cannot forge audit records. Repeated saves keep the same
card and stage clock. The existing move RPC internals retain stage history/events,
and new cards use the existing encrypted opportunity creation path. Changes to
disposition, stage and audit records commit or roll back together.

The Opportunities hook refreshes when Calls or the phone announces a disposition
save. Existing CSS and call routing, scoring and Co-Pilot logic are unchanged.

## Review and rollout

No main merge, production deploy, live migration, or historical backfill is part
of this branch. Review and apply only the exact forward migration 119; do not use
`supabase db push` to replay the repository's historical migration tree. Deploy
the frontend after the reviewed migration. No existing stage is moved when the
migration is installed.

For a call's audit trail:

```sql
SELECT id, old_outcome, new_outcome, action, reason,
       stage_id_before, stage_id_after, actor_id, created_at
FROM public.call_disposition_opportunity_log
WHERE call_id = '<call-record-uuid>'::uuid
ORDER BY id;
```

Regression coverage includes blank selection and saved legacy outcomes; refreshing
an already mounted board; MA-only creation and movement; Pending versus Won;
manual moves; changes away from Enrolled; repeated saves; soft deletion; enrolled
agent versus tenant agent identity; tenant access; and rollback on audit failure.
