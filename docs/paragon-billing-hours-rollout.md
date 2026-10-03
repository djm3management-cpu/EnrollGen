# Paragon hours, cap and verified billing (067)

## Rollout order

1. After approval, merge/deploy the code to **both Netlify and Railway**. Do not run 067 while Railway still runs the old handlers. No migration has been applied by this change.
2. Confirm Agency Settings > Paragon routing still loads, existing matrix controls still work, and Railway is running the new signed callback handlers and billing worker. Before 067, new controls are disabled; missing migration RPCs use the existing admission/report paths. Database/provider failures never trigger those compatibility fallbacks.
3. Run the complete `supabase/migrations/067_paragon_billing_hours.sql` in the SQL Editor. It runs in one transaction. It defaults NGHS to Monday–Friday, 10:15 AM–5:15 PM ET, cap 20, SOFT, $28. Existing pause and eligibility settings are preserved.
4. Refresh the Paragon routing settings: verify the days/times, SOFT cap 20, rate $28 and today's billable count. Blank cap means unlimited. Controls can now be saved by an authenticated tenant admin.
5. Verify a proved Paragon call through the deployed system: new pings outside hours are unavailable; an accepted ping with a verified Twilio parent arrival within 30 seconds remains eligible even if hours close or a hard cap is reached. Eligibility and current agent routability still apply. Vendor pause remains an explicit override.
6. Allow the Railway worker to reconcile historical and new proved calls. Unverified rows are labeled `billing_unverified`; they are not guessed from existing browser timers or recording lengths. Compare daily report totals and weekly reconciliation after verification.

Code first is necessary: old Railway handlers cannot supply the verified arrival timestamp or process the new durable billing queue. SQL retains old RPC signatures for compatibility, but those signatures alone cannot guarantee the approved arrival-time exception. Do not roll Railway back to the old handlers after 067 without a separate recovery plan.

## Behavior and evidence

- ET day/time boundaries use `America/New_York`, including DST. Missing/invalid hours close new ping admission. Opening is inclusive, closing exclusive.
- Only new pings encounter hours and cap gates. Accepted proof is valid from `received_at` through `received_at + 30 seconds`, using Twilio's parent `dateCreated` as incoming arrival. Repeated pings do not extend that deadline. Verified arrival avoids webhook processing latency invalidating an on-time call.
- HARD counts confirmed, billable calls on their ET arrival day. Accepted commitments and calls already in flight are honored, so eventual totals can exceed the cap. SOFT never blocks for the cap and shows a counter/alert in settings. No in-flight quota was added.
- Rate is snapshotted on acceptance. Settings changes cannot reprice a proved call. Historical accepted proof starts at the approved $28 setting and queues for verification; no historical provider timing is fabricated.
- Signed Twilio callbacks persist an idempotent, limited metadata event before acknowledgement. The service worker independently reads the matching account's parent/child resources, uses parent arrival/end for immutable billable seconds, and measured completed child duration for talk/answer evidence. An unsuccessful parent without `endTime` requires a signed terminal parent timestamp; child termination cannot supply the parent's end.
- The worker leases two jobs per tick, uses bounded provider timeouts, retries with backoff, and fills late child evidence without changing finalized billable seconds. Conflicting provider timestamps are flagged, not rewritten. Ordinary direct calls and state/eligibility selection are preserved.
- Vendor report, daily report/email totals, weekly reconciliation, and Paragon vendor callback duration use the same proved billing ledger. Billing starts at 90 arrival-to-end seconds. Internal wrong-state/dispute evidence stays in reconciliation; the vendor CSV remains exactly eight columns.
- No live migration, provider call, report-email delivery, credential rotation or data deletion was performed during implementation/testing. Existing ephemeral reservation cleanup remains in the admission SQL.

## Validation

- Application tests: **193 passed**; telephony tests: **153 passed**.
- New PostgreSQL/provider tests: 14, included in the application total. They execute the entire 067 SQL against a disposable PostgreSQL-compatible PGlite database and inject provider fixtures rather than contacting Twilio.
- Coverage: 10:14:59/10:15/17:14:59/17:15; weekends; winter/summer and both DST transition dates; 23/25-hour reporting days; cap 19/20/21 in HARD and SOFT and unlimited; real ping rejection; committed arrival across hours/cap changes and later denials; expiry and delayed handling; 89/90/91 seconds across all six callback-order permutations; late child timing; immutable rates/finalization; proof filtering and internal disputes; durable event failure/retry; account mismatch; lease fencing; database/provider failures; pre-067 compatibility; settings audit and browser-role denial; unchanged matrix counts.
- Production Vite build, all three Netlify function bundles and `typecheck:llm`: passed.
- Full lint: 45 existing errors, zero warnings. No new lint errors; existing errors in modified files were compared with their baseline versions.
- No production end-to-end calls were placed. Operator verification after deployment remains necessary.

## Files changed

- `supabase/migrations/067_paragon_billing_hours.sql`: complete schema, controls, commitment-aware RPCs, queue, immutable billing and reporting SQL.
- `netlify/functions/_paragonControls.js`: validation and pre-067 report compatibility.
- `netlify/functions/vendor-routing.js`: authenticated admin controls and daily counter.
- `netlify/functions/paragon-vendor-report.js`: canonical rates/totals and DST-correct report-day bounds.
- `netlify/functions/paragon-daily-email.js`: canonical daily amount due.
- `src/components/VendorRoutingSettings.jsx`: hours, cap, mode, rate and counter using existing styles.
- `telephony/src/paragonBilling.js`: durable events, provider verification, compatibility and bounded retry worker.
- `telephony/src/routes/twilioVoice.js`: verified arrival and commitment-aware claim integration.
- `telephony/src/routes/twilioStatus.js`: persist signed callback billing events before acknowledgement.
- `telephony/src/server.js`: start service billing worker.
- `telephony/tests/attributionRoutes.test.js`: signed-account/pre-migration test fixtures.
- `tests/fixtures/paragon-billing-schema.sql`: disposable database fixture.
- `tests/paragon-billing-hours.test.js`: billing/control SQL and provider verification tests.
- `tests/paragon-vendor-report.test.js`, `tests/paragon-daily-email.test.js`: canonical totals fixtures.
- `docs/paragon-billing-hours-rollout.md`: rollout, validation and complete change inventory.
