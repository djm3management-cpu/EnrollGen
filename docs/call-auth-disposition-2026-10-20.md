# Mid-call auth teardown and disposition-only wrap-up

## Incident evidence and root cause

Dylan's reported call was parent `CAb2885846a59e8744372c761453ef12b8`, agent child `CAa3789fafe7e3b00858a13672b31fbeca`. Both ended at approximately **10:31:06 AM Eastern on October 20**. The previously investigated Dial result explains when migration 105 imposed its wrap-up hold; it does not explain why the browser left the workspace.

The deployed App used Clerk `<SignedIn>` around the entire tenant/workspace/provider tree and `<SignedOut>` around the landing page. Any transition to signed-out state at `/script/ma` therefore replaced the workspace with LandingPage. That unmounted InboundCallProvider, whose effect cleanup called `device.destroy()`. This is a concrete app defect: an auth-state change could destroy an independently connected Twilio call.

Production Clerk application logs, filtered to Dylan's verified user, show:

- `sign_in.created` at **10:31:17 AM**, event `01a159b9-4a06-7f30-9ea9-fb34413f6bb4`.
- `session.created` at **10:31:23 AM**, event `01a159b9-5ec7-7b61-b01f-7eeaac37a047`.
- `sign_in.completed` at **10:31:23 AM**, event `01a159b9-5ec9-7b61-a495-f982a67bb99e`.

The new sign-in used Google OAuth and created `sess_3Kxkc2Ik7HmhI5y2QSeIHZ51ovA`. This supports the reported loss of auth followed by immediate reauthentication. The visible incident-window audit has no `session.ended`/`session.revoked` event identifying the old session's termination reason. Current configuration is a seven-day maximum lifetime with inactivity timeout off. Retained post-call job rows do not retain the old Clerk session ID (those values are null). Therefore **expiry versus revocation versus a transient client auth loss cannot be established from retained evidence**. The dashboard's current lifetime setting alone is not proof of a particular expiration.

Code-path exclusions:

- `clerkFetch` previously retried one 401 using `skipCache:true`, then returned the second response or threw the token error. It did not call signOut, navigate, or reload.
- Existing panel error boundaries render a panel error, not LandingPage. No retained browser exception proves a crash at the incident time.
- Normal signed-in route changes do not render LandingPage; that page was under SignedOut.
- The deployed service worker claims clients and caches navigation responses but does not call client.navigate or reload. The deployed preload recovery requires a guarded explicit reload. A stale browser bundle or external/browser reload cannot be ruled out without browser telemetry.

The strongest supported conclusion is **an unprotected auth boundary that tears down the phone on auth loss**, with the auth-loss trigger itself unconfirmed. This is distinct from the already-disabled premature DB wrap-up hold.

## Fix

A synchronous call continuity store exists above the signed-in workspace. Ringing, outbound connection setup and connected calls claim it before React updates; only the owning call's terminal event releases it. App retains the same authenticated provider tree/key while such a call is alive even if Clerk reports signed out. Phone/availability identity and organization readiness stay pinned to the existing call. Tokens are never frozen or replaced with an old JWT: protected HTTP still requires fresh valid auth, and a different user's token is refused during the original call.

Token-getter failures and a second 401 report auth trouble without signing out. A deduplicated refresh controller retries with exponential backoff (1, 2, 4, 8… seconds, capped at 60 seconds), retries credentials rather than business mutations, and cleans up on unmount. The banner reads **“Session expired, sign in after this call”**. Sign-in and sign-out actions are guarded while calls are active. Clerk's own routerPush/routerReplace callbacks, app navigation/back actions and same-tab link navigation are blocked during a call. Reload/close gestures get the browser's beforeunload confirmation; browsers cannot prevent a user from forcibly closing/reloading a page, crashing the browser, or losing connectivity.

Answered outbound calls also no longer wait for successful canonical/CRM lookup before exposing live controls. Lookup/auth failure previously explicitly disconnected the SDK call; it now retries metadata with capped backoff while keeping attribution unbound until verified. Terminal callbacks cancel pending retries.

The phone provider also sits outside the workspace UI error boundary; a render failure in AppShell leaves fallback dialer controls mounted beneath the existing device owner.

## Only disposition is required

The script's closing section is now script text and a short instruction. There are no wrap-up inputs, enrollment-field validation, cross-sell acknowledgement gate, Save Call Record action, automatic opportunity prompt or compliance-review popup. The cross-sell rail appears only during an active phone call, never as an after-call requirement.

The dialer requires only its disposition dropdown and save. Even ancillary product type is optional and editable later in Calls. Migration 108 relaxes that product requirement while preserving validation of any provided product and all migration 107 live-call, identity and atomic-save checks. It does not enable any routing hold.

Calls retains outcome editing and optional opportunity creation, and adds an optional record-details editor for notes/contact/enrollment fields. Its endpoint checks the authenticated agent and tenant, accepts empty/omitted fields, restricts updates to the optional field allowlist, and cannot alter disposition/session identity or queue scoring. Later optional edits never rescore calls.

Finalization remains independent of the removed form. The existing terminal-call/durable-transcript pipeline still owns processing; it requires transcript and call/session identity, not beneficiary fields, notes, opportunity creation or cross-sell acknowledgement. No production post-call job was rerun during this work.

## Verification

Tests exercise the actual auth bridge and App gate under signed-out state while a call is protected, token failure/401 exhaustion, backoff/deduplication/cleanup, new-user token rejection, navigation guards, real phone lifecycle regression coverage, the form-free closing section, optional ownership-protected Calls edits, disposition-only enrolled and ancillary calls, and post-call scoring dispatch without enrollment/notes fields.

The current full suite reports 421/422 passing; the remaining pre-existing failure is the unchanged single-quoted static diagnostic in `src/lib/sepCms.js:128` checked by `tests/housekeeping.test.js:76`. Production build and targeted ESLint pass. Publishing stays locked and no `netlify deploy --prod` is used.

## Follow-up: top-bar controls

The pending disposition used to keep its floating panel visible even after X, and its automatic appearance did not register outside-click listeners. That panel could cover the availability menu. X, clicking outside, Escape and the phone icon now collapse the whole panel to an amber badge on the phone icon. Reopening the phone restores the unfinished disposition. A new ringing/live call hides it. The availability menu also renders above the phone panel, and a legacy `wrap_up` display status no longer disables Available.

Disposition lookup now considers only the latest completed connected call. Saving it cannot expose a queue of older unfinished records. Older records remain editable from Calls; this change does not backfill outcomes or rescore anything.

The user name/avatar opens an account dropdown containing Sign Out. Sign Out is absent until the dropdown opens, is disabled during calls, and rechecks the synchronous SDK call guard when selected. The name remains visible at narrower widths. Outside click and Escape close the dropdown without signing out.

The focused auth/phone/lifecycle/top-bar suite passes 33/33. Tests cover collapse/reopen, both availability options under a legacy wrap-up status, the older-record regression, deliberate menu sign-out and the call-arriving-before-render guard. A localhost preview using the actual components and site styles verified Available/Offline selection with a pending disposition, the name dropdown and disabled Sign Out during a simulated call. No real calls, auth sessions or production availability were changed in that preview.
