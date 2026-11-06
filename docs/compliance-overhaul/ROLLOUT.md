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

These files are forward migrations, not re-runnable administrative scripts. Verify current routine signatures and table definitions before applying. In particular, 133/135/138 rename and wrap existing routines; existing dependencies and saved repair scripts must be validated against the target schema. The dynamic ordering replacement in 135 needs inspection of both telephony and conference function definitions afterward. Do not interpret file generation as SQL validation.

## Exact future operator sequence

1. Finish rubric/script mapping, conditional applicability, migration integration tests and cross-owner transport acceptance. Supply contracted prices and an approved daily token budget. Keep the draft rubric version unapproved until that work is accepted.
2. After explicit deployment/migration approval, arrange a scoring maintenance window. Do not interrupt live call audio simply to deploy compliance changes. Set `SCORING_ENABLED=false` in the new deployment configuration for Netlify and Railway, and keep `TRANSCRIPT_GAP_FILL_ENABLED=false`. Older deployed code may ignore this new env flag, which is why step 3 is required.
3. Apply **132 only** through the approved SQL process. Its DB fence starts disabled and guards old dispatch and job-claim entry points. Allow already-running scoring work to quiesce. Run the read-only active-lease query in `verify-before-enable.sql`; do not reset counters or requeue any call. Do not proceed to persistence wrapping while an old worker still owns an active run.
4. Apply 133 through 139 in order. Do not enable scoring between files. Check migration history and execute the read-only verification SQL. Verify item/detection/evidence access with same-tenant, other-tenant, non-admin and admin identities in an isolated acceptance environment. Verify zero complete new cards without items and zero evidence-free new hard failures.
5. Deploy only the reviewed source commit after approval. A future merge/push to `main` triggers Railway automatically. **Do not use `netlify deploy --prod`.** Inspect the corresponding Netlify build and use the existing approved publishing workflow. This task has not merged or pushed anything.
6. Keep both scoring switches off while confirming all services run the same version and the new RPCs are available. Validate live STT using an explicitly approved test call, including silence/mute/hold, delayed network recovery, twenty-reconnect exhaustion and source handoff. This test was not performed during the zero-provider-call task.
7. Configure, without committing secrets:
   - `SCORING_ENABLED=false` initially on Netlify and Railway.
   - `COMPLIANCE_RULES_VERSION` equal to the reviewed `RULES_VERSION` constant, once approved.
   - `SCORING_DAILY_TOKEN_CAP` as the approved positive integer budget.
   - `SCORING_INPUT_USD_PER_MILLION`, `SCORING_OUTPUT_USD_PER_MILLION` as contracted Luna rates.
   - `DEEPGRAM_BATCH_PER_MINUTE_USD` as the contracted Nova-2 batch **channel-minute** rate.
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
