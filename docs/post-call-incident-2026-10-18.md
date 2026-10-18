# Dylan recovery and reported 503s — October 18, 2026

Report time: 15:50 UTC / 11:50 AM Eastern. Investigation only; no function, service-worker, authentication, migration, or deployment changes were made during this investigation. Ancillary disposition behavior was not changed.

## Staged recovery: stopped after one session

The user approved one session first, with the remaining 14 conditional on a clean result. Only the first-session plan was executed.

- Session: `c4129766-fe6a-4708-b29f-e883e74390d1`.
- Ended October 16, 2026; 401-second call; transcript length 5,194 characters.
- Post-call record: `79b2f3b0-c6c0-4aa8-8165-4e328fa0c56a`.
- Transcript: `56b7bb22-173b-44e3-8a31-a0a63970a44f`.
- Request key: `0996ca2efa3e9df0b4900fa6b3e73fcc7d0703020028922be4136beb7837fb07`.
- Queued at 15:34:54 UTC / 11:34:54 AM Eastern; marked failed at 15:35:02 UTC.

The call record and transcript have matching session/record links. This is an existing `deepgram_server` transcript, so finalization correctly preserves the server-owned transcript rather than replacing it. The call outcome and saved wrap-up timestamp are unchanged. There are zero scorecards for this call, and `compliance_scorecard_id` remains null.

The production scoring job failed with OpenAI HTTP **429**, `credit_balance_exhausted` / `insufficient_quota`: “You have no credits remaining.” Stored usage telemetry for this call at 15:34:59–15:35:01 UTC confirms four failed provider attempts inside the single recovery job, including its existing model fallback. The scoring job `508f38a6-767b-4255-9f88-63f1ff1d25b2` also records the credit error. Both scoring and embeddings read `OPENAI_API_KEY`; this is now a confirmed production scoring/billing failure, rather than the prior inconclusive masked-key test.

**Embeddings was not invoked by this recovery.** Exact-window function-log queries returned no embeddings entries. The recovery code finalizes transcript evidence and invokes compliance scoring; neither path calls the embeddings function. Absence of an embeddings error is therefore not a pass. No production embeddings success is claimed.

Counts: **1 recovery attempted; 0 completed recoveries; 0 scorecards written; 14 sessions held.** The held plan contains five ended sessions missing scorecards, six open/unclosed sessions, and three ended sessions already scored. Exactly one Dylan row exists in `post_call_jobs`. The remaining plan was not executed. Production OpenAI billing must be restored before another recovery can pass; a separate authenticated embeddings invocation is required to verify that function. The failed request remains retained and deduplicated, so simply replaying the same request will not run it again.

## Reported 503s: evidence and attribution

All times supplied by the user were treated as Eastern Daylight Time (UTC−04:00). Each query used a five-minute margin on both sides.

| Eastern failure time | UTC center | Netlify HTTP traces in the window | Supabase call-log / callback reads |
| --- | --- | --- | --- |
| Oct 17, 3:43 AM | Oct 17, 07:43 | Outside available request-log retention | 2 / 1, all HTTP 200 |
| Oct 17, 6:33 AM | Oct 17, 10:33 | Outside available request-log retention | 3 / 3, all HTTP 200 |
| Oct 17, 7:14 PM | Oct 17, 23:14 | Call-log: 10 × 200. Paragon: 10 × 200, 1 × 401. No site-wide 503s. | 7 / 9, all HTTP 200 |
| Oct 18, 12:27 AM | Oct 18, 04:27 | Call-log: 12 × 200. Paragon: 11 × 200. No site-wide 503s. | 12 / 11, all HTTP 200 |
| Oct 18, 3:01 AM | Oct 18, 07:01 | Call-log: 12 × 200. Paragon: 12 × 200. No site-wide 503s. | 10 / 11, all HTTP 200 |

Supabase Management API queries covered API Gateway, PostgREST, Postgres, and connection-pool logs. The relevant `v_call_log` and `paragon_callback_tasks` reads returned HTTP 200 in all five windows: **69 successful reads total**. The associated identity-table reads also returned 200. Relevant origin timings were under 620 ms. Other than an unrelated recording-storage 400 in the first window, no API Gateway 4xx/5xx appeared in the requested windows.

PostgREST recorded “Warp server error: Thread killed by timeout manager” in each window (9, 15, 11, 17, and 18 log entries respectively). Postgres entries were normal checkpoints; the connection-pool entries included normal idle-timeout closes. The successful HTTP responses do not support attributing the reported 503s to those warnings.

Raw Netlify function logs contain duration/memory reports without handler errors. The raw API additionally provides request IDs omitted by the CLI formatter. Netlify's HTTP observability API confirms **67 target requests returned 200, one returned 401, and zero site-wide requests returned 503** in the three retained windows; the result pages are complete. The first two windows explicitly return `requested window out of bounds` and are not treated as evidence of absent errors.

The single 401 occurred at **Oct 17, 7:15:21 PM Eastern**: Clerk rejected an expired token. Netlify request ID: `01M562C01W1HVWTDJRB10SF6QA`. This explains that 401; it does not explain a 503.

### Browser-generated 503 mechanism

The deployed `public/sw.js` intercepts every GET, including `/.netlify/functions/call-log` and `/.netlify/functions/paragon-zip-confirm`. When its network fetch rejects and no cache entry exists, it synthesizes:

```js
new Response("Offline", { status: 503 })
```

The live worker was fetched and verified byte-for-byte against the inspected source. Executing that deployed fetch handler with a simulated browser network failure reproduces **503 / body `Offline` for both exact endpoints**, without invoking either function.

**Attribution:** the strongest explanation for the browser's reported 503s is network failures being translated into synthetic HTTP 503s by the service worker. That fits the absence of server-side 503s and successful Supabase reads in retained windows. The conversion mechanism is confirmed; the original browser network exception and each individual historical response body are not available, so the underlying connectivity failure and the two expired Netlify windows cannot be proven from these logs alone.

Recommended next change, not applied: bypass the service worker's offline/cache fallback for `/api/*` and `/.netlify/functions/*`, so API failures retain their actual network/error meaning. Neither endpoint handler nor the service worker was changed or redeployed.

## Evidence locations

Private raw logs remain in `/private/tmp` on the local machine; they were not copied into the repository or sent to another service:

- `enrollgen-503-oct*.jsonl`: Netlify function logs for the five supplied windows.
- `enrollgen-supabase-503-oct*.json`: bounded Supabase PostgREST/Postgres/pool error evidence.
- `enrollgen-supabase-gateway-oct*.json`: relevant API status/timing aggregates.
- `enrollgen-netlify-http-oct*.json`: retained HTTP traces and explicit retention errors.
- `enrollgen-first-recovery-exact-logs.jsonl`, `enrollgen-first-scoring-exact-logs.jsonl`: recovery-window logs.
- `dylan-recovery-full-plan.json`, `dylan-recovery-first-plan.json`, `dylan-recovery-remaining-plan.json`: metadata-only staged plans.
