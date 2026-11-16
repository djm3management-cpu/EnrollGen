# Post-call coaching

Local feature on `pilot/release`, after consumer lifecycle commit `b54eb94`. Default off. No push, deployment, hosted database, real provider/model call, new dependency, vendoring, historical migration edit, real environment-file edit, stylesheet edit or active-secret-exception change. Migration **164_post_call_coaching.sql** is new and included verbatim in the fresh-install bootstrap; checksums, catalog and operator routine inventory are regenerated in-process.

## Eligibility and scheduling

The stored canonical call must have ended, be `sales`, `marketing` or `enrollment`, have a stored nonempty linked or inline transcript, and meet the agency's minimum recorded talk duration. The default minimum is **120 seconds**, adjustable from 30 through 21,600 seconds. The existing disposition must be known and non-sale. Enrolled, pending-verification, partial and ancillary sales, completed/written enrollment indicators and stored confirmation/enrollment codes exclude the call. Pending/incomplete/test/duplicate/no-answer/voicemail/wrong-number/bad-data dispositions are excluded. A real native enrollment intake also excludes it. Because legacy policies have no call foreign key, an active/pending policy for the same protected consumer created at or after this call began conservatively excludes it; no link by name or phone is invented.

The earlier scoring behavior is preserved: non-sale calls finish that path by skipping scoring. Coaching waits while scoring is queued/running or an earlier scoring lease remains active. It writes no call, score, flag, scorecard or compliance-review field. The existing 15-second transcript worker starts an independent coaching dispatch pass after its scoring pass; scoring never awaits coaching. Calls without a session are supported.

The **same `transcript_score_dispatch` table** carries separate coaching state, generation, attempt, token, lease and availability columns. Score revisions/attempts/readiness are preserved, including the original default-off scoring fence. Coaching-only queue rows have scoring delivery settled and infinite scoring availability. A new service RPC enqueues bounded batches of eligible calls, once per call. Existing queued calls and new calls are checked each pass. Each dispatch has a three-minute lease; claiming the token twice cannot start two generations. Three durable dispatch attempts bound model failures, crashes and background invocations that never start. Worker failures retry after 30 then 60 seconds; a third failure stores a terminal failed note without partial content. Acceptance by the background host is never treated as completion. A stale token cannot publish. Changed transcripts or newly ineligible outcomes fail closed at completion.

## Note and output contract

`post_call_coaching` has a unique call foreign key, protected agent and agency UUIDs, optional source transcript UUID, status, objections, one positive observation, safe failure reason, model, prompt version, generation number/time and owner review actor/time. Its immutable retention anchor comes from the call. A regeneration replaces the same row, increments generation and clears the previous reviewed state.

Model output has exactly `status`, `objections` and `did_well`. Model statuses are **generated** and **nothing_to_coach**; the worker supplies **failed** for terminal failures and **skipped** when the daily allowance is exhausted. Nothing-to-coach requires an empty array; generated requires one through three objections. Each objection has exactly:

| Field | Validation |
|---|---|
| `category` | `price`, `network_or_doctor`, `drug_coverage`, `wants_to_think`, `spouse_or_family`, `trust`, `already_covered`, `other` |
| `start_ms`, `end_ms` | Ordered nonnegative integer range inside an available consumer utterance (or the source interval of an untimed transcript); never past the call duration |
| `description` | One neutral sentence, begins “The consumer”, at most 200 characters |
| `agent_response` | One or two sentences, begins “The agent”, at most 360 characters |
| `stronger_answer` | At most 500 characters, checked by the shared rules engine |

The positive observation begins “The agent” and is at most 240 characters. Strict provider JSON Schema and server AJV validation reject unknown keys, missing fields, wrong types/categories and overlong output. Server semantic checks reject inconsistent statuses/ranges, detected identifiers, direct quotation marks/newlines and any copied eight-word transcript passage. The full output is validated before any part is stored. Prompt version is **post-call-coaching-v1**. Model selection reuses the existing scoring/summary resolver; it adds no provider or expensive fallback. The shared client owns redaction, strict response validation, deadline and awaited tenant usage telemetry; the durable queue owns coaching retries, with one model transport attempt per claim.

## Model minimization and suggestion safety

