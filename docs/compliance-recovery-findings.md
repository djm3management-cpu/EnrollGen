# Compliance recovery and review findings

Branch: `fix-compliance-recovery-review`. Investigation used read-only Supabase REST queries. No production writes, migrations, deployment, recording download, paid transcription or paid scoring were performed. New migrations **147 and 148 remain unapplied**. Existing unrelated untracked files were left alone.

## Part A — the production call

### Verified database observations

Call `7743bf6a-893f-4744-a5cf-c4988dabb81e`, session `62d41ae6-8a14-4f97-8533-044ed74e6863`, parent SID `CA0784f3a7b82446562197ee4dd2b83241`. Product `MA`, disposition `enrolled`, duration **3,026 seconds (50:26)**. Its saved status is `failed`, with `scoring_attempts_exhausted`; it has no linked scorecard. Reproducible, consumer-data-free queries: `docs/compliance-recovery-readonly.sql:3`.

| Row/store | Observed values | Evidence query |
|---|---|---|
| `call_records` | Start 19:37:33.496761Z; end 20:28:04Z; failed at 20:59:03.517262Z on 2026-11-09 | `docs/compliance-recovery-readonly.sql:3` |
| `transcript_score_dispatch` | revision 1; delivered revision 1; dispatch attempts 3; `available_at=infinity`; `last_error=scoring_attempts_exhausted`; ready at 20:55:21.470321Z | `docs/compliance-recovery-readonly.sql:10` |
| `scoring_jobs` | No rows for this call | `docs/compliance-recovery-readonly.sql:13` |
| `compliance_llm_passes` | No rows for this call | `docs/compliance-recovery-readonly.sql:18` |
| Agent segments | 432; first start 129 ms; last end 1,998,119 ms | `docs/compliance-recovery-readonly.sql:21` |
| Customer segments | 222; first start 6,670 ms; last end 1,997,439 ms | `docs/compliance-recovery-readonly.sql:21` |
| Last captured utterances | Agent 20:10:55.282Z; customer 20:10:55.142Z. These are capture timestamps, not proven socket-close times. | `docs/compliance-recovery-readonly.sql:21` |
| `stt_call_reconnects` | One initial stream registration per channel; **0 reconnects** | `docs/compliance-recovery-readonly.sql:27` |
| Call attempts / conferences | One attempt, answered 19:37:38Z, ended 20:28:04Z; **no conference row** | `docs/compliance-recovery-readonly.sql:21`, `:29` |
| Browser lifecycle events | Accepted 19:37:38.333233Z; disconnected 20:28:04.529975Z, at call end, not the transcript cutoff | `docs/compliance-recovery-readonly.sql:31` |
| Recording ingestion | ID `20cf5a89-7ec8-4373-97aa-2412e8b4580d`; DialVerb; two channels; duration 3,026 seconds; copy failed once with **`recording_too_large`**, no verified storage copy | `docs/compliance-recovery-readonly.sql:34` |

**Other affected calls:** in the fixed 30-day window **2026-10-11 05:00Z through 2026-11-10 05:00Z**, there is **1 call** with `scoring_attempts_exhausted`, this call. Therefore there are **0 other calls with that error**, and 0 others combining that error with partial coverage. This is not a count of every possible transcription or scoring failure. Query: `docs/compliance-recovery-readonly.sql:41`.

### What happened, and what remains unknown

