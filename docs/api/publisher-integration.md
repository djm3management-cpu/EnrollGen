# Publisher ping integration guide

## Getting started

We provide a unique **ping** API key for your source, a sandbox key for testing,
and, for direct campaigns, your assigned transfer number. Each key can be revoked
independently. Send the key in the `x-api-key` header on every request. Only a
hash of your key is stored on our side; if you lose it we issue a new one.

There are two ping endpoints. Your contract says which one you use:

| Endpoint | Use | Who can win |
| --- | --- | --- |
| `POST /api/ping/v1` | Direct: you ping one agency's own campaign | That agency only |
| `POST /api/exchange/v1/ping` | Exchange: one ping reaches every buyer routed from your source | One buyer, picked by the platform |

Both live on the voice host we assign (`https://YOUR_ASSIGNED_VOICE_HOST`). The
full machine-readable contract is `docs/api/ping-platform.openapi.yaml`. Until the
platform is enabled for your deployment, both answer 503 with
`{"status":"disabled","feature":"PING_PLATFORM_ENABLED"}` (or
`PING_EXCHANGE_ENABLED` for the exchange).

## Sending a ping

```sh
curl -X POST 'https://YOUR_ASSIGNED_VOICE_HOST/api/exchange/v1/ping' \
  -H 'x-api-key: YOUR_PING_KEY' -H 'Content-Type: application/json' \
  -d '{"phone":"+15551234567","state":"TX","zip":"75001","call_id":"call-456","sub_id":"pub-123"}'
```

JSON and `application/x-www-form-urlencoded` bodies are both accepted.

| Field | Required | Notes |
| --- | --- | --- |
| `phone` | Yes, unless `call_id` is sent | Caller phone. Normalized to E.164; an unparseable value rejects as `invalid_payload`. |
| `state` | Yes | Two letter state of the caller. Case and spaces are normalized. |
| `zip` | No | Five digits. Some buyers serve only some counties; without a ZIP the county check is skipped. |
| `call_id` | Recommended | Your call ID, up to 128 characters. The call identity is `call_id` when sent, else `phone`. |
| `sub_id` | No | Your sub-publisher or traffic source label, up to 128 characters. Appears in buyer scorecards. |
| `consent_cert_id` | No | Consent certificate reference, up to 128 characters. |
| `t65` | No | Turning 65 flag: `true`/`false`, `"true"`/`"false"` or `1`/`0`. |
| `campaign` | Direct only | Campaign ID or name when your source has more than one active campaign. |

### Field mapping

If your system already uses other field names, tell us; we map them per source,
for example `{"phone":"ani","call_id":"lead_id","sub_id":"aff_id"}`. Unmapped
fields keep the default names above, and the default name is still accepted when
your mapped name is absent. Mapping renames only these eight fields; any other
field in your body is ignored and never stored.

## Responses

A ping always answers 200 with a decision unless the request itself failed
(401, 429 or 503). A rejected caller is `"available": false`, not an error.

Direct (`/api/ping/v1`):

```json
{"decision_id":"6b0b6f1e-2f0a-4d7e-9a5e-1c2d3e4f5a6b","available":true,"reason":"accepted_full","ttl_seconds":30}
```

Exchange (`/api/exchange/v1/ping`):

```json
{"auction_id":"0c4d5e6f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","available":true,"reason":"accepted_full","ttl_seconds":30,"transfer_number":"+15005550201"}
```

The exchange response contains exactly these five fields (plus `sandbox` for a
sandbox key). It never tells you the price, which buyer won, how many buyers were
evaluated, or why other buyers declined. Price is never returned unless your
contract enables price disclosure; it is off by default.

### Transfer within the reservation window

An accepted ping holds a licensed agent for `ttl_seconds` (30 by default, set per
campaign). Transfer the caller within that window:

- **Direct:** to your assigned transfer number.
- **Exchange:** to the `transfer_number` in the response. It changes per ping.

Use the same caller phone and, when you sent one, the same `call_id` (as the
`X-Aggregator-Call-ID` SIP header or transfer webhook query described in
`docs/vendor-integration.md`). We match the arrival to the ping by call ID first,
else by phone, within five minutes. If the held agent is no longer free when the
call arrives, the call goes to another eligible agent of the same campaign when
one is free.

