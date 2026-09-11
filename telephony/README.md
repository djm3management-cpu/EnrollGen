# EnrollGen Telephony Service

Standalone Node.js service for the inbound call platform. It answers Twilio
Programmable Voice calls transferred by the FMO lead partner, routes them to an
available agent's browser softphone, streams both call legs to Deepgram, and
pushes AGENT/CUSTOMER transcript lines to the agent so the existing Co-Pilot
pipeline works unchanged.

This runs as a long-lived process (WebSocket connections for call audio), so it
deploys to Railway or Fly.io, NOT Netlify or Supabase Edge Functions.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/twilio/voice` | Twilio signature | Inbound call webhook: match/create contact, pick an available agent, dial their browser client, start the media stream. Falls back to voicemail when no agent is available. |
| POST | `/twilio/dial-result` | Twilio signature | Dial outcome: reroute to the next available agent or voicemail. |
| POST | `/twilio/status` | Twilio signature | Call lifecycle events into `telephony_events`. |
| POST | `/twilio/recording` | Twilio signature | Stores the recording URL and copies dual-channel audio to Supabase storage (`call-recordings/{tenant_id}/{call_sid}.wav`). |
| POST | `/api/leads/incoming` | `x-api-key` (INBOUND_VENDOR_API_KEY) | FMO lead intake. Upserts contact and inserts `contact_lead_intel` before the transfer arrives. |
| POST | `/api/voice/token` | Clerk bearer token | Twilio Voice SDK access token + signed `/agent` WebSocket token for the browser softphone. |
| WS | `/media` | Twilio (private URL in TwiML) | Twilio Media Streams: both tracks forked to Deepgram (inbound=CUSTOMER, outbound=AGENT). |
| WS | `/agent?token=...` | Signed token from `/api/voice/token` | Delivers transcript and call status messages to the agent browser. |
| GET | `/healthz` | none | Health check. |

## FMO partner contract

Give the vendor two things:

1. **Lead intake**: `POST {PUBLIC_BASE_URL}/api/leads/incoming` with header
   `x-api-key: <INBOUND_VENDOR_API_KEY>` and JSON body. `phone` is required
   (E.164 or 10/11-digit US); everything else is optional and the raw payload
   is retained verbatim:

   ```json
   {
     "phone": "+15551234567",
     "first_name": "Jane",
     "last_name": "Doe",
     "state": "GA",
     "zip": "30501",
     "county": "Hall",
     "lead_score": 87,
     "churn_risk": "low",
     "vendor_source": "vendor_name",
     "any_additional_field": "kept in raw payload"
   }
   ```

   Responses: `201` (new contact) or `200` (existing) with `{ "contact_id": "..." }`.

2. **Transfer number**: the Twilio number in `TWILIO_PHONE_NUMBER`. Live
   transfers dial this number; the caller ID must be the beneficiary's phone
   (not the vendor's outbound trunk) so contact matching works.

## Deploy: Railway

1. Create a new Railway service from this repo, root directory `/telephony`
   (railway.json selects the Dockerfile).
2. Set every variable from `.env.example` in the service settings.
3. Deploy, note the public domain, and set `PUBLIC_BASE_URL` to it (redeploy).
4. Point the Twilio number webhooks at it (below).

## Deploy: Fly.io (alternative)

```sh
cd telephony
fly launch --no-deploy          # generates fly.toml; internal_port = 8080
fly secrets set $(cat .env | xargs)
fly deploy
```

## Twilio console setup

1. **API key**: Console > Account > API keys: create a standard key; set
   `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`.
2. **TwiML App**: Console > Voice > TwiML Apps: create one (request URL can
   point at `{PUBLIC_BASE_URL}/twilio/voice`); set `TWILIO_TWIML_APP_SID`.
3. **Phone number**: Console > Phone Numbers > your inbound number:
   - Voice webhook: `POST {PUBLIC_BASE_URL}/twilio/voice`
   - Call status callback: `POST {PUBLIC_BASE_URL}/twilio/status`
4. Recording is enabled per call by the `<Dial record="record-from-answer-dual">`
   TwiML this service generates; no console recording setting is needed.

## Tenancy

v1 routes all inbound calls to the default NGHS tenant (`DEFAULT_TENANT_ID`).
When more tenants take inbound calls, map `To` numbers to tenants (add a
`twilio_number` column on `tenants` and look it up in `/twilio/voice`).

## Local dev

```sh
cp .env.example .env   # fill in values
npm install
npm run dev
```

Use `ngrok http 8080` (or `twilio phone-numbers:update ... --voice-url`) to give
Twilio a reachable `PUBLIC_BASE_URL` while testing.

## Routing hardening and three-agent validation (2026-09-10)

Apply migration `038_call_owned_agent_reservations.sql` before deploying this
service. Drain existing calls, deploy the service and frontend together, and
reload all agent browsers: older frontends still write call lifecycle status.
This migration depends on the existing remote `agent_availability` table. It
intentionally fails if duplicate agent IDs exist rather than guessing which row
to retain. Do not deploy the new service without the migration.

Routing now chooses the eligible agent least recently assigned a call (ties:
availability timestamp, then agent ID). PostgreSQL locks the selected row with
`FOR UPDATE SKIP LOCKED`; inbound and outbound calls share a call-SID reservation.
This implements rotation among eligible agents, rather than a fixed roster cycle
that waits for busy agents. Agents never assigned a call receive first priority.

| Situation | Behavior |
| --- | --- |
| Three available agents, three overlapping calls | Each call reserves a different agent before dialing. All three can talk independently. |
| Fourth call while all three are reserved | Voicemail immediately; there is no hold queue. |
| Agent declines, is unreachable, or misses the ring timeout | Release that attempt and try an untried eligible agent; voicemail if none remain. Default ring timeout is 20 seconds per agent. |
| Agent finishes a call | Server completion callbacks release only that call's reservation and restore the after-call preference. |
| Agent chooses offline or busy during a call | Reservation remains exclusive; the chosen preference applies after completion. |
| Agent chooses available during a call | Reservation remains exclusive until completion. |
| Agent starts an outbound call | The server reserves that specific agent before dialing the destination, including when manually offline. |
| Old completion callback arrives during a newer call | Call SID ownership prevents releasing the newer call. |
| Routing webhook is retried | Stored TwiML is returned without making another assignment. An overlapping unfinished request receives HTTP 503. |

The callback design uses both Dial actions and child-leg completion callbacks.
Twilio documents that a Dial action may be skipped when the parent hangs up:
https://help.twilio.com/articles/55048623661851
Child callback parameters and events:
https://www.twilio.com/docs/voice/twiml/client

### Verification performed locally

Run `cd telephony && npm test`. SQL tests execute the actual migration and
functions in PGlite (embedded PostgreSQL). They cover capacity, rotation,
call-owned release, manual preference overrides, outbound occupancy, duplicate
identities, and response persistence. PGlite serializes queries: concurrent
Promise submissions verify outcomes but do **not** replace a multi-connection
PostgreSQL contention test. Replay middleware tests use a mock storage adapter.
The frontend production build and focused frontend lint were also checked.

### Remaining production acceptance requirements

- Apply the migration to the same Supabase project used by the availability
  edge functions. Those functions and the original availability schema are not
  in this repository; verify their writes preserve the new ownership columns.
- Verify the Twilio number's parent status callback points to `/twilio/status`.
  The outbound TwiML application's Voice URL must be `/api/voice/outbound`.
- With three distinct agent identities in three browsers, place three calls at
  once. Verify distinct `active_call_sid` values, independent audio/transcripts,
  and a fourth call reaching voicemail. Repeat with an outbound call occupying
  one agent, a decline, caller hangup during ringing, and caller hangup after
  answer. Check reservations clear and manual offline stays offline.
- Test separate service instances/connections against PostgreSQL with concurrent
  claims and callback delivery. Local embedded tests do not certify this load.

### Known limits; not a production reliability certification

Browser presence is now enforced by migration `039_agent_phone_presence.sql`
and the updated service/frontend (see below). Automatic reconciliation of lost
call completion callbacks against Twilio is still not implemented. If all
completion callbacks are lost, a reservation can remain busy; investigate the
Twilio Call SID before releasing it. Never blindly expire a reservation by call
duration: that can double-book a long call.

A process crash between acquiring a routing request and persisting its response
leaves a pending row in `telephony_routing_responses`. It deliberately fails
closed (503) to avoid duplicate assignment. Inspect pending rows older than a
minute and reconcile the parent call and reservation with Twilio before any
manual recovery. Configure and test Twilio fallback/error handling and alerting;
there is no automatic pending-request recovery or retention job in this patch.
A caller hangup racing a reroute also needs the live failure-injection test;
parent call termination and next-agent selection are not one DB transaction.

The token endpoint currently checks that an agent exists but does not bind the
requested agent slug to the authenticated Clerk user's roster entry. Production
identity binding should be addressed before treating agent separation as a
security guarantee. Routing remains single tenant as described above.


## Browser-close offline behavior (migration 039)

Migration 038 is unchanged. Apply `039_agent_phone_presence.sql` next, then deploy
both the telephony service and frontend. This intentionally takes existing agents
offline during rollout. Reload the phone and choose Available to resume routing.
Old frontends do not send phone readiness and cannot receive routed calls after
039; deploy both components together during a drained-call maintenance window.

Each registered browser phone has a separate database lease. The server pings
its WebSocket every 15 seconds and renews the 45-second lease only after a pong
from a phone that reported Twilio registration. The design follows the native
[ws heartbeat pattern](https://github.com/websockets/ws#how-to-detect-and-close-broken-connections)
and [Twilio registration events](https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice).

- Closing the final phone tab/browser sets the agent offline when its socket
  close reaches the server. Page navigation uses `pagehide` to close the socket.
- Browser crash, device sleep, network loss, or service crash: expired leases are
  ineligible for routing after 45 seconds from the last successful renewal.
  A 15-second service sweep persists offline status, normally within 60 seconds
  from that renewal. During a service/database outage, persistence can be delayed;
  routing itself still checks expiry when service returns.
- Closing one tab leaves the agent online if another registered phone session is
  still alive, including sessions on another service instance.
- Twilio unregistration/error withdraws that phone session even if the page is
  still open. Background-tab visibility alone does not mean offline.
- Active call reservations are never cleared by presence expiry. The agent stays
  busy with an offline after-call preference until the matching completion arrives.
- Reopening/reconnecting does not automatically choose Available. Heartbeats
  establish connectivity only and respect manual offline/busy choices.
- Token refresh keeps the old socket until the replacement lease is acknowledged,
  preventing an accidental offline transition during normal refresh.

Tests cover SQL eligibility/expiry, multiple sessions, active-call ownership,
manual offline, refresh handoff, page-close cleanup, reconnect cancellation,
missed pongs, and close racing a heartbeat. Live browser/Twilio validation remains
necessary after deployment: close the final tab, close only one of two tabs,
remove network connectivity, and close during a call; inspect the availability
row and verify no new call routes to the disconnected agent.

### Production recovery: 2026-09-11

Migration 039 was applied while the new service/frontend were still local.
Production inspection showed all three agents offline and no live phone sessions.
Applied `scripts/telephony/pause-phone-presence.sql` to production: restored the
038 availability trigger and claim function and made the presence expiry job a
no-op. Call ownership, privileges, data, and reservations were preserved. Agents
must manually select Available; the recovery does not assume anyone is ready.

Presence enforcement is currently PAUSED in production. After deploying BOTH
updated applications and verifying registered phone sessions, run
`scripts/telephony/enable-phone-presence.sql` to restore the 039 functions without
recreating tables or repeating its rollout reset. Do not re-run 039 wholesale.
The local recovery regression test covers pause, reservation safety, and re-enable.
