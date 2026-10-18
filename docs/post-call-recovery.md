# Post-call recovery, October 18, 2026

Latest status: the user subsequently approved staged recovery. One session was attempted and failed because production OpenAI credits are exhausted; the remaining 14 were not executed. See `post-call-incident-2026-10-18.md` for the verified record links, counts, embeddings limitation, and the five-window 503 investigation. The older verification/approval notes below describe the state before that approval and attempt.

Production deployment: `6ad4e3bc94c80b69180ba6a3` on enrollgen.com.

## Changes and verification

- `/api/post-call` authenticates and persists a request, dispatches `post-call-background`, and returns 202. The client polls the saved request rather than holding the work response open. One job row per session serializes work; stable request hashes deduplicate retried lifecycle actions. Failed work is retained and is not automatically rerun. Browser POST retries were removed; authentication can refresh and retry once.
- Migrations 099 and 100 were applied to production. Both queue tables and `cross_sell_attempts` return HTTP 200 from PostgREST. Queue tables/RPCs are service-only; cross-sell logging is restricted to the owning active agent and matching session/transcript.
- A production smoke test initialized an existing ended Mike session, without modifying its transcript or disposition. Two background deliveries returned 202 in 296 ms and 248 ms. Exactly one request row completed successfully. Dylan's recovery script was not executed; his queue row count was zero at verification.
- The effective-date local note accepted `MM/DD/YYYY` while wrap-up bound the same raw value to a date input. Date inputs and updates now normalize to `yyyy-MM-dd`. Duplicate note updates return the original state. Post-call initialization no longer restarts on transcript/state renders, checkpoint calls cannot overlap, and late results cannot attach to a newer active session.
- The shared fetch wrapper and authenticated Supabase clients refresh Clerk with `skipCache: true` after 401 and retry only once. Online/visible events refresh session and Supabase tokens. Public CMS clients remain public.
- Embeddings split input into conservative UTF-8 chunks, batch provider requests, and return one normalized 1536-dimension vector. Provider failures now log safe status/error/request identifiers, without text or credentials. Tests cover long Unicode input. Production provider success has **not** been verified: retained embeddings logs had no entries; unauthenticated production requests correctly return 401. Netlify masks the production OpenAI secret, so testing that masked value does not establish whether the deployed key works. The separate local key returned `credit_balance_exhausted`; this does not prove the production key has the same problem.
- 71 targeted tests passed, including existing ancillary/report regression coverage. Targeted ESLint, production build, availability bundle verification, and diff checks passed. No new ancillary disposition behavior was introduced.

## The two 503 handlers: investigation only

`call-log.js` and `paragon-zip-confirm.js` were left unchanged, as requested.

Retained logs contained 100 timing/memory entries for each function, without underlying errors; the separate 72-hour error/warning query returned no entries. The exact production database reads for the call-log view, Dylan's open callback tasks, and his recording subject succeeded. After deployment the signed-in call-log UI loaded 100 calls. These observations do not identify the historical 503 root cause. An affected request timestamp/request ID or a fresh reproduction is still needed to correlate an actual failing invocation. Do not describe these 503s as fixed.

## Recovery inventory and approval boundary

Read-only inventory: `supabase/validation/dylan_missing_post_call_output.sql`.

At verification, 15 sessions with transcripts lacked at least one output: 9 lacked scorecards and 14 lacked saved wrap-up metadata (categories overlap). Nine sessions were marked ended; six were still open/unclosed. No transcript text or beneficiary data is included in the inventory.

Prepared script: `scripts/post-call/rerun-dylan-sessions.mjs`. **Do not execute it until the user approves recovery.** This includes its dry-run mode, per the user's instruction. After approval, export the inventory as a JSON array and review the exact session IDs:

```sh
node --env-file=.env.local scripts/post-call/rerun-dylan-sessions.mjs --plan /private/tmp/dylan-recovery-plan.json
node --env-file=.env.local scripts/post-call/rerun-dylan-sessions.mjs --plan /private/tmp/dylan-recovery-plan.json --execute
```

The script rechecks protected Dylan membership and ownership, skips open sessions and already-scored calls, and queues the remaining transcript finalization/scoring through the new background worker. Existing completed/failed requests are deduplicated. It does not invent missing wrap-up fields, submit sale dispositions, or resend enrollment/vendor webhooks. Missing manual wrap-up must be completed by the agent. Results and errors are persisted in `post_call_requests` and `post_call_jobs`.