The request contains fixed coaching instructions, the strict schema, the selected engine/model/token limit and **only** an `untrusted_transcript` array of `{speaker,start_ms,end_ms,text}`. It contains no call/agent/agency/contact identifiers, outcomes, intake, CRM context, names from records, metadata, recording URLs, audio, payment fields or raw evidence objects. Only already stored transcript text is projected. The existing transcript redaction path runs again, followed by the existing scoring PHI redactor and shared client recursive scrub. Coaching opts into the shared redactor's stricter omission mode: whole utterances around protected-identifier, DOB/address/payment labels are omitted, including unusual/spoken formats, rather than preserving the surrounding identifying details. Supported unlabeled identifiers are redacted by the existing patterns. Medicare/SSN numbers, DOB, addresses and payment details in the synthetic corpus never reach the model stub. Redactor failure, unavailable output, invalid timing or a transcript over 160,000 serialized characters prevents model work and stores a safe `redaction_failed` outcome.

Transcript instructions remain data in a user-message JSON envelope; fixed system instructions explicitly reject role/schema changes, requests and tools inside that data. No model tool or external action exists. Tests establish instruction/schema separation and server rejection with fake responses; they cannot establish the intelligence or prompt-injection resistance of a real model. Regexes and sensitive-label omission are not a universal de-identification guarantee for every possible natural-language utterance; unfamiliar unlabeled spoken identifiers require further synthetic acceptance and operator review before enabling any real processing.

Every stronger answer passes **`evaluateCoachingSuggestion` in the existing rules engine**, including the live transcript conduct detector and the existing rule IDs for unsupported claims, guarantees, pressure and scope. Coaching has no verified plan-document or scope authority, so this advice-only check conservatively refuses superlatives, urgency/coercion, discouraging time/family consultation, coverage/cost/approval claims and product pitches. It does not change how actual call speech is scored or turn uncertain spoken claims into automatic violations. Refused advice is replaced by exactly **“No compliant suggestion was produced.”** No second model rewrites it. Neutral descriptions and the observation cannot be used as alternative stronger-answer fields.

## Access and interface

The HTTP handler requires verified Clerk authentication with bypass disabled and the existing active protected deployment membership resolver. Service-only SQL routines independently resolve actor and organization, tenant and explicit authority: agents see their own calls, managers their own and approved `team_agent_ids`, admins the agency. Foreign, unprovisioned and inactive identities fail closed. The table has RLS and no browser/anonymous content or write grants. Raw browser reads/writes and impersonation of service readers fail. SQL and endpoint matrices test own/peer/team/admin/unprovisioned/inactive/foreign cases. Mark reviewed is for the owning active agent; managers/admins see that state.

The call record includes Coaching; the top-level Coaching view lists newest-first pages (default 30, maximum 100), category filter, owner review action and, for managers/admins, protected agent filter, 7/30/90-day period, all eight category counts and reviewed states. Pagination uses time/UUID keysets bound to filters, and every page reauthorizes. Counts use the complete scoped period rather than the current page. Existing styles/classes, theme variables and controls are reused, without modifying `styles.css`, adding layout boxes/borders, helper prose or font weights above 500.

Opening a transcript moment uses the existing `getEvidenceSupabase` audited evidence transport and its SQL authorization/trail. Recording play/download uses the existing `RecordingCell`, grants and audited media path; coaching issues no storage URL. Background source retrieval is registered in the shared evidence-RPC inventory and refuses model work if the access trail cannot be written. Coaching notes and their content are absent from the explicitly projected consumer lifecycle and audit-packet sources.

Admin regeneration uses the existing `adminActionClient`/`execute_admin_action` transaction and requires the private administrator audit permit inside SQL. No audit means no mutation. The verified protected admin/call/agency is rechecked; a busy lease cannot be replaced. Existing admission limits provide **3/minute, 20/subject UTC day, 100/deployment UTC day**, configurable through the existing server profile's `admissionLimits.coachingRegenerate`. SQL independently enforces three regenerations per minute for a verified admin, including service-RPC use through the audited boundary. The existing administrator action log records the actor, call UUID and mutation with no note content.

## Retention, limits and operations

The note uses the source transcript's existing schedule, product/enrollment/SOA precedence, immutable call anchor, hold propagation and reference guards. The retention inventory classifies it as call evidence. The planner binds each note and exact transcript (or inline call source) into one deletion/savepoint group. Both delete in the same pass and roll back together on failure; counts enter the existing `retention_runs` record. No independent cleanup timer, retention policy, lifecycle coaching event or protected-content purge replica is added.

