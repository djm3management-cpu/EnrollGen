# EnrollGen Ping Platform Spec

Status: v2, 2026-11-17. Owner: Michael Shiomos.
Branch: `feature/ping-platform`, cut from tag `pilot-wave1-complete` on `pilot/release`.
Every session on this work reads this file first and treats it as the source of truth. If code and this spec disagree, stop and ask; do not improvise.

## 1. Purpose

Build a platform-grade, multi-tenant call and lead ping exchange inside EnrollGen that a major buyer (an FMO, a large agency network, or a carrier) can license and run for many downline agencies. It competes with UnifiedYield (Filter, Screen, source measurement, member monitoring) and AmeriLife LeadStar. Publishers send one ping to the platform; the platform evaluates every eligible buyer campaign across tenants, picks a winner, holds an agent, routes the call, bills it, meters platform usage, and measures every source.

NGHS's Paragon integration is the proving ground: it becomes campaign number one on the generic engine and supplies parity evidence on real traffic. It is not the product.

## 2. What exists (ground truth)

1. `telephony/src/routes/vendorPing.js` and `supabase/functions/get-availability`: Paragon-only ping entry points.
2. Migration 067 holds the live `paragon_ping` (supersedes 052): staffed hours, pause, 30 second commitment replay, allowed states, identity key, reservations with TTL, full and partial carrier tiers, round robin by `last_assigned_at`. `claim_paragon_call_at` claims on arrival.
3. `051`: `vendor_routing_config`, `vendor_agent_state_eligibility` (six carrier columns), `paragon_ping_decisions`, `paragon_agent_reservations`.
4. `048`: `lead_sources`, `lead_source_pings`, attribution trigger, availability push, disposition postbacks, daily CSV reports, delivery queue.
5. `067`, `076`, `111`, `126`, `131`: Paragon billing (`telephony/src/paragonBilling.js`, Twilio-verified arrival and billable seconds, immutable once finalized), duplicates, cap removal, out-of-state tasks, residence capture.
6. `158`: `admit_vendor` authorizes only `deployment_vendor_name()` for `vendorPing`.
7. `telephony/src/routes/twilioVoice.js`: arrival, claim, fast reject, voicemail, sticky routing.
8. Data for eligibility: `cms_plans_py2027` (county_fips, carrier, plan), `cms_county_penetration`, `carrier_rts`, `enrolled_agents.licensed_states`.
9. S1 (done, commits 9a3f706 to 2fe0f23): migrations 171 and 172 (`ping_campaigns`, `agent_campaign_carriers`, `ping_decisions`, `ping_reservations`, `ping_hours_open`, `ping_agent_tier`, `ping_decide`), `telephony/src/ping/decide.js`, `telephony/src/ping/adapter.js`, `POST /api/ping/v1`, six default-off PING flags, 34 golden parity cases against 067.

## 3. Non-negotiable principles

1. One engine. Generalize, never fork. Legacy Paragon code stays untouched until per-campaign cutover, then is removed in a separate change.
2. Multi-tenant from the ground up. Every table carries tenant_id. No tenant can read another tenant's calls, contacts, decisions, prices, or agents. The only cross-tenant data is the pooled shopper history in section 10, keyed by peppered hash.
3. Paragon parity holds: every existing Paragon test passes unchanged and the parity suite stays green.
4. Default off. New behavior sits behind PING flags, fenced in SQL with `deployment_feature_enabled`.
5. Publisher pings fail closed. Direct and known callers fail open, as today.
6. Every decision is logged with a closed reason code and a rule trace.
7. Data minimization: pings carry identifiers, state, ZIP and coarse flags. No MBI, DOB, names, or health details.
8. Migrations: next number, forward only, header `-- UNAPPLIED: isolated pilot only`, added to the fresh-install bootstrap with the repo rebuild script (as S1 did), never alter `paragon_*` objects, never touch production data.
9. No pushes, deploys, live migrations, or changes to main or pilot/release.
10. The screener never generates caller-facing speech in scripted mode. Conversational mode is a pluggable provider slot, off by default.
11. Platform scale is a requirement: sub-second p95 decisions at 50 pings per second sustained across tenants, proven by load test in S8.

