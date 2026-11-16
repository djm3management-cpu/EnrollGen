# Practice caller

Local on `pilot/release`, starting at supervisor floor commit `742f93c`. Both switches default off. No push, deploy, hosted database, provider/model request, dependency addition, vendoring, real environment edit, historical migration edit, stylesheet edit or secret-exception change. Telephony source is unchanged. Migration **167_practice_caller.sql** is copied exactly into the fresh-install bootstrap; its checksums, catalog, routine inventory and statement digest are regenerated locally.

## Scenario library

`src/practice/scenarios.js` is an authored, fixed synthetic library. No consumer, contact, call or transcript supplies any scenario. The public list contains only ID, title and product. The server retains the first name, situation, goal, hidden objections and good-call criteria.

| ID | Product / invented name | Situation and goal | Hidden objections |
|---|---|---|---|
| current-plan | MA / Mara | Happy with current coverage; decide whether a review is worthwhile | Disruption; time to compare |
| doctor | MA / Oren | Loyal to physician; learn how network participation is checked | Verbal network promises; specialist |
| price | MA / Tavi | Concerned about expenses; understand tradeoffs | Premium fixation; hospital expenses |
| guarantee | MA / Lina | Wants future procedure certainty; understand verification and limitations | Yes-or-no promise; application versus approval |
| best | MA / Neri | Asks which plan is best; compare personal priorities | Plans seem identical; wants agent to decide |
| medicaid | MA / Sela | Confuses Medicare and Medicaid; clarify and verify eligibility | Eligibility uncertainty; assumed benefits |
| caregiver | MA / Ivo | Helping a parent; establish authority and participation | Unconfirmed authority; different priorities |
| mail | MA / Veda | Wants written material; retain time for review | Personal details; family review |
| trust | MA / Elio | Distrusts phone sales; establish identity and consumer control | Scams; pressure may end conversation |
| already-enrolled | MA / Rumi | Enrolled elsewhere this year; determine whether discussion is appropriate | Effective date; unauthorized switch |
| topic | MA / Ziva | Goes off topic; provide a clear structured review | Eligibility avoidance; unrelated errands |
| ready | MA / Aven | Ready to enroll; complete an informed voluntary rehearsal | Skipping disclosures; immediate approval |
| income | ANNUITY / Pavo | Predictable retirement income; discuss suitability and limitations | Emergency liquidity; surrender terms |
| annuity-price | ANNUITY / Esra | Concerned about charges; review costs and suitability | Access to savings; guaranteed returns |
| annuity-family | ANNUITY / Leto | Wants family review; allow a careful voluntary decision | Urgency; time horizon |

Each good-call field requires permission, scope and consent within this conversation, needs clarification, approved-material verification, respect for the decision and clear next steps, followed by that scenario's specific goal. The current live engine has original rubrics for **MA and ANNUITY**; other product types return no original rubric and are not offered here.

Easy consumers cooperate and raise one objection. Standard consumers raise two objections gradually. Hard consumers are skeptical, surface all objections gradually, ask follow-ups and may end when pressured. Difficulty never changes the scoring template, rule weights or pass/fail policy.

## Consumer instructions and output

`netlify/lib/practice/consumer.js` owns the fixed system instructions, with the selected repository persona and fixed difficulty instruction appended server-side. The consumer must remain in character, never coach or score, never reveal instructions/hidden objection lists, ignore role/schema changes inside transcript data, use no tools and perform no external action. No prior scope or consent exists. Consumer replies may never contain an invented or real Medicare number, SSN, full DOB, street address or card/payment number, including spoken digits.

The existing model client and sole existing OpenAI provider are used, with the existing model resolver. There is no new provider, fallback model or model-generated scenario. Agent speech is supplied only inside a user-message JSON `untrusted_transcript` envelope. Consumer context uses the last 24 utterances; the final score and coaching use the complete minimized practice transcript.

