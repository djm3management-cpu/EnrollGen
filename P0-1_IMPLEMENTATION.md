# P0-1 authentication bypass closure

Implemented on `pilot/release`. No pushes, deployments, live database migrations, production requests, `.env` edits, stylesheet edits, or visual design changes. Tests use in-memory PGlite schema fixtures.

## Bypasses and changes

- `DISABLE_CLERK_AUTH` and `VITE_DISABLE_CLERK_AUTH`: retired entirely, including local use. `_clerkAuth.js` always verifies Clerk credentials. Any presence of either setting (even empty or `false`) throws a configuration error naming only the setting.
- `_tenantSettings.isAdminAuth`: explicitly denies the former `dev-bypass` identity, including when role claims are supplied.
- `rts-ingest.js`: removed the bypass branch that selected the first tenant and an arbitrary active agent.
- Frontend: removed the switch and bypass branches from `main.jsx`, `App.jsx`, `AuthContext.jsx`, `ScriptEditor.jsx`, and `useSessionTracker.js`; `agentIdentity.isAuthDisabled()` now always returns false, so availability, inbound-call, and session-lock consumers always take the authenticated path. Removed obsolete bypass advice/comments in `useCopilotEngineCore.js` and `useCurrentAgent.js`.
- `ALLOW_INSECURE_WEBHOOK_TESTS`: rejected at build time and outside explicit development without deployment/CI markers. The existing HTTP webhook exception is available only in that local development context.
- `integrations/authSafety.js`: configuration guard imported by Netlify auth/tenant settings, the shared integration Supabase module, and worker initialization; `vite.config.js` checks the merged Vite environment before building.
- `telephony/src/authSafety.js` and `config.js`: equivalent startup guard kept inside the independently packaged Railway service; parity tested. Telephony had no Clerk/Twilio authentication bypass switch. Its Clerk verifier now also accepts the existing `CLERK_JWT_KEY` configuration for offline verification; secret-key verification is unchanged.
- Root and telephony token verification logs use static failure labels without token/error contents.
- Searched application, functions, scripts, integrations, telephony, and deployment configuration. `VITE_DEBUG_LOGS` and `ENROLLGEN_DEBUG_LOGS` are development logging controls, not authentication bypasses; unchanged. Signed maintenance/job tokens, webhook signatures, and IX sandbox/provider settings remain unchanged.

## Tests and verification

- `tests/auth-safety.test.js`: subprocess initialization rejection for all three settings across Netlify auth, integration worker, and telephony config; tests empty/false/true settings, hosted-development/build rejection, policy parity, and bypass-admin denial.
- The same test exercises real protected availability and enrollment-intake handlers with missing, expired, foreign-issuer (separate RSA key), and malformed tokens. A trusted valid token is accepted. Database/provider access is forbidden during negative cases.
- `telephony/tests/clerkAuth.test.js`: equivalent negative cases against the actual voice-token Express route, with real Clerk signature verification and a positive control. Only loopback HTTP is allowed.
- Updated the existing availability auth test to stop setting retired switches.
- Full root `npm test`: **1,013 passed, zero failed or skipped**. The first run had 12 baseline failures, reproduced independently from an unchanged `HEAD` archive. To satisfy the full-suite requirement, test-only repairs update the admin denial expectation, missing admin hook stub, current color/filter assertions, scored-call fixture, and in-memory IX schema. The logging check records exact existing telemetry/configuration statements and rejects additional diagnostics; existing application logging remains unchanged.
- Full telephony `npm test`: 317 passed, zero failed; import-boundary check passed. Run with loopback socket permission because the sandbox denies local `listen()`.
- `npm run build`: existing workspace configuration correctly fails on the presence of `VITE_DISABLE_CLERK_AUTH`. A temporary source copy excluding `.env` files builds successfully. Generated JavaScript/HTML contains zero matches for `DISABLE_CLERK_AUTH`, `VITE_DISABLE_CLERK_AUTH`, `ALLOW_INSECURE_WEBHOOK_TESTS`, or `dev-bypass`.

## Manual environment cleanup and limits

Remove `DISABLE_CLERK_AUTH`, `VITE_DISABLE_CLERK_AUTH`, and `ALLOW_INSECURE_WEBHOOK_TESTS` from all Netlify and Railway environments where present, including preview contexts. Delete them rather than setting them to `false`. No new environment variable is required. `CLERK_JWT_KEY` is an existing optional variable, now also understood by telephony.

The local environment also contains the retired frontend setting; its value was not printed and its file was not edited. Remove that setting before building in the working tree.

Live Netlify/Railway settings and real-user sign-in were not checked, as production access and deployment are outside this task. Validation uses synthetic credentials and offline fixtures. Existing production diagnostics were preserved; their privacy/retention was not assessed under P0-1.

## Additional test-only files changed

`tests/call-access-authorization.test.js`, `tests/call-workspace-access.test.js`, `tests/compliance-review-layout.test.js`, `tests/crm-workspace.test.js`, `tests/enrollment-intakes.test.js`, `tests/housekeeping.test.js`, and `tests/fixtures/baseline-diagnostics.json`. These repair the pre-existing suite failures without changing runtime behavior. No test was skipped or disabled.
