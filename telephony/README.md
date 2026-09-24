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

That pause was temporary. Production presence enforcement is confirmed ENABLED:
the deployed `claim_call_agent` checks `agent_phone_sessions`. The pause script
is a recovery tool, not the current production configuration. Re-enabling after
any future rollback uses `scripts/telephony/enable-phone-presence.sql`; do not
re-run 039 wholesale. The local recovery regression test covers pause,
reservation safety, and re-enable.

## Answer attribution (migration 045)

Apply `045_telephony_answer_attribution.sql` before deploying this service. It
does not replace routing/reservation/presence functions. No agent selection,
fallback order, dial timeout, or voicemail behavior changes.

Each Dial attempt is persisted in `telephony_call_attempts`, including outbound
parent SID, agent slug, normalized destination and phone-matched contact. Client
supplied ContactId is not trusted for outbound identity. New callbacks carry the
attempt ID so attribution never reads the mutable last-routed agent.

Both `<Dial><Client>` (inbound agent) and `<Dial><Number>` (outbound callee) now
set `statusCallbackEvent="answered completed"` on `/twilio/agent-status`.
Twilio's answered event normally supplies `CallStatus=in-progress`. No Twilio
Console event subscription change is needed: these are emitted in TwiML. Keep
the number's parent status callback pointing to `/twilio/status` and the TwiML
app voice URL at `/api/voice/outbound`.

Inbound child answer events set `answered_at`, `answered_agent_id` and `accepted`;
hangup changes accepted calls to completed. A completed Dial action with positive
DialCallDuration provides secondary answer evidence. Canceled, no-answer, busy,
failed, and voicemail do not establish a connection. No-answer/busy/failed dial
attempts still reroute as before; exhaustion still ends at voicemail. Their
individual attempt outcomes are retained. Unanswered terminated parent calls
receive distinct final statuses, rather than being called completed.

Outbound answer alone does not advance contact history. A completed callee leg
must reach `MIN_CONNECTED_SECONDS` (positive integer, default 30). This is a
duration filter, not answering-machine detection: a long voicemail can still
qualify. The threshold is saved per attempt so deployment/config changes do not
change the meaning of an in-flight call.

Contact last-connected fields advance atomically only for a strictly newer
answer timestamp. Child callbacks use Twilio's Timestamp. Dial actions without
Timestamp fetch the completed child Call resource and derive answer time from
endTime minus DialCallDuration; no arrival-time fallback is used for attribution.
Failures return 503, and attribution runs before the routing replay guard so
retries can repair it without repeating routing. The Twilio credentials need
permission to read Call resources. Old in-flight TwiML without attempt IDs keeps
its release/routing behavior but cannot be attributed by this new mechanism;
drain calls during deployment if uninterrupted attribution is required.

Historical pointer backfill (not run automatically or against production):

```sh
cd telephony
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and explicit DEFAULT_TENANT_ID.
node scripts/backfillLastConnected.js --dry-run
# Only after reviewing counts and the target database:
node scripts/backfillLastConnected.js --apply
```

Omitting flags also selects dry-run. The script prints counts, skips events
without completed status/positive duration/attempt agent, and never overwrites a
newer pointer. Older dial_result payloads omitted duration and cannot safely be
backfilled. Historical event receipt time minus duration is used only when no
answer/event timestamp exists; these approximate candidates are counted. The
script updates contact pointers only, not historical call outcomes.

## Sticky inbound routing (migration 046; disabled by default)

The initial inbound attempt uses the contact already loaded by phone lookup.
With `STICKY_ROUTING_ENABLED=true`, a last-connected agent within
`STICKY_LOOKBACK_DAYS` (default 180) takes precedence over the assigned owner.
An older/invalid/future pointer falls back to the owner. No history uses normal
rotation. Anonymous/blocked/restricted or unnormalizable caller IDs and failed
contact lookups never supply a preferred agent. There is no extra contact query.

The new four-argument `claim_call_agent` overload requires an explicit
`p_preferred_agent_id` argument and returns `claim_path` (`preferred`,
`round_robin`, `existing`, or `outbound`). It uses the same per-call transaction
lock and `FOR UPDATE SKIP LOCKED`, reserving the preferred agent only if manually
available, unreserved, unexcluded, active in `tenant_agents`, and holding a live
phone session when presence enforcement is enabled. A rejected preferred agent
is excluded from the fallback within that RPC, including an inactive roster
entry that the legacy rotation would not itself filter. Sticky assignment
updates `last_assigned_at` exactly like normal assignment.

The original three-argument function is intentionally retained, with no change
to its body or return type. Flag-off calls, calls without a preference, reroutes,
and outbound claims still use it. The new overload has no default arguments,
so PostgREST can distinguish the signatures by their supplied argument names.
Preferred selection errors retry the original claim without a preference, using
the same CallSid so any committed reservation is reused. The same 20-second
default ring, tried-agent exclusions, release callbacks, replay guard and
voicemail overflow remain in effect. The owner is not a second sticky attempt
if a recent last-connected agent is ineligible; fallback is normal rotation.

Initial routing events contain `routing_method`, `preferred_agent_id`,
`agent_id`, and only `phone_last4` for caller identity (no full from/to numbers).
Methods: `sticky_last_connected`, `sticky_owner`,
`round_robin_preferred_ineligible`, `round_robin_no_history`,
`round_robin_anonymous`, `round_robin_sticky_error`, `round_robin_flag_off`.
The initial contact activity summary also masks the number.

Deployment order (manual; migration/deployment are not performed by tests):

1. Leave/set `STICKY_ROUTING_ENABLED=false` on the telephony service. Optionally
   set `STICKY_LOOKBACK_DAYS=180`. This deploy must remain flag-off.
2. Apply `046_sticky_agent_routing.sql` after 045. It preserves the installed
   presence mode by inspecting the legacy claim definition once, retains the
   old RPC, grants the new RPC to service_role only, and reloads the PostgREST
   schema cache. No backfill, schema reset or presence toggle is needed.
3. Deploy the telephony service with the flag still false. No frontend or Twilio
   callback configuration change is required. Verify ordinary inbound/outbound
   calling and initial `round_robin_flag_off` events.
4. Only when ready, manually set `STICKY_ROUTING_ENABLED=true` and restart/redeploy
   the service so it reads the environment. Check a recent caller, an owner-only
   caller, an unavailable preferred agent, and a declined/timed-out sticky ring.
5. To disable, set the flag back to false and restart/redeploy. Leave migration
   046 installed. Presence remains enabled; do not use presence-pause to disable
   sticky routing.

Both presence recovery scripts update the four-argument overload when installed
and still work before 046. Tests cover both modes and migration into an already
paused database. PGlite tests submit concurrent claims and verify exclusive
outcomes, but serialize SQL execution; real multi-connection lock contention
still requires a separate PostgreSQL integration environment.
