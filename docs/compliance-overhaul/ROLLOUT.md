> Current continuation: **cy2027-full-rubric-6**, described in EVENT-FIXES-REPORT.md and the final section below. Rule membership and original weights remain unchanged.

# Current rollout: full original rubric

Use the **cy2027-full-rubric-5** section at the end. Earlier script-only and CMS-only sections are historical and superseded. No deploy or migration execution is authorized.

# Unapplied SQL and future rollout

Nothing in this document was executed. The branch remains `fix/compliance-scoring-overhaul`; no branch was pushed and no deployment was requested. Complete the acceptance work in REPORT.md before requesting deployment approval.

## Apply order

| Order | File | Effect |
|---|---|---|
| 1 | `supabase/migrations/133_compliance_overhaul_safety.sql` | Disabled DB rollout fence; version/evidence columns; call-level pass/request/daily budget ledgers; review-decision audit; child read policies |
| 2 | `supabase/migrations/134_compliance_atomic_versions.sql` | Wrap existing persistence, require version/items/coverage and evidence-linked hard failures |
| 3 | `supabase/migrations/135_compliance_admin_versions.sql` | Atomic free re-evaluation/review versions; original retention; nullable ungraded headers |
| 4 | `supabase/migrations/136_compliance_dispatch_freeze.sql` | Freeze automatic dispatch after a prior call score/pass; speech-time transcript ordering and segment IDs |
| 5 | `supabase/migrations/137_manual_transcript_gaps.sql` | Manual-only gap jobs, unique provider reservations and atomic transcript merge |
| 6 | `supabase/migrations/138_call_display_names.sql` | Future protected-agent/contact name enrichment without ownership changes |
| 7 | `supabase/migrations/139_scoring_incomplete_status.sql` | Visible incomplete versions and incomplete call status |
| 8 | `supabase/migrations/140_stt_reconnect_budget.sql` | Durable shared reconnect/stream registration budget and known capture-gap persistence |
| 9 | `supabase/migrations/141_approved_cy2027_retirements.sql` | New active 135-item MA template; preserves historical templates/items |
| 10 | `supabase/migrations/142_script_stage_applicability.sql` | N/A header RPC and script/CMS-backed 86-item MA successor; no historical item changes |

These files are forward migrations, not re-runnable administrative scripts. Verify current routine signatures and table definitions before applying. In particular, 134/136/139 rename and wrap existing routines; existing dependencies and saved repair scripts must be validated against the target schema. The dynamic ordering replacement in 136 needs inspection of both telephony and conference function definitions afterward. Do not interpret file generation as SQL validation.

## Exact future operator sequence

1. Finish rubric/script mapping, conditional applicability, migration integration tests and cross-owner transport acceptance. Use the approved prices and 2,000,000-token daily cap below. Keep the draft rubric version unapproved until that work is accepted.
2. After explicit deployment/migration approval, arrange a scoring maintenance window. Do not interrupt live call audio simply to deploy compliance changes. Set `SCORING_ENABLED=false` in the new deployment configuration for Netlify and Railway, and keep `TRANSCRIPT_GAP_FILL_ENABLED=false`. Older deployed code may ignore this new env flag, which is why step 3 is required.
3. Apply **133 only** through the approved SQL process. Its DB fence starts disabled and guards old dispatch and job-claim entry points. Allow already-running scoring work to quiesce. Run the read-only active-lease query in `verify-before-enable.sql`; do not reset counters or requeue any call. Do not proceed to persistence wrapping while an old worker still owns an active run.
4. Apply 134 through 142 in order. Migration 141 clones the active MA template, excludes the three approved retirements, and leaves historical template items and scorecards intact. Do not enable scoring between files. Check migration history and execute the read-only verification SQL. Verify item/detection/evidence access with same-tenant, other-tenant, non-admin and admin identities in an isolated acceptance environment. Verify zero complete new cards without items and zero evidence-free new hard failures.
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

All migration files 133-142 remain unapplied. PostgreSQL concurrency/acceptance checks, provider canary and email delivery verification remain future approval steps. No production configuration was changed.


## Current script/stage policy, superseding draft-2 grading

The current rules stamp is `cy2027-script-stages-3`. Earlier draft-2 counts and examples above are historical change notes. The current authority is [script-backed-rules.md](script-backed-rules.md): 87 kept definitions, 75 excluded; 86 kept on MA. Code decides call/stage applicability and product-script boundaries. CMS-only conduct obligations retain exact primary references; generic coaching items without a script/CMS basis are excluded. All 14 PECL definitions are excluded because the local MA source delegates enrollment to the external carrier platform and does not contain an exact PECL passage.