Agency Settings uses the existing audited tenant settings handler for `tenants.coaching_settings`: **`minimum_talk_seconds:120`**, **`daily_cap:100`** by default; cap bounds are 1–1,000. Database and server validate the setting. The cap reserves one generation slot per call/generation/UTC day through the existing atomic `consume_admission` counters. Reservations are conservative: failed/uncertain/admission-denied attempts are not refunded. Retries in the same day reuse the reservation; crossing UTC day requires a new reservation. Regenerations consume a new slot. At the cap, remaining claimed calls become terminal **skipped / daily_cap**, with no model request and no endless queue/requeue next day. An authorized admin may regenerate later.

Every actual attempt also uses the existing **summary** rate and subject/deployment daily limits (30/minute, 100/subject/day, 1,200/deployment/day before profile overrides). The shared structured logger records each generation's call UUID, duration and status, never transcript/note/provider diagnostics. Existing queue-depth/age/exhaustion operational status and alert evaluation include coaching; provider usage/failures use existing telemetry. There is no new logging or alert sink.

## Enablement and local limits

In a separately authorized environment, apply reviewed migration 164 or the complete bootstrap, retain the existing protected roster/profile and `SCORE_CALL_JOB_SECRET`, and set **`POST_CALL_COACHING_ENABLED=true`** consistently on the application/background functions and telephony dispatcher. It uses the existing strict parser: unset/empty/`false` is off, exact `true` enables, anything else fails configuration. The public boolean controls the interface; trusted server feature headers control SQL. With the flag off, no coaching jobs are queued or claimed, the model task refuses execution, both direct/alias endpoints return 404 before auth/client construction, and navigation/content/settings entries are absent. Scoring retains its independent switch and all earlier fences. `.env.example` documents the default; no real environment was changed or enabled.

Baseline: **1,539 root / 331 telephony tests**, all passed, zero skips. Focused acceptance and complete verification results are recorded below before commit. All database work uses the existing PGlite harness and all model/provider work uses injected stubs. Only npm vulnerability audits contact `registry.npmjs.org`.

Not verified: hosted identity/PostgREST/storage/RLS behavior or migration rollout; real model behavior, provider retention/price/availability or arbitrary-language redaction; native PostgreSQL concurrent-process locking/crash behavior; real background-host scheduling/acceptance and same-day delivery latency at production scale. Terminal/light browser visual acceptance could not run because the computer-use browser access host is unavailable. The actual JSX behavior is tested with synthetic hook/evidence transports, and the isolated UI bundle builds with the unchanged styles/themes. Existing pilot launch, secret-rotation, platform and storage acceptance gates remain unchanged.

## Final local validation

| Check | Result |
|---|---|
| Root suite | **1,602 passed**, zero failures/cancellations/skips; baseline 1,539 (+63) |
| Telephony suite and import boundaries | **334 passed**, zero failures/cancellations/skips; baseline 331 (+3) |
| `npm run verify` on final staged implementation | **PASS, 10/10 steps** |
| Focused coaching/UI/database access/fresh-install run | **80 passed**, zero failures/skips |
| Standalone coaching dispatch cases | **3 passed**; included in telephony total |
| Bootstrap/catalog gate | **9 passed**, including independent empty builds; original access matrix passes |
| Build, built headers and model types | Passed with an environment-free synthetic profile |
| ESLint | Passed, only the three preexisting React hook warnings |
| Root and telephony npm audits | Zero vulnerabilities at all severities; registry audit traffic only |
| Agency and secret scans | Passed, zero findings; the same one active secret exception and review deadline remain |
| Scope | `pilot/release`; no push/deploy, real environment/dependency/style/historical-migration/active-exception edits |

The initial complete verify found the new table policy bypassing the common visibility-helper convention and a synthetic credential literal flagged by the scanner. Both were corrected without relaxing a gate or changing an exception. A complete ten-step run passed, then final review added plural/Unicode conduct guards, strict settings input types, null-token lease refusal, accurate coaching enqueue-age tracking and output sensitive-label rejection. The **complete ten-step suite passed again** on that final implementation before commit. Retention failure injection proves source/note rollback together; regeneration failure injection proves administrator audit failure rolls its mutation back. Fake model outputs establish contract enforcement and data boundaries, not real model intelligence or real-world compliance certification.
