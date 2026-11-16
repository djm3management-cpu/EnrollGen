# Supervisor floor and silent listening

Local feature on `pilot/release`, after `4357fd9`. Both switches default off. No push, deploy, hosted database, real provider request, new dependency, vendored file, real environment-file change, historical migration edit, stylesheet change or active-secret-exception change. Migration **166_supervisor_floor.sql** and its exact bootstrap copy, manifest, catalog snapshot and routine inventory are included together.

## Floor

`GET /api/supervisor-floor` and the direct function handler require verified Clerk authentication and the existing protected deployment resolver on every request, including conditional requests. Protected managers see exactly their approved enrolled-agent UUIDs; protected admins see the agency. Roster team labels only supply the admin filter. Mutable roster roles and supplied actor/tenant/team fields cannot authorize access. Target agents also require complete active deployment bindings.

The endpoint projects agent UUID/name/team, display status and source timestamp, connected timestamp, direction, known code-owned call/product types, current-call flag category/count and listen eligibility. It excludes consumer identity, contact IDs, provider identifiers, transcript/flag text, arbitrary metadata and credentials. Lead source is omitted. Flags come from the existing live co-pilot's unaddressed `compliance_flags`, linked through the current call's active session. The two existing hard-stop tags become fixed rule categories; other tags become `other`.

| Status | Existing source |
|---|---|
| On call | Live answered `telephony_call_attempts`, with no ended canonical call or ended conference. Connected time is `answered_at`. |
| On hold | The same call and `call_conferences.customer_held`. Hold changes use the existing timestamped conference events; the call timer still uses answer time. |
| Ringing | A current nonterminal attempt, or an existing reservation without terminal call evidence. |
| Wrap-up | Existing `call_wrap_ups.status = pending`, using its end/update timestamp. Wrap-up is supported. |
| Available / Callbacks only / Busy | Existing manual availability, with a live phone-presence lease. Busy means manual busy without a current call. |
| Offline | Existing offline availability or missing/expired phone presence. |

Live call state wins over availability. Ended call records, ended conferences and terminal attempts suppress stale reservations; the saved resume intent supplies the post-call display when availability has not caught up. No availability, reservation, presence, routing, call-session, recording, transcription or call-control record is written by this feature. A missing historical transition timestamp is displayed as `--` rather than invented.

There is one three-second, non-overlapping, compact poll, following the application's existing live-state polling convention. ETags omit the current server clock; unchanged data returns an empty 304 plus a fresh server timestamp. Admission and authorization still run. Browser timers advance from that timestamp using monotonic `performance.now()`, independent of browser wall-clock changes. Polls and ticks pause while hidden; focus resumes immediately. Lock, identity changes, unmount and hidden tabs stop playback and cancel obsolete work.

The header counts the entire authorized scope and shows the longest connected call. Connected calls sort longest first, then ringing, wrap-up, available, callbacks only, busy and offline. Filtering is local by status and, for admins, team. The entry is absent for ordinary agents and when the floor switch is off. Existing card classes and theme tokens are reused, with no helper copy or font weight above 500. `styles.css` and the design-token stylesheet are unchanged.

## Listen

`POST /api/supervisor-floor` with the listen action mints a cryptographically random, **45-second**, single-use capability bound to the verified supervisor/session, tenant, agent and exact attempt. Only its SHA-256 is stored. Reissuing invalidates that supervisor's unused grants. The browser sends the capability and a fresh session JWT in the first frame of `/supervisor-listen`, never in a URL. The phone server verifies the existing Clerk audience/party boundary and exact browser Origin, then independently redeems the grant transactionally against current protected membership, manager scope, connected call, active media lease and conference state. A local authenticated tap for that same attempt/tenant must also exist.

The application and phone server both use the existing strict feature parser. `SUPERVISOR_LISTEN_ENABLED` has no effect without `SUPERVISOR_FLOOR_ENABLED`. Off routes return 404 before client/auth work; the phone WebSocket server and upgrade branch are not created when listening is off. Floor-only mode has no Listen actions.

The tap observes already authenticated, answered media **after the existing transcription send**. Its bounded, synchronous fan-out does not await supervisors. A supervisor with more than 32 KiB pending output drops copies; producer delivery continues. Listener exceptions are isolated. The Web Audio player decodes existing G.711 mu-law with the repository's codec, plays both tracks together at 8 kHz, bounds scheduling/source counts and closes all output on stop. No microphone capture, recording, audio persistence, provider request, call redirection or call participant is introduced. The agent receives no listen notification or screen change.