Re-pinging the same call identity and state within 30 seconds of an acceptance
returns the same acceptance and does not hold a second agent. On the exchange a
re-ping stays with the buyer that already holds an agent for it. Pinging again
after the window starts a new decision.

### Reasons you may see

| `reason` | Endpoint | Meaning |
| --- | --- | --- |
| `accepted_full` | Both | Accepted; the held agent covers every carrier the campaign requires. |
| `accepted_partial` | Both | Accepted; the held agent covers most required carriers. Treat like `accepted_full`. |
| `accepted_retention_owner` | Direct | Accepted for an agent who already serves this caller. Treat as accepted. |
| `routing_disabled` | Direct | Routing is switched off for this deployment or campaign. |
| `invalid_payload` | Direct | A field failed validation (phone, ZIP or `t65`). |
| `source_paused` | Direct | You or the campaign are paused. |
| `outside_staffed_hours` | Direct | Outside the campaign's staffed hours. |
| `campaign_inactive` | Direct | No active campaign matched. |
| `state_not_allowed` | Direct | The campaign does not take this state. |
| `county_not_served` | Direct | The campaign's carriers have no plan in the caller's county. |
| `missing_call_identity` | Direct | Neither `call_id` nor `phone` was sent. |
| `existing_client_retention` | Direct | The caller is already a client of this agency and the agency handles them directly. |
| `cooldown_same_source`, `cooldown_any_source` | Direct | The caller came through recently and the campaign has a cooldown. |
| `repeat_shopper` | Direct | The caller has pinged many times recently across the network. |
| `daily_budget_reached` | Direct | The campaign's daily budget is used up. |
| `low_intent` | Direct | The buyer uses a consumer data vendor and this ping scored below its minimum. |
| `no_eligible_agent` | Direct | No licensed, appointed agent for this state. |
| `all_eligible_busy` | Direct | Eligible agents exist but all are busy. Retry later. |
| `exchange_no_buyer` | Exchange | No routed buyer accepted. Covers every buyer decline reason. |
| `error_rejected` | Both | We could not decide safely. Pings fail closed: do not transfer. |

Do not transfer unless `available` is `true`. New reasons are added only through
a contract change.

## Web leads: ping and post

Web leads use a two step flow. First a **lead ping** with no direct
identifier asks whether a buyer wants the lead and at what point it must be
delivered; then, only if it was accepted, a **post** delivers the lead.

### Lead ping: `POST /api/ping/v1/lead`

Same `x-api-key` header, admission limit and sandbox key as `/api/ping/v1`.
Send JSON with only these fields:

| Field | Required | Notes |
| --- | --- | --- |
| `state` | Yes | Two letters. |
| `zip` | No | Five digits. Checked against the buyer's county coverage when it applies. |
| `t65` or `age_band` | No | `t65` true or false, or `age_band` one of `under_65`, `turning_65`, `65_plus`. |
| `product_line` | No | `ma`, `medsupp`, `u65`, `aca` or `annuity`. |
| `sub_id` | No | Up to 128 characters. |
| `consent_cert_id` | No | TrustedForm certificate or Jornaya LeadiD token, if you have it now. |
| `campaign` | No | Direct only: your lead campaign id or name. |
| `exchange` | No | `true` sends the ping to every buyer routed from your source. |

A lead ping never carries a phone, name, email or street address. Any field not
in this table is a 400 `{"available":false,"reason":"invalid_payload"}` and
nothing is stored. The answer is:

```json
{"lead_ping_id":"7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f","available":true,"reason":"accepted_full","post_expires_at":"2026-11-18T16:01:00Z"}
```

`post_expires_at` is 60 seconds after the ping. A rejection is 200 with
`available: false` and one of `invalid_payload`, `source_paused`,
`outside_staffed_hours` (outside the campaign's lead hours; a campaign without
lead hours takes leads around the clock), `campaign_inactive`,
`state_not_allowed`, `county_not_served`, `consent_missing` (the certificate you
sent is not of the kind the campaign requires), `low_intent`,
`daily_budget_reached` or `error_rejected`. On the exchange a rejection is always
`exchange_no_buyer`; you never learn which buyer won or why another declined.

