# P0-7: session lock

Implemented on `pilot/release`. No push, deployment, live database access, migration execution, dashboard changes, or `.env` edits were performed. P0-1 authentication checks and P0-3 authorization helpers remain in force.

## Audit scope and decisions

The source-of-truth review found these relevant passages:

- `PILOT_READINESS.md`, ranked item P0-7: remove button/hash dismissal; require fresh authentication or reverification; clear identity-bound caches on sign-out/user change; configure invite-only Clerk, MFA, and session duration; test shared-browser switching and inactive-user revocation.
- The readiness PR sequence calls for an independently reviewable verification/cache lifecycle change.
- Readiness §3.2 identifies the frontend auth/idle bypass, the any-tenant cache fallback in `useTenantConfig`, token/client caches in `supabase.js`, and the need to account for long-lived phone credentials/sockets when sessions are revoked.
- The browser-state inventory calls out notes, intake, transcripts, caches and recovery/outbox storage during account-switch acceptance.
- `PILOT_FIT.md` requires correct idle/session behavior before real pilot calls and preserves the readiness P0 gates, isolated services and existing styling.

Neither audit specifies a P0-7 idle interval. The default is therefore **15 minutes**, following this item's instructions. There was no conflicting audit requirement to substitute for the requested scope. This work does not configure live Clerk or claim that the other pilot P0 gates are complete.

## Unlock mechanism

The installed packages are `@clerk/clerk-react` **5.61.12** and `@clerk/shared` **3.48.1** (manifest range `^5.61.3`). The installed declarations support `Session.startVerification`, factor preparation/attempt methods, `verifyWithPasskey`, and a `SessionVerificationResource` containing challenge ID, status and session identity. They also export `useReverification`.

The lock directly starts **`session.startVerification({ level: 'multi_factor' })`**. It requires a new challenge in `needs_first_factor`; an immediately complete result is rejected. After a document has locked, only the result of an actual credential-attempt method can reopen that same session. Initial document loads also accept the fresh full sign-in and signed activity rules below. Its challenge ID and nested session ID must match; after each asynchronous step, the live Clerk session must still match the session ID, user ID and active status. MFA remains locked between first and second factors. A newer lock, identity change, disposed controller, storage failure, incorrect credential, unsupported factor, or stale result cannot open the gate.

The UI supports passkey, password, email/phone code first factors and authenticator, phone code and backup-code second factors. Clerk determines whether the configured account has a second factor; it documents downgrade to first factor when none exists. Requiring MFA in the pilot dashboard is consequently still essential. Social OAuth is not a supported reverification first factor. When the validated Clerk challenge contains no factor this lock supports, it shows **Sign in again** instead of credential controls. This action signs out through Clerk and returns to the normal `/login` screen with Clerk’s `redirect_url` containing the original pathname, query and hash. A completed full sign-in creates a new session eligible for the fresh-sign-in rule below; an old session cannot reopen the workspace. Accounts with a supported factor retain the credential challenge and cannot invoke this fallback. Enterprise SSO's experimental custom flow is not implemented here.

The generic `useReverification` freshness window can accept recently verified credentials. It was not used as proof for a new manual lock. The direct challenge avoids trusting a recent factor age, an ordinary signed-in session, redirects, URL hashes or a user's assertion. The manual continue button and all hash handling were removed. There is no exposed `unlock` callback and no auth/lock bypass for development or tests. Tests mock Clerk methods.

The active Clerk session remains alive, so a privacy lock does not tear down phone registration or presence. The workspace remains unmounted throughout full reauthentication. **Sign out** is available in every lock-screen state, including pending verification and storage errors. Both sign-out actions invalidate pending verification and defer Clerk sign-out/navigation until an already-owned call finishes, using the existing call-continuity claim and phone checks. Verification does not navigate, preserving pathname, query and hash. Identity changes use the separate document-reset mechanism below.

References checked against the installed types and public vendor documentation:

- [Clerk Session methods](https://clerk.com/docs/react/reference/objects/session)
- [Clerk reverification guide and factor limitations](https://clerk.com/docs/guides/secure/reverification)
- [Clerk useReverification](https://clerk.com/docs/react/reference/hooks/use-reverification)

## Protected state and identity lifecycle

`SessionProtectedTree` returns either the lock screen or the protected children. It unmounts the workspace, left rail, CRM, recording/transcript views, subscription views, copilot log and live-call UI contexts. Pending protected-view requests cannot mount a view behind the lock; detached React state cannot render there. Removing the lock screen element reveals no protected sibling tree.

`TenantConfigProvider`, `AvailabilityProvider` and `InboundCallProvider` stay outside that gate because the phone needs the authenticated roster/client and availability intent. They render no protected records. The phone can retain call data in memory to own a call while locked; the lock screen never renders its contact, CRM or transcript fields.

On sign-out or a different Clerk subject, the auth bridge blocks **all descendants before the next workspace can mount** and reloads the document. This intentionally discards every module singleton/cache, token/client cache, pending request and React provider state together, including `useCallInsights`, subscription/knowledge/script caches, call handoff metadata and Supabase clients. It removes the legacy unscoped agent/script and ancillary-popup storage first. Identity-scoped durable residence outboxes and preference-only keys remain scoped/preserved. Existing call continuity defers cleanup while an already-owned call finishes; the existing token getter still rejects another user's token during that call.

The any-tenant cache fallback and unused tenant bundle cache were removed. In-flight tenant request deduplication now includes the Clerk subject and organization. Reload starts with an empty module graph and applies the load policy below, so a new user cannot inherit the previous user's in-memory workspace. Browser enforcement of the actual reload/account switch is part of manual acceptance.

## Persistence, tabs and idle clock

`IDLE_LOCK_MS` is the single named default. The controller accepts a validated timeout argument (one through sixty minutes) as a future settings integration point; no agency settings, environment variable or disable option was added.

The signed localStorage record contains user/session IDs, last activity, locked flag, lock generation and a short call heartbeat lease. A nonextractable HMAC key in IndexedDB detects changes to those fields. Web Locks serialize updates across tabs, preventing an activity write from overwriting a concurrent lock. Missing, malformed, changed, future-dated, foreign-identity or unreadable state fails closed for an existing session. The fresh full sign-in bootstrap below is the sole missing-record exception. IndexedDB also retains the latest lock generation per user/session separately from localStorage; every read must match it. A new generation is persisted before a lock record is written, so replaying an authentic pre-lock open record cannot reopen a new document. The marker also records that a session has already used its initial-load decision; deleting or tampering with localStorage cannot reuse creation-time freshness. Unsupported/blocked Web Crypto, IndexedDB, Web Locks or localStorage also leaves the gate closed.

Storage events, a one-second check, focus and visibility changes synchronize/evaluate state. Trusted input updates activity, throttled to one storage update per second. Expired activity cannot revive the deadline. Shared authenticated activity resets open tabs' clocks; a persisted lock closes open tabs. Storage never unlocks an already locked document.

**Load policy:** refresh and new tabs open without a challenge only when the HMAC-authenticated record belongs to the active Clerk user/session, matches the durable generation, has `locked: false`, and its nonfuture `lastActivity` is strictly less than the 15-minute idle timeout old. At the exact timeout boundary the gate stays closed and writes a new locked generation. A locked flag always wins, even just after sign-in. Storage never unlocks a document that has already locked; manual/idle/tamper locks still propagate across tabs.

**Fresh full sign-in:** installed Clerk `SessionResource.createdAt` is a `Date`, and `status: 'active'` identifies a session whose sign-in factors/tasks completed. A session may bootstrap one signed open record when it has no durable generation and no localStorage record at all, its identity matches the current active session, and `createdAt` is in the inclusive interval **`[now - 60,000 ms, now + 5,000 ms]`**. `FRESH_SIGN_IN_MS` is exactly **60 seconds**; `SIGN_IN_CLOCK_SKEW_MS` allows at most **5 seconds ahead** of the local clock. Older sessions, invalid/missing creation timestamps, pending/revoked sessions, existing locked records and already-seen sessions cannot use this rule. No recent factor-age heuristic is used: reverifying an older session must not masquerade as a new full sign-in. The signed record and durable generation must be written successfully before protected content mounts. The initial decision/write runs under the same cross-tab Web Lock as activity/locking.

The lock starts a challenge on mount so unsupported-factor users immediately receive their full-sign-in action. Errors have only short cause-specific text: **No supported method**, **Wrong credential**, **Challenge expired**, **Network or Clerk error**, **Storage unavailable**, and **Verification rejected** for the lock's internal checks. Development builds log a redacted object containing underlying SDK error codes/status, the classified cause and allowlisted error names/messages (including internal rejection reasons); unknown names/messages and request metadata are excluded so credentials, tokens and caller details cannot enter console logs. Production builds omit that diagnostic. Error-code mapping follows [Clerk’s frontend error reference](https://clerk.com/docs/guides/development/errors/frontend-api); route restoration uses [Clerk’s `redirect_url` behavior](https://clerk.com/docs/guides/development/customize-redirect-urls).

HMAC protects stored values, not against arbitrary same-origin JavaScript execution or a compromised browser. Server authentication/authorization remains the access boundary. This item prevents the overlay-deletion/storage-edit bypasses; it does not claim that data previously delivered to a browser can be erased from its developer tools or network history.

## Telephony

The controller checks active, dialing, incoming/ringing and the synchronous SDK call claim before locking, including a second check inside the storage transaction. Manual Lock Now is disabled and guarded during calls. A call resets the idle clock; its full interval begins when the call ends. Short signed call heartbeat leases let other tabs respect the live call. A crashed tab cannot leave an unbounded call exemption.

A call arriving after a lock **does not remove the lock**. The locked UI exposes only the caller's validated phone number and Answer/Decline, then Hang up. It never shows names, contact records, transcripts, routing metadata or recordings. An answered call retains the gate throughout and after the call until verification succeeds.

Because availability and inbound providers remain mounted, registration, device refresh, agent WebSocket and heartbeat intent continue using their existing authentication. No presence policy or telephony server code changed. Revocation still invalidates authorization; the privacy lock must not be treated as permission to keep a revoked identity online.

## Existing event log

The new authenticated `session-lock-events` function appends `session_lock`, `session_unlock` and `session_unlock_failed` to the existing `telephony_events` table. It resolves active enrolled membership and tenant from the authenticated subject, whitelists event names, uses database time, and records only actor/result/source metadata. No new table, migration, body-supplied tenant/actor, credential, caller detail or transcript is accepted.

These are client-reported diagnostic events, not authentication proof. Writes are attempted independently of the phone. A failed database write returns 503; browser delivery is best effort and emits a static debug diagnostic on failure. Offline delivery and already-revoked sessions cannot guarantee an event is stored; no durable browser audit outbox or new audit system was added. Clerk's own credential-attempt logs remain the authority for provider authentication outcomes.

## Files touched

- `src/lib/sessionLock.js`: idle/call state machine and fresh Clerk verification.
- `src/lib/sessionLockStorage.js`: signed persistence and cross-tab transactions.
- `src/context/SessionLockContext.jsx`: Clerk/phone/activity wiring and unmounting gate.
- `src/components/SessionLockOverlay.jsx`: credential/full-sign-in flow, sign-out and restricted incoming-call controls.
- `src/lib/debugLog.js`: development-only redacted lock diagnostics.
- `src/components/ProfileMenu.jsx`: guarded Lock Now action.
- `src/App.jsx`, `src/main.jsx`: provider placement and protected subtree lifecycle.
- `src/context/AuthContext.jsx`: block-and-reload identity boundary and legacy storage cleanup.
- `src/hooks/useTenantConfig.js`: remove cross-identity tenant cache fallback/cache and scope request deduplication.
- `src/styles/v3-overrides.css`: opaque gate using the existing `styles.css` theme variables, borderless controls and weights at most 500; no helper copy.
- `netlify/functions/session-lock-events.js`: existing event-log adapter.
- `tests/session-lock.test.js`, `tests/session-lock-events.test.js`: new security, lifecycle and event-log coverage.
- `tests/phone-stabilization.test.js`: replace the old “incoming call hides the lock” expectation with the required persistent gate.
- `tests/top-bar-controls.test.js`: preserve sign-out assertions and cover Lock Now.
- `docs/pilot-p0-7-lock-screen.md`: this report.

## Automated validation

**Session-resource compatibility follow-up:** Clerk browser SDK 5.128.2 returns a partial nested verification session without a usable active-user ID. All six Clerk steps now check only that nested session's ID, while retaining the full live-session check after every asynchronous step and all challenge/generation/lock checks. Mocks use the partial shape; regressions cover foreign nested IDs, live identity changes/revocation and internal rejection text. Internal checks show **Verification rejected**; development diagnostics retain safe names/messages and redact unknown free text. Real Clerk/browser acceptance was not rerun.

- Session-shape follow-up full root suite: **1,111 passed, 0 failed** (baseline 1,107; four added tests).
- Full telephony suite, including import boundaries: **317 passed, 0 failed**. The sandbox blocks loopback listeners; the rerun with loopback permission passed. Its providers/databases are test fixtures, not production connections.
- `npm run build`: **passed in place**. The local environment did not trigger the P0-1 build rejection, so no environment-free copy was needed. No `.env` file was edited.
- Targeted ESLint on every changed JS/JSX file and `git diff --check`: passed.

Tests execute the production controller, signing/verification code with real Web Crypto and an IDB fixture, actual hook/provider callbacks, gate/lock UI rendering, and the event handler against local in-memory PostgreSQL. They cover deadline/activity boundaries; all call phases and asynchronous call claims; call-end reset and tab heartbeat; fresh Google-only full sign-in and exact creation/skew boundaries; refresh/new tabs inside/outside the window; no-factor full-sign-in/sign-out with owned-call deferral; five distinct errors and redacted diagnostics; malformed/missing/tampered/foreign state and authentic-record replay against the durable generation; unavailable storage; old hash/button removal; first/second-factor and passkey flows; incorrect, stale, revoked, wrong-challenge/user/session responses; no protected descendant rendering; locked answering; account-switch/sign-out cleanup and call deferral; and authenticated event ownership, inactive/revoked membership and error sanitization.

## Browser acceptance still required

No real Clerk session, dashboard, live call, deployed API or production system was contacted. Before marking the isolated pilot ready, use synthetic data and verify:

1. Both Terminal and light themes, keyboard focus, password/code autofill, passkeys, MFA and retry/expiry behavior with the actual loaded Clerk browser SDK. Verify that every new challenge really asks for credentials, including an immediate Lock Now after successful verification.
2. Lock from a populated CRM/transcript/recording screen; inspect the DOM and remove the lock element. Confirm no protected views remain, including portals and a response that completes after lock.
3. Sign in with a Google-only account and confirm immediate workspace entry, then verify idle lock and Lock Now offer Sign in again and Sign out. Confirm the full-sign-in round trip restores pathname/query/hash and only opens after completed sign-in. Repeat with supported factors and confirm no Sign in again is offered. Refresh and open a second tab within and beyond the idle window; replay a pre-lock signed open record after Lock Now, edit/remove the record, and test blocked/private-mode storage. Test foreground/background tab activity and browser timer throttling with simultaneous calls; verify a call's heartbeat lease and the post-call clock in supported pilot browsers.
4. Leave a verified agent available, lock, and place a synthetic inbound call. Request Sign in again and Sign out during an owned call; confirm sign-out/navigation waits for hangup and the workspace stays unmounted. Confirm registration, authenticated WebSocket and presence remain live, the lock shows only the number, Answer/Decline/Hang up work, and answering never reveals the workspace. Confirm routing observes a real revoked session as unavailable.
5. Switch Clerk accounts in another tab while locked, including while an owned call is finishing. Confirm document reset and an empty new-user workspace; test ordinary/inactive/revoked identities and retained outbox scoping. Confirm no old module/token cache survives reload.
6. Verify successful event insertion and denied/failed insertion behavior on the isolated pilot database. Automatic tests validate the schema contract, not the deployed catalog.

## Owner-only Clerk/dashboard steps

Apply these only to the **new isolated pilot Clerk instance**, not production:

1. Set the application's access mode to **Invite-only** and invite only the reviewed pilot roster. See [Clerk access restrictions](https://clerk.com/docs/guides/secure/restricting-access).
2. Enable supported first factors and **Require multi-factor authentication**; enroll each pilot agent and recovery method before testing the lock. An account without an eligible reverification factor uses full sign-in again while its workspace stays unmounted. See [Clerk sign-in/MFA options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).
3. Configure and record an owner-approved maximum session lifetime and inactivity policy on **Sessions**. The audit gives no numerical vendor-session duration. Clerk's request-driven session inactivity and the app's human-input privacy timer serve different purposes: phone/token/presence refresh continues while locked. Validate expiry and revocation with routing rather than assuming a 15-minute Clerk inactivity setting implements this privacy gate. Lifetime changes apply to new sessions; create new pilot sessions for acceptance. See [Clerk session options](https://clerk.com/docs/guides/secure/session-options).
4. Confirm the pilot account's plan supports its chosen MFA/session controls, its loaded browser SDK supports these installed session methods, and the service-managed active membership maps exist. Revoke devices for removed users and run the synthetic revocation tests above.

No dashboard change is claimed or needed to be performed by an agent in this repository session. These external acceptance/configuration steps remain the owner's release gate.
