> Historical policy/report. The current full-rubric restoration is [FULL-RUBRIC-REPORT.md](FULL-RUBRIC-REPORT.md), version cy2027-full-rubric-5.

# CMS-only scoring dry run

Rules cy2027-cms-only-4. 21 cited requirements; 141 excluded definitions. No provider requests, production queries/writes, rescores, queue actions, migration applications, deploys, merges or pushes. The same 376-call saved October 1-onward snapshot was used. No transcription, Deepgram, Railway transport or telephony source changed.

Result: **24 scored estimates, 318 N/A and 34 INCOMPLETE**. The trigger remains **INCOMPLETE**, score none, AUTO-FAIL false. These are offline previews; original production records are unchanged.

## Agent averages

Before is the last committed script/stage dry run; after is CMS-only. Means are per-call, not weighted by minutes. The same-call paired comparison is included to expose cohort changes. Michael is stored as mike_shiomos.

| Agent | Before mean (n) | After mean (n) | Paired before / after (n) |
|---|---|---|---|
| dylan_maria | 60.26 (12) | 34.03 (12) | 60.26 / 34.03 (12) |
| mark_endres | 37.44 (12) | 9.72 (12) | 37.44 / 9.72 (12) |
| mike_shiomos | N/A (0) | N/A (0) | N/A / N/A (0) |

## Rules, evidence and limits

[Full graded and removed lists with CMS citations](cms-only-rules.md). [Two full production/before/after scorecards](cms-only-samples.md). [All proposed call headers and per-rule counts](cms-only-results.json). Private call evidence stays local and excluded from Git.

- 0e9f4a74-4d41-45fa-84d2-b531f9ef8d52: 49% before, 66.67% after; 8/12 applicable points.
- 13281a25-f547-4b28-956c-879c739ac099: 81.98% before, 83.33% after; 10/12 applicable points.

The six requested pre-enrollment topics are restored as tolerant CMS topic checks; pharmacy network status is additionally explicit in §422.2274(c)(12). They need no exact PECL recital or separate yes. Discussion during the application is valid before actual submission. Missing submission time produces REVIEW where timing cannot be verified. Application-only pharmacy/other-coverage questions never satisfy the topic.

Spoken confirmation-number and federal-contracting-statement checks are excluded because the reviewed sources do not establish the requested universal live-call speech obligation. Tracking and marketing-material duties are not being waived. Additional cited metadata checks are recording integrity and identified inter-TPMO written consent; a scope-exceedance REVIEW is retained. All generic agency preferences and duplicate component penalties are removed.

The 8/03/2026 FINAL PDF was verified on its title page and relevant pages. It recognizes wording only. No 09.28.2026 draft text is used to authorize grading. Standalone 2027 MCMG publication was not confirmed; no fabricated citation is used.

CMS does not set these percentages: internal weights are one per requirement. AI no-findings do not award points; review flags do not deduct until administrator confirmation. Old script-based admin outcomes do not override newly evaluated deterministic CMS evidence. The 15-minute, excluded-outcome, connected-conversation, coverage, stage and exact-Enrolled gates remain. No SEP speech rule is retained without a distinct required spoken statement; election-period detection still excludes AEP/OEP from SEP treatment.

Endpoint transcript coverage is unchanged; it is not proof of complete interior or per-channel capture. No recording/transcript repair occurred. Stored judgment can supply review evidence, but no new AI classification ran. Missing evidence is not invented.

## Validation

See VALIDATION-CMS-ONLY.md for exact offline test/check results. SQL is an unapplied proposal and has not been database integration-tested. No real-provider benchmark is claimed.

Reproduce offline: `node scripts/compliance-overhaul/cms-only-report.mjs --dry-run`. The private baseline and snapshot must exist. There is no execute mode.
