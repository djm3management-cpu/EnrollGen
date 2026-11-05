# Telephony egress audit — 2026-11-05

## Production evidence

Inspected Railway service `ba14e4c7-0437-42d5-b22a-7408bb143dd2`
(EnrollGen), production, source `/telephony`, revision 89de3b9.
The latest 150 application entries (14:05:30–14:17:51 UTC) were all
`conference_control_failed`, operation `conference_end`, Twilio code 20404,
across three historical call IDs. `finish()` threw before persisting completion.
The 15-second recovery worker repeatedly rediscovered those unfinished rooms.
Fix: treat a missing provider room as terminal, then perform the existing database
completion. Other provider errors still retry; routing and reservations are unchanged.

This is a confirmed accumulating background-request defect, not proof of the entire
984.53 GB bill. A 500-flow egress sample from 14:13:20–14:19:55 UTC contained about
0.98 MB, mainly Cloudflare HTTPS (Supabase) and Twilio HTTPS. DNS logs showed only
Supabase and Twilio in the recent 100-query sample. The seven-day HTTP query for
responses larger than 1 MB returned no entries. Sampling cannot establish historical
billing totals. New destination metrics should be compared with Railway network flows
while calls run and after they stop.

## Connection and payload audit

- Twilio media: legacy streams carry inbound/outbound tracks; conference streams
  carry one inbound track per participant. Neither uses bidirectional Connect/Stream
  nor sends audio to Twilio. Stop, socket close/error, replacement, local call-end
  notifications, and rejected/failed DB lease renewal close Deepgram tracks and clear
  queues, answer polling, renewal timers and lifecycle subscriptions. Renewal has a
  three-second request timeout. Added 45-second media inactivity cutoff and one-second
  forced transport termination after close, bounding missing stop/close handshakes.
- Deepgram: explicit mulaw/8000/mono, bounded queue and buffered output, three retries,
  one keepalive per connection. Close cancels retry/keepalive and allows a one-second
  final flush before termination. Fixed a stale old connection close clearing a newer
  connection's final-flush deadline. Gauges count connections through actual close.
- DeepFilterNet3: browser-only 48 kHz AudioWorklet feeds a MediaStream into Twilio's
  WebRTC SDK. It sends no raw PCM or float32 over Railway. Processor disposal removes
  listeners, disconnects nodes, stops output tracks and closes the AudioContext,
  including asynchronous initialization races. Railway validates Twilio's 8 kHz
  mu-law input before forwarding the original bytes to Deepgram. No conversion is
  needed here; changing the browser MediaStream to mu-law would break its SDK contract.
- Conferences: per-leg media leases/generations prevent duplicate ownership. Departed
  legs lose leases and streams close on renewal even when callbacks reach another
  replica. Transfers retain customer/third-party media intentionally. Recovery ends
  missing-heartbeat agent legs after the existing 45-second grace. Provider stop and
  call completion are retained. Missing-room completion now drains historical rooms,
  also when CONFERENCE_CALLING_ENABLED is off.
- Browser sockets: one presence timer per authenticated connection; close clears it
  and serializes the final false presence update after pending updates. Existing native
  ping/pong detects lost agents. Added error termination, a post-authentication OPEN
  check to prevent registration after an early close, a 16 KB incoming message limit,
  and a 256 KB outgoing buffer cap. An idle authenticated browser socket intentionally
  remains connected for incoming calls; it is not a call audio stream.
- Supabase: service has no Realtime channel subscriptions. Requests are HTTP; media
  leases use bounded requests. Browser-owned Realtime subscriptions are outside the
  Railway process. Agent heartbeat writes contain session ID/agent ID/ready only.
  Transcript persistence sends individual redacted final segments, not full snapshots.
  Previously each failed writer retried forever every second, surviving call closure;
  exponential backoff now caps at one request/minute while retaining unsaved finals.
  Retries intentionally remain until acknowledged so this fix does not discard evidence.
- Transcript guard: browser coaching guards acknowledge dispatched revisions and avoid
  unchanged transcript dispatches; their traffic goes to Netlify, not this service.
  Routing-response replay performs one lookup on a duplicate webhook; no persistent
  background poll or repeated full-call browser broadcast was found.
- Other traffic: recording copy uploads WAV to Supabase; verification downloads it
  again (ingress). Deletion retry verifies stored audio but does not re-upload it.
  Playback/compliance proxies can send large HTTP responses. Residence, billing,
  recording and transcript workers are process singletons with overlap guards.
  Giphy and SMS media fetches are bounded. No per-reconnect interval registration
  occurs outside per-socket ownership.

## Instrumentation and expected volume

`telephony_egress` logs every 300 seconds: cumulative bytes, interval bytes by
Twilio/Deepgram/Supabase/browser/other, and live Twilio-media, Deepgram, browser,
Supabase-Realtime gauges. TCP/TLS application writes cover SDK requests, fetch uploads,
WebSocket frames, recording proxy responses and ordinary HTTP responses. No payload,
token, phone number or transcript is logged. Counts exclude TLS framing/retransmissions;
unknown destinations are `other`. Idle HTTP keepalive pools are not audio streams.

After all calls close, Twilio-media and Deepgram gauges must return to zero; browser
shift sockets and small maintenance traffic remain. Durable failed transcript retries
and recording backlogs may also remain and are observable in destination bytes.

Audio alone: 28.8 MB/hour per mono mu-law track, approximately 57.6 MB/hour for a
legacy two-track call or 86.4 MB/hour for a three-leg conference. Headers, transcript
results and browser level messages add overhead. Dual-channel 8 kHz PCM16 WAV recording
copy adds approximately 115.2 MB per recording-hour, potentially one recording per
conference leg. Playback adds another copy per download. Therefore 60 MB/hour is an
audio-only estimate, not a total-service recording-inclusive ceiling.

## Validation

Telephony suite exercises authenticated media, replacement, bounded reconnects,
errors, call-end notifications and conference lease ownership. Added per-scenario
shared-transport baseline checks and a real 45-second-clock idle cutoff test;
these are transport tests, not real Twilio end-to-end calls. Conference tests also
prove 20404 completion leaves the recovery set while transient errors retain it.
The transport metric test covers HTTP request bodies and streamed responses.