1. Both live transcript channels started and produced 654 persisted segments. Their timestamps stop around 33:18, although the call continued another **17:07.881**. Coverage is the latest transcript endpoint divided by talk duration, plus separate channel-span checks; it does **not** prove that every second in the tail contained speech. Code: `src/compliance/rules/transcript.js:7`, `:13`, `:27`; database evidence above.
2. The scoring dispatcher delivered this revision three times, then set delivery complete/infinity and recorded exhaustion. **Three deliveries are not three paid scoring attempts:** this call has no `scoring_jobs` or `compliance_llm_passes` rows. The dispatcher has its own three-delivery cap, distinct from the scoring-job three-attempt cap. Code: `supabase/migrations/113_scoring_dispatch_retry_bounds.sql:48`, `:93`; query: `docs/compliance-recovery-readonly.sql:10`.
3. The exact responses to those three deliveries are not retained in the surviving dispatch row. They could have failed before a job claim: configuration/version gate, internal auth, database/call load, active-parent verification, subscription/seat gates, or delivery/handler failure. Coverage rejection also happens before a job claim. **I cannot establish which handler path ran in production from this row.** Code: `netlify/functions/score-call-background.js:44`, `:64`, `:97`, `:108`; `src/compliance/engine/ScorecardGenerator.js:67`; `telephony/src/transcripts.js:51`.
4. The screen independently detects incomplete coverage and hides the grade. Its saved-error text comes from the exhaustion code. “Legacy” was a fallback for a missing `rules_version`, including a missing scorecard; it did not establish that legacy scoring ran. Rescore was disabled whenever the view was incomplete. Re-evaluate was not similarly gated, but its backend required an existing scorecard, so this call could not actually use it successfully. Code: `src/lib/complianceScore.js:18`, `src/lib/scoringStatus.js:1`; original behavior remains inspectable with `git show e2e1740:src/components/callDetail/ComplianceReviewModal.jsx` (lines 60–68), and `git show e2e1740:netlify/lib/complianceVersions.js` (line 4). New behavior: `src/components/callDetail/ComplianceReviewModal.jsx:61`, `:65`; `netlify/lib/complianceVersions.js:4`.
5. SOA/Enrollment “Missing” chips are deterministic searches of the available transcript and call metadata. They do not establish that those events were missing from the untranscribed tail. Code: `src/components/callDetail/ComplianceReviewModal.jsx:32`, `:72`; `src/compliance/rules/callStages.js:8`.

| Candidate cause | Finding | Evidence / exact remaining check |
|---|---|---|
| Speech-to-text stream stopped/dropped | **Partial:** both stored channels stop together. The exact transport/provider cause was not durably captured. | `docs/compliance-recovery-readonly.sql:21`; Railway → telephony service → deployment logs, UTC 2026-11-09 20:10:45–20:11:30, search the parent SID and `stt_stream_close`, `Media lease ended`, `Media binding unavailable`, `Media transport`, `stt_usage_failed`. |
| Reconnect budget exhausted | **Not supported for this call:** durable counter is zero, not 20. | `docs/compliance-recovery-readonly.sql:27`; cap code `telephony/src/media/deepgramTrack.js:174`, `supabase/migrations/140_stt_reconnect_budget.sql:16`. |
| Lease expiration / transient database error | **Needs logs.** Before this change, one renewal RPC exception immediately killed both tracks. A lease is 20 seconds and renewals occur every five seconds. The five-minute signed URL expires only during connection/start validation, not at 33 minutes. | `supabase/migrations/074_media_stream_auth.sql:54`; `telephony/src/media/mediaStream.js:179`; `telephony/src/media/streamToken.js:5`; `telephony/src/media/mediaStream.js:142`. Check Railway logs above. |
| Transfer/conference leg untranscribed | **No app-managed conference evidence:** one attempt, no conference row. External events outside the app cannot be ruled out. | `docs/compliance-recovery-readonly.sql:21`, `:29`; Twilio Console → Monitor → Logs → Calls → parent SID → child calls/events. |
| Provider quota/error | **Unproven.** No paid scoring-pass row and zero reconnects; neither proves absence of a provider error. | `docs/compliance-recovery-readonly.sql:18`, `:27`; Deepgram Console → usage/request logs around 20:10:55Z; Railway close/error logs. |
| Browser/agent disconnected at cutoff | **Not supported by recorded lifecycle:** browser disconnect is at 20:28:04Z. Server transcription persists independently of browser delivery. | `docs/compliance-recovery-readonly.sql:31`; `telephony/src/media/mediaStream.js:79`; `telephony/src/transcripts.js:19`. |
| Specific `fmo_transfer` timer | **Not found in transcription path.** This is a contact-source label; incoming calls use the ordinary Dial recording/media path. | `telephony/src/routes/twilioVoice.js:137`, `telephony/src/contacts.js:10`, `telephony/src/media/mediaStream.js:19`. |
| Recording unavailable in private storage | **Verified separate recovery obstacle:** copy was rejected as too large. Default storage copy limit is 50 MiB. A 50:26, 8 kHz, 16-bit stereo PCM file is roughly 96.8 MB. Actual file bytes and production limit overrides were not read. | `docs/compliance-recovery-readonly.sql:34`; `telephony/src/config.js:34`, `telephony/src/recordings.js:171`. |

