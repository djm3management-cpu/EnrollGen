# Recording callbacks and phone diagnostics — October 21, 2026

Scope: recording callback 400 and today's recording audit, canceled-registration
device disposal, and browser lifecycle/error telemetry. Session/contact retry
work and the broader subsystem failure-injection suite are deferred.

## Recording audit and fix

The read-only Twilio metadata audit found 11 recording resources for October 21
Eastern Time through the 12:00 PM call (latest recording created 16:00:28 UTC).
All nine completed recordings have `copy_status=stored`, positive stored byte
counts, and an object present at their recorded path in `call-recordings`.
No completed recording in that snapshot failed to save.

Two resources are provider-absent, not recoverable audio files:

| Call time ET | Parent call SID | Recording SID | Twilio result |
|---|---|---|---|
| 11:37 AM | CA13430a1801df5a058d01e8626cab3fcf | REdd0cfc3202ef5c9245443e72295b067e | absent, duration -1, error 16101 |
| 11:52 AM | CA1403bf9f1229c03345d413b4ca67f243 | RE7ebc55e1f57fed402d20574b87caf24e | absent, duration -1, error 16101 |

Twilio defines [16101](https://www.twilio.com/docs/api/errors/16101) as recording
unavailable because its duration is too short. The callback/reconciliation
parser rejected Twilio's `-1` duration sentinel, leaving both absent resources
out of the ingestion ledger and incorrectly reported as `no_callback`.

`callbackPayload` now normalizes **only absent recordings' -1 duration** to
NULL. Completed recordings still require a nonnegative duration. Both signed
callbacks and the existing REST reconciliation worker use this parser. No
audio is fabricated and no call-duration or billing fields change. The existing
reconciliation worker can record the absent states after backend deployment;
its existing backoff schedule remains unchanged. Callback failures now log
validated call and recording SIDs for correlation, without raw callback bodies.

Private audit snapshot: `/private/tmp/enrollgen-recording-audit-2026-10-21.json`.
Only metadata and object existence were read; no audio was downloaded.

## Device disposal

If registration resolves after cleanup has retired that same device to protect
a ringing/live call, its canceled continuation now preserves the device.
The terminal event later destroys the retired device. All disposal paths use
a WeakSet guard so cleanup and registration continuation cannot destroy the
same device twice.

## Lifecycle/error telemetry

The browser reports incoming calls, busy rejection, accept requested/confirmed,
explicit decline/End Call, SDK terminal events and numeric error codes,
registration events, missing remote audio, and device retirement/disposal
reasons. A random client-session ID and device sequence distinguish tabs and
replacement devices. Outbound SDK events use the same reporter.

`POST /api/voice/events` requires Clerk authentication, resolves the active
tenant agent from the verified subject, checks the requested agent matches,
and verifies each supplied call SID against that agent's persisted attempts.
It stores allowlisted `browser_voice_*` rows in `telephony_events`, with the
verified parent SID, tenant, inbound call ID and direction. SDK child SIDs are
kept only when they match the verified attempt. Browser timestamps are labeled
`client_at`; database receipt timestamps remain separate. Browser reports are
diagnostics and never update authoritative call/routing state.

Only known events, phases, reasons, numeric error codes and correlation IDs
are stored. Phone numbers, names, transcript text, arbitrary exception messages,
URLs and credentials are excluded. Events are sent asynchronously in batches
of at most 20, with at most 40 queued and a five-second HTTP timeout. Delivery
is best effort: authentication/network failures may lose diagnostics. There
is no delivery retry queue and no dependency on telemetry in the audio path.

Backend and frontend code must both be released for persistent browser events.
No database migration or manual production setting change is required.

## Validation and release

All 468 existing application tests and 211 existing telephony tests pass.
The recording subset (25 checks) and phone/canonical-call subset (17 checks)
also pass. Changed-file ESLint and the production build pass. In-memory smoke
checks exercised authenticated telemetry ownership and field filtering, the
client payload, and delayed registration resolving after a ringing device was
retired. No broad subsystem failure-injection suite was added.

Netlify's published deploy was verified locked before the single GitHub push;
frontend publication stays with the owner for the after-hours window. No
`netlify deploy --prod` command was run. Backend changes are in `telephony/`
and require the Railway service release as well as the frontend publication.
