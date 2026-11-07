> Historical policy/report. The current full-rubric restoration is [FULL-RUBRIC-REPORT.md](FULL-RUBRIC-REPORT.md), version cy2027-full-rubric-5.

# Compliance scoring and live transcription overhaul

Superseded grading policy: the current CMS-only authority and dry run are in [CMS-ONLY-REPORT.md](CMS-ONLY-REPORT.md) and [cms-only-rules.md](cms-only-rules.md). Earlier figures below are retained as historical before-states.

Current scoring continuation: [stage applicability dry run](STAGE-GATES-REPORT.md) and [script/CMS-backed kept/removed rules](script-backed-rules.md) supersede the earlier draft scoring applicability below. Rules version is cy2027-script-stages-3. The live-transcription findings below are historical; this continuation changed no transcription, Deepgram, Railway transport or telephony code.

**Status: implementation draft, not ready for deployment approval.** Branch: `fix/compliance-scoring-overhaul`. No deployment, branch push, merge, production mutation, migration execution, LLM request or transcription API request was performed. Tests use injected model/socket/transcription doubles. Production reads were PostgREST GETs and 33 calls to the existing read-only `decrypt_pii_value` function; query statements were printed, and encrypted query bindings are retained in the private local query log.

## 1. Live transcript findings

The trigger call is `9e5f7473-e4dc-4325-8bad-763a7300d04e`. Its 198 utterances end at 545,579 ms, versus 4,390 seconds of talk time: **12.43% endpoint coverage**, with a **64.0737-minute missing tail**. The last utterance begins around 9:03 and ends at 9:05.579. The comparison call, `d7031a75-6c83-438f-9c82-075b7fac62dc`, has 822 utterances, with its last utterance beginning at 44:13.202 and ending at 44:16.032 against 44:17 talk time.

The trigger's `transcript_source` is `deepgram_server`. Its primary path is Twilio Media Streams to Railway (`telephony/src/media/mediaStream.js`), with separate customer and agent Deepgram connections in `deepgramTrack.js`. Browser customer capture is a separate fallback in `src/hooks/useCustomerAudio.js`. Browser agent recognition uses `useSpeechRecognition.js` and is not the Railway Deepgram transport.

The checked-out Railway implementation **already sent KeepAlive every five seconds**, retried connections three times and maintained a bounded buffer. It forwarded incoming Twilio audio frames without silence suppression. DeepFilterNet3 processes the browser microphone before Twilio; its gate attenuates samples rather than deliberately omitting Twilio packets. The browser PCM capture worklet can stop producing frames when no input is available; its old customer socket lacked recovery and instructed the agent to restart capture after a drop.

There is no stored stream-close event establishing why this trigger stopped. Read-only `telephony_events` records show routing, acceptance, normal browser disconnection at call end, recording duration 4,390 seconds, and completion. They contain no corresponding close/error event at the transcript cutoff. Railway CLI/log access and browser-host access were unavailable. **A silence timeout, connection failure, retry exhaustion, media transport loss or persistence failure remains a hypothesis, not a proven root cause.**

