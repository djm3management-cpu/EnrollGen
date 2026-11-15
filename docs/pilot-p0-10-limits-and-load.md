# P0-10 — admission controls and local load evidence

**Release acceptance is incomplete.** The local protocol checks pass, but the audit's full wall-clock churn/soak and independent PostgreSQL lock-contention checks have not been established. Do not interpret the passing unit suite as permission for real calls. The acceptance CLI exits nonzero for failed or unverified gates. The measured results below retain the original thresholds.

Work is local on `pilot/release`, after `1f3147b` (P0-8/P0-11), `bbdb334` (P0-4), and the protected identity/feature-switch work. No push, deploy, hosted database, real phone call, real STT stream or processor API was used. No environment file, dependency, stylesheet, or committed historical migration was changed. New migration **158** is also included verbatim in the checksummed bootstrap; its catalog snapshot and operator routine inventory were regenerated locally.

## Admission contract

`telephony/src/lib/admission.js` owns the named `PILOT_LIMITS`. `DEPLOYMENT_PROFILE_JSON.admissionLimits[route]` can override positive integer values (`minute`, `subjectDay`, `deploymentDay`, `concurrent`); unset fields keep the defaults below. This server-only profile is not exposed by the public projection. These are **request/connection budgets**, not dollar estimates or substitutes for account spend controls. Existing payload bounds, retry bounds, feature switches, scoring claims and the 2,000,000-token scoring ceiling remain in force. One admitted LLM request can make up to the existing four bounded attempts; an embedding handler can make up to four bounded batches. These multipliers must be included in a later spend plan.

| Entry point | Constant | Per minute per verified subject/key | Per subject UTC day | Per deployment UTC day |
|---|---|---:|---:|---:|
| `POST /api/leads/incoming` | `vendorLead` | 120 | — | — |
| `POST /api/leads/ping` | `vendorPing` | 600 | — | — |
| `GET/HEAD get-availability` | `availability` | 600 | — | — |
| `POST /api/voice/token` | `voiceToken` | 12 | — | — |
| WebSocket `/agent` | `agentSocket` | 30; also 3 simultaneous sockets | — | — |
| `POST /api/sms/send` | `sms` | 20 | 300 | 3,600 |
| `GET /api/sms/gifs` | `gifs` | 60 | — | — |
| `coach` (including streaming) | `coach` | 120 | 6,000 | 72,000 |
| `deepgram-token`, `transcribe`, background gap fill, Deepgram backfill | `transcription` | 12 | 100 | 1,200 |
| Live server STT initial connections **and reconnects** | `sttStream` | 30 | 240 | 2,880 |
| `score-call-background`, `compliance-review-background` | `scoring` | 30 | 100 | 1,200 |
| `weekly-coaching`, RTS model chunks, knowledge model entries | `summary` | 30 | 100 | 1,200 |
| `embeddings`, `transcript-import` | `embeddings` | 30 | 100 | 1,200 |
| Paragon vendor report, including invalid credentials | migration 055 sliding window | **30 per trusted address per 5 minutes** | — | — |

Agent allowances use the verified Clerk subject after protected deployment membership resolution. Background work resolves the subject from protected persisted call ownership, never a supplied agent/name/tenant. Interactive knowledge work uses its verified admin subject; secret-authorized knowledge jobs share `service:knowledge-update`. SMS and provider work start only after admission. Vendor intake hashes its timing-safe verified configured key. Ping/feed admission verifies an active stored hash before consuming an allowance, then retains the original vendor/consumer checks. `agent_id`, `vendor_source`, phone and forwarded-address changes cannot obtain a fresh allowance.

The service-only `consume_admission` RPC locks all hashed keys in sorted order, checks **all** windows, and increments them in the same transaction. A denied check increments none. Subject and deployment daily rows are therefore shared across function instances. The new counter table has RLS, no browser privileges, and stores SHA-256 hashes instead of raw subjects/keys. A missing migration, malformed RPC response or database failure fails closed with 503. Exhaustion returns 429, `Retry-After`, and a retry time; JSON agent responses include `retry_at`. Rate-limited work is never refunded after an uncertain result. UTC fixed windows can permit bursts across a boundary; they are not a sliding traffic shaper. Counter pruning removes at most 10,000 rows older than one day per hourly telephony sweep; operators must monitor/prune larger installations. `admission_limited` events contain only route and retry duration.