For scoring delivery cause, use **Netlify → EnrollGen site → Logs → Functions → `score-call-background`**, UTC **20:55:00–21:00:00 on 2026-11-09**, filtering call ID. Check status codes/configuration messages and the deployed commit. In Netlify environment settings, inspect **names** `SCORING_ENABLED`, `COMPLIANCE_RULES_VERSION`, `SCORE_CALL_JOB_SECRET`; compare the version to `src/compliance/rules/catalog.js:4`. Do not export credentials. Database runtime gate query: `docs/compliance-recovery-readonly.sql:45`.

**Root-cause limit:** the cutoff’s precise production cause remains unproven. The branch fixes the verified silent-stop observability gap, immediate termination on transient renewal errors, missing automatic recording recovery, and no-scorecard manual-recovery failure; it does not claim to have identified a historical socket-close reason that was never saved.

### Changes made

- Transient renewal transport failures can retry within the existing valid lease, without extending the lease or increasing reconnect budgets. Explicit lease denial still stops immediately; repeated exceptions stop before the 20-second lease expires. Unexpected media closure now persists an incident and alerts the administrator with a call ID/reason. Routing and audio-call lifecycle are not changed. `telephony/src/media/mediaStream.js:88`, `:179`; `telephony/src/transcripts.js:8`; `netlify/functions/stt-alert.js:1`.
- Before any scoring model invocation, an ended, authorized sale with insufficient coverage enters recording recovery. Default-off `TRANSCRIPT_AUTO_RECOVERY_ENABLED` controls the new paid path. Verified ordinary Dial recordings derive parent/child speakers and answer-time alignment; conferences, multiple attempts, ambiguous recordings, excessive gaps/cost, or prior paid scoring are blocked for admin review. `netlify/functions/score-call-background.js:97`, `:120`; `netlify/lib/transcriptRecovery.js:9`, `:62`; `supabase/migrations/147_bounded_transcript_recovery.sql:35`.
- Automatic cost reservations are atomic: **one attempt per call for its lifetime, at most four ranges, $0.50 per call, $10 globally per UTC day**; failed/uncertain provider requests are not refunded or replayed. Downloads are bounded at 128 MiB; provider requests time out. Late/missing channel endpoints are included in repair planning without changing grading coverage. `netlify/lib/transcriptRecovery.js:6`, `:28`; `supabase/migrations/147_bounded_transcript_recovery.sql:4`, `:55`; `netlify/functions/transcript-gaps-background.js:4`, `:40`.
- Each provider range is durably claimed before submission. Repaired, redacted utterances are written both to the call transcript and canonical segment store so reconciliation cannot erase them. Original utterances and scorecard versions remain. Only successful repaired ranges clear their known capture-gap markers. Coverage is recomputed; **the same 95% checks must pass** before normal scoring dispatch resumes. `netlify/lib/manualTranscriptGaps.js:5`; `supabase/migrations/147_bounded_transcript_recovery.sql:83`; `netlify/lib/transcriptRecovery.js:77`; STT usage remains distinct from paid scoring entitlement (`supabase/migrations/147_bounded_transcript_recovery.sql:121`); unchanged gate `src/compliance/rules/transcript.js:18`, `:27`.
- Recovery failures/exhausted deliveries have a durable administrator alert row. The existing dispatcher retries unsent ID/reason-only email notifications; abandoned automatic jobs expire after 15 minutes without another transcription purchase. `supabase/migrations/147_bounded_transcript_recovery.sql:6`, `:121`; `telephony/src/transcripts.js:89`; `netlify/functions/stt-alert.js:9`. Email still requires `RESEND_API_KEY` and a working `POST_CALL_ALERT_EMAIL` destination, as in `netlify/lib/postCallProvider.js:37`.
- The UI names one next action for the current state: **Fill transcript gaps** while coverage is partial, **Rescore** after coverage is complete. Recovery-in-progress is shown and duplicate clicks disabled. The unchanged threshold still blocks paid Rescore on a partial transcript. No scorecard now says **Not scored**, not Legacy. `src/components/callDetail/ComplianceReviewModal.jsx:54`, `:61`, `:65`, `:69`.
- First manual scorecard creation now works when no automatic scorecard was ever created. It retains the source-version lock, admin auth, row/evidence checks and existing scoring math. Template/source preflight runs before a paid manual model call. `netlify/lib/complianceVersions.js:4`; `netlify/functions/compliance-review-background.js:28`; `supabase/migrations/148_initial_manual_compliance_version.sql:17`.