Under 900 seconds of known nonnegative talk time (including zero) or an excluded outcome: N/A, no percentage, zero counted items and no provider pass. Exactly 900 seconds is eligible. Other calls need complete coverage and a connected product conversation. Unknown/invalid duration or incomplete coverage remains INCOMPLETE unless an explicit exclusion applies. Plan rules require a detected benefit presentation; needs/qualification rules require their stages; enrollment closing requires exact Enrolled disposition. AEP/OEP suppresses SEP rules, including conflicting old SEP metadata.

Apply 142 after 141, while scoring remains disabled. Pending migrations 133/134 were also updated to reject below-minimum/excluded calls before claiming a paid pass, reserving tokens or persisting a complete score. Pending 135/139 support N/A without confusing it with INCOMPLETE. No migration in this series has been applied; if any target environment has already applied an earlier draft, stop and prepare additive compatibility migrations instead of replaying edited files.

A fresh excluded call can receive a zero-token N/A header through the service-only RPC. A free manual re-evaluation of a historical template preserves original cards and emits N/A/zero-point audit rows for excluded items. Previously scored calls remain frozen automatically; the dry-run repair does not authorize production re-evaluation or data writes. No automatic dispatch eligibility was broadened to previously unscored non-sale calls.

Call metadata required for conditional branches is not invented. Unknown recording integrity is REVIEW with zero points; transcript endpoints do not prove audio completeness. Inter-TPMO sharing is checked only when a sharing event is identified, using verified written-consent metadata. This change adds no recording, transcription or transport behavior.

The PECL response/order helper is dormant until a real local checklist is explicitly mapped. Its tests cover yes/yeah/yep/correct/right/I do/I understand/okay/uh-huh/mm-hmm, 30 seconds or the next customer turn (whichever is later), refusal precedence and ordering against actual submission rather than application start. Missing submission time is reviewable, not invented.

Scoring cost impact: excluded calls make zero model requests; eligible calls retain at most one pass and the existing 4,096-token maximum. The prompt catalog shrinks from 75 judgment definitions to 27. No Deepgram, transcription, Railway transport or telephony source changed. Budget/pricing constants remain as approved. The legacy classifyCall entry now delegates to the same gated single-pass classifier; it cannot restart the old paid window loop.

Validate the SQL on an isolated production-equivalent schema before deployment, especially N/A version constraints, same-tenant visibility, lifetime pass locking and template count assertions. The 296 selected scoring/script tests, lint, typecheck and build are offline validation, not proof of database concurrency or provider behavior. No provider canary or migrations were run.

## Current CMS-only policy, superseding all script-based grading

Use `COMPLIANCE_RULES_VERSION=cy2027-cms-only-4` for a future approved rollout. The current authority is [cms-only-rules.md](cms-only-rules.md), with 21 cited requirements (14 deterministic checks and seven prohibited-conduct REVIEW rules). Agency scripts are never a grading basis. The August 3, 2026 FINAL PDF is a phrase reference only; no September draft is used by the grader.

Keep all scoring switches and the database fence disabled until every acceptance step is complete. Apply pending migrations 133 through 143 in order only after explicit approval. Migration 143 follows the 86-item successor from 142, clones a 21-item CMS template with one-point internal weights, retains historical cards/templates, and replaces the N/A routine's version fence. Pending migration 135 now permits a new version to target the active product rubric, so an old template cannot omit a newly consolidated CMS requirement. It still requires the original/current source card and preserves that source. The application looks up the active template and maps stored evidence by intent across template copies.

All migration files remain unapplied. If any older draft was applied elsewhere, prepare additive compatibility migrations rather than replay edited source. No SQL in this document was executed. Historical report generators are now guarded against rewriting old migration artifacts under the new policy; use `cms-only-report.mjs --dry-run`.

CMS pre-enrollment topics are restored as topic discussions before actual submission, only for Enrolled outcomes. Unknown submission ordering becomes REVIEW rather than an invented pass. AI findings are REVIEW only: no automatic points for an AI no-finding, no deduction until admin confirmation, no AI AUTO-FAIL. Legacy script-based admin decisions cannot override fresh deterministic CMS results. CMS does not prescribe the percentage or equal point weights; those are internal presentation choices requiring review.

Spoken confirmation-number and live federal-contract-statement checks are not graded because a universal speech requirement was not established from the reviewed primary sources. Receipt tracking and marketing-material requirements still exist outside that spoken-call test. Additional cited checks and interpretive conduct boundaries are explicit in the rule inventory.

