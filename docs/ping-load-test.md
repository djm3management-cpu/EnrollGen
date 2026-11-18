# Ping platform load test

**The spec target is not yet proven.** Spec 3.11 requires sub-second p95
decisions at 50 pings per second sustained across tenants. What exists after S8a
is a load script, a local single connection baseline and a regression test.
The target needs the staging run below, done by the owner. No staging database,
deploy or live migration was used in S8a.

## What the script does

`scripts/ping_load.js` drives `ping_decide` (direct publisher pings) and
`exchange_ping` (exchange pings) at a fixed open loop rate for a fixed duration.
It reports client latency p50, p95, p99 and max (overall, exchange and direct),
the achieved rate, error rate (failed calls plus `error_rejected` decisions),
decision reasons, and **double reservations**: pairs of live reservations on the
same agent whose windows overlap, created during the run. That count must be
zero; the script exits nonzero when it is not, or when any error occurred.

| Command | Rate | Duration |
| --- | ---: | ---: |
| `npm run ping:load:short` | 50 a second | 10 seconds |
| `npm run ping:load:long` | 50 a second | 300 seconds |
| `node scripts/ping_load.js --rate N --duration S --exchange-share F --output FILE` | 1 to 200 | 1 to 1800 seconds |

`--exchange-share` (default 0.5) is the fraction of pings sent to the exchange;
the rest are direct. Pings use synthetic `+1555` numbers and call ids prefixed by
a run id. A hard process deadline of duration plus three minutes applies.

## Local baseline (PGlite, one connection)

Without `PING_LOAD_DATABASE_URL` the script builds an in-process PGlite database
from the test harness: migrations through 184, three exchange buyers in Eastern,
Central and Pacific time with ten agents each, and a direct publisher with two
campaigns and nine agents. Reservations older than two seconds are expired to
emulate transfers so agents keep cycling. Requests run one at a time because
PGlite has one connection; a ping that overruns its slot is skipped and counted.

Measured on the development machine (Apple silicon), `npm run ping:load:short`:

| Metric | All | Exchange | Direct |
| --- | ---: | ---: | ---: |
| p50 | 10.6 ms | 14.4 ms | 4.9 ms |
| p95 | 17.0 ms | 19.2 ms | 6.5 ms |
| p99 | 36.4 ms | 50.6 ms | 17.5 ms |
| max | 74.2 ms | 74.2 ms | 26.6 ms |

495 of 500 planned pings were sent (49.5 a second; 5 skipped behind a slow
ping), 0 errors, 0 double reservations, 154 accepted. This shows the cost of one
decision with the exchange evaluating three buyers. It says nothing about lock
contention, connection pool limits, network round trips or a production sized
`ping_decisions` table, so `spec_target.met` is reported as `null` here.
`telephony/tests/pingLoadBaseline.test.js` runs a shorter version in the suite.

## Staging run (owner)

Use a disposable staging Supabase project, never production, with migrations
through 184 applied by the owner. All fixtures must be synthetic.

1. **Fixtures.** In staging, provision through the operator routines and seeds
   you already use:
   - one exchange publisher (`lead_sources` type `publisher`, active, `sandbox`
     false) with its `exchange_sources` row and routes to at least three buyer
     campaigns in different tenants and time zones;
   - one direct publisher with one active `engine_mode='generic'` campaign;
   - per buyer campaign: `transfer_number`, staffed hours open for the whole
     test window, allowed states (for example TX and FL for the exchange, KS and
     MO for direct), and at least 20 active agents in `agent_availability`
     with `agent_campaign_carriers` rows for those states and carriers;
   - the phone pepper provisioned (`provision_ping_phone_pepper`);
   - a ping key for each publisher. Keep the plaintext keys for the run only.
   Do not enable cooldowns, repeat shopper, budgets or caps on these campaigns
   unless that is what you are measuring.
2. **Environment.** Run from a machine near the staging region:

   ```sh
   export PING_LOAD_DATABASE_URL='postgresql://...'   # staging, direct (not pooled through PgBouncer transaction mode)
   export PING_LOAD_ALLOWED_HOST='db.STAGING_REF.supabase.co'  # must equal the URL host
   export PING_LOAD_CONFIRM=synthetic-staging
   export PING_LOAD_EXCHANGE_KEY='...'   # exchange publisher ping key
   export PING_LOAD_DIRECT_KEY='...'     # direct publisher ping key
   export PING_LOAD_DIRECT_CAMPAIGN='...' # optional: campaign id or name
   export PING_LOAD_STATES=TX,FL PING_LOAD_DIRECT_STATES=KS,MO
   export PING_LOAD_CONNECTIONS=20      # pool size, at most 100
   export PING_LOAD_CHURN_MS=2000       # optional: expire reservations older than 2 s to emulate transfers
   npm run ping:load:short && npm run ping:load:long -- --output ping-load-long.json
   ```

   The script refuses a non-local host unless it equals `PING_LOAD_ALLOWED_HOST`
   and `PING_LOAD_CONFIRM` is set, and never prints the URL or the keys. Each
   pooled session sets the service role claims and the
   `PING_PLATFORM_ENABLED` and `PING_EXCHANGE_ENABLED` feature header, the same
   way PostgREST calls arrive.
3. **Pass criteria** (from the long run): `achieved_rate` at least 49,
   `latency.all.p95_ms` under 1000, `errors` 0, `double_reservations` 0.
   `spec_target.met` is true only when all hold. Also check in staging that no
   `error_rejected` decisions carry sqlstate `40P01` (deadlock) or `55P03`
   (lock timeout) in `rule_trace`.
4. **Cleanup.** Load decisions, auctions and usage events are append only by
   design. Use a disposable project, or filter reports by the run's call id
   prefix.

### What the staging run proves that PGlite cannot

- Lock narrowing (migration 184): pings for different campaigns and call
  identities no longer queue behind one per source lock, and the exchange holds
  the `exchange_sources` row only for weighted rotation.
- Agent safety under real concurrency: `FOR UPDATE SKIP LOCKED` on agent rows
  plus the fresh `ping_agent_held` re-check keep `double_reservations` at zero.
- Budget and cap exactness under concurrency (per campaign lock from the count
  to commit).

To exercise weighted rotation contention, set the exchange publisher's strategy
to `weighted_rotation` for a second long run and compare p95.
