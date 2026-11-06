# CMS-only validation

Current policy: cy2027-cms-only-4. All checks were offline; provider boundaries were injected test doubles. No OpenAI/other model requests, transcription requests, production SQL/RPC queries or production writes occurred. Dry-run scripts wrote local reports and unapplied SQL only.

Passed: 241 selected tests, targeted ESLint, LLM typecheck, Vite build and git whitespace checks. The superseded script-policy assertions were updated/replaced rather than treated as current CMS requirements. This is not a claim that the entire legacy repository suite was run.

```sh
node --test tests/compliance-cms-only.test.js tests/compliance-stage-gates.test.js tests/compliance-approved-decisions.test.js tests/compliance-judgment-pass.test.js tests/compliance-version-aggregation.test.js tests/compliance-reaggregation.test.js tests/compliance-overhaul.test.js tests/compliance-review-api.test.js tests/compliance-review-display.test.js tests/scoring-provider-guard.test.js tests/ma-script-2027.test.js
npm run typecheck:llm
npm run build
node scripts/compliance-overhaul/cms-only-report.mjs --dry-run
```

Covered: every active deterministic statement/topic with a positive full-call fixture; all seven pre-enrollment topics before/after actual submission; application-only question rejection; pharmacy context versus doctor-network context; no extra topic acknowledgment; unknown submission timing; named-plan consent and explicit affirmative choice; August 3 wording; TPMO fillers, restarts, spoken numbers and options clause; hard-failure evidence; Code versus AI decisions; no AI pass points; no automatic deductions from REVIEW; historical admin outcomes versus fresh deterministic evidence; active-template versions; 15-minute/excluded-outcome gates; missing-tail incompleteness; lifetime request and daily cap guards; assessment/cached pricing preservation.

Dry run: 376 saved calls, 24 numeric estimates, 318 N/A, 34 INCOMPLETE. Trigger: INCOMPLETE, no percentage, no AUTO-FAIL. Full counts and original/before/after samples are in the linked report. No scorecard in production changed.

The PDF was read and relevant complete pages visually checked. The file is the user's existing FINAL (1) copy, dated 8/03/2026, not the requested underscore filename or the September draft. It was not modified or added to the commit.

Migration 142 and edited pending persistence/version routines remain unapplied. PostgreSQL integration, database concurrency/RLS and live provider behavior were not exercised. Those remain approval-stage acceptance work. Endpoint transcript coverage does not prove all interior or per-channel speech exists; no capture/transcription behavior was changed.
