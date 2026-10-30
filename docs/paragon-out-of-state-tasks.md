# Paragon out-of-state callbacks and disputes

Migration **126_paragon_out_of_state_tasks.sql** must run after 125 and before releasing the updated functions/UI. It has not been applied to a live database by this change.

ZIP/state confirmation now calls an atomic service-only RPC. It validates the answering agent, tenant, Paragon source and ZIP/state pair, and uses the existing routing `paragon_agent_tier` function with the current source/year licensing and appointment matrix. Callback recipients may be offline or busy because this is asynchronous follow-up. Only active agents in the same NGHS tenant qualify. The former fixed-NPN fallback is removed.

- Eligible answering agent: no out-of-state callback is needed.
- Ineligible answering agent with an eligible teammate: assign one callback task to that teammate. Existing eligible assignees are retained on repeat confirmation; other eligible agents use the existing least-recently-assigned pattern.
- No eligible NGHS agent: set `inbound_calls.paragon_serviceability='not_serviceable'` and `return_reason='out_of_state_not_serviceable'`, and cancel any open callback for that call.

Migration 126 re-evaluates historical confirmed wrong-state calls and existing open tasks with that same function. Invalid fallback tasks are cancelled with a closure timestamp/reason and their original call is flagged. Serviceable tasks are retained or reassigned to an eligible agent. Completed tasks are not reopened by identical repeated confirmation. A failed eligibility lookup rolls back confirmation/assignment rather than labeling the call unserviceable.

Real tasks appear alongside ordinary CRM Follow-ups, labeled **Paragon callback: out-of-state**. The task rows show the caller name/phone/confirmed state, a contact link when available, and an original-call link. Missing call-record names fall back to existing encrypted contact names; genuinely unknown callers are labeled Unknown caller. Existing task storage is reused, with due-date and completion support; the CRM hook merges these tasks with ordinary follow-ups and keeps either source available if the other fails.

The dashboard's task panel is removed. A small own-agent count badge links to `/crm/followups?source=paragon`, which selects Paragon callbacks and all open due-date buckets. The badge counts every open task, not just the first page, and hides at zero or if its optional count request fails. Counts refresh on task changes, focus and every 30 seconds. Identity changes cannot display the previous user's count.

The Paragon report now shows a **serviceability** column, an **Out of state: not serviceable** count and a filter for those calls. CSV downloads preserve the filter and the confirmed state. Daily CSV exports also include the new column. Stored billing evidence/rates and the 90-second threshold remain authoritative: the flag supports a dispute/credit request and does not mark a vendor credit as already granted. Daily report totals are labeled as totals for all calls even when filtering the detail rows.

Original-call links filter the existing tenant-scoped call-log API by inbound-call UUID and expand the matching call. Call admission, reservations and live routing code are unchanged.

Tests use local PostgreSQL fixtures for migration cleanup, routing-tier eligibility, authorization, atomic failures, report flags and task lifecycle, plus component/hook tests for the badge, task-list filter, actions and degraded API behavior. No live task, vendor message, billing record or deployment was changed.