## Part B — scoring and the review screens

### Existing scoring math and evidence

**Verified:** overall score is `100 × sum(points_earned) / sum(points_possible)` after event deductions, rounded to two decimals. Category totals already exist and are recomputed from those same final per-rule points; they are not a separate weighted average of category percentages. Automatic scorecards store them in `compliance_scorecards.category_scores`. Passing uses the template threshold (default 85), subject to supported deterministic auto-fail. Grades are A+ ≥97, A ≥93, A− ≥90, B+ ≥87, B ≥83, B− ≥80, C+ ≥77, C ≥73, C− ≥70, D ≥60, otherwise F; auto-fail forces F. `src/compliance/engine/ScoringEngine.js:209`, `:224`, `:244`; `src/compliance/shared/serverGradeScale.js:1`. Manual versions use the existing parallel sum in `src/compliance/engine/VersionAggregator.js:40`. Neither scoring implementation nor rubric weights was changed.

**Verified:** `scorecard_items` supports pass, fail, partial, review and N/A results, earned/possible points, confidence, auto-fail flags, evidence text/start timestamp, notes and display order. Versioned rows additionally have rule ID, decision owner, evidence end, segment ID and missing reason. Older rows may not have all additional evidence fields populated. `supabase/migrations/001_compliance_engine.sql:163`; `supabase/migrations/133_compliance_overhaul_safety.sql:39`; `src/compliance/engine/ScoringEngine.js:184`; `src/compliance/rules/transcript.js:29`. The related stores are `scoring_templates`, `scoring_template_items`, `compliance_intents`, `intent_detections`, `compliance_scorecards`, and `scorecard_items`; loading/linkage: `netlify/lib/complianceVersions.js:4` and `src/compliance/engine/ScorecardGenerator.js:74`.

### Display changes

