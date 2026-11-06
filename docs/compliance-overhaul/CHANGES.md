# Change manifest and cost impact

All files are local to the feature branch. No deployment, env edit or migration execution occurred.

Recovering dropped audio can increase observed billed minutes relative to a broken stream. The branch does not upgrade the STT/model tier or add normal streams, but unchanged realized cost per talk minute has not been demonstrated. See cost-verification.sql and REPORT.md.

| File | Change | Cost impact |
|---|---|---|
| `.gitignore` | Keep production evidence reports and local preview out of Git. | 0 |
| `docs/compliance-overhaul/REPORT.md` | Report, full inventory or future verification/operator instructions. | 0 |
| `docs/compliance-overhaul/ROLLOUT.md` | Report, full inventory or future verification/operator instructions. | 0 |
| `docs/compliance-overhaul/cost-verification.sql` | Report, full inventory or future verification/operator instructions. | 0 |
| `docs/compliance-overhaul/rubric-inventory.md` | Report, full inventory or future verification/operator instructions. | 0 |
| `docs/compliance-overhaul/rule-buckets.md` | Report, full inventory or future verification/operator instructions. | 0 |
| `docs/compliance-overhaul/verify-before-enable.sql` | Report, full inventory or future verification/operator instructions. | 0 |
| `netlify/functions/_llmTelemetry.js` | Reserve global token allowance before paid scoring; await usage and estimated cost persistence. | No additional provider call |
| `netlify/functions/compliance-review-background.js` | One explicitly authorized manual judgment pass, with versioned persistence. | Paid only after admin confirmation; per-call/day cap |
| `netlify/functions/compliance-review.js` | Protected scorecard read and admin preview/review/re-evaluation/rescore/gap operations. | Free actions 0; paid actions gated by confirmation and configured prices |
| `netlify/functions/score-call-background.js` | Coverage/lifetime/version gates; immutable results; remove extra assessment request. | No automatic second pass; fewer paid completions |
| `netlify/functions/stt-alert.js` | Existing text alert path on exhaustion. | No LLM/STT |
| `netlify/functions/stt-reconnect.js` | Protected durable per-call channel registration/reconnect authorization. | Database checks only; limits billable stream churn |
| `netlify/functions/transcript-gaps-background.js` | Manual, range-cropped, ledgered Nova-2 batch gap fill; never automatic. | Only approved missing channel-minutes; configured rate required |
| `netlify/lib/complianceVersions.js` | Shared atomic version preparation/persistence with human-decision preservation. | 0 for free actions |
| `netlify/lib/manualTranscriptGaps.js` | Manual, range-cropped, ledgered Nova-2 batch gap fill; never automatic. | Only approved missing channel-minutes; configured rate required |
| `netlify/lib/postCallWork.js` | Preserve speech timing, speaker/segment identities, known gaps and scoring kill switch. | No new provider call |
| `scripts/compliance-overhaul/dry-run.mjs` | Read-only extraction or offline dry-run/report generation; no production execute mode. | 0 LLM/STT |
| `scripts/compliance-overhaul/read-only-audit.mjs` | Read-only extraction or offline dry-run/report generation; no production execute mode. | 0 LLM/STT |
| `scripts/compliance-overhaul/render-inventory.mjs` | Read-only extraction or offline dry-run/report generation; no production execute mode. | 0 LLM/STT |
| `scripts/compliance-overhaul/script-inventory.mjs` | Read-only extraction or offline dry-run/report generation; no production execute mode. | 0 LLM/STT |
| `src/compliance/engine/IntentClassifier.js` | Sort legacy classifier inputs; legacy helper remains for saved-result tooling. | No new paid path; automatic production scorer uses JudgmentPass |
| `src/compliance/engine/JudgmentPass.js` | One bounded full-call judgment pass with static rules first and anchored quotes. | Replaces repeated windows and separate assessment; max output 4096 |
| `src/compliance/engine/ScorecardGenerator.js` | Coverage/lifetime/version gates; immutable results; remove extra assessment request. | No automatic second pass; fewer paid completions |
| `src/compliance/engine/ScoringEngine.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/engine/VersionAggregator.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/rules/catalog.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/rules/evaluate.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/rules/transcript.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/shared/scoringPolicy.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/compliance/shared/tpmo2027.js` | Draft deterministic rubric, code-only hard failures, applicability and free aggregation. | 0 LLM/STT for deterministic work |
| `src/components/MiniLiveTranscript.jsx` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/components/callDetail/ComplianceReviewModal.jsx` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/components/callLog/CallRowParts.jsx` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/components/callLog/CallTranscriptPlayer.jsx` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/data/maScript2027.js` | Restore callback all-options clause and remove stale Part D phase wording. | 0 |
| `src/hooks/useCustomerAudio.js` | Recover browser fallback socket with KeepAlive, buffered speech, source ownership and sent-byte accounting. | Same Nova-2 rate; no filler; no intentional parallel streams |
| `src/hooks/useMergedTranscript.js` | Preserve speech timing, speaker/segment identities, known gaps and scoring kill switch. | No new provider call |
| `src/lib/complianceScore.js` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/lib/llm/client.ts` | Shared provider boundary requires scoring authorization; one request, no scoring retry/fallback. | Reduces scoring request count; other live paths retain their model policy |
| `src/lib/llm/types.ts` | Shared provider boundary requires scoring authorization; one request, no scoring retry/fallback. | Reduces scoring request count; other live paths retain their model policy |
| `src/lib/postCallPipeline.js` | Preserve speech timing, speaker/segment identities, known gaps and scoring kill switch. | No new provider call |
| `src/lib/recoveringSttSocket.js` | Recover browser fallback socket with KeepAlive, buffered speech, source ownership and sent-byte accounting. | Same Nova-2 rate; no filler; no intentional parallel streams |
| `src/lib/wavGaps.js` | Manual, range-cropped, ledgered Nova-2 batch gap fill; never automatic. | Only approved missing channel-minutes; configured rate required |
| `src/styles.css` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `src/styles/design-tokens.css` | Modal/recording/status/theme/indicator presentation and score visibility. | 0 LLM/STT |
| `supabase/migrations/132_compliance_overhaul_safety.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/133_compliance_atomic_versions.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/134_compliance_admin_versions.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/135_compliance_dispatch_freeze.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/136_manual_transcript_gaps.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/137_call_display_names.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/138_scoring_incomplete_status.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `supabase/migrations/139_stt_reconnect_budget.sql` | Unapplied schema, authorization, evidence/version, status or transport budget changes; see rollout order. | 0 until applied; constrains future paid requests |
| `telephony/src/media/deepgramTrack.js` | Idle text KeepAlive, gated close-before-reconnect, buffered/paced speech and timeline mapping. | Same Nova-2/channel rate; no filler or replay; recovered real audio adds normal minutes |
| `telephony/src/media/mediaStream.js` | Shared call reconnect budget and transport ping/pong health. | No audio generated; no extra channel |
| `telephony/src/media/sttAlert.js` | Existing text alert path on exhaustion. | No LLM/STT |
| `telephony/src/media/sttReconnectBudget.js` | Protected durable per-call channel registration/reconnect authorization. | Database checks only; limits billable stream churn |
| `telephony/src/transcripts.js` | Preserve speech timing, speaker/segment identities, known gaps and scoring kill switch. | No new provider call |
| `telephony/tests/sttRecovery.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/browser-stt-recovery.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-judgment-pass.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-overhaul.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-reaggregation.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-review-api.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-review-display.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/compliance-version-aggregation.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/live-transcript.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/manual-transcript-gaps.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/scoring-provider-guard.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |
| `tests/wav-gaps.test.js` | Local regression/fixture coverage; no provider traffic. | 0 during tests |


## November 6 approved continuation

See [APPROVED-DECISIONS.md](APPROVED-DECISIONS.md) for the current costs, 15-rule failure table, sample-review link and tests. No Deepgram transport or provider submission ran or changed in this continuation.

| File | Approved change | Cost impact |
|---|---|---|
| `src/compliance/shared/scoringConfig.js` | Approved prices, cached-token formula and hard 2M daily maximum | No provider work; caps cost |
| `src/compliance/engine/judgmentRequest.js` | Compact assessment in existing pass, stable product prefix, shared estimation and accepted section bound | No extra request; same 4096 output ceiling; lower estimated input |
| `src/compliance/engine/JudgmentPass.js` | Carry assessment; skip provider when no judgment applies | At most one request; zero for excluded calls |
| `src/lib/llm/openai.ts` | Low scoring reasoning and hard 4096 output clamp | No increased request ceiling |
| `netlify/functions/_llmTelemetry.js` | Cached cost and daily reservation denial/alert handling | No extra model request |
| `netlify/lib/postCallProvider.js` | Durable daily alert claim uses daily email idempotency key | Email only, no model or transcription |
| `netlify/functions/score-call-background.js` | Daily alert handled at reservation boundary to avoid duplicate sends | No added paid work |
| `netlify/functions/compliance-review.js` | Shared priced Rescore estimate and approved batch gap estimate | Estimates only; manual confirmation retained |
| `src/compliance/engine/ScorecardGenerator.js` | Assessment/risk included in atomic payload and current version stamp | No second assessment request |
| `netlify/functions/compliance-review-background.js` | Manual version carries same-request assessment/risk | No extra request |
| `src/compliance/rules/catalog.js` | Approved retirements/version and tolerant phrase patterns | CPU only |
| `src/compliance/rules/evaluate.js` | Completed repeat prompts, bounded channel overlap, scope wording and corrected applicability/consent deadline | CPU only |
| `src/compliance/engine/ScoringEngine.js` | Retirements excluded despite stale detections | CPU only |
| `src/compliance/engine/VersionAggregator.js` | Retirements excluded despite historical admin outcomes | CPU only |
| `supabase/migrations/132_compliance_overhaul_safety.sql` | Unapplied cached ledger field and persistent UTC budget latch/alert claim | No current cost; blocks future paid requests |
| `supabase/migrations/133_compliance_atomic_versions.sql` | Unapplied same-transaction legacy assessment writes | No model request |
| `supabase/migrations/134_compliance_admin_versions.sql` | Unapplied manual same-transaction assessment writes; free versions preserve fields | No model request |
| `supabase/migrations/138_scoring_incomplete_status.sql` | Unapplied current rules stamp | No provider work |
| `supabase/migrations/140_approved_cy2027_retirements.sql` | Unapplied successor template with 135 items; history retained | No provider work |
| `scripts/compliance-overhaul/dry-run.mjs` | Approved row and total gap estimates | Local reports only |
| `scripts/compliance-overhaul/approved-report.mjs` | Baseline/post-fix samples and per-call estimated costs | Local reports only |
| `scripts/compliance-overhaul/render-inventory.mjs` | Updated active/archive counts and inventory text | Local reports only |
| `tests/compliance-approved-decisions.test.js` | New budget/cache/schema/retirement/matcher fixtures | No provider requests |
| `tests/compliance-judgment-pass.test.js` | Updated required assessment fixture | No provider requests |
| `tests/compliance-review-display.test.js` | Updated required assessment fixture | No provider requests |

Documentation updated: REPORT.md, ROLLOUT.md, rubric-inventory.md, rule-buckets.md and APPROVED-DECISIONS.md in this directory. The private sample review is ignored by Git to keep stored call evidence local. The two unrelated user-created duplicate UI/style files are untouched.

## Script/stage scoring continuation

Current policy: `cy2027-script-stages-3`. See [STAGE-GATES-REPORT.md](STAGE-GATES-REPORT.md) for the 376-call dry run, same 15-rule comparison and agent means, and [script-backed-rules.md](script-backed-rules.md) for all 87 kept/75 excluded definitions. No transcription, Deepgram, Railway transport or telephony code changed.

| File | Change | Cost impact |
|---|---|---|
| `src/compliance/rules/scriptBasis.js` | Explicit per-product script/CMS allowlist; exact source lines; conditional branches; CMS-only metadata checks | CPU only; smaller judgment catalog |
| `src/compliance/rules/callStages.js` | 15-minute/outcome/conversation eligibility and detected stages, exact Enrolled and SEP gates | Skipped calls consume zero model tokens |
| `src/compliance/rules/acknowledgment.js` | Requested PECL response window/refusal policy and submission order; dormant without exact PECL basis | CPU only |
| `src/compliance/rules/catalog.js` | New version, 87 kept/75 excluded definitions; script-matched labels | Reduced prompt input; no new requests |
| `src/compliance/rules/evaluate.js` | Stage/path/product applicability, metadata-only results, script scope matching; PECL application questions cannot count | CPU only |
| `src/compliance/engine/IntentClassifier.js` | Legacy classifyCall delegates to the same gated one-pass implementation; removed old paid window loop | Prevents old multi-request path |
| `src/compliance/engine/JudgmentPass.js` | Explicit N/A/incomplete results and Code REVIEW detections | No request for excluded/incomplete calls |
| `src/compliance/engine/judgmentRequest.js` | Only supported product judgments; narrow CMS review scope and approved-closing exception | 27 judgment definitions versus 75; same 4096 output maximum |
| `src/compliance/engine/ScorecardGenerator.js` | Persist N/A before template/job/paid-pass claim; apply eligibility in scoring | Zero model calls for N/A |
| `src/compliance/engine/ScoringEngine.js` | Fail-closed allowlist, applicable denominator, Code REVIEW without deductions | CPU only |
| `src/compliance/engine/VersionAggregator.js` | N/A headers/zero points, reapply gates despite historical admin results, unknown rules excluded | Free re-aggregation only |
| `netlify/functions/score-call-background.js` | N/A response before fresh paid scoring | Prevents paid work |
| `netlify/functions/compliance-review.js` | Eligibility returned with reads; manual Rescore refuses N/A before claim/dispatch | Prevents paid work |
| `netlify/functions/compliance-review-background.js` | Recheck manual eligibility, save N/A instead of invoking provider | Prevents paid work |
| `netlify/functions/compliance.js` | Current scored-call aggregates exclude null/incomplete/N/A values | No provider work |
| `src/lib/complianceScore.js` | N/A is distinct from incomplete and never a percentage | No provider work |
| `src/components/callDetail/ComplianceReviewModal.jsx` | Disable Rescore for N/A; N/A zero-item headers do not show an item-loading error | No style or transcription behavior implementation changes |
| `supabase/migrations/132_compliance_overhaul_safety.sql` | Pending DB guard for under-minimum/excluded calls at pass claim and reservation | Unapplied; constrains future spending |
| `supabase/migrations/133_compliance_atomic_versions.sql` | Pending guard prevents excluded complete scores | Unapplied |
| `supabase/migrations/134_compliance_admin_versions.sql` | Pending N/A version validation and N/A call status | Unapplied |
| `supabase/migrations/138_scoring_incomplete_status.sql` | Pending distinct N/A status and current rules stamp | Unapplied |
| `supabase/migrations/141_script_stage_applicability.sql` | Pending N/A header RPC and 86-item MA successor; preserves historical templates/cards | Unapplied |
| `scripts/compliance-overhaul/stage-gates-report.mjs` | Explicit dry-run-only full source/rule/cohort/sample report, no database/provider client | Zero provider cost |
| `scripts/compliance-overhaul/render-inventory.mjs` | Current version/counts and link to exact allowlist | Local reports only |
| `tests/compliance-stage-gates.test.js` | Eligibility, source/CMS boundary, dormant PECL policy, recording metadata, unsupported historical/custom rows | Fixture doubles only |
| `tests/compliance-overhaul.test.js`, `tests/compliance-approved-decisions.test.js`, `tests/compliance-version-aggregation.test.js`, `tests/compliance-judgment-pass.test.js`, `tests/compliance-reaggregation.test.js`, `tests/compliance-review-api.test.js` | Bring fixtures onto eligible 15-minute calls or assert exclusion, preserve review/locking checks | Fixture doubles only |

The private full sample cards and baselines are excluded from Git. Original production headers/items are included alongside previous-draft and proposed cards locally; no production card was updated. The two unrelated duplicate UI/style files remain untouched.

## CMS-only continuation

Current rule version: cy2027-cms-only-4. [Full rules/citations](cms-only-rules.md), [dry run](CMS-ONLY-REPORT.md), [validation](VALIDATION-CMS-ONLY.md).

| Files | Change | Provider cost impact |
|---|---|---|
| `src/compliance/rules/cmsBasis.js`, `catalog.js`, `scriptBasis.js` | Citation-only authority; old script export is a compatibility alias; 21 active, 141 removed/consolidated | No provider work; fewer judgment items |
| `src/compliance/rules/evaluate.js` | Topic-based pre-enrollment checks, named-plan intent/affirmative, scope agreement, before-submission order, metadata checks | CPU only |
| `src/compliance/rules/callStages.js` | Preserve duration/outcome/stage/coverage gates; use verified submission metadata when present; no non-MA CMS assumptions | Zero model work for N/A |
| `src/compliance/shared/tpmo2027.js` | Full statutory options clause, filler/count/resource tolerance and explicit all-organizations wording variant | CPU only |
| `src/compliance/engine/JudgmentPass.js`, `judgmentRequest.js` | Only cited judgments; omit retired Code detections | One request maximum unchanged; judgment catalog 27 to seven |
| `src/compliance/engine/ScoringEngine.js`, `VersionAggregator.js` | One-point internal weights, no AI pass points, no unconfirmed deductions, new CMS deterministic evidence replaces old script admin outcomes | Free aggregation only |
| `netlify/lib/complianceVersions.js` | New versions use active rubric and evidence maps across template copies | Read/transaction work only; no model call |
| `supabase/migrations/134_compliance_admin_versions.sql`, `138_scoring_incomplete_status.sql`, `142_cms_only_rubric.sql` | Pending active-rubric versions, current stamp/N/A fence, cloned CMS template | Unapplied; no current cost |
| `scripts/compliance-overhaul/cms-only-report.mjs` | Explicit dry-run-only inventory, per-call/agent means, full original/before/after cards and pending SQL | No SQL/provider client |
| Historical `approved-report.mjs`, `stage-gates-report.mjs`, `render-inventory.mjs` | Guard against generating old-policy artifacts under the new authority | Local guard only |
| Scoring fixture files | Replace superseded script assertions; topic/consent/citation/ordering regressions and budget/API safeguards | Injected doubles only |

Documentation and private reports updated. No styles, transcription, Deepgram, Railway transport or telephony source changed. User PDF and two unrelated duplicate UI/style files remain untouched. No provider request, production query/write, rescore, dispatch/queue action, migration application, deploy, merge or push occurred.
