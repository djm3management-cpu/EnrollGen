# Full-rubric validation

Version: cy2027-full-rubric-5. No LLM/provider/transcription requests, production SQL/RPC reads or writes, scoring dispatch/queue actions, applied migrations, deployment, merge or push occurred. Provider-boundary tests use local injected doubles only. The report script imports no database or provider client and rejects execution without --dry-run.

Passed: **148 selected tests**, targeted ESLint, LLM typecheck, Vite build and Git whitespace checks. The test count differs from the previous policy because its per-retired-ID tests now cover three retirements instead of 141; restored rules are checked for exact membership, original weights and unchanged agency text. The full legacy repository suite was not claimed to pass.

```sh
node --test tests/compliance-full-rubric.test.js tests/compliance-cms-only.test.js tests/compliance-stage-gates.test.js tests/compliance-approved-decisions.test.js tests/compliance-judgment-pass.test.js tests/compliance-version-aggregation.test.js tests/compliance-reaggregation.test.js tests/compliance-overhaul.test.js tests/compliance-review-api.test.js tests/compliance-review-display.test.js tests/scoring-provider-guard.test.js tests/ma-script-2027.test.js
npm run typecheck:llm
npm run build
node scripts/compliance-overhaul/full-rubric-report.mjs --dry-run
git diff --check
```

Coverage includes: 138 original MA definitions, exactly three retirements, 135 restored MA rows and 251 original points; unchanged agency wording; all active CMS deterministic methods; tolerant TPMO organization/plan/resource/option variants; exact Mark TPMO excerpt; name/DOB signature followed by Dylan's And I agree; named-plan evidence elsewhere in enrollment; refusal/renewed recording consent; rejecting opening-only plan/topic evidence; drug coverage AND costs; pharmacy and provider network context; unrelated submitted-something and false benefit triggers; stage/15-minute/outcome/SEP/coverage gates; anchored stored agency points; conduct REVIEW and original-weight admin confirmation; no AI AUTO-FAIL; one-pass/cap/assessment/cache guards.

Saved 376-call snapshot: **24 scored, 318 N/A, 34 INCOMPLETE**. Agent means: Dylan 57.19 (12), Mark 35.95 (12), Mike N/A (0). Trigger remains INCOMPLETE, no score, no AUTO-FAIL. Mark's private report contains every active rule for each of his 12 scored calls: **1,620 rows**. All 42 remaining TPMO fail rows across ten calls are listed with excerpts; six v4 wording/trigger false-fail calls are corrected to PASS or N/A. Classification is limited to stored text, with recording verification still required before treating transcript misses as actual spoken omissions.

Historical judgment may be missing, unsupported or stale. It stays visible as REVIEW rather than being regenerated or invented; these preview scores are therefore not complete new model assessments or employee performance ratings. New rule weights remain agency-defined, not CMS-issued percentages. Endpoint transcript coverage does not prove all interior/per-channel speech is present. No recording or transcript was repaired.

The August 3 FINAL wording source was retained from the previously verified PDF; no September draft supplies matcher authority. CMS citations were rechecked against primary current eCFR, CMS-4212-F and the September 15, 2026 revision of CY2027 enrollment guidance. Part 423's parallel TPMO/scope/conduct provisions were considered; this original template/cohort is MA, not a new PDP rubric. Agency-specific additional speech/quality preferences are identified as such, not represented as verified federal duties.

Migration 144 and the pending version stamp in 139 remain unapplied. PostgreSQL transaction/concurrency/RLS execution, deployed UI and real provider behavior were not exercised. The build reports the existing postCallPipeline static/dynamic import warning; it completes successfully. No transcription, Deepgram, Railway transport or telephony source changed.
