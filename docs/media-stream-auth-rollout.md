# F08 / F25 speaker health: Railway media streams

The inbound TwiML still starts the same named, unidirectional `both_tracks`
stream before the existing Dial. Its URL now contains a five-minute HMAC-signed
capability under `/media/<token>`, binding the account, parent CallSid, agent,
tenant, inbound call and persisted attempt. The existing server-only
`AGENT_WS_SIGNING_SECRET` signs it with a separate purpose from `/agent` tokens;
browser WebSocket tokens cannot authorize media. No new environment variables.
The token is never sent to the browser. Treat Stream URLs and stored TwiML as
credentials; do not log them or include them in diagnostic screenshots.

The upgrade rejects unsigned, forged and expired capabilities before opening a
WebSocket. The start packet must match every identity, the StreamSid, both tracks,
and 8 kHz mono mu-law format. It must also claim a service-only database lease
against the live call attempt and its existing call reservation before any
Deepgram socket opens. There is no fallback to the unsigned `/media` endpoint.

Migration 074 adds only `media_stream_leases` and its service-only claim, renew,
release and eligibility functions. A call has one lease across replicas. Leases
expire after 20 seconds and renew every five seconds. Closed, expired, terminal
and reassigned attempts cannot retain ownership. An orderly reroute can replace
a finished attempt; an old close callback cannot release its successor. Leases
are cleaned on close and expired rows are swept on subsequent claims. No call
reservation, routing, admission, hours/cap, billing, recording or Paragon
function is replaced or written by the lease RPCs.

## Speaker health and resource bounds

Each server-side speaker keeps its existing Deepgram URL, model, encoding and
transcript shape. Unexpected close, socket error, provider Error and connection
timeout report `transcription_error` with the affected speaker and call ID.
There are at most three reconnects per speaker per stream, with 500/1000/2000 ms
delays and a five-second connect timeout. Recovery emits `transcription_health`
with coverage-gap timestamps; buffered overflow explicitly reports missing audio.
This is bounded recovery, not a promise of lossless audio across provider outages.
Intentional stops cancel retries/keepalives and retain a final-result flush of at
most one second.

Bounds are fixed in code: 16 KiB Twilio frames, 3200 decoded bytes per audio packet,
400 frames / 256 KiB while database binding is pending, and five seconds to start.
Each Deepgram track holds at most 100 frames / 16 KiB while connecting, with a
64 KiB outbound transport buffer ceiling and a 128 KiB provider frame ceiling.
The waveform buffer is also bounded. Invalid identity, track, format, StreamSid,
binary data or oversize input closes transcription without ending the call.

The browser tracks agent/customer failures separately through the existing
right-rail error feed. One speaker's recovery cannot clear the other speaker's
failure. A failure during ringing remains visible when that call is accepted.
Older customer-only server error messages remain supported. Existing outbound
calls still use browser customer capture and agent microphone recognition;
no outbound server Stream or additional transcription source is introduced.
Styling is unchanged.

## Rollout order

1. Apply only `supabase/migrations/074_media_stream_auth.sql` before Railway code.
   It is additive and older code ignores it. Confirm the service role can access
   the lease RPCs and browser/anonymous roles cannot. No live SQL was applied here.
2. Deploy the browser health handling first. It accepts the old server's messages
   and displays the new per-speaker failures/recoveries after Railway is updated.
3. Confirm Railway's existing `PUBLIC_BASE_URL` is the correct public HTTPS origin
   and `AGENT_WS_SIGNING_SECRET` is a strong, stable server-only secret shared by
   processes issuing and accepting TwiML. Confirm one running replica for browser
   delivery: `sendToAgent` remains process-local. The database lease prevents
   duplicate media owners across replicas, but this batch does not implement
   shared transcript/socket dispatch or verify production replica topology.
4. Deploy Railway telephony in a call-free window. A restart drops existing media
   sockets; previously cached unsigned TwiML cannot open a new authenticated
   stream. New signed tokens authorize startup only, not the duration of the call.
   Do not purge/rewrite routing replay rows or change admission/routing controls.
5. Smoke-test a real inbound call: both speaker labels, waveform, final transcripts
   and right-rail health messages. Test a normal no-answer reroute and confirm
   new attempt ownership. Test outbound remote customer capture/mic transcription
   using the existing browser path. In staging, drop either Deepgram track and
   confirm only that speaker reports failure, bounded recovery and gap markers.
   Confirm unsigned `/media` gets HTTP 401 and a duplicate signed stream cannot
   open speech connections for an already owned call.

Keep the additive SQL on rollback. Any rollback must retain the authenticated
media boundary; restoring the old unsigned handler reopens F08. No deployment,
secret rotation, production status update or live media/RPC invocation was
performed during this batch.

## Validation

The tests use real local WebSocket upgrades and the real 074 functions in
disposable PostgreSQL (PGlite), with fake provider sockets. They cover forged,
unsigned, expired and wrong-purpose tokens; account/call/agent/attempt/tenant
mismatches; two-server duplicate ownership; valid speaker delivery; reroute,
lease expiry and late cleanup; oversize/binary frames and bounded queues;
both-speaker errors/reconnect exhaustion; connect timeout; and final-result flush.
Existing routing, attribution, Paragon, hours/caps, billing, recording, heartbeat,
availability and browser transcription regressions are also run.

New media/frontend code passes targeted ESLint. The unchanged baseline diagnostics
in `twilioVoice.js` (`paragonCall` unused) and `server.js` (`process` global) remain;
they are outside this batch's lint repair scope. See the final task report for
test counts, production build results and the committed bundle path.

Twilio supports custom Stream URL paths and nested parameters; query strings are
unsupported. See [Twilio's Stream reference](https://www.twilio.com/docs/voice/twiml/stream)
and [WebSocket start/media/stop message schema](https://www.twilio.com/docs/voice/media-streams/websocket-messages).