## 4. Roles and concepts

1. Platform operator: the licensee running the exchange (for example an FMO).
2. Buyer tenant: an agency on the platform with agents, campaigns, caps and budgets.
3. Publisher: a lead or call source (row in `lead_sources`), connected to the platform once.
4. Campaign: a buyer tenant's rules for a product line (section 5).
5. Exchange route: which buyer campaigns a publisher's pings may reach, with priority and weight.
6. Ping, Decision, Reservation, Arrival, Billing record, Return: as built in S1 and S2.
7. Usage event: a metered platform action (ping evaluated, call routed, screener minute) billed by the operator to buyers.

## 5. Data model

Built in S1: `ping_campaigns`, `agent_campaign_carriers`, `ping_decisions`, `ping_reservations`.

Added in later sessions:

1. `ping_call_billing` (S2): generic copy of `paragon_call_billing` with tenant_id, campaign_id, pricing_model and rate snapshot, immutable once finalized.
2. `ping_returns` (S2): tenant_id, billing_parent_call_sid, campaign_id, reason (`short_duration`, `wrong_state`, `duplicate`, `not_medicare`, `existing_client`, `other`), auto_flagged, status (`open`, `submitted`, `credited`, `denied`), notes, created_at.
3. `ping_source_controls` (S2): per source and per campaign pause with audit, replacing the tenant-wide `vendor_controls.vendor_pause` for generic campaigns.
4. `exchange_routes` (S3): publisher source_id, buyer campaign_id, priority, weight, active, price override.
5. `exchange_auctions` (S3): one row per exchange ping with every buyer campaign evaluated, each decision id, the winner, and the selection strategy used.
6. `platform_usage_events` (S3): tenant_id, kind (`ping`, `routed_call`, `screener_minute`, `screened_qualified`), quantity, unit_price snapshot, source_id, campaign_id, occurred_at. Append only.
7. `platform_price_plans` (S3): operator-defined per-tenant plan: included pings, overage per ping, per routed call, per screener minute.
8. `ping_retention_alerts` (S4).
9. `shopper_history` (S4): peppered phone hash, tenant_id, source_id, seen_at. Pooled reads only through a SECURITY DEFINER count function.
10. `agent_performance` (S5): rolling conversion by agent, campaign, product line.
11. `ping_shadow_diffs` (S8 optional).

## 6. Reason codes

As built in S1 (order follows live `paragon_ping`: hours before campaign). S3 adds `exchange_no_buyer` and `buyer_cap_reached`. S4 activates rules 8 to 12. No other codes without a spec change.

## 7. Engine

1. `ping_decide` is the single-buyer decision unit. The exchange calls it once per candidate buyer campaign with `p_engine='shadow'` semantics for evaluation, then once for the winner with reservation side effects.
2. Staffed hours must use each tenant's own IANA timezone (S2 fixes `ping_hours_open`, which today accepts only America/New_York). Parity for Paragon is unaffected because NGHS is Eastern.
3. Serialization: the per-source advisory lock in S1 matches Paragon. S3 narrows it to per-campaign plus identity key so one large publisher does not serialize the whole exchange; parity tests must stay green.

## 8. API

1. `POST /api/ping/v1`: publisher-facing. Any active publisher with a ping key can authenticate (S2 generalizes `admit_vendor` for route `vendorPing` to any active `lead_sources` row with a matching `ping_key_hash`; the Paragon path is unchanged).
2. Response: `{decision_id, available, reason, ttl_seconds, transfer_number}`; `price` only when the route allows disclosure.
3. Web lead ping-post (S9): `POST /api/ping/v1/lead` with the same decision flow, then `POST /api/post/v1` to deliver the accepted lead with consent certificate.
4. Buyer API (S8): campaign CRUD, caps, pause, reports, scoped to the buyer tenant.

## 9. Exchange orchestrator (S3)

