# EnrollGen Ping Platform Spec

Status: draft v1, 2026-11-17. Owner: Michael Shiomos.
Branch: `feature/ping-platform`, cut from tag `pilot-wave1-complete` on `pilot/release`.
Every Codex session on this work reads this file first and treats it as the source of truth. If code and this spec disagree, stop and report; do not improvise.

## 1. Purpose

Turn the Paragon-only ping, reservation, claim and billing system into a publisher-agnostic ping platform that any number of call sources can use, with a richer Filter, an optional scripted Screener, retention protection for existing clients, and a per-source scorecard. NGHS is buyer number one. Multi-buyer exchange mode is designed for but built last.

## 2. What already exists (ground truth, read before changing anything)

1. `telephony/src/routes/vendorPing.js`: POST `/api/leads/ping`, Paragon only, admission via `admit_vendor`, calls SQL `paragon_ping`.
2. `supabase/functions/get-availability` plus `supabase/functions/_shared/paragonPingAdapter.js`: second ping entry point (availability pull with ping params).
3. `supabase/migrations/052_paragon_ping_and_claim.sql`: `paragon_ping` (staffed hours, pause, allowed states, call identity key, advisory lock, agent reservation with TTL, tiered full/partial eligibility, round robin by `last_assigned_at`) and `claim_paragon_call` (arrival match within 5 minutes by vendor call id or phone, reserved agent reuse, sticky preference, atomic agent claim).
4. `051_paragon_vendor_matrix.sql`: `vendor_routing_config`, `vendor_agent_state_eligibility` (six hardcoded carrier boolean columns), `paragon_ping_decisions`, `paragon_agent_reservations`, `paragon_agent_tier`. The matrix intentionally never reads RTS.
5. `048_vendor_integrations.sql`: `lead_sources` (aggregator/publisher/direct, parent/child, per-source number, ping key hash, postback config, report emails), `lead_source_pings` (aggregator pre-transfer pings), source attribution trigger, availability push, disposition postbacks, daily CSV reports, delivery queue.
6. `067`, `076`, `111`, `126`, `131`: Paragon billing (`paragon_call_billing`, immutable once finalized), duplicate caller detection (90 days, same source, Paragon only), daily cap removal, out-of-state callback tasks, residence/ZIP capture.
7. `telephony/src/routes/twilioVoice.js` `/twilio/voice` and `/twilio/dial-result`: arrival resolution, billing callback enqueue, claim, fast reject (busy) for matched publisher calls, voicemail for known callers, sticky routing.
8. `telephony/src/paragonEligibility.js`, `paragonRouting.js`: pure JS mirrors of the decision logic used by tests.
9. Deployment profile (`telephony/src/lib/deploymentProfile.js`) has a single `paragon` section; feature flags live in `featureFlags.js` `FEATURE_NAMES`; SQL fences use `deployment_feature_enabled(flag)` (migration 150).
10. Data available for later phases: `cms_plans_py2027` (state, county_fips, carrier, plan), `cms_county_penetration`, `carrier_rts` (free-text states), `enrolled_agents.licensed_states`.

The problem: every SQL function above is hardcoded to `name='Paragon Media'`, carriers are fixed columns, and config is a single profile section. Adding a second publisher today means copying the whole stack.

## 3. Non-negotiable principles

1. Generalize, do not fork. One engine. Paragon becomes campaign number one on it. The legacy Paragon path stays untouched and live until a per-campaign cutover, then is removed in a later, separate change.
2. Paragon behavior is preserved exactly. Every existing Paragon test passes unchanged. Parity tests prove the generic engine returns the same decision as `paragon_ping` for the same inputs.
3. Default off. Every new behavior sits behind a new flag in `FEATURE_NAMES`, fenced in SQL with `deployment_feature_enabled`, absent flag means off.
4. Publisher pings fail closed (reject on any error). Direct and known callers fail open (route or voicemail), exactly as today.
5. Every decision is logged with a fixed reason code and a rule trace. No silent paths.
6. Data minimization holds: pings carry identifiers, state, ZIP and coarse eligibility flags only. No MBI, DOB, health details, or names. Phone numbers are stored as today; any cross-tenant phone comparison uses a peppered SHA-256 hash, never the raw number.
7. Migrations start at 171, are forward only, carry the header `-- UNAPPLIED: isolated pilot only`, never backfill or modify production data, and never alter `paragon_*` tables or functions.
8. No deploys, no live migrations, nothing pushed to `main`. Work stays on `feature/ping-platform`.
9. The AI screener never generates speech. It plays owner-approved fixed prompts and uses a model only to classify the caller's answers.

## 4. Concepts

