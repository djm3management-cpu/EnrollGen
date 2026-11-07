# v6 validation

176 selected tests passed, plus targeted ESLint, LLM typecheck, Vite build and whitespace checks. Provider calls use injected fixture doubles only. No actual LLM/transcription requests, production queries/writes, rescores, queue actions, applied migrations, deploys, merges or pushes.

```sh
node --test tests/compliance-event-fixes.test.js tests/compliance-full-rubric.test.js tests/compliance-cms-only.test.js tests/compliance-stage-gates.test.js tests/compliance-approved-decisions.test.js tests/compliance-judgment-pass.test.js tests/compliance-version-aggregation.test.js tests/compliance-reaggregation.test.js tests/compliance-overhaul.test.js tests/compliance-review-api.test.js tests/compliance-review-display.test.js tests/scoring-provider-guard.test.js tests/ma-script-2027.test.js
npm run typecheck:llm
npm run build
node scripts/compliance-overhaul/event-fixes-report.mjs --dry-run
git diff --check
```

Specific coverage: original 135 MA membership / 251 points; three retirements only; single highest-weight SOA deduction; missing-component versus late TPMO selection; same quoted judgment event versus separate events; covered labels; negative POA/self questions despite adjacent product names; exact 13281a25 and 75e3b687 Section 3 exchanges; Uh-huh/mm-hmm/yep/okay/sure with 1.5-second overlap; refusal; voluntary statements anywhere; date without effective; current-plan question/answer; tier prices/drug deductible; type/network separated across presentation; conditional Medigap/gap/employer rules; both channel spans and the exact 120-second agent-start boundary. Existing synthetic positive tests now explicitly supply both channel endpoints. The full legacy repository suite was not run or claimed.

Saved-cohort results: 22 scored, 316 N/A, 38 INCOMPLETE. Four calls change to INCOMPLETE. All are listed in EVENT-FIXES-REPORT.md, including the 105:08 agent start and one other formerly scored call. Trigger remains INCOMPLETE. Dylan 57.19 (12) to 70.30 (10); same retained cohort 61.56 to 70.30. Mark 35.95 to 47.10 (12). Real Section 3 SOA: Dylan 7/10, Mark 0/12. Complete TPMO including options: Dylan 10/10 (7 on time), Mark 3/12 (3 on time).

Each top-10 example was verified against an actual positive-loss failed row in the proposed scored cohort and quoted from the saved transcript by original speaker/timestamp. REAL MISS is absence/insufficiency in stored text, not independent audio verification. WORDING labels identify remaining matcher issues, which were reported rather than silently expanding the requested fixes. Per-channel span is not proof of interior audio continuity. No missing speech was reconstructed.

No database integration/concurrency/RLS, deployed UI or real provider behavior was exercised. Migration 145 and the edited pending 139 remain unapplied. Historical cards and all saved baseline artifacts remain unchanged. No transcription, Deepgram, telephony or Railway transport source changed. The existing postCallPipeline static/dynamic import warning remains; the build completes.

Legacy in-place override/recalculate routes are disabled for full-rubric versions to prevent bypassing the new invariants. This fence was source-reviewed, not exercised against live auth/DB. The scoring generator reports the specific missing/late channel reason.