- Per-call results now use category bands and tables with code, name/evidence, severity/required catalog metadata, saved auto-fail flag, result, points and clickable evidence timestamps (including 0:00). Severity/required are read from the linked current `compliance_intents` row, not claimed to be a historical snapshot; unavailable values are labeled. `netlify/functions/compliance-review.js:32`; `src/components/callDetail/ComplianceReviewModal.jsx:76`.
- Category subtotal percentages derive only from **saved row points**, including existing event deduplication. Filters never change totals or the stored overall score. All now includes N/A; the review decision controls are inside their filtered rows. Partial results carry a nonfinal banner and provisional category labels. `src/lib/complianceScore.js:18`, `:27`; `src/components/callDetail/ComplianceReviewModal.jsx:69`, `:74`.
- Score, Grade and Call length tiles were added. The three dead AUTO FAIL/SEVERITY/SEQUENCE spans were actually in the reference accordion, not the old per-call modal; they were removed, not wired. `src/components/callDetail/ComplianceReviewModal.jsx:57`; `src/components/ComplianceIntentAccordion.jsx:38` (compare original `e2e1740`, lines 77–83).
- The reference screen selects MA or Annuity and counts the active catalog: **MA 135; Annuity 24**. The old 152 came from `[...ALL_INTENTS, ...RUNTIME_INTENTS].slice(0,152)`, mixing products and including retired rules, rather than counting active MA rules. The source defines 162 intents, with 3 MA retirements, leaving 159 across both products. `src/compliance/intents/index.js:13`; `src/compliance/rules/catalog.js:5`, `:16`; `src/components/ComplianceIntentAccordion.jsx:11`. Original truncation: `git show e2e1740:src/components/ComplianceIntentAccordion.jsx`, line 23.
- Both screens use dark `#172033` text on amber `#fbbf24`, **9.75:1** contrast. Explicit main/muted label palettes measure **16.29:1 / 12.08:1** in dark mode and **16.27:1 / 9.56:1** in light mode. Table labels, headers, metadata, buttons, selectors, disabled controls, status/errors and category metadata are covered by scoped styles, including overrides for the site's broad light-theme rules. `src/styles.css:18806`; `tests/transcript-recovery.test.js:54`. These are computed palette tests and component-render tests; authenticated browser visual acceptance remains a staging check, not something claimed as production verification.

## Manual steps, in order — nothing below was performed