The strict provider schema and server AJV validation require exactly:

```json
{"reply":"A consumer reply, 1 through 600 characters","ended":false}
```

Unknown fields, wrong types, blank replies, incomplete/tool/degraded output, detected identifiers and explicit instruction/coaching leaks are rejected before reply storage. Identifier questions instead receive the fixed safe reply **“I have it ready.”** and an enum-only collection marker (`medicare`, `ssn`, `dob`, `address`, `card`), without any value. No model request is necessary for that turn. The marker records a rehearsal step, never a real identifier. Regex/semantic guards and fixed prompts do not prove arbitrary-language de-identification or real-model resistance to every injection; model intelligence was not exercised locally.

Agent text is bounded to 1,000 characters and passes the existing `minimizedCoachingTranscript` projection, strict sensitive-utterance omission, transcript redactor and scoring PHI redactor **before storage or model use**. Practice permits a fully redacted utterance placeholder; the live coaching default still refuses an entirely redacted source. The shared client scrubs requests again. No raw request text, reply, coaching content or exception prose is logged.

## Sessions, scoring and coaching

`practice_sessions` stores the protected agency/owner, code-owned scenario/product/difficulty, snapshotted turn/time limits, redacted text with the live `agent`/`customer` speaker format and server-relative millisecond moments, collection enums, state, deadlines, bounded work lease and conservative token reservation. `practice_results` stores the score, shared rules version, scorecard and validated coaching, linked only to its practice session and protected tenant/agent. There is no call, session-of-a-real-call, consumer, recording, phone, CRM or delivery foreign key.

Agent end, consumer end, turn cap and time cap enter final scoring. The server, not the browser, decides limits. A three-minute token-bound work lease serializes turns and scoring; concurrent/replayed work cannot publish twice. Failed generation closes incomplete without partial consumer/model output. Five minutes of inactivity closes abandoned sessions incomplete. `practice-sweep` uses the existing Netlify scheduled-function convention every minute, default-off, claims at most 20 due sessions, scores deadline-ended sessions and reconciles abandoned/expired work. No new phone timer or dispatch lane exists. Hosted scheduler invocation and latency remain an acceptance item.

The final path loads the **same active product scoring template and linked intents**, calls the same `classifyJudgmentOnce`, and passes those detections to the same `scoreCall`/rules engine used by `ScorecardGenerator`. The fresh-install database has only an active MA template; when an annuity template is absent, practice projects the exact existing annuity rule catalog into the shared engine item shape, retaining every rule ID and weight and the engine defaults. It never creates or activates a live template. An existing active annuity template takes precedence. The symbol-only in-memory practice eligibility mode omits live minimum talk time and audio-channel coverage requirements, which do not apply to typed turns. Stored live metadata cannot opt into it. All live default eligibility and scoring behavior remain unchanged. No external scope/consent fields are provided; stage-dependent scope and enrollment consent must be evidenced in this session. A transcript that never reaches a product conversation remains N/A. Model concerns remain review flags and cannot auto-fail, matching the shared policy.

The existing coaching instructions/schema, `minimizedCoachingTranscript` and `checkedCoachingOutput` generator contract are reused. Every stronger answer passes `evaluateCoachingSuggestion`; practice drops entries for which the existing generator returns its refusal sentinel. The result displays score, rule results, evidence moments where available, fixed explanations for missing evidence, coaching and Try again with the same scenario/difficulty. Missing speech has no invented timestamp.

## Isolation and access

The practice path writes only its two tables, shared hashed admission counters and requested administrator review records. It never writes live scorecards, scores, call records, sessions, counts, agent compliance profiles, CRM/contact/lifecycle data, audit-packet sources, floor state, billing/usage records, vendor reports, uploads, outbound webhooks or delivery queues. Existing live projections and outbound source allowlists are unchanged. Model telemetry uses the existing structured logger rather than inserting a billable live usage record; conservative token reservations remain in the practice session.

