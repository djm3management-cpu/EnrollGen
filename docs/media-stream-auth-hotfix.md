# F08 post-deploy transcription hotfix

Branch: `fix/media-stream-auth-hotfix`, based on deployed `b93de4a`.
All work is in an isolated `/private/tmp` clone. Production investigation used
REST SELECTs only. No production changes, deploy, push, or merge were performed.

## Findings

The answered inbound call is `CAa44621807f498d3dede1eb16ce02d192`, inbound record
`5fcbe3a8-887e-4b12-8275-8c6ae3e93508`, attempt
`fb43fb0a-cb98-47ca-837c-b889006de579`, agent `mike_shiomos`.
The child leg is `CA060f237b887be453e64adf7698149a19`.
It answered at 2026-10-03 20:24:38 UTC and ended at 20:24:58 UTC (4:24 PM ET).
Both call and attempt are completed. At inspection, availability was available,
with no active reservation; the last assignment was 20:24:29 UTC and the last
availability update was 20:24:58 UTC. No media lease row remained. These are
post-call snapshots, not evidence of the reservation's exact value during the call.

The persisted TwiML media token binds the parent CallSid, owning agent, tenant,
and exact attempt correctly. It was issued at 20:24:29 UTC and expires at
20:29:29 UTC, covering the reported 20:24:39 upgrade. Tokens/signatures were not
printed or committed.

**Confirmed media defect:** the JS start validator and SQL claim RPC require
`SM` plus 32 hex characters. Twilio Media Stream identifiers use `MZ` plus
32 hex characters. Thus a real start packet is rejected before the SQL claim;
fixing only JS would still cause a failed SQL claim. Original tests used the
incorrect `SM` fixture and therefore missed this regression.

Twilio source: https://www.twilio.com/docs/voice/media-streams/websocket-messages
and https://www.twilio.com/docs/voice/api/stream-resource.

Reservation code passes the parent CallSid into the claim and stores that SID in
`agent_availability.active_call_sid`. The lease's parent-SID comparison remains
unchanged; a child SID must not authorize transcription.

**Agent 401 investigation:** `b93de4a` did not change `wsToken.js`, its HMAC input,
`AGENT_WS_SIGNING_SECRET` configuration, voice-token minting, or browser token
refresh/reconnect code. Purpose separation exists only in the new media token
signature. An HTTP 401 at `/agent` happens in token verification before the DB
identity query. The browser's disconnect retry reused the previous credential
without obtaining a fresh one; expired or invalidated credentials repeatedly
fail until a proactive refresh succeeds. This recovery defect is reproduced
and fixed. The initiating production rejection (expiry, signature mismatch,
missing/malformed token) cannot be determined from the supplied reasonless logs.
Railway browser diagnostics were denied by browser security policy; no workaround
was attempted. Do not claim a signing-secret rotation occurred without evidence.

## Changes

- `telephony/src/wsToken.js`: compatible verification with safe rejection reason
  codes; signing format, secret configuration and token lifetime remain unchanged.
- `telephony/src/media/agentSocket.js`: reason-only token, handshake and identity
  rejection logging.
- `src/lib/agentPhoneConnection.js`: fetch fresh credentials before reconnect;
  bounded 2–30 second backoff; stop/proactive-refresh guards and updated identity
  fetcher prevent obsolete async reconnects.
- `src/context/InboundCallContext.jsx`: supplies the authenticated bundle fetcher.
- `telephony/src/media/mediaStream.js`: `MZ` validation and reason-only upgrade,
  frame/start/binding/lease/transport rejection logging.
- `telephony/src/media/streamLease.js`: safe claim denial/RPC failure logging.
- `supabase/migrations/074_media_stream_auth.sql`: corrected SID validation for
  installations that have not applied 074.
- `supabase/patches/074_media_stream_sid_fix.sql`: forward repair for an already
  applied 074; replaces only `claim_media_stream` and reasserts service-only grants.
- `telephony/tests/agentPhoneConnection.test.js`, `telephony/tests/wsToken.test.js`,
  `telephony/tests/mediaStream.test.js`: credential recovery, compatible agent
  authentication and actual parent/child call identity with Twilio MZ wire shape.
- This report.

## Rollout

1. On the deployment with 074 already applied, apply
   `supabase/patches/074_media_stream_sid_fix.sql`. Do not rerun the original 074
   table-creation migration. The patch is transactional and repeatable. No SQL
   was applied during this investigation.
2. Deploy this commit to Railway telephony. Keep the existing
   `AGENT_WS_SIGNING_SECRET`; this fix does not require rotation or a new secret.
3. Deploy the browser changes to Netlify, then reload the agent browser to load
   credential recovery. Until then, a reload obtains a fresh browser token.
4. Smoke-test an inbound real call: `/agent` authenticates; both media tracks
   produce transcripts; hangup releases the transcription lease. If 401s recur,
   read `[agent] rejected: expired_token` vs `signature_mismatch` (or other
   safe reason) and inspect the voice-token request's status and deployment's
   signing-secret/public URL configuration. Never paste the token or stream URL.

Routing, admission, hours/cap, billing, recordings and Paragon code are unchanged.
Deepgram speaker health/reconnect behavior remains covered by existing tests.
SQL/browser/Railway deployment must all be included; a Railway-only deployment
cannot fix the browser's stale-credential reconnect loop.

## Validation

- 201 tests passed, zero failures: `node --test telephony/tests/*.test.js
  tests/transcription-health.test.js tests/availability-auth.test.js`.
- Production call parent/child/attempt identity, documented `MZ` start packets,
  both audio tracks, second-stream rejection, owning-agent/tenant checks, forged
  token rejection, lease renewal and Deepgram speaker drop/reconnect are covered.
- Browser handshake rejection obtains a fresh credential; failed refresh backs
  off without resending the old credential; stop/proactive refresh/identity change
  cannot resurrect an obsolete reconnect.
- Valid `/agent` upgrade delivers a transcript over a real local WebSocket with
  a fixture identity service; original signing format and media-purpose isolation
  remain valid; expiry and simulated secret rotation have distinct reason codes.
- Forward SQL patch upgrades the old `SM` function, succeeds when applied twice,
  and preserves denied EXECUTE privileges for anon/authenticated roles.
- Scoped ESLint and `git diff --check` passed.
- Production Vite build passed using local production environment settings;
  built assets contain neither `VITE_AGENT_API_KEY` nor the retained shared-key value.
- All provider/database mutation tests used isolated local fixtures, not production.
