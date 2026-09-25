# Lead vendor integration guide

## Getting started

We provide a unique availability API key for your organization. Each key can be
revoked independently. Optional push notifications, call disposition postbacks,
and daily CSV reports are enabled only after we agree on your configuration.
Availability describes a current snapshot, not a held or guaranteed transfer slot.

## Availability pull

Endpoint:
`https://qzjtagnpklaxefwurorc.supabase.co/functions/v1/get-availability`

```sh
curl -H 'x-api-key: YOUR_KEY' \
  'https://qzjtagnpklaxefwurorc.supabase.co/functions/v1/get-availability'
```

Default JSON:

```json
{
  "any_available": true,
  "available_count": 1,
  "unavailable_count": 1,
  "total_count": 2,
  "available_states": ["NJ", "PA"],
  "agents": [
    {"agent_id":"agent_a","agent_name":"Agent A","available":true,"status":"available","licensed_states":["NJ","PA"]},
    {"agent_id":"agent_b","agent_name":"Agent B","available":false,"status":"busy","licensed_states":["NY"]}
  ]
}
```

An agent is available only when manually available, free of a reserved/active
call, and connected with a current phone presence lease when presence checks
are enabled. States represent the union of licenses of available agents.

| Option | Result |
| --- | --- |
| `format=simple` | `{"available":true,"count":1}` |
| `format=text` | Plain `1` or `0` |
| `state=NJ` | Only available agents licensed in NJ contribute to the result |
| `min=2` | Available only when at least two eligible agents remain; count remains the actual count |
| `key=YOUR_KEY` | Alternative authentication for systems that cannot set headers |

Combine options, for example `?format=text&state=NJ&min=2`. State codes are
case-insensitive US postal abbreviations (including DC). Minimum must be an
integer from 1 through 999999 and defaults to 1. Unsupported options return 400.
Header authentication takes precedence when both methods are supplied. Prefer
headers so credentials do not appear in URLs, browser history, or proxy logs.
No authentication is required for CORS preflight; missing/revoked keys return 401.

GET returns 200 with a negative availability result when no agents qualify.
HEAD returns **200 when available**, **503 when unavailable**, with no body;
it supports the same filters and authentication. Infrastructure failures also
return 503, so treat any non-200 HEAD response as unavailable. Responses are
not cacheable. A legacy `agent_id=SLUG` lookup returns a single agent object;
combining it with state/min filters returns the filtered aggregate instead.

## Availability push

Provide a public HTTPS endpoint and choose `json` (the default availability
JSON above) or `simple` (`{"available":true,"count":1}`). We provide a separate
shared signing secret. Changes to overall availability, available count, or
available states trigger a push after a five-second quiet period. A current
status heartbeat is also sent every five minutes. Pushes are global; request
state-specific decisions through pull.

Requests include:

- `Content-Type: application/json`
- `X-Signature: sha256=HEX_HMAC`
- `X-Delivery-ID: UNIQUE_DELIVERY_ID`
- `Idempotency-Key: UNIQUE_DELIVERY_ID`

Verify HMAC-SHA256 over the **exact raw request body bytes** before parsing JSON.
Node.js verification example:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
const expected = 'sha256=' + createHmac('sha256', signingSecret)
  .update(rawBody).digest('hex');
const actual = Buffer.from(request.headers['x-signature'] || '');
const valid = actual.length === Buffer.byteLength(expected) &&
  timingSafeEqual(actual, Buffer.from(expected));
```

Return any 2xx response to acknowledge. Deliveries are at least once: deduplicate
by delivery ID, including across retries. Failures retry with exponential
backoff for up to ten minutes. A newer status supersedes an unsent older status.
Accept requests promptly; requests time out after ten seconds. Redirects and
private-network endpoints are unsupported.

## Transfer identity and source attribution

We assign a transfer number to each configured aggregator and agree on each
publisher's identifier. Provide the publisher identifier and, if available,
your own call ID by one of these methods:

1. **SIP transfer headers:** `X-Publisher-ID` and `X-Aggregator-Call-ID`, passed
   through to our Twilio webhook as `SipHeader_X-Publisher-ID` and
   `SipHeader_X-Aggregator-Call-ID`.
2. **Configured transfer webhook query:** `publisher=pub-123&aggregator_call_id=call-456`.
   These values must be part of the URL Twilio actually calls and signs; appending
   them to a dialed telephone number does not transmit them.
3. **Pre-transfer ping:** POST to the telephony ping endpoint we supply with your
   dedicated **ping** API key (separate from your availability key):

```sh
curl -X POST 'https://YOUR_ASSIGNED_VOICE_HOST/api/leads/ping' \
  -H 'x-api-key: YOUR_PING_KEY' -H 'Content-Type: application/json' \
  -d '{"phone":"+15551234567","publisher":"pub-123","aggregator_call_id":"call-456"}'