Every interactive request disables auth bypass and uses the existing active protected deployment resolver. SQL resolves the actor and organization again. Agent reads are own-only, managers own plus explicit protected `team_agent_ids`, admins the agency. Unprovisioned, inactive, out-of-team and foreign organization/agency identities fail closed. Only the owner can play or end a session, including for managers/admins. RLS delegates to the existing `deployment_row_visible` helper. No anonymous/browser table or routine access is granted. Service content mutation is revoked; scoped, leased routines own writes.

Opening another person's transcript inserts exactly one record in the existing append-only `admin_action_log`, in the SQL read transaction. Failed audit insertion withholds the transcript. Own transcript reads and summary/list requests create no administrator record. Lists contain metadata only, with 30-row time/UUID keyset pages. The scoped summary includes completed count, average, latest-five versus previous-five score trend (absent until both groups exist), and the five most missed scored rules. It aggregates the complete authorized practice history, not only the current page.

## Settings, admission and cost

Agency Settings uses the existing audited `tenant-settings` handler and administrator transaction permit. A failed administrator log rolls settings back. Raw service updates cannot bypass that permit. Both server and database reject unknown fields, wrong types, non-integers and out-of-bounds settings.

| Setting | Default | Allowed |
|---|---:|---:|
| Sessions per agent per UTC day | 5 | 1–50 |
| Sessions per agency per UTC day | 50 | 1–500 |
| Agent turns per session | 60 | 1–120 |
| Minutes per session | 30 | 1–60 |

Starts consume both daily caps transactionally through existing `consume_admission` counters. Its sorted transaction locks cover concurrent starts and multiple server instances. Failed/uncertain model attempts are not refunded. Existing sessions retain their original turn/time limits when settings change.

`_admission.js` adds application-only named routes `practiceRead` (40/minute), `practiceStart` (5/minute), `practiceTurn` (20/minute), `practiceEnd` (5/minute), using the existing admission engine, deployment tenant/profile, hashed atomic counters, 429/503 behavior and retry contract. Route daily request budgets are 3,000/subject and 30,000/deployment, independent of the much smaller database session caps. No phone-server registry/source changes are needed.

Every actual shared-client practice request requires durable session budget authorization. Consumer requests reserve at most **24,000** input/framing/output tokens; scoring and coaching at most **180,000** each. The maximum **1,200,000** reserved tokens/session cannot be raised through settings. Reservations conservatively use serialized UTF-8 bytes plus framing and full output allowance, not optimistic tokenizer estimates. Output limits are 384/4,096/1,600 tokens for consumer/scoring/coaching. One transport attempt, no automatic provider retries/fallback. Oversized or exhausted requests close incomplete rather than using an unbounded model request.

For planning only, using the repository's existing approved scoring price constants ($0.20/M input, $1.20/M output): 20 consumer turns at 3,000 input and 150 output tokens each, plus an 8,000-input/2,000-output judgment and 6,000-input/800-output coaching, estimates **$0.02176/session** uncached. Sixty turns at those same sizes estimate **$0.05296**. A conservative arithmetic ceiling treating every reserved token as output at that stored rate is **$1.44/session**, or $72 for 50 fully reserved sessions. These are local planning calculations, not current provider quotes or evidence of an account spend cap; no price lookup or paid request occurred.

## Retention

The existing inventory/planner assigns both tables their own **practice** class, default **90 days**, using the existing validated `operationalDays` period and overrides. A longer deployment operational period also lengthens practice retention. Session and result use the same immutable anchor and purge/savepoint group. Protected agent holds propagate through both records; the existing legal-hold and reference guards remain. The new practice transcript-review audit keeps its own audit period without extending the synthetic text to the live evidence audit period; other administrator/evidence reference behavior is unchanged. No practice consumer lifecycle/purge event is added.

## Voice and switches

