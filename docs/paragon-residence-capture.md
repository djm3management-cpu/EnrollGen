# Automatic Paragon residence capture

Branch: `fix/remove-zip-gate`. No deployment or production migration is authorized yet.
The workspace stays open immediately. This adds no confirmation control, banner,
script change, disabled tool, or call-control dependency. `da50664` remains intact.

## Residence sources and provenance

The independent Railway worker reads server-attributed, durable live transcript
finals every three seconds, without changing transcription/checkpoint/post-call
code. It extracts the customer's first numeric answer to the ZIP/county/state
question, explicit residence ZIP statements, and clear corrections. Split finals
and individually spoken digits are supported. It validates every five-digit ZIP
against `zip_county_crosswalk`; state comes from that crosswalk, narrowed by spoken
state/county when possible. A uniquely mapped ZIP conflicting with spoken state
is captured with ambiguity flagged. No state-only inference is allowed.
Uncertain alternatives are flagged, not accepted as a clear residence. Multiple
valid transcript ZIPs leave a sticky ambiguity flag; the last clear ZIP wins.
A later unrelated number cannot replace the first answer.

Priority, enforced again under the database job lock:

1. Transcript residence.
2. Successful agent-typed, call-bound SEP lookup or county selection.
3. Contact ZIP with positive provenance from an authenticated CRM ZIP field edit.

SEP capture is asynchronous and binds the tenant, agent, inbound call ID and
parent SID. The server rejects mismatched or ended calls. Merely running an
untouched contact-prefilled ZIP is not residence evidence. Lower-priority sources
cannot overwrite transcript residence, including exploratory/conflicting lookups.

`telephony/src/routes/leads.js` accepts ZIP/county/state from authenticated vendor
lead intake (`/api/leads/incoming`), creates `fmo_transfer` contacts, and backfills
missing fields on existing contacts without changing their source label. Raw lead
intelligence is saved separately, so its absence is not proof of non-vendor origin.
`telephony/src/routes/twilioVoice.js` finds/creates contacts by phone and records
vendor/ping state in `inbound_calls.caller_state`; that is not customer residence.
Existing contacts have no reliable per-field ZIP provenance. Consequently even a
`manual` source label is insufficient. Neither ping state, vendor metadata, raw
lead ZIP nor an unproven existing contact ZIP is used as residence.

Explicit future CRM ZIP edits atomically save a proof row with the contact's
`updated_at` version. Any later contact update invalidates that proof until a new
explicit ZIP edit; this deliberately favors missing evidence over false residence.
Historical contact values are not retroactively blessed. This does not change
contact ZIP prefill inside plan tools.

## Persistence, retries and review

All writes use authenticated server endpoints or service-only RPCs. The worker
calls the existing `confirm_paragon_call_state` transaction, retaining its
serviceability, `return_reason`, `wrong_state` and eligible-teammate callback task
behavior. Existing routing, billing rules, vendor postbacks and reporting logic
are unchanged. Capture source, observation/capture timestamp, ZIP, state, county
and ambiguity are stored under `inbound_calls.vendor_metadata.paragon_residence`.

Jobs use 45-second leases, idempotent value comparisons and exponential backoff
(1 second up to 300 seconds, without dropping evidence). The separate scoped
browser outbox persists SEP submissions across reloads and retries transient
failures. It never delays the lookup result. Terminal call jobs settle five
minutes after ending to allow delayed durable transcript finals. New calls are
discovered starting at migration activation; historical calls are not reclassified.

CRM > Calls includes an admin-only **Paragon residence review** section with
pagination. Ended calls with missing residence, ambiguous evidence or a capture
error appear there; ordinary agents cannot query the underlying service-only view.
No automatic ZIP is invented for missing evidence.

## Migration 131 — prepared, not applied

`supabase/migrations/131_paragon_residence_capture.sql` is schema-additive:

- Four new tables: activation settings, contact ZIP provenance, residence jobs,
  and call-bound SEP inputs; one due-job index and a singleton activation row.
- Five new service-only functions and one service-only admin review view.
- RLS/grants on the new objects and a PostgREST schema-cache notification.

