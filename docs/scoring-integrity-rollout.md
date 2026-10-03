# Scoring persistence integrity — F13 / Batch 1 intent overflow

## Change

072 widens `intent_detections.intent_code` from varchar(50) to text and widens
`corrective_actions.intent_codes` to text[] so the same long code can be retained
in a corrective action. No truncation or catalog renaming occurs.

`scoring_jobs` identifies a result by call ID, template ID and transcript revision.
The revision is the database's canonical JSON fingerprint of raw transcript,
diarized transcript and duration. The caller snapshot must match the stored call.
A pending job has a 20-minute lease (longer than the background function's 15-minute
maximum). Failed/expired jobs can be claimed again with a fresh attempt token;
older workers cannot save or overwrite the newer worker's failure state.

The scoring transaction saves the scorecard, detections, item links, corrective
actions and redactions, then links the call and marks the job/call complete.
Template coverage and evidence ownership are checked. SQL errors and silently
skipped inserts roll back the entire result. The generator checks returned errors
for template reads, job RPCs, assessment/follow-up writes and profile reads/writes.
Failure-status persistence is also checked; if it fails, the background handler
returns a retryable error and the job remains pending instead of becoming complete.

Completed jobs return their persisted card/items/detections/actions without another
model call or duplicate writes. Pending jobs return without starting a second
worker. A changed transcript/duration or different template ID produces a new job.
Short-call results retain their existing N/A behavior and use the same transaction.
The input diarization is cloned rather than mutated by raw-transcript fallback.

Optional agent-profile refresh remains after the scoring commit. Its errors are
checked and explicitly logged; it does not invalidate successfully stored scoring
evidence. Optional assessment model failure retains the existing warning behavior;
assessment/follow-up persistence failures abort scoring before the result save.
Existing subscription gates and usage-record implementation are unchanged; replays
do not repeat post-score side effects. No telephony, routing, recording or billing
files, tables, calculations or admission rules were changed.

## Rollout

1. Let already running legacy scoring workers finish.
2. Apply only `supabase/migrations/072_scoring_integrity.sql`, then deploy the scoring
   code. 072 notifies PostgREST to reload its schema cache. Code requires the new RPCs.
3. Retry failed scoring jobs through the existing scoring entry point. Do not replay
   the migration tree or delete existing cards/detections.

Existing historical cards have NULL transcript revisions and remain untouched.
The first new-version job for a historical call creates a versioned card; the
migration does not guess revision identity for old partial/duplicate results.
A function worker that dies without recording failure remains pending until its
lease expires; a subsequent job invocation can retry it. No new scheduler is added.

No production SQL, deployment, merge or push was performed during implementation.
Unrelated uncommitted workspace changes are excluded from the commit.

## Validation

- Full app tests: 227 passing; full telephony tests: 158 passing.
- Production build, targeted scorer/function lint and whitespace checks passed.
- `scoring-integrity.test.js` uses the real classifier/scorer and PostgreSQL table
  definitions with migration 072. It verifies the 53-character catalog intent,
  corrective-action arrays, forced detection/item/action failures, atomic rollback,
  retry, replay without model calls, pending jobs, expired/stale leases, distinct
  transcript/template revisions, short calls, background failure, RPC privileges,
  silently skipped inserts, mid-job transcript changes, returned template errors
  and failure-status-write errors.
- The evidence-access fixture now requires successful detection persistence and
  idempotent replay before and after 063 instead of accepting the old overflow.