1. Source: a row in `lead_sources` (aggregator or publisher). Unchanged.
2. Campaign: new. One source can have several campaigns (for example Paragon MA grocery creative vs Paragon MA general). A campaign holds the rules: product line, allowed states, carriers required and critical, pricing model and rate, billable seconds, reservation TTL, cooldown windows, daily budget, screener mode, retention mode, routing engine mode, active flag.
3. Ping: an inbound decision request from a source. Produces exactly one Decision.
4. Decision: accept or reject with a reason code, the chosen agent, the price, the rule trace.
5. Reservation: an agent slot held for TTL seconds after an accept.
6. Arrival: the actual Twilio call, matched back to a Decision.
7. Billing record: per arrived call, pricing model aware, immutable once finalized.
8. Return: a dispute record for a billed call (short duration, wrong state, duplicate, non-Medicare, existing client).

## 5. Data model (new tables, all tenant scoped, RLS on, service role only)

1. `ping_campaigns`: id, tenant_id, source_id, name, product_line (`ma`, `medsupp`, `u65`, `aca`, `annuity`), active, engine_mode (`legacy`, `shadow`, `generic`), allowed_states text[], required_carriers text[], critical_carriers text[], plan_year, pricing_model (`per_call`, `per_app`, `free`), rate numeric, billable_seconds int, reservation_ttl_seconds int (5 to 120), cooldown_same_source_days int, cooldown_any_source_days int, repeat_shopper_threshold int, repeat_shopper_window_days int, daily_budget_calls int null, screener_mode (`off`, `inbound_only`, `always`), retention_mode (`route_owner`, `reject_and_alert`), staffed_hours_override jsonb null, created_at, updated_at. Unique (tenant_id, source_id, name).
2. `agent_campaign_carriers`: tenant_id, campaign_id, plan_year, agent_id (tenant_agents.id), state, carrier (normalized key), enabled, updated_at, updated_by. Primary key (campaign_id, plan_year, agent_id, state, carrier). Replaces the six boolean columns with rows so carriers are open ended. Existence of any row for (agent, state) is the license assertion, same semantics as today.
3. `ping_decisions`: id, tenant_id, source_id, campaign_id, received_at, latency_ms, caller_phone, caller_state, caller_zip null, vendor_call_id, publisher_sub_id, consent_cert_id null, t65_flag null, available, reason (enum below), agent_id, price, rule_trace jsonb, engine (`generic` or `shadow`), matched_call_sid.
4. `ping_reservations`: generic copy of `paragon_agent_reservations` keyed by campaign_id.
5. `ping_call_billing`: generic copy of `paragon_call_billing` with campaign_id, pricing_model and rate snapshot; same immutability trigger semantics.
6. `ping_returns`: id, tenant_id, billing_parent_call_sid, campaign_id, reason (`short_duration`, `wrong_state`, `duplicate`, `not_medicare`, `existing_client`, `other`), auto_flagged bool, status (`open`, `submitted`, `credited`, `denied`), notes, created_at.
7. `ping_retention_alerts`: id, tenant_id, contact_id, owner_agent_id, source_id, campaign_id, decision_id, created_at, acknowledged_at.
8. `ping_shadow_diffs`: id, decision_id_legacy, decision_id_generic, field, legacy_value, generic_value, created_at.

## 6. Reason codes (closed list, order is evaluation order)

1. `routing_disabled`
2. `invalid_payload`
3. `source_paused`
4. `campaign_inactive`
5. `outside_staffed_hours`
6. `state_not_allowed`
7. `missing_call_identity`
8. `existing_client_retention` (accept with owner routing, or reject, per retention_mode)
9. `cooldown_same_source`
10. `cooldown_any_source`
11. `repeat_shopper`
12. `daily_budget_reached`
13. `no_eligible_agent`
14. `all_eligible_busy`
15. `accepted_full`
16. `accepted_partial`
17. `accepted_retention_owner`
18. `error_rejected`

Codes 1 to 7 and 13 to 16 must match `paragon_ping` semantics exactly (Paragon uses `vendor_paused` and `routing_unconfigured`; map them and document the mapping in a test). Rules 8 to 12 are new and each is individually disableable per campaign (null or zero means off).

## 7. Engine

1. SQL function `ping_decide(p_key_hash, p_campaign, p_payload jsonb, p_engine text)` returns jsonb `{authorized, decision_id, available, reason, agent_id, price, ttl_seconds}`. Same locking pattern as `paragon_ping` (advisory lock on source plus call identity, `FOR UPDATE SKIP LOCKED` agent pick, reservation insert).
2. SQL function `ping_agent_tier(agent_slug, state, campaign_id)` reads `agent_campaign_carriers`.
3. SQL function `ping_claim_arrival(...)`: generic `claim_paragon_call` keyed by campaign.
4. Pure JS mirror in `telephony/src/ping/decide.js` with the same rule order, used by unit tests and by the shadow comparator.
5. Engine mode per campaign: `legacy` (only the old Paragon path runs), `shadow` (old path decides; generic engine also decides with `p_engine='shadow'`, no reservation side effects, diffs logged), `generic` (generic engine decides and claims; old path skipped).

## 8. API

