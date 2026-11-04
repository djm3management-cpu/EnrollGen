# Live checkpoint warning, November 4, 2026

## Verified incident

Parent Twilio SID: `CA6c0e92c761f5f20ec3cbedeec3444fb3`.
Session: `4f34c8a2-c08a-4c1c-98ca-7ca9f20896fd`.
Call record: `13281a25-f547-4b28-956c-879c739ac099`.
Transcript: `180283de-6eba-4769-a095-8e3befc02b38`.

The reported warning was a **live transcript checkpoint failure**, not a prematurely
executed finalization or summary. Database queue evidence and Netlify function logs
agree:

| Event | UTC | Eastern (EST) |
| --- | --- | --- |
| Session started | 15:57:13.366838 | 10:57:13 AM |
| Parent answered | 15:57:17 | 10:57:17 AM |
| Scheduled `checkpoint`, `final:false`, accepted | 16:32:01.773852 | 11:32:01 AM |
| Worker logs `post_call_work_failed`, action `checkpoint`, HTTP 503 | 16:32:03.621 | 11:32:03 AM |
| Request marked failed | 16:32:03.685621 | 11:32:03 AM |
| Parent terminal callback `call_completed` recorded | 18:05:43.816530 | 1:05:43 PM |
| Server transcript finalized | 18:05:43.976393 | 1:05:43 PM |
| Browser `finalize` accepted / completed | 18:05:44.632462 / 18:05:47.360567 | 1:05:44 / 1:05:47 PM |
| Scoring job completed | 18:11:56.057544 | 1:11:56 PM |
| Compliance result committed | 18:11:56.436232 | 1:11:56 PM |

`ScriptFlow` runs live transcript checkpoints every 15 seconds. They intentionally
use the durable `post-call` queue. `PostCallStatusAlert` previously called every
queue failure “Post-call failed,” including live saves. Migration 117 resolved only
`worker_timeout` checkpoint errors, so a recovered `post_call_http_503` remained
visible after later successful saves and the real finalization.

The 503 was returned by the in-process Netlify work handler. Its `evidenceFailure`
catch maps unclassified errors to 503 and previously logged no underlying error.
The checkpoint branch stores/links evidence; it does not invoke OpenAI, send GHL
posts, or invoke a Supabase edge function. Its approximately 1.6-second failure
and subsequent successful checkpoints do not establish payload limits, a function
timeout, provider overload, or a Railway restart. The precise underlying database
operation/error cannot be recovered from the retained Netlify log. New logs retain
safe SQL/provider codes, action and session, without transcript contents.

Railway service logs and Twilio REST/conference logs were not available through
the configured connectors or local credentials. Callback evidence is the retained
Supabase `telephony_events` record, not an independently fetched Twilio log. Do
not claim those unavailable logs were inspected.

## Lifecycle trace

- Parent `/twilio/status`: signed callback, conference guard, terminal evidence,
  agent release, inbound completion and `finalize_telephony_transcript`. Now fetches
  Twilio REST status before accepting a terminal parent event; a live call or child
  SID cannot produce authoritative completion evidence through this route.
- `/twilio/agent-status`: child answer/completion attribution and call-owned agent
  release; does not call post-call processing. Conference guard owns upgraded legs.
- Conference participant leave, Add Person, warm/blind transfer: conference service
  manages participant ownership; media migration is distinct from customer-call
  completion. Conference calling remains enabled; no routing algorithm changed.
- Presence: normal phone heartbeat expiry changes phone readiness. Conference's
  45-second missing-heartbeat recovery manages departed participants, not browser
  post-call requests. It cannot bypass the new provider check before final work.
- Deepgram close/reconnect: closes/reconnects a track, reports coverage health and
  retains/persists final segments; does not enqueue summary/finalize work.
- Browser disconnect, enrollment completion and component unmount previously could
  request final persistence. A connected softphone now downgrades that request to
  a live checkpoint. Visibility/unload flushes remain checkpoints.
- Call duration never authorizes final work. `hasNewTranscript` gates live Co-Pilot
  analysis, not call completion. Finalization, wrap-up and telephony scoring now
  require a fresh provider-confirmed terminal parent status on the server.

A service-only, single-use, 30-second database ticket lets Netlify ask Railway to
read Twilio status without distributing Twilio credentials or exposing a public
call-status lookup. Provider outages fail closed. Manual, non-telephony sessions
retain their existing behavior.

## Transcript and output status

The finalized stored transcript has 82,814 characters and 2,077 diarized segments.
Both speakers have persisted speech around 16:32 UTC, including customer speech
at 16:32:03.643 and agent speech at 16:32:43.244. Transcription continued after the
warning. This establishes retained speech across the failure; it cannot prove no
individual audio frame was ever lost.

Scoring job `03a08bcb-c4d0-4599-84c2-0837ed2e8a94` completed on its first attempt,
after finalization, with no error. Compliance is `complete`; dispatch revision 1
is delivered. No replay is necessary. The stored call has `webhook_sent:false`
and no sent timestamp. The failed request was checkpoint-only, so it could not
have sent a partial GHL post. No partial output requiring cleanup was identified.
Do not replay sale dispositions or vendor posts as incident recovery.

## Changes and operational limits

The existing asynchronous queue and stable request hashes remain in use. Transient
429/500/502/503/504 responses receive four total attempts with 1/2/4-second backoff
under the same worker ownership. Canonical record/transcript links are reused.
A persistent per-call GHL claim prevents duplicate sends across retries/crashes.
An ambiguous or failed external delivery is not automatically resent: external
exactly-once delivery cannot be guaranteed without receiver support.

