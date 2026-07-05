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