1. New endpoint POST `/api/ping/v1` on telephony. Auth: `x-api-key` hashed and matched to `lead_sources.ping_key_hash`, admission via `admit_vendor` route `vendorPing`. Body (field names mappable per source, like `paragonPingAdapter`): `phone` (E.164), `state`, `zip` optional, `call_id`, `sub_id` optional, `campaign` optional (defaults to the source's single active campaign), `consent_cert_id` optional, `t65` optional bool.
2. Response 200: `{decision_id, available, reason, ttl_seconds}`; `price` only when the source config allows price disclosure. 401 unauthorized, 429 admission limited with Retry-After, 503 when the flag is off.
3. Existing `/api/leads/ping` and the get-availability ping path keep working unchanged. When a Paragon campaign is in `shadow` or `generic` mode they additionally or instead call `ping_decide`.

## 9. Screener (phase 6, spec only until then)

1. Scripted, not generative. TwiML `<Gather input="speech dtmf">` with fixed owner-approved prompts. A small OpenAI model classifies the transcribed answer into a fixed label set; it never produces caller-facing text.
2. Opening line discloses an automated assistant. Disclaimer text is owner-approved config, not model output.
3. Questions (max four): on Medicare or turning 65 soon; ZIP code; reason for calling; okay to connect to a licensed agent. Press 1 is always accepted as yes.
4. Hard limits: 90 seconds total, two retries per question, any uncertainty or error fails open to a live agent. Never hangs up on a caller who said yes.
5. Bypass for warm transfers (campaign screener_mode `inbound_only`).
6. The screener segment is recorded and linked to the inbound call under the existing retention schedule. Agent receives the screener answers as call parameters.
7. Metrics per campaign: screened, passed, disqualified by label, abandoned during screen, average screen seconds.

## 10. Retention protection

1. If the pinging phone matches an existing contact with a sale disposition or active policy, the decision is `existing_client_retention`.
2. `route_owner` (default): accept, reserve the owning agent if routable, otherwise the normal pool; create a retention alert. Reason: rejecting sends the client to a competing buyer.
3. `reject_and_alert`: reject and create a retention alert for an outbound call.

## 11. Scorecard (phase 5)

RPC `ping_scorecard(p_tenant, p_from, p_to, p_group text[])` grouping by any of source, campaign, sub_id, state, day. Columns: pings, accepts, accept rate, rejects by reason, arrivals, connects, billable calls, cost, apps written, enrollments, cost per app, cost per enrollment, returns open and credited, screener pass rate. Cost uses the billing snapshot, never live config. UI lives with `VendorRoutingSettings.jsx`.

## 12. Exchange mode (phase 8, design constraints only)

Every table carries tenant_id now. Cross-tenant data is limited to a pooled phone history keyed by peppered hash, behind `PING_EXCHANGE_ENABLED`, and requires owner and counsel sign-off before any build.

## 13. Flags

`PING_PLATFORM_ENABLED`, `PING_SHADOW_ENABLED`, `PING_RETENTION_ALERTS_ENABLED`, `PING_SCORECARD_ENABLED`, `PING_SCREENER_ENABLED`, `PING_EXCHANGE_ENABLED`. All default off, added to `FEATURE_NAMES`, test fixture `tests/fixtures/deployment-env.js` updated, SQL entry points fenced.

## 14. Sessions

1. S1 Foundation: schema 171+, `ping_decide`, `ping_agent_tier`, JS mirror, `/api/ping/v1`, Paragon campaign seed (pilot only, engine_mode legacy), parity tests.
2. S2 Arrival and billing: `ping_claim_arrival`, generic billing and returns, `twilioVoice.js` integration for `generic` campaigns only.
3. S3 Filter rules: cooldowns, repeat shopper, daily budget, retention path and alerts.
4. S4 Shadow and cutover: shadow mode for Paragon, diff log, admin diff view, per-campaign engine switch.
5. S5 Scorecard.
6. S6 Screener.
7. S7 County and RTS aware eligibility (needs ZIP to county and RTS ingestion).
8. S8 Exchange mode.

Each session ends with: new tests, `npm test` in root and `telephony`, `npm run build`, `npm run lint` all passing, and a short report listing files changed, migrations added, flags added, and anything deferred.

## 15. Owner decisions (defaults used until Mike says otherwise)

1. D1 Retention mode default: `route_owner`.
2. D2 Cooldowns default off for Paragon (parity), suggested 30 days same source and 7 days any source for new campaigns.
3. D3 Repeat shopper default off; suggested 3 pings from any source within 30 days.
4. D4 Screener disclaimer and prompt text: Mike supplies before S6.
5. D5 Second publisher to model: SmartCare, per-call, details TBD.
6. D6 Price disclosure in ping responses: off.

## 16. Out of scope

Live auctions and dynamic bidding, generative voice agents, outbound dialing, commission tracking, reselling calls to other agencies before exchange sign-off, any change to `main`.