`/agent` uses synchronous process-local reservations, before asynchronous identity lookup/upgrade completion. It limits connection attempts and simultaneous sockets by the signed subject and releases each slot once. This is deliberately single-process.

**Audit reconciliation:** migration 055 already contains an advisory transaction lock around its sliding count/insert. It was not changed. New `authorize_paragon_report_limited` takes the same lock and preserves the original authorization/access-log routine while exposing a distinct rate-limit result (429, conservative 300-second retry). The HTTP handler now reads only Netlify's overwritten `x-nf-client-connection-ip`; missing headers share `unknown`. `x-forwarded-for` is never consulted. This assumes invocation through Netlify's trusted ingress, not direct exposure behind an arbitrary proxy.

## Browser, media and replica boundaries

The deployment profile supplies exact `browserOrigins`, `authorizedParties`, and `tokenAudiences`. Defaults are the exact application origin, that same authorized party, and the deployment organization ID. Overrides must use exact HTTPS origins in `allowedHosts`; no wildcard is accepted. Both Clerk verifiers enforce the profile, including explicit required audience/party claims after signature verification. Legacy environment audience/party/CORS variables cannot broaden it. Configure the pilot Clerk JWT template with the selected audience before use. Browser Origin mismatches fail 403; absent Origin remains valid for authenticated server clients. CORS is not used as authentication. Agent HMAC tokens also carry and enforce the deployment audience; old audience-less tokens need refresh. Provider media tokens retain their separate purpose, account, call and lease binding.

MMS download defaults: exact `api.twilio.com` host (optional validated `messageMediaHosts`), HTTPS, no credentials/custom port/hash, redirects rejected, **5 MiB maximum**, **10-second total header/body timeout**, at most ten attachments. Both declared and streamed size are checked; the reader is canceled on failure and only bounded chunks are buffered. Authentication is sent only after URL validation. Failure retains the existing provider reference for reconciliation; the audited browser attachment route still requires a stored, authorized object and does not fetch arbitrary fallback URLs. Real Twilio redirect/CDN behavior remains a paid-canary check.

Telephony announces `replicas:1`, lack of distributed fan-out and the operator's replica obligation at startup. Known replica-count variables (`RAILWAY_REPLICA_COUNT`, `WEB_CONCURRENCY`, `TELEPHONY_REPLICAS`, `REPLICAS`) refuse anything other than one. No count variable means a clear startup warning, not a claim that the hosting dashboard was inspected. Express no longer trusts arbitrary proxies. Keep the Railway service at one replica; adding replicas requires a separate transcript fan-out design.

## Normal-use arithmetic

An 8-hour shift contains **1,920** 15-second heartbeats per agent, **23,040** for twelve, or **48/minute** overall. Those renew the existing presence lease and do not issue tokens, reconnect sockets or consume paid allowances. Three open tabs fit the socket cap; a normal single socket and occasional reconnect are far below 30/minute. Hourly voice refresh is eight/day; even refreshing the 15-minute agent token every 12 minutes is only forty/day, far below twelve/minute.

A feasible shift example is twenty 20-minute calls plus four minutes wrap-up each: 400 + 80 = 480 minutes. With forty coaching requests/call, that is 800 requests/subject/day, 9,600/deployment/day, and about two/minute during conversation, versus 6,000/72,000 daily and 120/minute. Even the audit's deliberately unrealistic forty-call/day scenario needs only 1,600/19,200 coaching requests. Forty 20-minute calls already require 13h20m talk time and cannot be claimed to fit an eight-hour shift.

At forty calls/day, two initial STT tracks require eighty connections/subject and 960/deployment; the 240/2,880 connection budget leaves 160/1,920 reconnects of daily headroom while preserving the existing per-call reconnect fence. Two browser token requests/call use eighty of the 100 transcription units. One scoring, summary or embedding request/call uses forty of 100, or 480 of 1,200 deployment units. Two SMS/call use eighty of 300, or 960 of 3,600. Vendor twenty-call arrival bursts fit 120 lead/minute and 600 ping/minute; one-second feed polling is sixty/minute, one tenth its cap.

These request budgets do **not** make all scoring affordable: the unchanged 2M-token ceiling permits only about 141 calls at a 14,096-token reservation, not 480. Sales fraction, prompt size, provider quotas and approved spend remain release gates; this item does not silently raise that cap. Administrative RTS/knowledge work shares the summary pool and may be rejected during a large batch; it is not an ordinary agent call flow.

