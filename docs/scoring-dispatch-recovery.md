# Scoring dispatch rollout and manual recovery

This change is prepared locally. Migrations and live recovery commands have not
been executed. Pushing main deploys the Netlify code automatically; it does not
apply database migrations or deploy the separate telephony worker.

## Rollout order

1. Verify the production OpenAI credential and successful Responses requests for
   both `gpt-5.6-luna` and `gpt-5.6-terra`, using a trimmed key and no organization
   or project headers. A model catalog listing does not establish account access.
2. Apply `113_scoring_dispatch_retry_bounds.sql`, then
   `114_manual_scoring_retry.sql`. Verify PostgREST exposes `dispatch_attempts`,
   `transcript_ready_at` and `retry_failed_scoring` before releasing the worker.
3. Deploy the Netlify scoring code, then the telephony worker. Migration 113 works
   with the old worker during this transition. The new worker must not precede
   113: its acknowledgement update filters on the new `dispatch_attempts` column.
4. Observe scoring progress/completion and the call's persisted compliance state.

113 separates the five-second transcript settling window from the 60-second
dispatch retry schedule. It gives each content revision at most three deliveries,
excluding polls while a scoring job has an active lease. Exhaustion marks the call
failed and stops automatic redelivery. A new transcript revision gets a fresh
budget. A worker invocation can itself make bounded OpenAI request retries.

At the October 23 read-only inventory, calls
`7374a205-def1-4ab4-8fd0-877eaaff88a5` and
`24e11660-0c5d-4f33-8c5f-da68ef876632` were eligible enrolled calls with queued,
undelivered dispatches and no scoring jobs/cards. 113 gives these existing rows a
zeroed dispatch counter; they need no manual reset unless a subsequent attempt
fails. Inspect current state again before any recovery.

## Recover one failed call

Fix the provider/configuration failure first. The operator command uses the
service-role client; it is not exposed to browser users. The default is a dry-run
that calls the RPC without writing, sending a job or contacting an LLM:

```sh
node --env-file=.env.local scripts/post-call/retry-failed-scoring.mjs \
  --call-id <call-uuid> --tenant-id <tenant-uuid>
```

To execute one recovery, supply an operator, reason and a new UUID as the retry
request ID. Retain and reuse that same UUID if the command's result is uncertain;
repeating it cannot grant another batch of attempts.

```sh
node --env-file=.env.local scripts/post-call/retry-failed-scoring.mjs \
  --call-id <call-uuid> --tenant-id <tenant-uuid> \
  --execute --request-id <new-retry-uuid> \
  --operator 'Operator name' --reason 'Provider issue corrected; request verified'
```

114 locks the call, records the old dispatch/job counters and errors in the
service-only `scoring_manual_retries` audit table, resets matching failed job
attempts, rotates worker tokens, clears failure metadata and queues a new dispatch
revision. The next batch is again limited to three deliveries. Old dispatch
acknowledgements cannot overwrite the new revision. The regular telephony worker
dispatches the job; the command does not call Netlify directly.

The command preserves transcripts, disposition, recording, existing scorecards,
cached segment results and cumulative input-token usage. It does not replay
post-call finalization, enrollment submission or sales/webhooks. It refuses live
worker leases, non-sales, unrequested/historical calls, calls that are still
queued, current completed results and exhausted input-token budgets. Token-budget
exhaustion requires investigation rather than an automatic budget reset.

The call list displays **Scoring failed**, including when an older score exists.
The review modal displays an alert for `compliance_status=failed`, even if only
`scoring_error_code` is stored. It explains that the transcript is retained and
directs the user to an administrator for recovery. Existing styles are reused.

## Follow-up model access check

The production/functions value fetched from Netlify matched the user-confirmed
`eFcA` suffix. `.trim()` made no change to that value. Each probe sent only
`Authorization` and `Content-Type` headers to `https://api.openai.com/v1/responses`,
with no organization or project headers. The payload used synthetic text,
`store:false`, medium reasoning and a small strict JSON schema; no call data was
sent. Both probes still returned HTTP 401 `invalid_api_key`:

- `gpt-5.6-luna`: `req_fd104acf8cad46928f1b0251c166d86a`
- `gpt-5.6-terra`: `req_24bf0ff5061f41088253f7f7b259434b`

This does not establish why authentication failed or verify model access. Resolve
the authentication discrepancy and repeat both successful model probes before
deploying or manually requeueing calls. Credentials were never printed or saved
in this document.