There are no changes to existing column definitions, existing functions or
existing triggers; no historical backfill or data deletion runs during migration.
Foreign keys reference existing tables, so normal PostgreSQL DDL locks still apply.
The new functions perform ordinary runtime contact/residence updates as described
above, and clearing a contact ZIP deletes only its new provenance row. The existing
`confirm_paragon_call_state` function is reused without replacement. Production
application requires explicit approval.

## Validation and deployment after approval

Run `npm test`, `npm run lint`, `npm run build`, and `npm test` in `telephony/`.
Integration tests execute migration 131 and the real serviceability/callback
functions in PGlite, including authentication, priority, vendor exclusion,
ambiguity, retries and service-only permissions.

Before **any deployment**, check current Twilio parent-call/conference status and
DB active attempts/reservations; verify there are no live calls. Presence alone
is not sufficient. Repeat the check if the rollout is delayed. If a call is live,
stop and wait for clearance. Stop and report any failing rollout step.

1. Review and approve migration 131. Check `npx supabase migration list --linked`
   and `npx supabase db push --linked --dry-run`; proceed only if 131 is the sole
   pending migration, then `npx supabase db push --linked --yes`. Do not use
   `--include-all` to replay unrelated history. Resolve any drift before applying.
2. After explicit merge/push approval, push main once to trigger Railway and
   Netlify automatic deployments. The database must be ready first; no Supabase
   edge function is changed by this work. Do not run `netlify deploy --prod`.
3. Verify Railway health and absence of `paragon_residence_worker_error`; verify
   the Netlify production build and authenticated `/api/paragon-residence`.
4. On an authorized test call, verify transcript capture, correction ambiguity,
   wrong-state callback classification and the admin review section, while all
   tools remain available immediately. Check stored source/timestamps and confirm
   untouched vendor prefill does not become residence evidence.

Do not merge, push, apply SQL or deploy as part of the current change.

## Changed files

| File | Purpose |
| --- | --- |
| `telephony/src/paragonResidenceExtraction.js` | Deterministic residence and correction extraction, crosswalk resolution. |
| `telephony/src/paragonResidenceWorker.js` | Independent discovery/lease/retry worker and source priority. |
| `telephony/src/server.js` | Starts only the new independent worker. |
| `supabase/migrations/131_paragon_residence_capture.sql` | New durable storage, provenance, service RPCs and admin review view. |
| `netlify/functions/paragon-residence.js` | Authenticated, tenant/agent-bound SEP/contact capture and admin review API. |
| `src/lib/paragonResidence.js` | Scoped persistent SEP outbox and authenticated contact ZIP save. |
| `src/components/ParagonResidenceOutbox.jsx` | Invisible, nonblocking background outbox flush. |
| `src/App.jsx` | Mounts the invisible outbox. |
| `src/hooks/useSEPLookup.js` | Publishes successful explicitly typed ZIP lookups without changing prefill. |
| `src/components/SEPLookup.jsx` | Freezes lookup call identity and publishes successful county selections. |
| `src/components/contacts/ContactsTab.jsx` | Routes explicit ZIP edits through atomic provenance save. |
| `src/components/callLog/ParagonResidenceReview.jsx` | Read-only admin list of ended calls needing review. |
| `src/components/callLog/CallLogTab.jsx` | Mounts admin review within CRM Calls. |
| `telephony/tests/paragonResidenceExtraction.test.js` | Extraction, correction, invalid/missing ZIP and unrelated-number tests. |
| `tests/paragon-residence.test.js` | Real migration/classification/callback/priority/authentication/retry integration tests. |
| `tests/paragon-residence-outbox.test.js` | Persistent retry, identity isolation and vendor-prefill exclusion tests. |
| `tests/call-workspace-access.test.js` | Prefill provenance and nonblocking/hidden background UI tests. |
| `tests/crm-workspace.test.js` | Supplies the new admin component to the existing CRM test harness. |
| `docs/paragon-state-routing.md` | Links the replacement automatic write path. |
| `docs/paragon-residence-capture.md` | Provenance findings, migration review and gated rollout instructions. |