No transcription, Deepgram, Railway transport, or telephony source changed. Eligible scoring keeps the same single request, low reasoning, 4,096 total output ceiling, compact same-request assessment, pricing and 2M UTC daily budget. The judgment catalog falls from 27 to seven items; excluded calls make no provider request. No request or cost was incurred in this task.

[CMS-ONLY-REPORT.md](CMS-ONLY-REPORT.md) contains the saved-cohort comparison. [VALIDATION-CMS-ONLY.md](VALIDATION-CMS-ONLY.md) lists offline checks and remaining SQL/provider acceptance limitations. This work does not authorize deploy, merge, push, migration application or data repair.

## Full original rubric, superseding v3 and v4 exclusions

Future approved version: `COMPLIANCE_RULES_VERSION=cy2027-full-rubric-5`. Restore the original MA template 00000000-0000-0000-0000-000000000115 (138 rows / 255 points), excluding only ELIG_010, CONDUCT_013 and ENROLL_008. The new template is 135 rows / 251 original points. The 24 annuity definitions stay separate and are never added to an MA denominator. The approximately 152 figure does not match the saved active MA template. [Current inventory and CMS changes](FULL-RUBRIC-INVENTORY.md).

All SQL remains unapplied. Apply pending migrations 133 through **144** in order only after explicit approval and isolated-schema validation. Migration 144 must follow 143; it clones the original 138-item template, not the restricted 21-item successor, updates CMS wording, retains original point values and historical templates/cards, and replaces the N/A version fence. It aborts if the original count/point assertions fail. The pending incomplete-header routine in 139 now stamps v5. If any draft migration was already applied elsewhere, use a new additive migration rather than replay edited files.

Keep SCORING_ENABLED and database scoring fences disabled throughout acceptance. Preserve the approved 2,000,000 input-plus-output UTC daily cap, lifetime automatic-pass lock, manual confirmation/limit, cached pricing, no fallbacks/retries and 4096 total output cap. No provider call is part of migration application or verification. Static judgment content is first and the transcript last. The restored full judgment catalog has more instructions than the seven-rule CMS-only subset; future cold prompt estimates can differ, while the single-request and maximum token/dollar guards are unchanged. No extra assessment request is introduced. This task incurred no provider charges.

After approval, validate 144 and earlier transaction/RLS/ledger routines against a production-equivalent isolated schema, verify original source/history retention and active-template version targeting, and verify N/A/INCOMPLETE/REVIEW labels in preview. Compare offline Mark and Dylan regression evidence and all remaining TPMO fails before any scoring switch is enabled. A separate approved deploy and controlled acceptance plan is required; this document does not authorize it. No main push, merge, deployment, transcription or telephony changes occurred.

## v6 event deductions, Section 3 and per-channel coverage

Use `COMPLIANCE_RULES_VERSION=cy2027-full-rubric-6` only in a future approved rollout. Keep the original 135 MA rules / 251 points. One missing group event now costs one highest-weight failure; covered siblings store N/A 0/0 with a visible Covered by rule ID label. Passing rows retain original points. The exact groups and conditions are listed in EVENT-FIXES-REPORT.md.

Pending migration 145 follows 144 and replaces the N/A routine's version fence only. No template rebuild or membership/weight change is required. The still-unapplied incomplete routine in 139 stamps v6. All migration SQL remains unapplied; validate against an isolated production-equivalent schema after approval. If any edited pending migration was applied elsewhere, use an additive compatibility migration rather than replaying it.

Scoring now requires both channel timestamp spans >=95%, plus agent first utterance <=120 seconds. A full customer tail cannot mask a missing agent opening. This is not audio-duration billing, not proof of interior completeness, and not authorization for transcript gap fill. No recording, capture, Deepgram, transport or telephony code changed. No automatic provider pass, transcript revision, dispatch or repair ran. The one-pass lock, 2M UTC daily cap, pricing and 4096 output ceiling remain unchanged; these changes are CPU only and add no provider request/cost.

Use `node scripts/compliance-overhaul/event-fixes-report.mjs --dry-run` for the saved-snapshot preview. Do not run the guarded v5 generator under v6 or overwrite its baseline. The two Section 3 regression calls retain credit at 268582ms and 270301ms respectively, from genuine product agreement after POA, not from self/decision-maker questions. Validate covered-row labels, incomplete headers and the four status-changing calls before enabling scoring after a separately approved deploy. No rollout is authorized by this file.
