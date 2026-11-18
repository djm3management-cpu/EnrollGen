# Buyer API integration guide

## Getting started

The buyer API lets your agency manage its own ping campaigns and read its own
reports from your systems. We issue buyer API keys for your agency, each with a
name and a set of scopes. A key looks like `egb_` followed by 64 hex characters
and is shown to us once, when it is created; only a hash is stored. Keys can be
revoked independently at any time; a revoked key answers 401 for good. Ask for a
separate key per system so each can be revoked alone.

Send the key in the `x-api-key` header. All endpoints live under
`https://YOUR_ASSIGNED_VOICE_HOST/api/buyer/v1`. The machine-readable contract is
`docs/api/ping-platform.openapi.yaml`. Until the platform is enabled for your
deployment every endpoint answers 503 with
`{"status":"disabled","feature":"PING_PLATFORM_ENABLED"}`; reports also need
`PING_SCORECARD_ENABLED` and screener scripts `PING_SCREENER_ENABLED`.

| Scope | Allows |
| --- | --- |
| `campaigns:read` | List campaigns, list screener scripts |
| `campaigns:write` | Change allowlisted campaign fields, pause and resume |
| `reports:read` | Scorecard, usage, invoice lines, retention alerts |
| `alerts:write` | Acknowledge retention alerts |
| `screener:write` | Create draft screener scripts |

A key without the endpoint's scope gets 403 with `"required_scope"`.

## Endpoints

| Method and path | Scope | Purpose |
| --- | --- | --- |
| `GET /campaigns` | `campaigns:read` | Your campaigns, including `paused` |
| `PATCH /campaigns/{id}` | `campaigns:write` | Change allowlisted fields |
| `POST /campaigns/{id}/pause` | `campaigns:write` | Stop new pings for the campaign |
| `POST /campaigns/{id}/resume` | `campaigns:write` | Resume the campaign |
| `GET /scorecard?from=&to=&group=` | `reports:read` | Pings, accepts, arrivals, cost, apps and more |
| `GET /usage?month=YYYY-MM` | `reports:read` | Platform usage and invoice preview |
| `GET /invoice-lines?month=YYYY-MM` | `reports:read` | Invoice lines by usage kind |
| `GET /retention-alerts?status=open\|all&limit=` | `reports:read` | Pings that matched your existing clients |
| `POST /retention-alerts/{id}/ack` | `alerts:write` | Acknowledge an alert |
| `GET /screener-scripts?campaign_id=` | `campaigns:read` | Your screener scripts and their status |
| `POST /screener-scripts` | `screener:write` | Create the next draft version |

### Changing a campaign

```sh
curl -X PATCH 'https://YOUR_ASSIGNED_VOICE_HOST/api/buyer/v1/campaigns/CAMPAIGN_ID' \
  -H 'x-api-key: YOUR_BUYER_KEY' -H 'Content-Type: application/json' \
  -d '{"exchange_hourly_cap":12,"daily_budget_calls":80}'
```

Only these fields can be changed through the API:

| Field | Values |
| --- | --- |
| `active` | `true` or `false` |
| `staffed_hours_override` | `null` (use your agency hours) or `{"timezone":"America/Chicago","days":{"mon":{"enabled":true,"start":"09:00","end":"17:00"}}}`; days `sun` to `sat`, `start` before `end` |
| `daily_budget_calls` | Integer 0 to 1000000, or `null` for none |
| `exchange_daily_cap`, `exchange_hourly_cap` | Integer 0 to 1000000, or `null` for none; in your own time zone |
| `retention_mode` | `route_owner` or `reject_and_alert` |
| `screener_mode` | `off`, `inbound_only` or `always` (takes effect only with an approved script) |
| `performance_routing` | `true` or `false` |

Any other field (rate, states, carriers, transfer number, engine mode) is 400
with `"error":"invalid_request"` and nothing changes; those are set with us. The
response is the campaign after the change.

Pause and resume take no body. A paused campaign rejects new pings with
`source_paused`; a caller already holding one of your agents still arrives.
Resuming does not lift a source wide pause we set.

### Reports

`from` and `to` are ISO 8601 timestamps, `from` inclusive, `to` exclusive, at
most 92 days apart. `group` is a comma separated subset of `source`, `sub_id`,
`campaign`, `state` and `day` (days in your own time zone); leave it out for one
total row. Every metric is attributed to the ping that produced it. Usage and
invoice lines cover one UTC calendar month.

### Retention alerts

When a ping matches one of your existing clients, an alert records the contact in
your own CRM and its owning agent. Alerts never carry a phone number.
Acknowledging is idempotent.

### Screener scripts

You can create draft scripts; each new draft is the next version for its
campaign. A draft is never played to callers. Approval is done by the platform
operator after review and has no API endpoint.

```json
{"campaign_id":"CAMPAIGN_ID","opening":"...","q_medicare":"...","q_zip":"...","q_reason":"...",
 "q_connect":"...","pass_line":"...","fail_line":"...","disclaimer":null,"voice":"Polly.Joanna"}
```

Each text field is 1 to 600 characters, `disclaimer` up to 1000.

## Validation, errors and rate limits

Every query parameter and body field is checked against an allowlist. Unknown
fields or parameters, and values outside their allowed range, are 400; nothing
changes. Endpoints without a body reject one.

| Status | Meaning |
| --- | --- |
| 200 / 201 | Done |
| 400 | `invalid_request`, with a short `detail` |
| 401 | Missing, unknown or revoked key |
| 403 | `insufficient_scope` |
| 404 | No such campaign, alert or script in your agency |
| 429 | Over the limit; wait `Retry-After` seconds |
| 503 | Disabled feature, or the platform could not serve the request; retry later |

Each key may make 120 requests per fixed 60 second window.

## Audit

Every write call is recorded with the key, the action, the target and the
outcome (`ok`, `not_found` or `rejected`), including calls that were rejected and
changed nothing. Campaign changes record the field names and values; screener
drafts record the campaign and version, never the script text. Key creation and
revocation are recorded too. Ask us for an export of your audit trail.

## Data boundary and go-live checklist

A key reads and changes only your agency's data. Another agency's campaign,
alert or script IDs answer 404, exactly like IDs that do not exist. You never see
other buyers' bids, decisions, or that you lost an auction. Scorecards carry no
caller phone, ZIP or contact. Responses are not cacheable.

Tell us which systems need keys and which scopes each needs. We provide the
keys, the voice host and your campaign IDs. Before going live, test a read with
each key, a 403 for a missing scope, a rejected PATCH field, a pause and resume,
and one report call.