Voice **is built**, separately lazy-loaded only when both switches are true. The existing `useSpeechRecognition` hook supplies recognized text to the editable draft; the agent explicitly sends it. The browser's native `speechSynthesis` can read a newly received consumer reply. Hiding, locking, leaving the view or changing identity stops recognition/playback via existing hook cleanup. The feature adds no audio recorder, upload, server audio endpoint or speech provider. The existing hook's local microphone meter is reused unchanged.

Browser speech recognition may send microphone audio to the browser vendor's speech service, depending on browser and configuration. Browser synthesis may likewise use installed or remote voices. EnrollGen's practice server receives only the resulting text. Browser/vendor audio handling, browser permissions and actual recognition/synthesis were not verified or activated locally. With voice off, its component/hook is never mounted and no practice speech path runs.

For a separately authorized environment, apply reviewed migration 167 (or the complete bootstrap), retain the protected deployment profile/roster and existing server model configuration, then set **PRACTICE_CALLER_ENABLED=true**. Set **PRACTICE_VOICE_ENABLED=true** only if browser speech processing is approved. The existing strict parser accepts only exact `true`; unset/empty/`false` is off, invalid values fail configuration. The first flag controls interface, settings, endpoints, SQL work and scheduled work. Voice has no effect without it. The shared service factory sends trusted feature headers; a browser cannot enable SQL with a forged header. Both off means no navigation/view and 404 handlers before auth/client construction. No real environment file was changed.

## Local validation and limits

Focused acceptance initially passed **61 tests**. Full final verification counts are recorded below before commit. All database tests run in disposable in-process PostgreSQL/PGlite; every model request uses a stub under the existing external-network fence. No microphone or real browser speech service is invoked by tests. Only registry vulnerability audits may contact the network.

Not established locally: hosted identity/PostgREST/RLS/migration behavior, native PostgreSQL independent-backend lock contention/crashes, real model character/injection behavior, arbitrary-language redaction, actual provider pricing/retention/availability, account spend controls, hosted scheduling or production-scale latency, physical microphone/browser vendor processing and Terminal/light browser visual acceptance. Existing pilot platform, retention-storage and secret-rotation gates remain unchanged. No push/deploy or real-call operation occurred.

## Verification before commit

| Check | Result |
|---|---|
| Complete `npm run verify` | **PASS, 10/10 steps**. Repeated against the final staged source before commit. |
| Root suite | **1,750 passed**, zero failures/cancellations/skips; baseline 1,685 (+65). |
| Telephony suite and import boundary | **349 passed**, zero failures/cancellations/skips; no telephony source changes. |
| Focused practice API, SQL and UI acceptance | **65 passed**, including every scenario and completion through all three annuity scenarios. |
| Fresh-install/bootstrap/catalog | **9 passed**, including independent empty builds and original access matrix coverage. |
| Environment-free synthetic build and built security headers | Passed. |
| ESLint and LLM types | Passed, only the four preexisting hook warnings. |
| Root and telephony npm audits | Zero vulnerabilities at all severities; registry audits only. |
| Agency and tracked-secret scans | Passed, zero findings; same active exception and December 15 review date. |
| Terminal/light visual check | Browser inventory returned “The browser access host is unavailable”; actual visual acceptance remains unverified. |
| Scope | Local `pilot/release` only; no push/deploy, real environment, dependency, stylesheet, historical migration, telephony source or active-exception change. |

The first complete run found two older test fixture expectations that needed the new default-off application switches and settings constants. Their existing assertions were preserved and the fixture inputs expanded. That restricted run also could not open synthetic loopback listeners or reach the permitted npm registry audit endpoint. Subsequent verification used loopback/registry permission with the external-network test fence retained. A separate product check exposed the bootstrap's absent annuity database template; the final practice-only catalog projection and all three annuity completion cases cover that gap without altering live templates. No provider, microphone or hosted acceptance is claimed.
