# Approved scoring updates, November 6

Superseded grading policy: the current CMS-only authority and dry run are in [CMS-ONLY-REPORT.md](CMS-ONLY-REPORT.md) and [cms-only-rules.md](cms-only-rules.md). Earlier figures below are retained as historical before-states.

Later script/stage applicability changes are in [STAGE-GATES-REPORT.md](STAGE-GATES-REPORT.md). The draft-2 counts below are retained as the historical before-state. Current rules are cy2027-script-stages-3.

Implemented locally on fix/compliance-scoring-overhaul. No provider requests, transcription, production SQL queries or production writes were performed in this continuation. No rescore/dispatch/queue, migration application, deploy, merge or push occurred.

The 2,000,000-token daily UTC cap now has a persistent halt and a once-per-day alert claim; manual and automatic scoring share it. The three approved rules are excluded in future scoring, including stale detections and preserved admin results; historical cards remain intact. Rules version is cy2027-overhaul-draft-2. Active source counts: 159 (84 deterministic, 75 judgment), with three archived retirements. Migration 140 creates the 135-item successor MA template.

Agent assessment and beneficiary risk now share the one judgment request and the legacy call-record fields. Static product rules/schema precede the transcript. Reasoning is low and the adapter clamps total output to 4,096. Cached input has its own ledger field and discounted pricing. Matcher changes fix recorded-line wording, Parts A and B, max-out-of-pocket wording, acknowledged scope questions, repeated prompts and bounded response overlap. Travel benefit pitches are not accepted as travel-needs questions.

## Tokens and cost per judgment pass

Prices: input $0.20/M, output $1.20/M, cached input $0.02/M. Input is a character estimate (3.5 characters/token), not a provider tokenizer measurement. Output below is the maximum allowance, not a measured or promised typical completion. Cold input is used in the Rescore confirmation. Actual cache hits use reported cached tokens, never assumed hits.

| Full-transcript case | Before estimated input | After estimated input | Before / after max output | Before cold estimate | After cold estimate |
|---|---:|---:|---:|---:|---:|
| Stored complete 44:17 comparison call | 19,601 | 19,427 | 4,096 / 4,096 | $0.0088354 | $0.0088006 |
| Modeled 75-minute call, same transcript density | 30,257 | 30,083 | 4,096 / 4,096 | $0.0109666 | $0.0109318 |

For the complete 44:17 case, caching the eligible static prefix would estimate $0.0080689. Caching is not guaranteed. The trigger's stored nine-minute fragment estimates $0.0064944 before and $0.0064454 after, but coverage blocks a pass and those figures do not represent its missing 64 minutes. Across all 376 saved calls, no projected request ceiling increased; calls with no applicable judgment rules now make zero provider requests. An assessment can increase actual completion length within the unchanged allowance, so actual bill savings have not been measured.

The assessment has <=120 words of agent text (a stricter 190-character schema bound), risk low/medium/high and <=3 short reasons. Maximum canonical assessment JSON is 341 ASCII bytes, conservatively below 400 BPE tokens. The raw section is also rejected above 400 bytes, including whitespace/escapes. The API offers only a whole-response generation cap: this is an accepted-output section guard, not an independent provider-side subfield limit. Invalid/oversized/missing assessment leaves scoring incomplete without another request. Unrequested legacy metrics are null or empty, rather than fabricated.

## Gap-fill estimates

Nova-2 batch: $0.0043 per channel-minute. Assumed two channels pending verified mapping.

- 166 duration-valid candidates: 834.376317 timeline minutes, 1,668.752633 channel-minutes, **$7.175636 total ($7.18)**.
- Trigger call: 64.073683 timeline minutes, 128.147367 channel-minutes, **$0.551034 ($0.55)**.
- Excluded: 14 unknown durations and three duration anomalies. No defensible dollar estimate until duration is verified.

These are candidate endpoint/known-gap ranges, not proven lost speech. Recording ID, channel ownership and timeline offset still require verification before any manual fill. No gap fill ran. Local private [coverage rows](coverage.json), [totals](coverage-totals.json) and [per-call cost estimates](approved-costs.json) are populated for priceable calls.

## Highest failure-rate rules

All fifteen tie at 100% in the baseline; source order breaks ties. Denominator excludes N/A and unknown-applicability REVIEW rows. Of 193 endpoint-qualifying calls, 131 are under two minutes. These are matcher outcomes, not confirmed compliance violations.

