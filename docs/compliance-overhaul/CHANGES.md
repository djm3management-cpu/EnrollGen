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