Migration 130 adds service-only status tickets and webhook claims, call-record
`post_call_status` (`pending`, `processing`, `completed`, `failed`) and
`post_call_last_error`, status reconciliation, and controlled transcript retry.
A later matching transcript save resolves historical transient checkpoint errors
without deleting their audit rows or resolving unrelated failures.

CRM call details show processing status. Error details and Retry processing are
admin-only; authorization is enforced on the server. Retry finalizes stored
transcript evidence and uses the existing audited sale-scoring retry when needed;
it does not repeat wrap-up or webhooks. Scoring continues to obey existing sale
eligibility, leases, snapshot hashes, and token budgets. No new transcript chunking
was needed: the affected long transcript completed successfully, and existing
scoring/embedding chunking remains intact.

Post-call failure alerts are suppressed while the softphone is connected.
After the call, agents see: “Call saved. Summary is still processing.” Status polling failures do
not expose HTTP codes or throw new agent toasts.

Co-Pilot compares the last 12 delivered suggestions using normalized token overlap,
uses a three-minute topic cooldown with an exception for meaningful new transcript
facts, and includes ordinary tips in the last eight suggestions sent to the MA
prompt. Duplicate suppression updates synchronously, covering back-to-back results.
Existing disclosure checkpoint checklists retain their own per-section guard.
No stricter compliance prompts or routing/RTS changes were introduced.

## Deployment

1. Validate tests/build, then apply **only** migration 130. `supabase db push
   --dry-run` currently reports historical migration gaps (015,
   020, 030, 037, 060, 111, 112, and 115–129). Do not use `--include-all` for this fix. Apply the
   reviewed file through the linked database SQL command, then record its version:

   ```sh
   # Use a temporary workdir containing the linked config and recorded migrations,
   # plus 130; omit the unrecorded historical files listed above.
   npx supabase db push --linked --workdir /private/tmp/enrollgen-migration130 --dry-run
   # Proceed only when the plan lists exactly 130, after hosted-mutation consent:
   npx supabase db push --linked --workdir /private/tmp/enrollgen-migration130 --yes
   ```

   An isolated selection was prepared locally and the CLI confirmed exactly one
   pending migration. The CLI refused mutation with HostedMutationConsentRequiredError;
   explicit hosted-change consent is required before the --yes command. Nothing
   was applied. Resolve old history separately.

2. Commit changes and push `main` once. Railway auto-deploys telephony from main.
   Wait for its health check and the `/internal/post-call-status` route before
   publishing the Netlify changes. Both services use the same Supabase project.

3. Netlify must have server `TELEPHONY_BASE_URL` (or existing
   `VITE_TELEPHONY_BASE_URL`) set to the HTTPS Railway origin. Build and preview:

   ```sh
   npm run build
   netlify deploy --dir dist --functions netlify/functions
   ```

   Publish the reviewed deploy through Netlify's UI/manual production workflow.
   Never run `netlify deploy --prod`. This fix does not change or require deploying
   any Supabase edge functions. If an edge function is changed separately, deploy
   only its name via `npx supabase functions deploy <name> --project-ref qzjtagnpklaxefwurorc`.

4. Verify active-call finalization is rejected, live transcript/tips continue,
   repeated parent-completed events do not duplicate results, CRM status/error
   permissions work, and the affected record shows completed with its historical
   checkpoint failure still retained in the request audit.

Bulk or single-call recovery previews by default:

```sh
node --env-file=.env.local scripts/post-call/reprocess.mjs --call-id CALL_UUID
node --env-file=.env.local scripts/post-call/reprocess.mjs --from 2026-11-04T00:00:00Z --to 2026-11-05T00:00:00Z
```

Add `--execute` with a fresh `CLERK_ADMIN_TOKEN` in the environment to submit
through the authenticated admin endpoint. Narrow ranges to fewer than 1,000 calls.

## Validation and rollout state

- Full application suite: 775 passing; telephony suite: 281 passing (localhost
  integration tests run outside the filesystem/network sandbox).
- Targeted ESLint and `git diff --check` pass; Netlify production build and
  function bundling pass. Preview admin endpoint returns 401 without a bearer.
- Latest draft: https://6aeb80e61c234e4cb6266363--enrollgen.netlify.app
- Netlify's configured Railway origin is
  `https://enrollgen-production.up.railway.app`.
- Production migration remains unapplied pending the CLI's explicit hosted-change
  consent. Main has not been pushed, so Railway rollout is also pending. No
  Supabase edge function was modified or deployed.

## Additive-only review and exception logging follow-up

The subsequent deployment approval was conditional on migration 130 being purely
additive, with no locking ALTER operations or data deletes. **That condition is
not met.** No migration or production deployment was attempted in this follow-up,
and main remains unpushed.

In one line: migration 130 adds processing/retry and parent-call verification
infrastructure and reconciles existing call-processing state.

It adds columns to existing `post_call_requests` and `call_records`, requiring
table locks; replaces existing error/reconciliation functions; installs triggers
that change runtime behavior; updates existing job/call rows; and includes a
DELETE against the newly created (normally empty) status-ticket table. It must
not be described or approved as new columns/tables/indexes only. The migration
file was left unchanged for review. The requested deployment order, if subsequently
authorized, is edge functions (none changed), Netlify production, and main push
last for Railway. Deployment must also account for the fact that Netlify's new
parent-status verifier needs the new Railway endpoint before final work can pass.

The checkpoint catch now includes a structured exception with message, complete
stack, code/status, storage details/hint, and nested causes/original errors.
Credentials, common beneficiary identifiers and SQL failing-row contents are
redacted. Agent responses retain the generic error. Tests exercise native Error
non-enumerable stacks, plain storage errors, nested causes, circular references,
redaction, and the actual checkpoint handler failure path.