1. Publisher ping arrives once. Candidate buyer campaigns come from `exchange_routes` for that source.
2. Each candidate is evaluated with the S1 rules (hours in its tenant timezone, state, eligibility, capacity) without side effects.
3. Selection strategies, configurable per route group: `priority_waterfall` (lowest priority number with an accept wins), `weighted_rotation`, `highest_price`. Ties break on least recently won.
4. The winner gets a real reservation and its tenant's transfer number. The auction row records every candidate.
5. Per-buyer daily and hourly caps and budgets; `buyer_cap_reached` when hit.
6. Usage events are written for every evaluated ping and every routed call.
7. A buyer never sees other buyers' bids, decisions, or that they lost.

## 10. Filter rules (S4)

1. Cooldown same source and any source, per campaign.
2. Repeat shopper: pooled across tenants through `shopper_history` hash counts only. No phone numbers, tenant names, or outcomes cross tenants. Requires PING_EXCHANGE_ENABLED plus operator opt-in.
3. Retention: a ping matching an existing client of the buyer tenant follows retention_mode (`route_owner` default, or `reject_and_alert`) and creates an alert.
4. Daily budget per campaign.

## 11. Scorecards and performance routing (S5)

1. `ping_scorecard` for buyers (their own data) and for the operator (all tenants), grouped by source, sub_id, campaign, state, day. Pings, accepts, rejects by reason, arrivals, connects, billable, cost, apps, enrollments, cost per app, cost per enrollment, returns, screener pass rate.
2. Operator usage and invoice preview from `platform_usage_events`.
3. Performance routing: optional per campaign, ranks eligible free agents by rolling conversion before `last_assigned_at`, with a floor so new agents still get calls.

## 12. Eligibility from RTS (S6)

Generate `agent_campaign_carriers` from RTS and license data per state and county using `cms_plans_py2027` carrier presence by county_fips, instead of a hand-kept matrix. ZIP to county via a crosswalk table. Hand overrides remain and win.

## 13. Screener (S7)

1. Two modes per campaign: `scripted` (TwiML Gather, fixed owner-approved prompts, small OpenAI model classifies answers into fixed labels) and `conversational` (provider slot, off, not built beyond the interface).
2. Disclosure of an automated assistant first. Disclaimer text is operator config.
3. Max 90 seconds, two retries per question, uncertainty fails open to an agent, warm transfers bypass.
4. Screener audio recorded and linked to the call under existing retention.
5. Usage events for screener minutes and qualified results.

## 14. Flags

`PING_PLATFORM_ENABLED`, `PING_SHADOW_ENABLED`, `PING_RETENTION_ALERTS_ENABLED`, `PING_SCORECARD_ENABLED`, `PING_SCREENER_ENABLED`, `PING_EXCHANGE_ENABLED`. All default off.

## 15. Sessions

1. S1 Foundation: done.
2. S2 Generic publisher end to end: generic `admit_vendor`, per-tenant timezone hours, per-source and per-campaign pause, `ping_claim_arrival`, generic billing and returns, `twilioVoice.js` integration for `generic` campaigns, end-to-end test with a second publisher.
3. S3 Exchange orchestrator and platform metering.
4. S4 Filter rules: cooldowns, pooled repeat shopper, retention, budgets.
5. S5 Scorecards, usage reporting, performance routing.
6. S6 RTS and county eligibility.
7. S7 Screener.
8. S8 Buyer and publisher portals, buyer API, API docs and sandbox, load test, optional Paragon shadow.
9. S9 Web lead ping-post and consumer data vendor adapters.

Each session ends with new tests, `npm test` in root and telephony, `npm run lint`, and a short report. `npm run build` requires the real deployment profile and is checked by the owner.

## 16. Owner decisions

1. D1 Retention default `route_owner`.
2. D2 Cooldowns off for Paragon; suggested 30 days same source, 7 days any source for new campaigns.
3. D3 Pooled repeat shopper: 3 pings across the network within 30 days, off until counsel signs off on cross-agency sharing.
4. D4 Screener prompts and disclaimer: owner supplies before S7.
5. D5 Default exchange strategy: `priority_waterfall`.
6. D6 Price disclosure off.

## 17. Out of scope

Dynamic real-time bidding beyond the three strategies, outbound dialing, commission tracking, any change to main.