## Local harness and commands

`local-load.mjs` installs the external-network fence before importing application code. It reads a committed synthetic fixture, replaces tenant/org/personas with generated synthetic identities, explicitly disables optional features, and supplies fake service credentials only in process memory. It never loads environment files. Targets must be localhost; configured remote URL targets and current-agency identifiers are rejected. Fake account/project labels, synthetic-only data, 100-call maximum and duration bounds are mandatory. `run-local.mjs` supplies an outer process deadline (30 seconds short, 120 seconds long), including bootstrap/shutdown, and kills a stalled child. Unknown wrapper arguments fail closed. No real provider transport or recording URL is followed.

```sh
npm test
npm test --prefix telephony
npm run pilot:load:short -- --output /tmp/p010-short.json
npm run pilot:load:long -- --output /tmp/p010-long.json
# Separate conference cohort, fake providers only:
node --import ./telephony/tests/fixtures/deployment-env.js --test telephony/tests/conferenceCalling.test.js
```

Run acceptance commands separately from the full suites for interpretable latency and memory samples. Initial parallel benchmarks exceeded both commands' process deadlines under concurrent suite/build load; those failures were retained during development and the recorded acceptance samples below were rerun separately. A nonzero acceptance exit is expected while any gate below is failed/unverified; do not treat it as a deployment-ready pass. An initial sixty-second cohort also caught a harness bug: its fake browsers stopped heartbeating during the media phase, so the real 45-second leases expired and a later claim correctly failed. The harness now continues the 15-second pong/renewal schedule during that phase. The normal test suite asserts the short **local component** contracts and preserves explicit false/unverified platform gates.

The fresh-install bootstrap creates an empty in-process PostgreSQL (PGlite) database. Twelve generated personas have varied NY/NJ, CA/NY and FL/NY licenses and protected enrolled/roster/availability/recording mappings. Actual `phonePresence` logic receives ready/pong/disconnect events from fake browser sockets. Signed fake Twilio callbacks use the installed Twilio signing/verification implementation. Actual routing reservations, transcript persistence/finalization, recording callback deduplication/linkage, disposition storage and post-call queue/worker fencing execute against SQL. The fake recording store supplies only synthetic object metadata; it is not a real storage upload. Fake post-call completion/failure results replace paid providers.

Short: one twenty-call burst (twelve reservations, eight explicit voicemail outcomes), plus two caller-hangup/stale-release fault calls, 48 transcript segments, and a separate forty-track cohort. Long: four twenty-call bursts, 1,920 transcript segments, the same separate forty tracks paced in 160-byte/20ms synthetic mu-law frames for sixty wall seconds. Call timestamps span twenty **synthetic** minutes; this is not twenty wall minutes of live calls. Forty production `openDeepgramTrack` state machines use injected fake sockets, with deterministic fake final recognition. No real audio recognition or browser device is exercised.

Fault assertions cover duplicate routing after a lost response, duplicate recording/final callbacks, reordered terminal status, caller hangup, stale release after a new reservation, socket disconnect, expired/tampered tokens, foreign signed audience, a delayed response, STT rate-limit/error/disconnect with two bounded test reconnects and visible exhaustion, and worker expiry/restart. Ambiguous post-call worker work is durably failed, **not automatically replayed**; only the local synthetic fixture explicitly rearms it. Existing earlier suites additionally cover actual handler signature/account checks, recording and upload failure/retry paths, admission/auth negatives, and the separate conference hold/add/transfer/remove/restart/flag-off cohort. Those focused suites supplement this adapter harness; they are not claimed as one full browser-to-provider end-to-end run.

## Measured results

Recorded artifacts: [short](pilot-p0-10-load-short.json), [long](pilot-p0-10-load-long.json). Both commands completed their local workloads and exited **1** because two audit gates remain failed/unverified. Each has **13 passing local gates and 2 failed/unverified gates**. The 15-second acknowledgment ceiling is an explicitly stated local Twilio deadline proxy; actual provider acceptance remains unverified.

