# Unapplied SQL and future rollout

Nothing in this document was executed. The branch remains `fix/compliance-scoring-overhaul`; no branch was pushed and no deployment was requested. Complete the acceptance work in REPORT.md before requesting deployment approval.

## Apply order

| Order | File | Effect |
|---|---|---|
| 1 | `supabase/migrations/132_compliance_overhaul_safety.sql` | Disabled DB rollout fence; version/evidence columns; call-level pass/request/daily budget ledgers; review-decision audit; child read policies |
| 2 | `supabase/migrations/133_compliance_atomic_versions.sql` | Wrap existing persistence, require version/items/coverage and evidence-linked hard failures |
| 3 | `supabase/migrations/134_compliance_admin_versions.sql` | Atomic free re-evaluation/review versions; original retention; nullable ungraded headers |
| 4 | `supabase/migrations/135_compliance_dispatch_freeze.sql` | Freeze automatic dispatch after a prior call score/pass; speech-time transcript ordering and segment IDs |
| 5 | `supabase/migrations/136_manual_transcript_gaps.sql` | Manual-only gap jobs, unique provider reservations and atomic transcript merge |
| 6 | `supabase/migrations/137_call_display_names.sql` | Future protected-agent/contact name enrichment without ownership changes |
| 7 | `supabase/migrations/138_scoring_incomplete_status.sql` | Visible incomplete versions and incomplete call status |
| 8 | `supabase/migrations/139_stt_reconnect_budget.sql` | Durable shared reconnect/stream registration budget and known capture-gap persistence |
| 9 | `supabase/migrations/140_approved_cy2027_retirements.sql` | New active 135-item MA template; preserves historical templates/items |

These files are forward migrations, not re-runnable administrative scripts. Verify current routine signatures and table definitions before applying. In particular, 133/135/138 rename and wrap existing routines; existing dependencies and saved repair scripts must be validated against the target schema. The dynamic ordering replacement in 135 needs inspection of both telephony and conference function definitions afterward. Do not interpret file generation as SQL validation.

## Exact future operator sequence

1. Finish rubric/script mapping, conditional applicability, migration integration tests and cross-owner transport acceptance. Use the approved prices and 2,000,000-token daily cap below. Keep the draft rubric version unapproved until that work is accepted.
2. After explicit deployment/migration approval, arrange a scoring maintenance window. Do not interrupt live call audio simply to deploy compliance changes. Set `SCORING_ENABLED=false` in the new deployment configuration for Netlify and Railway, and keep `TRANSCRIPT_GAP_FILL_ENABLED=false`. Older deployed code may ignore this new env flag, which is why step 3 is required.
3. Apply **132 only** through the approved SQL process. Its DB fence starts disabled and guards old dispatch and job-claim entry points. Allow already-running scoring work to quiesce. Run the read-only active-lease query in `verify-before-enable.sql`; do not reset counters or requeue any call. Do not proceed to persistence wrapping while an old worker still owns an active run.
4. Apply 133 through 140 in order. Migration 140 clones the active MA template, excludes the three approved retirements, and leaves historical template items and scorecards intact. Do not enable scoring between files. Check migration history and execute the read-only verification SQL. Verify item/detection/evidence access with same-tenant, other-tenant, non-admin and admin identities in an isolated acceptance environment. Verify zero complete new cards without items and zero evidence-free new hard failures.
5. Deploy only the reviewed source commit after approval. A future merge/push to `main` triggers Railway automatically. **Do not use `netlify deploy --prod`.** Inspect the corresponding Netlify build and use the existing approved publishing workflow. This task has not merged or pushed anything.
6. Keep both scoring switches off while confirming all services run the same version and the new RPCs are available. Validate live STT using an explicitly approved test call, including silence/mute/hold, delayed network recovery, twenty-reconnect exhaustion and source handoff. This test was not performed during the zero-provider-call task.
7. Configure, without committing secrets:
   - `SCORING_ENABLED=false` initially on Netlify and Railway.
   - `COMPLIANCE_RULES_VERSION` equal to the reviewed `RULES_VERSION` constant, once approved.
   - `SCORING_DAILY_TOKEN_CAP=2000000` (input plus output combined, per UTC day). Source and SQL clamp any higher setting to 2,000,000. A lower setting is allowed.
   - `SCORING_INPUT_USD_PER_MILLION=0.20`, `SCORING_OUTPUT_USD_PER_MILLION=1.20`, `SCORING_CACHED_INPUT_USD_PER_MILLION=0.02`. These public prices are source constants, not secrets. Cached input is subtracted from ordinary input before billing.
   - `DEEPGRAM_BATCH_PER_MINUTE_USD=0.0043` for Nova-2 batch **per channel-minute**. Estimates use verified channel count when available, otherwise two channels, explicitly provisional.
   - `TRANSCRIPT_GAP_FILL_ENABLED=false` initially.
   - `COMPLIANCE_APP_ORIGIN` as the trusted HTTPS application origin.
   Existing `SCORE_CALL_JOB_SECRET`, provider credentials, alert settings and `TRANSCRIPT_SCORING_URL` must be available through their existing protected configuration. Do not copy secret values into reports or commits.