Deepgram documents a ten-second no-data timeout and recommends text KeepAlive at three-to-five-second intervals. KeepAlive pauses do not advance its audio clock. This is why the transport now maps submitted audio ranges onto the call timeline rather than adding only one reconnect offset. [Deepgram KeepAlive documentation](https://developers.deepgram.com/docs/audio-keep-alive).

The branch adds idle text KeepAlive, reconnect-on-audio, close-before-replacement, buffered audio with paced draining, per-call durable reconnect reservations, lifecycle logging, an agent indicator and a text alert through the existing provider alert mechanism. A healthy Twilio socket responds to ping/pong instead of being closed merely because audio pauses. No silent/filler audio is generated. Queue overflow is explicitly persisted as a capture gap. An initial stream registration also counts reopened channels after a process restart against the durable budget.

### Coverage inventory

The October 1 snapshot contains 376 calls:

| Result | Count |
|---|---:|
| Endpoint/known-gap coverage qualifies at 95% | 193 |
| Known duration, below 95% | 169 |
| Missing/zero duration | 14 |
| Total failing the coverage gate | 183 |

Three of the 169 have suspicious multi-day durations, including two approximately 574,000-second calls. Their talk counters and attempt end times also contain those durations; this audit cannot replace them with an invented duration. They require recording/provider verification and are blocked from gap-fill authorization. Excluding them leaves **834.3763 candidate gap minutes**. This is not an invoice or an authorization to transcribe.

The complete per-call list is [coverage.json](coverage.json): call ID, resolved agent, stored agent, talk duration, last transcript end, ratio, gap ranges, missing minutes, duration verification flag and price field. The endpoint metric does not prove that every interior pause contains missing speech; only known capture gaps are additionally counted. It is a minimum integrity gate, not a complete audio/transcript alignment test.

## 2. Rubric inventory and CY2027 review

Current source contains **162 intents: 138 Medicare and 24 annuity**, rather than 167/143/24. The active production template has 138 MA items. The database contains 148 intent rows, including historical entries. All active template intents occur in current source.

The full per-rule inventory is [rubric-inventory.md](rubric-inventory.md), with machine-readable detail in [rubric-inventory.json](rubric-inventory.json). It includes IDs, categories, descriptions, active points, decision source, old/new hard-fail eligibility, product/direction, historical N/A/pass/partial/fail counts, script candidate counts and legal-review notes. Historical counts include previous scorecard versions, not only current cards.

The draft classification is **84 DETERMINISTIC, 75 JUDGMENT, three RETIRE**. The complete bucket lists are [rule-buckets.md](rule-buckets.md). The November 6 approved retirements are the blanket ESRD eligibility check, blanket carrier-name comparison prohibition and generic CMS review-period statement. Active source counts are 159 (84 deterministic, 75 judgment), with three archived definitions. Rules version is cy2027-overhaul-draft-2. Historical items remain unchanged; unapplied migration 141 creates a 135-item successor MA template. Related conditional clinical/carrier/state requirements remain separate.

Actual script sources include:

- MA: `src/data/maScript2027.js`, `src/lib/maScriptFlow.js`, `src/components/ScriptFlow.jsx`; supplied source draft in `docs/MULTIPLAN_2113SMS_SalesScript2027_M draft 09.28.2026.docx`.
- Med Supp: `src/context/MedSupScript.js`, `src/components/MedSupFlow.jsx`.
- ACA: `src/flows/aca/ACAData.js`, `ACAScript.jsx`.
- U65: `src/flows/u65/U65Data.js`, `U65Script.jsx`.

[script-statements.json](script-statements.json) enumerates 637 candidate statements, including conditional and operational text. [script-mapping.json](script-mapping.json) maps existing rule patterns to source lines. **414 candidate statements remain unmapped by these pattern mappings.** They must not be represented as 414 unconditional CMS mandates or silently ignored as a finished rebuild. Conditional branch metadata and a semantic statement-to-rule review remain unfinished. Dedicated active Med Supp/PDP/ACA/U65 templates were not present in the production template read; the MA engine must not be presented as a complete grader for those products.

Verified CY2027 changes: TPMO before benefit discussion rather than within one minute; SHIP removed; SOA retained with no 48-hour waiting period; misleading superlatives remain subject to truthfulness, rather than a blanket superlative ban. The official disclaimer **still contains the all-options referral clause**. It was retained. [Published final rule](https://www.govinfo.gov/content/pkg/FR-2026-04-06/html/2026-06600.htm), [CMS CY2027 marketing changes tip sheet](https://www.cms.gov/files/document/changes-medicare-advantage-organization-medicare-drug-plan-sponsors-marketing-guidelines.pdf).

The MA callback disclaimer omitted that final clause; the branch adds it. A PDP script note still named the former Part D coverage-gap phase; the branch replaces that note with deductible, initial coverage and catastrophic phases. No numeric benefit thresholds were invented.

A standalone full 2027 MCMG edition was not established during this task. The published rule and CMS update tip sheet were used. **The rule-by-rule legal/carrier/state review is incomplete.** Inherited catalog citations are not certified current by this report. Recording consent, script preferences, optional needs questions, recording quality checks and plan-specific facts must be distinguished from universal CMS spoken-statement requirements.

## 3. Scoring implementation

`src/compliance/rules/` contains the draft catalog, full-call ordering/statement matcher and coverage calculation. Agent lines are sorted by speech time. Split statements can be matched across adjacent agent utterances. Consent/SOA/PECL checks require an affirmative customer response. Direction, product, disposition and supported conditional metadata are resolved in code; missing conditional metadata produces review rather than a fabricated requirement.

TPMO supports up to five filler words before counts, digits/number words, organizations/carriers/companies, plan/product counts and Medicare.gov/phone variants including 1800. Abandoned starts do not override a later completed passage. Needs questions and generic extras do not create a benefit trigger; extras create coaching evidence. Known plan names, carrier pitches, price and plan-benefit language do create triggers.

`JudgmentPass.js` submits one bounded, sorted full transcript with static instructions first. It filters judgment applicability in code and anchors returned quotes to stored utterances. AI cannot create a deterministic finding or an AUTO-FAIL. Unsupported quotes remain unscored review/completeness concerns. The separate assessment request remains removed. The November 6 update restores compact assessment/risk fields inside the same judgment response and legacy columns, without adding a request. See APPROVED-DECISIONS.md for token/cost estimates and the accepted-output section guard.

`scoringPolicy.js` and `ScoringEngine.js` restrict hard failures to code decisions with timestamped quotes. AI misconduct findings become REVIEW without deductions pending admin confirmation. Free aggregation preserves stored admin decisions. AUTO-FAIL header/item consistency is enforced in the proposed SQL.

The shared LLM client requires a durable reservation before provider access, permits one scoring request, and has no scoring retry or Terra fallback. The call-level ledger and daily token reservations include the provider request and its input/output usage. Historical cards/usage prevent a new automatic paid authorization. Transcript revisions and reconciliation cannot reauthorize a call. Manual paid exceptions are separately logged and limited to three per call per UTC day.

`SCORING_ENABLED`, `COMPLIANCE_RULES_VERSION`, pricing and daily-cap configuration all fail closed. The proposed database runtime fence additionally protects rollout from older workers that do not know the new environment switch. No environment variables were changed.

## 4. Modal and manual operations

`ComplianceReviewModal.jsx` uses an authenticated server read that surfaces item-query errors. The server scopes calls to the protected identity and tenant, loads versions and items, and decrypts only linked contact name fields. The proposed RLS aligns item/detection/evidence visibility with visible tenant scorecards.

The modal has a terminal default and an explicit local corporate light mode, both using existing design tokens. It uses flat sections, maximum font weight 500, outlined badges, four-pixel glossy buttons, twelve-hour dates and no new em-dash UI text. It shows coverage, version metrics, AUTO-FAIL evidence links, REVIEW controls, timeline events, weighted category bars and result filters with N/A collapsed. Recording timestamps seek the retained player.

Free re-evaluation and review adjudication use one version transaction, preserving originals. Confirmation requires evidence; dismissal excludes points. Only verified admins can mutate these decisions. Paid rescore requires a price confirmation and sufficient coverage; active passes disable conflicting actions.

Manual gap fill is a separate administrator-created job, never a cron or reconciliation action. The implementation slices PCM WAV ranges before submitting them to Nova-2 batch, records the request before provider access and never automatically retries uncertain requests. It requires a verified full-call recording ID, channel mapping and recording/transcript timeline offset. Those values have **not** been populated for existing calls. The trigger's exact recording offset is not assumed. Approved pricing is now configured in source. Paid execution remains disabled until recording prerequisites and deployment acceptance are verified. The gap-fill path never calls an LLM or automatically scores its result.

Visual inspection could not be completed because the browser access host was unavailable. The local synthetic preview fixture is `compliance-overhaul-preview.html` (ignored by Git). The theme description above reflects the implementation, not a claimed screenshot review.

## 5. Dry-run results

Only offline dry runs were executed after read-only extraction:

```text
calls since October 1: 376
coverage qualified: 193
coverage gate failures: 183 (169 known low coverage, 14 unknown duration)
duration verification cases: 3
candidate gap minutes excluding invalid multi-day durations: 834.3763
all historical scorecards evaluated: 161
proposed complete versions: 95
proposed incomplete versions: 66
name-change candidates: 381 calls
agent-name corrections: 371
consumer-name corrections: 62
production writes: 0
```

Outputs:

- [reevaluation-dry-run.json](reevaluation-dry-run.json): every stored card, old score/result, proposed score/state, new deterministic items and changes.
- [matcher-dry-run.json](matcher-dry-run.json): every deterministic rule's counts over the 193 qualifying October transcripts, with up to three failures and nearest lexical context. Context is explicitly not proof of absence.
- [names-dry-run.json](names-dry-run.json): protected assignment/membership basis and linked-contact proposals. Ownership is not changed.
- [coverage.json](coverage.json): all gate failures and candidate time ranges.
- [name-read-query-log.json](name-read-query-log.json): exact encrypted bindings for the 33 read-only decryption calls.

For the trigger: **62.5%, AUTO-FAIL → proposed INCOMPLETE, no percentage, no AUTO-FAIL**. Its stored 138 items remain intact; the branch has not repaired its production records. Draft numeric re-evaluations for other calls are not approved replacements.

Approved November 6 prices are now populated: input $0.20/M, output $1.20/M, cached input $0.02/M, batch transcription $0.0043/channel-minute. The trigger tail is 64.0737 timeline minutes, approximately 128.1474 channel-minutes and $0.551034 assuming two channels. Across 166 duration-valid incomplete candidates: 834.3763 timeline minutes, 1,668.7526 channel-minutes, $7.175636. Fourteen unknown durations and three duration anomalies remain unpriced and excluded, with explicit reasons. Recording/channel/timeline mapping still requires verification before any paid fill.

Private JSON reports and the raw snapshot are local-only and excluded from Git. Reproduction:

```sh
node --env-file=.env.local scripts/compliance-overhaul/read-only-audit.mjs --include-history --decrypt-names
node scripts/compliance-overhaul/dry-run.mjs
node scripts/compliance-overhaul/script-inventory.mjs
node scripts/compliance-overhaul/render-inventory.mjs
```

These tools do not have a production execute mode. The extractor only reads; the others only read the local snapshot/source and write local reports.

## 6. Validation and remaining acceptance work

November 6 update: passed 241 selected frontend/engine/API/transport/accounting tests and nine isolated Railway recovery tests, including approved positive and absent-statement cases for all 84 draft deterministic matchers. Passed: Vite production build, LLM typecheck and targeted lint. All provider boundaries in those tests are injected doubles. No production-equivalent SQL integration suite, production RLS impersonation test, actual provider timing test or real-audio batch test was run. The complete repository suite was not claimed to pass; old SQL-backed scoring/transport suites still need migration to the new lifecycle contract.

Required before deployment approval:

1. Finish per-rule legal/script/conditional applicability review, including the 414 unmapped candidates and missing product-specific coverage. Add stronger negative/paraphrase validation for topic-based matchers. Positive phrase matches do not prove absence detection is ready to grade people.
2. Validate migrations and concurrency/RLS using an isolated production-equivalent schema; validate existing dependent functions and legacy repair RPCs after wrapping persistence.
3. Finish full transport ownership acceptance, including cross-process/browser handoff and active conferences, not only isolated per-track socket tests.
4. Approved rates and the 2,000,000 UTC-day token cap are documented. Verify gap recording/channel/offset metadata and budget concurrency in staging. Cost per recovered call minute cannot be certified from these dry runs.
5. Review the modal visually in both themes and validate admin actions/version selection against staging data without provider calls.
6. Verify the under-two-minute target after an explicitly approved future canary. No real-provider timing claim is made here.

## 7. SQL and rollout

All SQL is **unapplied**. Apply order and exact future operator steps are in [ROLLOUT.md](ROLLOUT.md). The first migration installs a disabled database scoring fence so older workers cannot claim new scoring work during rollout. Existing in-flight workers must be allowed to quiesce before changing persistence.

The branch is committed locally only. It must not be merged, pushed to main, deployed or enabled on the strength of the draft test counts alone.