1. Retrieve the Railway/Netlify logs in the time windows above to establish the original cutoff/delivery cause. Keep consumer text and credentials out of exports. Run the read-only SQL file, stopping before its “After migration 147” section until that schema exists. Confirm the Twilio original still exists in **Twilio Console → Monitor → Logs → Calls → parent SID → Recordings**. Local matching Twilio credentials were unavailable, so current Twilio media availability was not checked.
2. Review and apply **147 then 148 to staging only**, after confirming existing prerequisites 133–140/144–146 are installed. Do not replay retired migration 143 blindly. Stage Netlify and Railway code together; keep `TRANSCRIPT_AUTO_RECOVERY_ENABLED=false` initially. Validate migration SQL, authenticated permissions, the reference/table displays in light/dark modes, and fake-provider recovery. The added tests never contact a paid provider.
3. For a paid staging test or this real call, obtain explicit approval first. Verify server-only names `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `DEEPGRAM_API_KEY`, `SCORE_CALL_JOB_SECRET`, `SCORING_ENABLED`, `COMPLIANCE_RULES_VERSION`, `TRANSCRIPT_GAP_FILL_ENABLED`, `COMPLIANCE_APP_ORIGIN`, `RESEND_API_KEY`, `POST_CALL_ALERT_EMAIL`; confirm `compliance_runtime_control.enabled` and the active rubric. Never paste secret values into reports. No flags or production schema were changed in this work.
4. Separately authorize a production rollout before applying either migration/deploying. The branch is not pushed. Enabling the new automatic flag is a future operational decision, after cost/notification acceptance. Keep existing scoring safety gates and one-paid-pass freezes intact.
5. After the approved rollout and **paid recovery approval**, open this call as an administrator and choose **Fill transcript gaps**. The new verified Dial mapping uses customer channel 0 / agent channel 1, answer-aligned time, no conference. Twilio documents this parent/child dual-channel layout: [TwiML Dial recording](https://www.twilio.com/docs/voice/twiml/dial). The function authenticates Twilio media if the private copy is absent. Do not reset retry counters or run a broad bulk scorer.
6. The gap plan covers **33:17.439 through 50:26**, accounting for the slightly earlier customer endpoint: **17.142683 minutes × 2 channels × $0.0043 = $0.147427** at the repository-configured batch rate. The displayed 17:07.881 tail is based on the later agent endpoint, hence the slight difference. This is a code-price estimate, not verification of a vendor contract. `netlify/lib/transcriptRecovery.js:28`, `:45`; `src/compliance/shared/scoringConfig.js:6`.
7. Once the gap job completes, verify both channel spans and the unchanged coverage gate. If still incomplete, stop and inspect the recording; do not lower the threshold or repeatedly buy the same range. Then choose **Rescore once**, with a fresh cost preview and approval. The current partial-call preview returns $0 because no judgment rules are eligible on incomplete coverage; it is **not** a promise of free scoring after repair. The single-pass estimate allows up to 80,000 estimated input tokens and 4,096 output tokens: at configured rates this is about **$0.020915**, for a combined planning estimate of **about $0.17**, excluding storage/network/vendor-contract differences. `src/compliance/rules/evaluate.js:32`; `src/compliance/engine/judgmentRequest.js:30`; `src/compliance/engine/JudgmentPass.js:11`; `src/compliance/shared/scoringConfig.js:3`. Confirm the actual fresh preview before purchase.
8. Separately investigate the storage-project file-size cap and Railway `RECORDING_STORAGE_MAX_BYTES` / `RECORDING_MAX_BYTES`. Raising only the code limit will not raise Supabase's project/bucket cap. Preserve the Twilio original until a private copy is verified. No recording-copy retry or deletion was performed. `telephony/src/config.js:34`; `telephony/src/recordings.js:171`.

## Validation

- `npm run build`: passed, no build warnings.
- Root `npm test`: 1,004 tests; 1,002 passed. The two failures reproduce on unchanged `e2e1740` in a temporary checkout: `tests/call-workspace-access.test.js:64` (`useAdminReviewAccess` missing from its VM fixture) and `tests/housekeeping.test.js:76` (pre-existing console call in `CallDispositionBox.jsx`). Neither production source is changed here.
- Telephony suite with concurrency limited to two: 315/315 passed. The three conference cleanup fixtures now isolate persistence from socket cleanup; actual incident persistence/permissions are exercised in the recovery SQL test.
- Focused recovery, review UI/API, initial-version and persistence tests: 22/22 passed. Coverage includes partial real-call-shaped audio, default-off recovery, one-attempt replay refusal, cost and daily caps, stale worker expiry, tenant access, unchanged coverage gating, canonical segment persistence, first-scorecard save/idempotency/source locking, all result filters, zero-time seeking, selected-product catalog counts and contrast ratios.
- Additional scoring safety and evidence-access suites passed after ended-call fixtures were updated for the explicit call-end guard. Test commands/providers use local fixtures only.
- No authenticated production browser or real paid-provider recovery acceptance is claimed. Those checks remain in the ordered manual steps above.

## Every changed file

- `.env.example`
- `docs/compliance-recovery-findings.md`
- `docs/compliance-recovery-readonly.sql`
- `netlify/functions/compliance-review-background.js`
- `netlify/functions/compliance-review.js`
- `netlify/functions/score-call-background.js`
- `netlify/functions/stt-alert.js`
- `netlify/functions/transcript-gaps-background.js`
- `netlify/lib/complianceVersions.js`
- `netlify/lib/manualTranscriptGaps.js`
- `netlify/lib/transcriptRecovery.js`
- `src/components/ComplianceIntentAccordion.jsx`
- `src/components/callDetail/ComplianceReviewModal.jsx`
- `src/lib/complianceScore.js`
- `src/styles.css`
- `supabase/migrations/147_bounded_transcript_recovery.sql`
- `supabase/migrations/148_initial_manual_compliance_version.sql`
- `telephony/src/media/mediaStream.js`
- `telephony/src/media/sttAlert.js`
- `telephony/src/transcripts.js`
- `telephony/tests/conferenceCalling.test.js`
- `telephony/tests/mediaStream.test.js`
- `tests/compliance-review-api.test.js`
- `tests/compliance-review-display.test.js`
- `tests/compliance-review-layout.test.js`
- `tests/crm-workspace.test.js`
- `tests/evidence-access.test.js`
- `tests/initial-compliance-version.test.js`
- `tests/manual-transcript-gaps.test.js`
- `tests/sale-compliance.test.js`
- `tests/scoring-integrity.test.js`
- `tests/transcript-recovery-migration.test.js`
- `tests/transcript-recovery.test.js`