8. Only after the acceptance checks and explicit enablement approval, set the DB fence to enabled and set `SCORING_ENABLED=true` for both services. The explicit future SQL is `UPDATE public.compliance_runtime_control SET enabled=true WHERE id=true;` **It was not executed.** No historical call is to be requeued as part of this step. Existing calls stay frozen; paid exceptions require the admin confirmation workflow.
9. For each approved gap fill, first verify `gap_fill_recording_id`, `recording_channel_speakers` and `recording_timeline_offset_ms` in protected call metadata. Combined/conference recordings without reliable channel and time mapping are not automatically treated as two distinct speakers. Enable the manual gap feature only after its recording acceptance tests. Review exact minutes/channels/cost in the confirmation. Never bulk-trigger it.
10. Review the free re-evaluation/name dry runs before authorizing any data repair. The supplied scripts deliberately do not contain a production execute mode. The trigger remains incomplete until its transcript problem is resolved. A free deterministic TPMO correction does not recover missing speech.
11. Compare the week before/after using `cost-verification.sql`, then reconcile the application audio ledger against the Deepgram invoice/export. Do not assert unchanged spend from application counters alone. Exclude/flag multi-day duration anomalies instead of letting them dilute the cost-per-talk-minute denominator.

## Rollback/failure posture

Disable the DB fence and both environment scoring switches to stop new paid scoring reservations. Keep gap fill disabled. Do not remove evidence, reset the lifetime ledger, delete scorecard versions, replay post-call finalization or queue repairs as a rollback. Rolling code back to an old scoring worker while leaving wrappers/permissions changed requires a separately reviewed compatibility plan. The database fence is intended to remain available during that process.

## Timing and cost acceptance

The under-two-minute target is an acceptance target, not a result of a real-provider benchmark. The code uses one full-transcript judgment request, static prompt content first, no separate paid assessment and no scoring retries/fallback. A real approved canary is still necessary.

Restoring transcription necessarily submits real audio that a broken stream previously missed. Model/channel rates and the number of normal streams are unchanged; no filler audio is sent. It is not possible to promise that an observed bill-to-talk ratio will never rise relative to a silently broken, under-transcribing baseline. This conflict with a literal no-increase promise needs to be resolved through the approved cost measurement, not hidden by an assurance.


## Approved November 6 decisions

`RULES_VERSION=cy2027-overhaul-draft-2`. Future cards exclude ESRD status, the blanket comparison-by-name ban, and the CMS review-period statement. Misleading comparisons remain active. Counts: 159 active intents (84 deterministic, 75 judgment); 3 archived retired definitions. The cloned MA template has 135 items rather than 138. The wider rubric still requires the previously documented script/legal sign-off.

The shared UTC budget uses a row lock across every call and both automatic/manual requests. It reserves a conservative UTF-8 byte input bound, framing allowance, and the entire 4,096-token output allowance before contacting the provider. Reservations are not refunded after failures or unused output. Thus it may halt before measured token use reaches 2,000,000. On the first request that reaches or would exceed the approved budget, the DB commits a durable halted flag and an atomic once-per-UTC-day alert claim. A denied reservation returns a status, not an exception that rolls the halt back. All subsequent requests, including manual rescores, are blocked until the next UTC day. The final request that exactly fits is allowed. The existing provider email sender uses a daily idempotency key for this alert. Failed email delivery is logged; no provider replay or email retry loop is introduced.

Ledger pricing is `(uncached_input * 0.20 + cached_input * 0.02 + output * 1.20) / 1,000,000`. Cached input is a subset of input, not extra tokens for the daily cap. Header costs include the combined assessment. Runtime rates come from the reviewed constants; environment values shown above document the approved deployment configuration and cannot silently raise pricing or the cap.

Assessment and beneficiary risk share the single judgment request. Product-specific static rules/schema precede the transcript. The schema drops legacy detection fields the judgment consumer does not use and restricts IDs to judgment rules for the product, offsetting the assessment instructions. Reasoning is low; overall output remains 4,096. The assessment JSON has a maximum valid serialization of 341 ASCII bytes, conservatively below 400 BPE tokens, with agent text limited to 190 characters (also <=120 words) and risk to three 25-character reasons. Unexpected extra/invalid fields fail validation and do not trigger a retry. A raw-wire check also rejects a section above 400 bytes, including whitespace and escapes. The provider API exposes only a whole-response generation cap: the 400-token section limit is an accepted-output guard, not a separate provider-side generation limit. A malformed oversized section can consume part of the existing 4,096 overall allowance, then leaves scoring incomplete without another request. These compact fields map into the legacy assessment/risk columns in the same scorecard transaction. Free re-evaluation never clears them.

No additional provider request, additional stream, audio submission, or rate increase is introduced by these approved changes. The estimated maximum judgment request cost is slightly lower from schema compression. Actual output length and cache hits cannot be established without a provider call, which remains prohibited. Gap filling remains an explicitly confirmed paid operation; prices in reports are estimates only, not authorization to submit audio.

All migration files 132-140 remain unapplied. PostgreSQL concurrency/acceptance checks, provider canary and email delivery verification remain future approval steps. No production configuration was changed.