| Rule ID | Plain-English name | Before fail/applicable | After fail/applicable |
|---|---|---|---|
| SOA_001_SOA_REFERENCE | Agent references SOA on file | 181/181 | 173/181 |
| SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027 | SOA obtained before plan discussion | 181/181 | 174/181 |
| SOA_004_SOA_SCOPE_STATED | Agent states SOA scope | 181/181 | 173/181 |
| ELIG_007_SEP_REASON_DOCUMENTED | SEP qualifying reason documented | 1/1 | 1/1 |
| NEEDS_014_TRAVEL_FREQUENCY | Asks about travel frequency | 181/181 | 181/181 |
| PLAN_006_MOOP_STATED | States maximum out-of-pocket | 181/181 | 180/181 |
| PLAN_009_REFERRAL_REQUIREMENTS | Explains referral requirements | 181/181 | 181/181 |
| IMPACT_008_COVERAGE_GAP_WARNING | Explains coverage gap during transition | 181/181 | 181/181 |
| PECL_001_CHECKLIST_REFERENCED | References the Pre-Enrollment Checklist | 10/10 | 10/10 |
| PECL_003_DEDUCTIBLE_CONFIRMED | PECL: deductible amount confirmed | 10/10 | 9/10 |
| PECL_004_MOOP_CONFIRMED | PECL: maximum out-of-pocket confirmed | 10/10 | 10/10 |
| PECL_006_PHARMACY_NETWORK_CONFIRMED | PECL: pharmacy network confirmed | 10/10 | 10/10 |
| PECL_007_DRUG_COVERAGE_CONFIRMED | PECL: drug coverage confirmed | 10/10 | 10/10 |
| PECL_008_BENEFITS_UNDERSTOOD | PECL: beneficiary confirms understanding of benefits | 10/10 | 9/10 |
| PECL_009_COST_SHARING_UNDERSTOOD | PECL: cost sharing understood | 10/10 | 10/10 |

The private [sample review](matcher-false-fail-review.md) contains two selected examples per rule with call ID, timestamp, quote, reason and false-fail label. SEP has only one applicable call, so only one real example exists. Each example distinguishes a corrected wording/timestamp outcome from an absent phrase or missing acknowledgment. Travel/referral/coverage-gap/checklist misses were not force-passed. The remaining draft topic matchers still need the legal/script/negative-case acceptance documented in REPORT.md; these fixes do not certify the whole rubric.

Outside the tied top 15, recording disclosure improves from 98/181 failures to 36/181 and Parts A/B from 175/181 to 131/181. Scope reference/scope wording move from zero passes to eight; ordering passes seven. Explicit refusals cannot be skipped for a later generic yes. A 500ms overlap tolerance accommodates the observed 51ms and 111ms response overlap. Recording permission no longer establishes enrollment consent.

## Changed source and cost impact

| Files | Change | Provider cost impact |
|---|---|---|
| src/compliance/shared/scoringConfig.js | Approved public prices, cached-input calculation and capped daily configuration | Discount correct cached subset; no provider work |
| src/compliance/engine/judgmentRequest.js, JudgmentPass.js | Shared compact schema, assessment mapping, static prefix, common estimate, raw section validation, skip zero-applicability requests | One request; unchanged overall output ceiling; lower estimated input |
| src/lib/llm/openai.ts | Low scoring reasoning; 4,096 hard overall output clamp | No increase to request ceiling |
| netlify/functions/_llmTelemetry.js, netlify/lib/postCallProvider.js | Cached ledger cost, persistent daily denial and daily alert idempotency | Caps paid work; alert only |
| netlify/functions/compliance-review.js | Rescore/gap preview uses approved prices and shared full-pass estimator | Confirmation estimate only; no automatic paid work |
| ScorecardGenerator.js, compliance-review-background.js, migrations 133/134 | Carry assessment and risk into existing fields in scorecard transaction | Removes any need for separate assessment request |
| catalog.js, evaluate.js, ScoringEngine.js, VersionAggregator.js | Retirement enforcement and bounded matcher corrections | CPU only; no provider work |
| migrations 132/138/140 | Durable UTC cap/cache ledger, version stamp and cloned template | Unapplied; no current cost |
| scripts/compliance-overhaul/dry-run.mjs, approved-report.mjs, render-inventory.mjs | Local coverage/cost/evidence reports and updated inventory | No database/provider client in dry runs |

Paths above are relative to src/compliance/engine or src/compliance/rules where shortened. No Deepgram transport or transcription submission implementation was changed in this continuation. The approved batch price populates estimates only.

## Verification and dry-run output

241 selected application tests passed; nine isolated Railway STT recovery tests passed (250 total). Vite build, LLM typecheck, targeted ESLint and git diff whitespace checks passed. Provider boundaries were fixtures only. SQL remains unapplied and PostgreSQL concurrency/email delivery checks remain future acceptance work.

Dry run: 376 calls; 193 coverage-qualified; 183 incomplete; 166 priceable candidates; 84 deterministic matchers; 161 historical scorecard re-evaluations; 381 name-backfill candidates. Zero production writes. Original scorecards and names are unchanged. No new production SQL queries were run, so the existing QUERY_LOG.md has no new entries for this continuation.

Reproduce offline after restoring the private snapshot and baseline:

```sh
node scripts/compliance-overhaul/dry-run.mjs
node scripts/compliance-overhaul/render-inventory.mjs
node scripts/compliance-overhaul/approved-report.mjs docs/compliance-overhaul/matcher-before-approved-decisions.json
```

[ROLLOUT.md](ROLLOUT.md) contains the approved values, conservative reservation behavior, unapplied SQL order 132-140 and future deployment steps. No approval to deploy or execute data repair is inferred from the source changes.