| Gate (original threshold) | Short measured | Result | Long measured | Result |
|---|---:|---|---:|---|
| Unauthorized successes (0) | 0 | PASS | 0 | PASS |
| Double assignments (0) | 0 | PASS | 0 | PASS |
| Cross-agent evidence leaks (0) | 0 | PASS | 0 | PASS |
| Missing connected-call/recording links (0) | 0 | PASS | 0 | PASS |
| Extra stored recording rows after duplicate callbacks (0) | 0 | PASS | 0 | PASS |
| Presence removal (<60,000 ms) | 2.951 | PASS | 3.019 | PASS |
| Routing p95 (<2,000 ms) | 6.083 | PASS | 5.731 | PASS |
| Signed callback ack p99 (<15,000 ms local proxy for provider deadline) | 6.236 | PASS | 6.018 | PASS |
| Live fake transcript p95 (<3,000 ms) | 1,065.853 | PASS | 1,073.106 | PASS |
| Eligible local post-call p95 (<120,000 ms) | 203.950 | PASS | 633.851 | PASS |
| Remaining queued/running requests (0) | 0 | PASS | 0 | PASS |
| Exhausted requests with visible errors (all) | 1 / 1 expected | PASS | 4 / 4 expected | PASS |
| RSS tail growth (no growth in sampled interval) | 0 | PASS | -340148224 | PASS |
| Real-duration churn/soak (at least 3,600 seconds) | 1.200 | FAIL / unverified | 60 | FAIL / unverified |
| Independent database lock timing | unmeasured | FAIL / unverified | unmeasured | FAIL / unverified |

| Additional metric | Short | Long |
|---|---:|---:|
| Workload wall seconds | 1.655 | 62.662 |
| Main calls / overflow | 20 / 8 | 80 / 32 |
| Transcript segments | 48 | 1920 |
| Stored synthetic recordings | 12 | 48 |
| False overflow rate | 0 | 0 |
| Lease conflicts | 0 | 0 |
| Transcript persistence p95 ms | 1.664 | 1.232 |
| Peak RSS MiB | 1,426.922 | 1,276.953 |
| RSS tail change MiB | 0.000 | -324.391 |
| Event-loop p99 ms | 12.689 | 12.714 |
| CPU ms | 528.305 | 4,318.594 |
| Database lock time | unmeasured | unmeasured |
| Queue backlog | 0 | 0 |
| Provider spend USD | 0 | 0 |
| Local request p50 ms | 0.833 | 0.955 |
| Local request p95 ms | 10.974 | 5.956 |
| Local request p99 ms | 17.096 | 11.417 |

The two failed/unverified gates have not been redefined: 1.2/60 seconds of paced media do not meet a 60-minute churn/longer soak, and PGlite supplies no independent backend lock-time measurement. No native local PostgreSQL/Supabase stack was available. The large RSS numbers include the embedded WASM database; observed flat/falling tail RSS during sixty seconds does not establish production memory sizing or full-duration stability. The local request/ack/queue timings exclude real network/provider work.

Metrics are synthetic IDs/counts/timings only. Request percentiles measure local SQL/adapter operations, acknowledgments measure signed callback adapter completion, routing measures the actual claim RPC, live lag measures fake provider frame-to-transcript delivery, and queue age measures local post-call completion. These are not hosted HTTP percentiles. RSS includes PGlite/WASM in the same process and cannot size the separate production database/telephony services. The memory gate samples second-half versus final RSS during the bounded media phase, not the audit's full-duration churn.

## Remaining acceptance work and paid layer

The local layer cannot establish independent PostgreSQL backend contention/lock wait (`db_lock_time_ms:null`), deployed Netlify/Supabase/Clerk/Storage/Realtime behavior, twelve real browser devices, PSTN routing/audio, provider deadlines/quotas/receipts, real recording bytes/recovery, multi-replica hosting state, twenty-minute real call aggregation, sixty-minute churn, a longer wall-clock soak, or bounded memory/backlog under that full churn. A 25ms delayed adapter response is not a substitute for real database lock contention. Overflow outcomes are asserted, but this harness does not prove a staffed voicemail follow-up owner/SLA. Real worker kill mid-upload and complete integrated browser-to-provider failure recovery remain later acceptance work. No gate was loosened to conceal these limitations.