```

A valid ping returns 202. Transfer within five minutes using the same caller
phone number and assigned transfer number. The newest unused matching ping is
consumed once. Header/query metadata takes precedence over ping metadata.
Identifiers may contain letters, digits, spaces, dots, colons, `@`, `+`, and `-`
(up to 128 characters). Send identifiers only, never personal or health details.
Unrecognized publishers are not attributed to another publisher; calls on an
unconfigured transfer number are treated as direct calls.

## Disposition postbacks

Aggregators provide a public HTTPS endpoint and optionally agree on a signing
secret. After agent wrap-up is saved, we send the disposition asynchronously,
normally on the next one-second dispatch cycle. Delivery failures do not affect
the call or the agent's saved wrap-up.

```json
{
  "aggregator_call_id": "call-456",
  "twilio_call_sid": "CA0123456789abcdef0123456789abcdef",
  "publisher": "pub-123",
  "call_start_time": "2026-09-24T14:30:00.000Z",
  "caller_phone": "+15551234567",
  "duration": 185,
  "disposition_code": "enrolled",
  "sale": true
}
```

IDs/publisher/phone can be null when unavailable. Duration is seconds;
`call_start_time` is UTC. `sale` is true only for `enrolled`, not a pending or
partial enrollment. Codes include enrollment, callback, uninterested,
no-answer, voicemail, and technical outcomes; sensitive health-related outcomes
are represented as `other`. Unwrapped calls appear in daily reports using their
current call status rather than an invented wrap-up disposition.

Field names can be mapped to your contract, for example:

```json
{"aggregator_call_id":"vendor_call_id","twilio_call_sid":"call_id","sale":"converted"}
```

Unmapped fields retain their default names. Mapping renames only these eight
fields; it does not expose additional data. Tell us your exact desired names.
Disposition retries use the same delivery ID and immutable field mapping for a
given event. If a later wrap-up edit changes the disposition, it generates a new
event. Process events idempotently by delivery ID. Postbacks are signed exactly
like pushes when a signing secret is configured. Non-2xx responses and timeouts
retry with exponential backoff for up to 24 hours. Contact us with a delivery ID
for manual replay after a delivery has exhausted retries.

## Daily CSV reports

Publishers provide their approved recipient email addresses. Reports are sent
at 7 AM America/New_York (automatically following daylight saving time) for calls
started during the previous Eastern calendar day. Sources with no calls receive
no email. Reports use these stable canonical columns, regardless of postback
field mapping:

```csv
aggregator_call_id,twilio_call_sid,publisher,call_start_time,caller_phone,duration,disposition_code,sale
```

CSV values are quoted and spreadsheet-formula characters escaped with a leading
apostrophe. UTC timestamps make ordering unambiguous. The report contains only
calls attributed to that recipient's source; an aggregator report includes its
publishers when aggregator reporting is requested. Late wrap-ups may be absent
from an already generated daily snapshot; their real-time postbacks still arrive.

## Data boundary and go-live checklist

No health details, plans, carriers, MBI, date of birth, addresses, notes,
transcripts, or recordings are included in these integrations. Availability
contains no caller information. Caller phone appears only in authorized
postbacks/reports.

Provide your organization name, requested availability format/filter needs,
optional push URL, optional postback URL and field-name mapping, publisher
identifiers and transfer metadata method, and approved report recipients.
We provide your availability endpoint/key, assigned transfer number, ping
endpoint/key if used, signing secrets, and sample payloads. Before enabling
production traffic, jointly test positive/negative availability, signatures,
deduplication, transfer identity, a disposition, and a sample report.
