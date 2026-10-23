# Scoring dispatch rollout and manual recovery

Pushing main automatically deploys the Railway telephony and integrations-worker
services and starts a Netlify build. Netlify automatic publishing is locked: the
user publishes the ready build. Git pushes do not apply database migrations.

## Rollout order

1. The user verified the real production key with successful HTTP 200 responses
   from both `gpt-5.6-luna` and `gpt-5.6-terra`. Netlify CLI returns a masked
   secret, so its `env:get` value cannot be used to test OpenAI authentication.
2. Apply `113_scoring_dispatch_retry_bounds.sql`, then
   `114_manual_scoring_retry.sql`. Verify PostgREST exposes `dispatch_attempts`,
   `transcript_ready_at` and `retry_failed_scoring` before releasing the worker.
3. Only after schema verification, push main once. Railway auto-deploys telephony
   and integrations-worker on that push. The Netlify build remains unpublished
   until the user publishes it. Migration 113 supports the old scoring handler
   during the transition. The new Railway worker must not precede 113: its
   acknowledgement update filters on the new `dispatch_attempts` column.
4. Report the ready Netlify build to the user, then verify scoring completion and
   persisted scorecards for both stuck calls. Do not unlock or publish Netlify.

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

## Corrected model access verification

The user verified both models with the actual production key: `gpt-5.6-luna`
returned HTTP 200 and `gpt-5.6-terra` returned HTTP 200. These are the accepted
account-access results for this rollout.

The earlier agent probes were invalid: Netlify CLI masks secret values with
asterisks plus the last four characters. A matching suffix does not establish
that the CLI returned a usable key, and trimming does not unmask it. The HTTP 401
results came from sending that masked string, not from testing the actual key.
No credentials were printed or saved in this document.

## Production migration execution, October 23

Applied only migrations 113 and 114, in that order, through the production SQL
editor for project `qzjtagnpklaxefwurorc`. Both succeeded before the main push;
the migration ledger contains the exact reviewed SQL source (7,273 and 6,030
characters). Verified `dispatch_attempts`, `transcript_ready_at`, the recovery
RPC and audit table. The service role can execute recovery; `authenticated`
cannot. PostgREST successfully returned both new dispatch columns.

At 20:46 UTC, both target calls had completed scorecards and completed jobs on
attempt one. Dispatches had `delivered_revision=revision`, `available_at=infinity`
and no error. No manual retry was needed:

- `7374a205-def1-4ab4-8fd0-877eaaff88a5`: scorecard
  `4f0d1ce2-92dd-4ef4-93d0-d1529c5468c2`, 73.02%, grade C.
- `24e11660-0c5d-4f33-8c5f-da68ef876632`: scorecard
  `3e340fa1-00ce-48ab-a93b-33416274ea64`, grade N/A.