`node scripts/pilot/paid-canary.mjs /path/to/reviewed-plan.json` is a **preparation-only entry point**; it was not run. It refuses missing explicit `disposableHosts`, matching current-agency identifiers, absent/invalid synthetic data constraints, more than 100 calls/two hours, and a missing/invalid spend ceiling (maximum $25). Every target host must be explicitly allowlisted. Even a valid plan has transport execution disabled and exits nonzero. There is no path in this entry point that connects to a database or provider. Implementing/enabling a later execution adapter requires separate authorization, metered pre-reservation/stop logic and reconciliation of ambiguous paid results; an allowlist alone does not authorize it.

Before that later separately authorized pilot test:

1. Approve isolated disposable Supabase, Clerk, Netlify and Railway hosts/project/account IDs and independently owned test numbers. Reconfirm no existing-agency identifiers, destinations, data or credentials. Confirm all optional integrations off, conference off, single telephony replica, trusted ingress, profile origins/parties/audiences, processor agreements and retention.
2. Verify Twilio subaccount CPS, concurrent-call/leg/participant/API ceilings and queue delay. Budget at least 24 legs for twelve conversations plus voicemail/retry/transfer headroom; confirm signing URLs, geographic/carrier permissions, account binding and recording callbacks/storage.
3. Confirm the specific Deepgram project allows **40 streams plus headroom**, prerecorded quotas and required intelligence features. A secondary project may allow only one stream. Check real 429/disconnect/recovery, CDN/media allowlist, download limits and recording recovery.
4. Confirm OpenAI/Anthropic model access, RPM/TPM, project/org shared limits, fallback/shadow policy and hard spend controls. Include retry/batch multipliers. Preserve the 2M local scoring token cap and measure actual sales fraction/reservations.
5. Confirm Supabase compute, pool/connections, RPC lock/query latency, Realtime joins/messages, Storage/egress, private bucket policies, audit durability, retention and backup/restore. Repeat bootstrap/catalog/access tests through a disposable **real local** PostgreSQL/Supabase stack before hosted load.
6. Confirm Railway RAM/CPU and one replica, Netlify function concurrency/runtime/background acknowledgment and credit limits. Instrument CPU/RSS/event-loop delay, queue age and failed/exhausted jobs. Agree the audit's routing <2s p95, transcript <3s p95, post-call <120s p95, provider acknowledgment deadline and stability gates before execution.
7. Review a small capped call/minute/spend plan; add transport enforcement, per-action spend reservation, automatic stop, operator alerts and ambiguous-result reconciliation before enabling any paid adapter. Use generated personas/audio only, owned destinations/sinks, safe IDs, and a separate conference cohort without changing the default switch.
8. Run the complete real twenty-minute sustained-call, sixty-minute churn and longer bounded soak cohorts, independent PostgreSQL contention and all faults. Preserve results; reconcile every terminal call/recording/transcript/disposition/intake/job/grant/billed request. Obtain owner approval before real beneficiary calls.

## Validation

| Check | Result |
|---|---|
| Unchanged starting root suite | 1,242 passed, zero failures/skips |
| Unchanged starting telephony suite | 323 passed, zero failures/skips; localhost listener permission required |
| Full root `npm test -- --test-concurrency=4` | **1,265 passed**, zero failures/skips; includes the short local workload, two independent empty bootstrap/catalog builds and the protected access matrix |
| Full `npm test --prefix telephony` | **327 passed**, zero failures/skips; independent import-boundary check passed |
| Separate conference cohort | **48 passed**, zero failures/skips; fake providers and localhost listener only |
| Environment-free source-copy `npm run build` | **Passed**, all `.env*` and `.git` excluded, existing dependencies linked, synthetic server profile and PATH only |
| LLM typecheck; ESLint on changed/new JavaScript; `git diff --check` | **Passed** |
| Short and long acceptance commands | Completed local cohorts; **exit 1**, 13 local gates pass and 2 audit gates remain failed/unverified in each |

Localhost listener escalation was used only for synthetic HTTP/WebSocket test servers; the network fence remained active. No installed native PostgreSQL/Docker stack or hosted environment was used. The final commit and clean-tree status are supplied in the session handoff.

Older scoring/provider unit fixtures now explicitly inject the admission boundary where those tests intentionally reconstruct only their earlier schema. They retain their prior scoring, ownership, quota, idempotency and failure assertions. New admission tests execute migration 158 against the full empty bootstrap; both the counter and all daily rules are tested under concurrent submissions, key-spoof attempts and database failures. The production defaults always execute admission and fail closed; there is no environment bypass.
