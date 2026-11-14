# P0-3: legacy API authorization

Implemented on `pilot/release`, building on P0-1 (`2b915a8`). No deployments, pushes, live database operations, provider requests, environment-file edits, or frontend/style changes were performed. Provider interactions in tests use offline fixtures.

## Legacy compliance operation inventory

Searched `src`, `netlify`, `integrations`, `telephony`, `netlify.toml`, and repository scripts for full paths, direct function URLs, relative operation names, generic request helpers, and scheduled/worker dispatch. “None” means no executable repository caller was found in any of frontend / worker / scheduled job categories; it cannot establish whether external clients exist.

All 17 operations are disabled with **410 Gone** before authentication, subscription checks, or service-client creation. The former implementation remains in the file as an unexported function for review. No legacy operation was retained.

| Method and operation (relative to `compliance`) | Frontend caller | Worker / scheduled caller | Decision |
| --- | --- | --- | --- |
| `POST /calls` | None | None | Disabled, 410 |
| `POST /calls/:id/score` | None | None | Disabled, 410 |
| `GET /calls/:id/scorecard` | None | None | Disabled, 410 |
| `GET /calls/:id/detections` | None | None | Disabled, 410 |
| `POST /calls/:id/override` | None | None | Disabled, 410 |
| `GET /scorecards` | None | None | Disabled, 410 |
| `GET /scorecards/:id` | None | None | Disabled, 410 |
| `GET /templates` | None | None | Disabled, 410 |
| `GET /dashboard/overview` | None | None | Disabled, 410 |
| `GET /corrective-actions` | None | None | Disabled, 410 |
| `PATCH /corrective-actions/:id` | None | None | Disabled, 410 |
| `GET /calibration/runs` | None | None | Disabled, 410 |
| `POST /calibration/start` | None | None | Disabled, 410 |
| `GET /calibration/:id` | None | None | Disabled, 410 |
| `POST /calibration/:id/override` | None | None | Disabled, 410 |
| `POST /recalculate` | None | None | Disabled, 410 |
| `GET /agents` | None | None | Disabled, 410 |

The active Compliance Review modal calls `compliance-review`, not the retired nested API. The call log uses `call-log`, `call-record-details`, recordings APIs and existing Supabase projections; these frontend paths were left unchanged. Post-call scoring and recovery workers use their existing job-authenticated handlers, not legacy `POST /calls/:id/score`.

## Retained handlers and frontend impact

- `compliance-review.js`: reuses `scopeCallToIdentity` for ordinary-agent ownership plus agency scope. Verified admins retain agency-wide access. Every POST action (preview, evaluate, review decisions, gap fill, rescore) rejects ordinary agents before reading call evidence. Gap-fill idempotency lookup and dispatch-failure updates also include the authorized agency and call. Authorized response data and UI rendering are preserved.
- `transcribe.js`: no repository HTTP caller found; retained and hardened as explicitly requested. Requires `callId` and `recordingId`, resolves protected recording identity, authorizes the call, selects only its authorized recordings, obtains a server-issued media URL, and repeats tenant/owner scope on the transcript update. A submitted `url` never selects provider input. This replaces the unused arbitrary-URL API contract; no frontend uses it. Ordinary agents may transcribe their own authorized calls; this is not an admin-only action.
- `stripe-portal.js` and `stripe-checkout.js`: verified agency owner/admin required through `resolveCallAccessIdentity`; protected agency resolution replaces the default-agency fallback. Subscription/customer lookup is agency-scoped. Existing successful billing session payloads and redirects are preserved.
- Frontend requests now requiring admin on the server: `BillingSettings.jsx` calls `/api/stripe-portal` and `/api/stripe-checkout`; `Onboarding.jsx` calls `/api/stripe-checkout`. Compliance Review mutations already required admin and continue to do so, now before evidence reads. Legacy calibration and recalculation are retired for everyone.

## Route audit

`netlify.toml` has one function wildcard alias: `/api/*` rewrites to `/.netlify/functions/:splat`. The billing functions also declare explicit `config.path` aliases for those same `/api/stripe-*` URLs. Both entry forms execute the same authorization inside each handler. The tests inspect the actual wildcard configuration and billing path declarations and exercise the handlers at both addresses. Every retired operation is tested through both its alias and direct function path for unauthenticated, ordinary, foreign-agency and admin requests.

The remaining redirects are `/vendor/paragon` to its separate vendor-report function, `/calls` to the CRM page, `/assets/*` to the static 404 page, and the SPA fallback. None supplies another address for these handlers. All five schedules target separate analytics, coaching, bulletin, email or FEMA functions; none invokes the legacy compliance or transcription APIs. Direct Compliance Review/background and compliance-upload paths were traced; their existing job/admin boundaries remain separate from the retired API.

## Files and tests

Changed handlers: `netlify/functions/compliance.js`, `compliance-review.js`, `transcribe.js`, `stripe-portal.js`, `stripe-checkout.js`.

Added `tests/legacy-api-authorization.test.js` and this report. Tests use real local PostgreSQL queries via PGlite, real offline JWT verification for invalid credentials, and stubbed provider transports. Coverage includes all retired operations and route forms; missing/expired/malformed/foreign-key tokens; bypass rejection; owner versus other-agent/agency access; ordinary-agent admin-action rejection; allowed agent/admin/owner cases; unknown/mismatched agency rejection; trusted recording selection; and tenant/owner changes during transcription before the write.

| Check | Result |
| --- | --- |
| Baseline root `npm test` before edits | 1,013 passed; no failures |
| Final root `npm test` | 1,062 passed; no failures (49 new tests) |
| `npm test --prefix telephony` with loopback permitted | 317 passed; no failures; import boundary check passed |
| `npm run build` in environment-free temporary source copy | Passed; Vite completed in 23.19 seconds |
| `git diff --check` | Passed |

Pre-existing environment issues were kept separate: the initial sandboxed telephony run had 46 failures from denied local `127.0.0.1` listeners (`EPERM`); rerunning with loopback enabled passed all tests without changing them. The in-place root build correctly failed P0-1's guard because existing local configuration contains the retired `VITE_DISABLE_CLERK_AUTH` name. To verify the build without editing `.env` or weakening P0-1, tracked source (including the changed handlers) was copied to `/private/tmp/enrollgen-p03-build-v2hahu1q`, excluding environment files, with the existing local `node_modules` linked and only standard process path/home/temp variables inherited; `npm run build` passed there. No secret values were printed.

## Limits

Live Netlify routing, external callers, deployed identity mappings and provider integration behavior were not verified because live-system access and deployments are prohibited. The alias checks are local handler/configuration tests, not a deployed smoke test. Existing database/RLS findings and other readiness items were not changed.