**Unavailable audio:** conference Listen is disabled, including conversion while listening. Per-participant streams and private hold/transfer boundaries are deliberately not mixed. Direct outbound calls also show Listen unavailable when they have no existing authenticated server audio stream; the existing outbound browser-transcription path is unchanged. This implementation cannot relay audio the phone server never receives, and does not add provider streams to obtain it.

A fresh JWT and database authority/call check are required every three seconds. Missing renewal, token/session expiry, lock, revoked scope, ended call/media or a feature shutdown terminates playback. The local authorization deadline is at most six seconds; database leases last eight seconds for crash reconciliation. The existing lock/unlock event sink is used, without a new lock store. A lock also prevents minting until the existing unlock event arrives. Lock diagnostics are actor-wide, matching their existing payload, so another tab's lock conservatively ends listening too.

`DEPLOYMENT_PROFILE_JSON.supervisorListen` supports:

```json
{"maxSeconds":1800,"perCall":2,"perAgency":6}
```

Those are the defaults. Valid maxima are 7,200 seconds, 10 listeners/call and 100/agency. A transaction lock serializes per-agency admission and the database enforces one active listen per supervisor across sessions/processes. Existing named admission entries are `supervisorFloor` (40 requests/minute) and `supervisorListen` (6/minute); profile overrides use the existing admission parser/counters. Grant minting and WebSocket redemption both consume the listen allowance. At most sixteen unauthenticated handshakes are pending in one process. The existing single-replica telephony requirement remains in force.

## Audit and lifecycle

Redemption commits a session, exactly one evidence `play` record and one administrator start record in the same transaction. Either insert failure rolls back grant use and the session, so no audio is released. Stop appends end records and saves the end time/duration. A five-second local sweep retries expired/crashed sessions idempotently; audit failure remains visible through the structured logger and existing audit alerts. The existing append-only trails are not updated. Session history stores only identifiers and times, never media.

Protected admins open **Listen history**, with stable 100-row keyset pages of supervisor, agent, call, start and duration. Managers and agents cannot read it. Grants/history have RLS and no browser grants; service INSERT/UPDATE is closed and scoped routines perform those operations. Retention uses the existing audit period, immutable anchors, reference/hold planner and operational classification for ephemeral grants.

Consumer lifecycle adds the distinct `listen` event with fixed summary **Supervisor listened to call**, the recorded supervisor as staff, and the session evidence reference. Canonical links can resolve through the existing attempt if the call record was linked after listening started. The existing audit-packet evidence index includes that reference, with no audio/file artifact and no new completeness check. Historic listen events remain evidence even after a feature is disabled.

## Validation and limits

Tests use disposable in-process PostgreSQL, synthetic identities, local WebSockets and stubbed providers under the existing external-network fence. The larger schema exhausted the long-lived PGlite access fixture's stack after catalog-wide denial scans. Each authorization scenario now gets an independent database; all earlier table/column/policy/routine assertions remain unchanged. No stack limit, grant, authorization rule or security assertion was relaxed.

Focused coverage includes every status, stale availability and ended-call precedence, protected team/agency scope, revoked bindings, safe flag projection, conditional reauthorization, grants bound to actor/session/call, replay/expiry, both audit failure rollbacks, caps, lock/revocation/end/deadline cleanup, crash sweeping, browser codecs/timers/poll cancellation and passive-tap failure/slow-consumer isolation. The real media harness verifies that all original frames still reach transcription when the observer throws. The full verification result is recorded below before commit.

Not verified: hosted database/identity behavior, native PostgreSQL independent-backend races, real telephony audio/playback latency, large production rosters/history, or deployed routing. Browser visual acceptance in Terminal/light themes could not run because the computer-use browser host is unavailable. A local synthetic preview was prepared with auth/network stubs, then stopped; no real application session or provider was opened. Existing pilot platform/load/launch and secret-rotation limitations remain unchanged. The submitted request ended at `TESTS 2. The`; no additional test text was received.

Final local verification before commit:

| Check | Result |
|---|---|
| `npm run verify` | **PASS, 10/10 steps** on the complete staged implementation. |
| Root tests | **1,685 passed**, zero failures/cancellations/skips. |
| Telephony tests and independent import boundary | **349 passed**, zero failures/cancellations/skips. |
| Fresh-install/bootstrap/catalog check | **9 passed**, including independent empty builds and the complete catalog comparison. |
| Environment-free synthetic production build and built headers | Passed; no real environment file loaded. |
| ESLint and language-model types | Passed, with only the four existing hook warnings. |
| Root and telephony npm audits | Zero vulnerabilities at every severity; registry audits were the only authorized external requests. |
| Agency and tracked-secret scans | Passed; the existing active exception and December 15 review date are unchanged. |
| Scope | Local `pilot/release` only; no push/deploy, dependencies, stylesheets, historical migrations or real environment files changed. |
