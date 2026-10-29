# Conference control 503 — October 29, 2026

Fix branch: `fix/conference-control-503`. No push, deployment, environment changes, or production migration performed. Production database inspection was SELECT-only.

## Production evidence and limits

Railway EnrollGen deployment `1c3da863-e655-4843-8337-b4794c4500c7`, started at 22:03 GMT, displays “Fix conference migration safety and merge recording playback.” Its Network Logs show:

| GMT | POST /api/voice/conference-action | Duration |
| --- | --- | --- |
| 22:06:33 | 503 | 896 ms |
| 22:06:39 | 503 | 429 ms |
| 22:06:45 | 503 | 398 ms |
| 22:10:43.639449828 | 503 | 1,074 ms |

The 22:10 request ID is `rjLb7NbDRTmJwU_ZnPRhug`. Available logs show one action POST at 22:10 and three on the preceding call at 22:06, rather than three at 22:10. This does not establish what the browser displayed.

The deployment's application logs contain startup/database-access-success entries but no exception for these requests. The old route catch returned the generic response without logging the exception. **No historical stack trace is available in these Railway logs.** The cause below is reproduced from the deployed source/installed SDK and corroborated by persisted call progress, rather than presented as a recovered production exception.

Read-only database inspection identified Dylan's inbound canonical call `f2e1c09a-b577-41d3-902a-ff9b49f85f99`:

- Started 22:10:15.752991; answered 22:10:18.
- `upgrade_requested` saved at 22:10:43.276186.
- Both participants stayed at `stream_generation=0`, with no stream or recording SID; no `upgraded` or dial event.
- Ended 22:11:20.404917 with `last_error=recovery_pending`; operation token/expiry were clear when inspected.

## Reproduced cause

`conference-action → action → locked → connectOriginal → media` called `client.calls(callSid).streams.list(...)`. The installed Twilio Node SDK provides `streams.create` and `streams(sidOrName).update`, but **no `streams.list` or `streams(...).fetch`**. The old expression throws `TypeError: ...streams.list is not a function` locally, before the first stream generation is saved. [Twilio's Streams REST reference](https://www.twilio.com/docs/voice/api/stream-resource) documents create and stop only.

This explains the zero-generation setup failure and repeated failures when controls/recovery retry conversion. An earlier successful telephone test cannot be established or explained from these requests alone; this implementation's initial conversion deterministically hits the unsupported method.

Tests missed the defect because the fake provider invented `streams.list`. The fake no longer provides it. New inbound/outbound tests run the **real installed Twilio SDK with a fake HTTP transport**, exercising real resource methods without external calls.

## Every source of the old message

There was **one literal response site**: `wrap` in `telephony/src/routes/conferenceCalling.js`. It replaced every 503 with `Call controls are temporarily unavailable. Please retry.` and converted every non-`ConferenceError` exception to 503.

Explicit `ConferenceError(503)` sources:

1. `connectOriginal`: fewer than two live initial participants (`Conference setup is incomplete.`).
2. `dial`: invalid/missing configured US Twilio caller ID (`A US Twilio caller ID must be configured.`).

Other paths were escaping exceptions from authentication/member/call/participant/attempt/contact queries; session adoption/conference preparation; lock/unlock RPCs; control database writes/events/reservations; Twilio call lookup, streams, recordings, redirects, conference/participant lookup, hold, dialing/removal, voicemail or completion; cleanup/snapshot errors; and implementation exceptions such as `streams.list()`.

The catch wrapped these endpoints:

| Browser APIs | Signed Twilio callbacks |
| --- | --- |
| GET /api/voice/conference-capabilities | POST /twilio/conference/join |
| POST /api/voice/conference-status | POST /twilio/conference/status |
| POST /api/voice/conference-action | POST /twilio/conference/exit |
| | POST /twilio/conference/events |
| | POST /twilio/conference/stream-status |
| | POST /twilio/conference/recording |

`/twilio/conference/hold` does not use this catch. The legacy `conferenceGuard` can return an empty 503, but cannot emit this JSON message.

## Lock conclusion

`lock_call_conference=false` throws **409**, not this 503. Another control, callback or recovery operation owns a still-valid 90-second lease. All acquisitions release through the shared `finally` token-checked unlock. A service crash, lost connection or failed unlock can leave a lease until expiry; a normal thrown action does not. Retries do not extend another owner's lease, and stale cleanup cannot clear a successor's token.

The reproduced exception passes through this `finally`. Tests exercise three successive provider failures and verify a cleared token after each. Dylan's clear final token and completion within the initial 90-second window are consistent with successful unlock. There is no production-log evidence of a retained lock, and a false acquisition does not match the observed generic-503 branch.

If unlock also fails, the original control failure now remains primary and cleanup source/code is logged separately. A cleanup-only failure is a database failure; the lease remains bounded by its expiry.

## Fix and release requirements

Media creation uses the persisted stream SID; recovery uses the authenticated WebSocket lease. New nullable `stream_requested_at` in **migration 122** supplies a durable 30-second connection grace across restarts/replicas. Recovery stops a stale known SID (or name after a lost create response), clears its lease, advances generation and creates a replacement. Signed stopped/error callbacks conditionally clear only their own SID/lease. Late callbacks cannot erase replacement streams. A destination join that contends with the dialing lock returns successful Pause/Redirect TwiML to retry without terminating the leg.

Apply [122_conference_stream_recovery.sql](../supabase/migrations/122_conference_stream_recovery.sql) to staging before this service version. Production needs a separately authorized migration/release; neither was performed here. No Twilio Console change is required. Repeat the inbound/outbound and media-continuity tests in [conference-calling.md](conference-calling.md).

Responses include `{error, code, requestId}`. Structured `conference_control_failed` logs correlate the same request ID with route, verified call/agent, operation, provider/database code and stack frames. Logs omit request bodies, phone numbers, auth headers, media URLs and raw SQL/provider messages. Recovery uses the same diagnostics.

| Failure | HTTP | Code |
| --- | --- | --- |
| Active operation lease | 409 | CONFERENCE_LOCKED |
| Twilio request | 502 | CONFERENCE_TWILIO_FAILURE |
| Database query/RPC, including lock/unlock | 503 | CONFERENCE_DATABASE_FAILURE |
| Missing initial participants | 503 | CONFERENCE_SETUP_INCOMPLETE |
| Caller ID configuration | 503 | CONFERENCE_CALLER_ID_MISSING |
| Internal implementation error | 500 | CONFERENCE_INTERNAL_FAILURE |

Validation: **628 application tests + 265 telephony tests = 893 passed**, zero failures/skips. Production build passed. Full lint: **622 files, zero errors/warnings**. Coverage includes real SDK transport, connection grace/lease/restart/stale callbacks, early destination join, distinct errors and repeated-failure unlock tests.
