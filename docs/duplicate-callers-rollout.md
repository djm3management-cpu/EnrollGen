# F07: duplicate caller evidence

Branch: `fix/duplicate-callers`. Base: `6b03721` (current main at clone time).
All work occurred in `/private/tmp/enrollgen-duplicate-callers`; the original checkout was read only.

Duplicate detection runs in a database insert trigger, independently of new/known identity classification. The scoped expression index uses tenant, source, normalized phone, timestamp and ID. The lookup includes the exact 90-day boundary, excludes future timestamps and the current CallSid, and deterministically records the newest matching inbound-call UUID. Existing contacts take the same insert path. Invalid phone identities never match. Same-identity inserts use a transaction advisory lock; multi-connection contention was not exercised by PGlite.

The billing ledger snapshots both duplicate fields whether the ledger or inbound record arrives first. Daily totals add duplicate/disputed counts. Weekly reconciliation adds duplicate counts and minimized duplicate evidence. The service-only `paragon_duplicate_disputes` SQL view includes duplicate and wrong-state calls with prior UUID and dispute/amount evidence. A duplicate with 90+ billable seconds is dispute evidence; existing charge calculation and stored rates are unchanged. The vendor report function and its eight-column CSV are untouched.

No historical rows are updated/backfilled by 076. Existing flags remain intact; historical calls can serve as prior-call evidence. Old rows without normalized-phone columns are queried through the expression index without changing stored numbers. Null source IDs cannot establish source-scoped duplicate evidence and are deliberately not inferred or repaired.

## Verification

- New F07 database acceptance tests: 6/6 passed, including within 90 days with prior UUID, day 91, existing contact, different tenant/source, exact day 90, future timestamps, normalization, over 20 prior calls, replay SID exclusion, ledger ordering, daily/weekly/internal view, historical preservation and browser denial.
- Focused F07 + Paragon billing/report/email suite: 26/26 passed.
- Root suite: 252 passed / 255 total. Three `outbound-canonical.test.js` failures report `setTranscriptionHealth is not defined`. All three reproduce on the unchanged base in a separate detached worktree; no F07 failures.
- Telephony suite: 188/188 passed with local fixture servers allowed to bind. Initial sandbox-only run: 170 passed, 18 localhost `listen EPERM` failures.
- `node --check telephony/src/routes/twilioVoice.js` and `git diff --check`: passed.
- No production schema writes, provider calls, merge, push or deployment.

## Rollout order

1. Compare the target catalog to the reviewed 049/067 prerequisites, including ledger/view column order and existing 076 versions; take a verified backup. Do not use blind `supabase db push` or replay earlier migrations.
2. Apply only `076_duplicate_callers.sql` to disposable staging, run the F07 fixtures, then test overlapping same-phone inserts using separate PostgreSQL connections. Check unchanged historical rows, invoice amounts, source proof and CSV columns.
3. Apply the reviewed 076 forward delta to the target database before deploying the route. Index creation and ALTER TABLE run in one transaction and take locks; schedule the short write-lock window. The old route remains compatible because the BEFORE INSERT trigger computes the evidence even if the old code supplies false.
4. Deploy the Railway route commit. Netlify report SQL consumers and billing workers receive the new fields without needing a code rollout; no settings changes are required.
5. Verify a controlled repeat's prior UUID in inbound and ledger records, daily/weekly totals and the internal dispute view. Check 91-day/cross-scope negatives, eight CSV columns and unchanged routing decisions.

Application rollback: redeploy the prior route while retaining additive 076 schema/evidence. Any database rollback needs a separately reviewed forward migration that preserves recorded duplicate evidence; do not drop evidence columns or rewrite historical rows.