### Post: `POST /api/post/v1/lead`

Before `post_expires_at`, send the lead for an accepted ping:

| Field | Required | Notes |
| --- | --- | --- |
| `lead_ping_id` | Yes | From the lead ping. |
| `first_name`, `last_name` | Yes | Letters, spaces, apostrophes, periods and hyphens; up to 64 characters. |
| `phone` | Yes | A US number; we normalize it to E.164. |
| `zip`, `state` | Yes | Must match the ping. |
| `email` | No | |
| `address` | No | Street address, up to 200 characters. |
| `consent_cert_id` | See below | Required here unless you sent it on the ping; must match the ping when both are sent. |

**Never send** an MBI, SSN, date of birth, health conditions, medications or any
other field. Any field not in this table, or a malformed value, is a 400
`{"accepted":false,"reason":"invalid_payload"}` and nothing is stored; you may
correct the post and send it again inside the window.

Consent: every lead needs a consent certificate. A TrustedForm certificate is its
40 character hex id or its `https://cert.trustedform.com/...` URL; a Jornaya
LeadiD token is a UUID. Each buyer campaign requires `any` of the two,
`trustedform` or `jornaya`; a missing or wrong kind is `consent_missing`.

The answer is `{"accepted":true,"reason":"accepted"}` or `accepted: false` with:

| Reason | Meaning |
| --- | --- |
| `duplicate_lead` | This ping was already posted. Only the first post counts; nothing changed. |
| `lead_window_expired` | The 60 second window passed, or the ping was not accepted. |
| `consent_missing` | No certificate, or not the kind the buyer requires. |
| `existing_client_retention` | The consumer is already the buyer's client. The lead is not sold or billed. |
| `cooldown_same_source`, `cooldown_any_source` | The consumer came through recently and the buyer has a cooldown. |
| `repeat_shopper` | The consumer has been shopped many times recently across the network. |
| `error_rejected` | We could not take the lead safely. Nothing was stored; you may retry inside the window. |

An accepted lead is billed at the price set when the ping was accepted. Each
response carries only these fields; we never echo the lead back. In the
sandbox both calls answer with `"sandbox": true`, and a sandbox post is checked
but never stored, billed or delivered to a buyer.

## Sandbox

Your sandbox key behaves like your live key on both endpoints with three
differences: no agent is held, nothing is billed or metered, and the response
carries `"sandbox": true`. Every rule is still evaluated, so you can test states,
hours, field mapping and rejection handling. On the exchange, `auction_id` is
`null` in the sandbox. A call transferred after a sandbox ping is **never**
matched to it, even on the returned transfer number; do not transfer real
callers while testing. Sandbox pings do not count toward cooldowns, repeat
shopper history, buyer budgets or caps.

## Rate limits and errors

Each ping key may make 600 requests per fixed 60 second window. Over the limit
the answer is 429 with `Retry-After` in seconds and
`{"error":"admission_limited","retry_after":N}`. A missing, unknown or revoked
key is 401. 503 means the platform is disabled or could not admit the request;
treat it as unavailable and do not transfer.

## Disposition postbacks and reports

Calls that arrive from your pings are attributed to your source, so disposition
postbacks and daily CSV reports work exactly as described in
`docs/vendor-integration.md` (signing, retries, field mapping, delivery IDs). For
exchange calls the postback and report carry the same fields and never identify
the buyer agency.

## Data boundary and go-live checklist

Send identifiers, state, ZIP and coarse flags only. Never send MBI, date of
birth, names, addresses, notes or health details; unknown fields are ignored and
not stored. On the exchange, buyers that do not win never store the caller's
phone or ZIP; they keep only a one way hash used for duplicate detection. Your
call ID and sub ID are shared with the buyer that receives the call.

Provide your source name, the endpoint you will use, field-name mapping if any,
transfer identity method, postback URL and mapping, and report recipients. We
provide your ping key and sandbox key, assigned transfer number (direct), the
voice host and signing secrets. Before production traffic, jointly test in the
sandbox: an accept, each reject you handle, field mapping, a 429, and then one
live accepted transfer within the window, its disposition postback and a report.
