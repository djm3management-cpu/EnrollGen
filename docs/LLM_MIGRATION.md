The MA, MedSup, ACA, and U65 Co-Pilot engines now use the shared server-side LLM client. OpenAI is the default provider; Anthropic remains available for per-engine rollback and shadow comparison. The deterministic annuity hook, deterministic scoring engine, and site styling are unchanged.

The primary model is `gpt-5.6-luna`. No dated snapshot was listed when the [official Luna model catalog](https://developers.openai.com/api/docs/models/gpt-5.6-luna) was checked on September 9, 2026. The fallback defaults to `gpt-5.6-terra`.

The shared request interface accepts `max_completion_tokens`, Anthropic-style messages/tools, and `response_format`. On the Responses API wire these become `max_output_tokens`, flat function definitions, `function_call`/`function_call_output` items, and `text.format`. Sending the Chat Completions field names directly to Responses would be incorrect. See the [Responses reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) and [migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses). Neither temperature nor top_p is sent.

Live requests use low reasoning effort and a 2,048-token output budget, including reasoning tokens. Post-call classification/assessment uses medium effort and 16,384 tokens; weekly summaries use medium effort and 4,096 tokens. Live attempts time out after 9 seconds; summary attempts after 120 seconds. There are at most three primary attempts with exponential backoff and jitter, then exactly one fallback attempt for 429, 5xx, or timeout. Other 4xx/schema failures never trigger fallback. Empty `LLM_FALLBACK_MODEL` disables fallback.

Live terminal failures return a populated `service_degraded` message in the existing content envelope. Post-call failures propagate so unavailable evidence cannot be recorded as missing compliance intents. The streaming interface retains Anthropic event names and delta shapes. It buffers each attempt until completion/validation before emitting it, so failed primary fragments cannot mix with fallback JSON or tool calls. This means it does not currently provide incremental time-to-first-token delivery. Existing four-engine consumers use nonstreaming JSON requests.

Shadow requests start alongside the primary request. Their completion/comparison work and telemetry use [Netlify context.waitUntil](https://docs.netlify.com/build/functions/api/#waituntil), allowing the primary HTTP response to return independently. CLI callers without waitUntil need a long-lived process. The classifier compares the sorted set of detected catalog intent codes, which are its stable resolved IDs, ignoring prose, confidence, order, and duplicate IDs. Failed/degraded comparisons have a null match rather than falsely claiming a mismatch. Both outputs are stored for enabled shadow comparisons only.

Each API attempt records model, engine, prompt/cached/completion/reasoning tokens, latency, fallback flag, and original error code in the existing tenant-scoped `usage_records` table. Attempts share a request UUID. Failed attempts with no reported usage record zero known tokens. `llm_tokens` records contribute to the existing Co-Pilot token total; comparison rows have zero quantity and use a separate record type to avoid double counting. Shadow requests have their own token records and are marked in metadata.

Apply `supabase/migrations/034_llm_telemetry.sql` before deploying the functions. The migration and code have not been deployed or applied to a live database. No live model requests were made. The shared scorer still accepts legacy Ancillary/Annuity post-call records on Anthropic; those records do not enter the migrated live LLM endpoint.

Environment variables are listed individually below. Engine overrides take precedence over the global provider. Empty engine overrides inherit the global setting. All provider credentials are server-side only.

| Variable | Default / example | Status and purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | `replace-with-openai-api-key` | New; server-side OpenAI credential |
| `ANTHROPIC_API_KEY` | `replace-with-anthropic-api-key` | Existing; rollback, shadow, and remaining Anthropic paths |
| `LLM_PROVIDER` | `openai` | New; global provider, `openai` or `anthropic` |
| `LLM_PROVIDER_MA` | empty | New; Medicare Advantage override |
| `LLM_PROVIDER_MEDSUP` | empty | New; Medicare Supplement override |
| `LLM_PROVIDER_ACA` | empty | New; ACA override |
| `LLM_PROVIDER_U65` | empty | New; U65 override |
| `LLM_FALLBACK_MODEL` | `gpt-5.6-terra` | New; empty disables fallback |
| `LLM_SHADOW_MA` | empty | New; set `claude-sonnet-4-6` to shadow MA |
| `LLM_SHADOW_MEDSUP` | empty | New; set `claude-sonnet-4-6` to shadow MedSup |
| `LLM_SHADOW_ACA` | empty | New; set `claude-sonnet-4-6` to shadow ACA |
| `LLM_SHADOW_U65` | empty | New; set `claude-sonnet-4-6` to shadow U65 |
| `SUPABASE_URL` | `https://your-project.supabase.co` | Existing; telemetry database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | placeholder | Existing; server-side telemetry writer credential |
| `SUPABASE_ANON_KEY` | placeholder | Existing legacy connection fallback; service role is needed for telemetry writes under RLS |

The normal build now intentionally fails on the existing local `VITE_AGENT_API_KEY` and `VITE_BIBLIA_API_KEY`. They are used by agent availability and Bible integrations outside this migration. Those integrations need their credentials moved behind server endpoints, or the variables must be removed if the integrations are disabled, before a normal production build can pass. Local secret files were not changed. The validation build blanked these two variables only in its child process; it is not a production configuration for those integrations.

Prompt audit:

| Prompt source | Finding / action |
| --- | --- |
| Four Co-Pilot hooks | Replaced JSON-only/fence instructions with schema instructions. Moved live app state, transcript history, prior interventions, and spoken-question metadata behind static prompt/script/rule/RAG content. Existing imperative and ALL-CAPS compliance wording remains; it is provider-neutral but worth evaluating in shadow mode. |
| `src/compliance/prompts/intent-classification.js` | Classification now requests the strict 167-ID schema; static intent definitions and output guidance precede transcript/context. The unused `PLAN_FIT_SYSTEM`/`buildPlanFitPrompt` exports still contain legacy JSON-only guidance; they have no active call or regex parser to migrate. Add a schema before wiring them to an engine. |
| `src/compliance/engine/ScorecardGenerator.js` | Replaced the pseudo-JSON angle-bracket placeholders with plain field guidance and a strict assessment schema. |
| `src/lib/transcriptSearch.js:56` | Existing RAG prompt uses `<enrollment_call_references>` / `</enrollment_call_references>` wrappers. Flagged for a plain-heading rewrite if prompt tuning is undertaken. No parser relies on these tags, and they are not inherently incompatible with OpenAI. This file was not changed. |
| `src/context/CopilotCmsKnowledge.js` and inspected engine prompts | No explicit Claude/Anthropic role instructions found. Remote RAG content was not fetched or rewritten. |

Anthropic rollback uses the official SDK's JSON-schema helper to translate unsupported bounds into descriptions, then applies the original strict schema locally. This avoids 400 errors while preserving validation. See [Anthropic structured-output limitations](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Every changed or added file is summarized below.

| File | Change |
| --- | --- |
| `.gitignore` | Allows only the root placeholder `.env.example` to be tracked. |
| `.env.example` | Documents provider credentials, routing, fallback, shadow, and telemetry settings. |
| `package.json` | Adds official OpenAI/Anthropic SDKs, Ajv, TypeScript/Node types, and LLM test/type-check scripts. |
| `package-lock.json` | Locks the added dependencies and their dependency tree. |
| `tsconfig.llm.json` | Adds a strict TypeScript check for the server LLM modules. |
| `vite.config.js` | Rejects public secret variables before development/build startup. |
| `src/lib/llm/types.ts` | Defines shared request, completion, usage, adapter, and runtime types. |
| `src/lib/llm/client.ts` | Implements complete/completeStream, routing, retries, timeout/fallback, degradation, telemetry, and detached shadow comparison. |
| `src/lib/llm/openai.ts` | Implements official SDK Responses translation, usage normalization, and streaming event mapping. |
| `src/lib/llm/anthropic.ts` | Implements the rollback adapter, schema compatibility, tool conversion, and streaming envelope. |
| `src/lib/llm/config.js` | Validates public secrets and resolves engine/provider settings. |
| `src/lib/llm/validation.ts` | Validates structured responses with Ajv; rejects refusal, empty, malformed, or incomplete structured output. |
| `src/lib/llm/prompts.js` | Builds stable system prefixes and separate volatile context messages without importing server code. |
| `src/lib/llm/schemas/coaching.js` | Defines the strict live coaching object schema. |
| `src/lib/llm/schemas/compliance.js` | Defines strict classification and assessment schemas; derives the ID enum from all 167 catalog intents. |
| `netlify/functions/coach.js` | Routes the four engines through the shared client, preserving authentication, subscription gates, and response envelopes. |
| `netlify/functions/_llmTelemetry.js` | Writes tenant-scoped model telemetry and binds waitUntil. |
| `netlify/functions/score-call-background.js` | Uses shared summary completions with schemas and call-specific telemetry. |
| `netlify/functions/weekly-coaching.js` | Uses shared medium-effort summary completions and telemetry. |
| `src/hooks/useCopilotEngine.js` | Migrates MA request metadata, schema, token budget, and prompt ordering. |
| `src/hooks/useMedSupCopilotEngine.js` | Migrates MedSup request metadata, schema, token budget, and prompt ordering. |
| `src/hooks/useAcaCopilotEngine.js` | Migrates ACA request metadata, schema, token budget, and prompt ordering. |
| `src/hooks/useU65CopilotEngine.js` | Migrates U65 request metadata, schema, token budget, and prompt ordering. |
| `src/hooks/useCopilotEngineCore.js` | Removes fence/regex JSON recovery and makes provider-key error guidance generic. |
| `src/hooks/useSubscription.js` | Includes new LLM token records in the existing Co-Pilot usage total. |
| `src/components/AskCopilotMini.jsx` | Sends MA engine metadata instead of a Claude model name; styling is untouched. |
| `src/compliance/engine/IntentClassifier.js` | Passes strict classification schema, removes fence stripping, and propagates unavailable-evidence failures. |
| `src/compliance/engine/ScorecardGenerator.js` | Passes assessment schema and removes fence stripping/pseudo-JSON prompt placeholders. |
| `src/compliance/prompts/intent-classification.js` | Places static classifier instructions before volatile transcript/context and updates schema guidance. |
| `supabase/migrations/034_llm_telemetry.sql` | Adds telemetry columns, record types, and an engine/time index without changing tenant RLS. |
| `tests/llm.test.js` | Adds 23 mocked tests covering SDK adapters, tools, streaming, schemas, routing, retries/fallback, shadow isolation/comparison, secrets, caching, telemetry, and classifier failure propagation. |
| `docs/LLM_MIGRATION.md` | Records implementation choices, environment variables, validation, prompt audit, and every file change. |

Validation completed: 36 total repository tests passed (23 new LLM tests), the strict LLM type check passed, changed application JavaScript passed ESLint, all three server entrypoints bundled for Node 22, and the frontend production build passed with the two public secret values blanked for validation. The browser output contained neither SDK nor the server LLM client. No styling or deterministic annuity/scoring files changed.

Follow-up review — Task 1: streaming (September 9, 2026)

Status: examined and paused at the requested design decision. No streaming implementation was changed. Tasks 2, 3, and 4 have not been started because the requested order and Task 1 stop condition take precedence. The user reports migration 034 has been applied; this review did not independently query the database.

Why buffering was chosen: `run()` accumulates provider events, obtains the final completion, validates it, and only then lets `completeStream()` emit events. This makes each response atomic: failed-attempt fragments never reach the consumer, and structured output is checked before publication. The existing mocked tests expressly check that primary fragments are absent after fallback and that invalid structured output produces only a degraded response.

Buffering is not necessary to make a fallback API request. It is necessary to retain the current combination of guarantees: incremental events are append-only with no defined replacement protocol; a failed attempt is transparently replaced by a complete retry/fallback; and unvalidated structured output is not exposed. Blanket buffering was a conservative implementation choice to satisfy those guarantees, not a requirement imposed by the provider API. Removing it safely requires deciding which guarantee or consumer behavior changes.

The precise failure case: suppose a primary has emitted a partial JSON object and then fails with a 5xx. The fallback returns a fresh complete JSON object, not a guaranteed continuation of the emitted prefix. Buffering the fallback does not retract the primary bytes. Appending the replacement produces mixed output; sending another `message_start` is safe only if the consumer explicitly resets the abandoned attempt. No such reset/commit semantics are established in the repository. Similarly, schema validation cannot certify a partial JSON object, and a late schema failure cannot erase text already displayed. This is a behavior issue even if event field names stay identical.

Alternative designs, not applied:

| Design | Behavior and tradeoff |
| --- | --- |
| Provisional streaming with explicit attempt replacement and commit semantics | Stream primary deltas into a tentative consumer buffer. Preserve existing event shapes; use a fresh message ID and a defined new-message reset rule for retry/fallback. Publish actionable coaching and execute any tools only after validated completion. Buffer fallback as requested. Requires an explicit consumer contract and tests for partial failure, replacement, cancellation, and late validation failure. Earlier provisional bytes do not imply earlier validated advice. Showing the tentative advice to an agent would introduce an additional compliance tradeoff. |
| Retry/fallback only before the first content delta | Stream immediately. Once any content is emitted, end a failed turn as interrupted instead of splicing a replacement. This avoids mixed output but changes the previously requested midstream retry/fallback and degraded-response behavior, and exposes unvalidated fragments. Not recommended as the default for compliance-sensitive coaching. |
| Retain validated buffering for structured coaching | Preserve current compliance-visible behavior. A separate, explicitly approved plain-text Q&A streaming policy could be designed later. This retains full-response latency for structured coaching. Recommended pending approval of a replacement protocol. |

Practical latency impact: buffered streaming delivers its first text delta only after the successful attempt finishes generating and passes validation; retries/fallback add their elapsed time too. Incremental streaming could deliver the first text delta as soon as the provider emits it, saving the remaining generation duration on a successful primary attempt. It cannot remove the model's delay before that first text delta. No live timing measurements were taken, so there is no defensible millisecond estimate here. Moreover, all four current coaching hooks omit `stream: true` and await `response.json()`. Changing the streaming adapter alone therefore has zero visible time-to-first-token benefit for those live callers. Actual progressive display would also need consumer integration and an agreed treatment of tentative content.

This follow-up changed only `docs/LLM_MIGRATION.md`, appending these findings and alternatives. No new environment variables or tests were added. Two existing mocked tests were rerun and passed: “official SDK SSE path and transactional fallback avoid mixed primary/fallback output” and “stream schema failure yields a complete degraded envelope.” No network requests to a model, code changes, prompt rewrites, silence guard, or off-topic filter were performed. The outstanding decision is whether to retain atomic validated coaching output or authorize a provisional-stream/replacement contract before implementation continues.

Follow-up review — Task 2: prompt audit and unapplied proposals (September 9, 2026)

Task 1 decision is now resolved: the user chose to retain validated buffering and rejected designing a provisional-stream contract before AEP. No streaming or consumer changes are proposed here. This section supersedes the earlier pending-decision status.

Task 2 status: proposal only. The diffs below are documentation, not applied source changes. They cover coaching and agent-question system prompts for Medicare Advantage, Medicare Supplement, ACA, and U65. The 167-intent classifier is audited separately and recommended to remain byte-for-byte unchanged. Tasks 3 and 4 have not been started in this review.

Audit scope and measurement

Inspected the four hook builders, shared `buildCachedPrompt`, `transcriptSearch.js`, local section knowledge, MA CMS/template assembly, coaching/classification schemas, and classifier prompt assembly. Tenant database templates, remote knowledge overrides, and retrieved call contents were not fetched. Extra XML or instructions inside those remote records therefore remain unverified.

Estimates below use rendered JavaScript string length divided by four, rounded up. No Luna tokenizer is installed; these are rough English-text estimates, not measured model tokens or production request totals. Decorative Unicode dividers make this approximation especially imperfect. Pure prompt functions were extracted with the installed Babel parser and evaluated locally with `buildCachedPrompt`; no hook execution, database access, or model calls were needed.

The base is the live, agent-only variant, with empty flow, RAG, tenant template, CMS appendices, and no section knowledge. It includes the constant live-context pointer. The section range adds one local knowledge section at a time (10 MA, 7 MedSup, 7 ACA, 8 U65). Provider schema serialization and volatile user messages are excluded.

| Engine | Base coaching characters / estimated tokens | Coaching with one local section | Base Q&A estimated tokens | Q&A with one local section |
| --- | --- | --- | --- | --- |
| MA | 8,374 / 2,094 | 2,583–3,252 | 888 | 982–1,139 |
| MedSup | 7,184 / 1,796 | 2,119–2,241 | 434 | 486–520 |
| ACA | 5,291 / 1,323 | 1,857–2,015 | 421 | 512–588 |
| U65 | 6,581 / 1,646 | 2,095–2,495 | 543 | 627–716 |

MA dual-audio base coaching is approximately 2,012 tokens. Periodic-review base coaching is approximately 1,924 MA, 1,699 MedSup, 1,226 ACA, and 1,568 U65. These variants explain why one fixed number is not a full call-level budget.

Per-engine findings

| Engine | Inherited XML and formatting | JSON instructions under the current schema | Static stability across turns | Examples and recommendation |
| --- | --- | --- | --- | --- |
| MA | Shared `<enrollment_call_references>…</enrollment_call_references>` wraps retrieved excerpts in coaching and Q&A. Local builder uses decorative divider lines rather than other XML nesting. | Coaching retains “Follow the supplied response schema” and a pseudo-JSON object. Its displayed level list omits `info`, although the schema permits it. Q&A expressly prohibits JSON/code and requests plain English; Q&A is not schema constrained, so those instructions remain useful. | Fixed literal instructions repeat. Full system does not reliably repeat: current flow, section knowledge, CMS selection driven by section/transcript/question, RAG, review mode, audio mode, and tenant script revision can change. | Four GOOD and two BAD coaching examples (~164 rough tokens together) teach terse corrections and severity; keep all. Keep audio examples, the conditional MA + HIP observation-stay script quote, and Q&A scope-redirection example. No evidence supports removing them before AEP. |
| MedSup | Same shared XML wrapper; divider/title blocks around compliance, audio, context, and output. | Coaching has the schema reminder and pseudo-JSON shape; no remaining coaching fence-stripping instruction. Plain-text/no-markdown rules constrain the message string, not JSON syntax. Q&A has no strict schema. | Fixed core repeats; section knowledge, current/neighbor flow, RAG, and review mode can change system bytes. Database knowledge revisions can also change them. | No full multi-turn few-shot pairs. DO/NEVER illustrative phrases and local section scripts, key phrases, mistakes, and red flags provide behavioral cues; retain them. |
| ACA | Same shared XML wrapper and decorative section dividers. | Same coaching schema reminder and pseudo-JSON shape as MedSup. Keep plain-text message restrictions and Q&A formatting instructions. | Fixed core repeats; section knowledge, current/neighbor flow, RAG, and review mode vary. Live subsidy/plan state is in the separate context message. | No full multi-turn few-shot pairs. Keep illustrative audio constraints and per-section disclosure/anti-pattern language; schema does not teach subsidy or consent judgments. |
| U65 | Same shared XML wrapper and decorative gate/context dividers. | Same coaching schema reminder and pseudo-JSON shape as MedSup. Keep message text restrictions and unconstrained Q&A formatting instructions. | Fixed core repeats; gate knowledge, current/neighbor flow, RAG, and review mode vary. Live underwriting/product state is in the context message. | No full multi-turn few-shot pairs. Keep disclosure, underwriting, product, and gate-specific script examples; these convey detection semantics rather than JSON structure. |

No local prompt tells the model it is Claude or requires an Anthropic-only instruction language. XML is an inherited organizational convention, not proof of an OpenAI incompatibility. The proposed heading replacement is a readability change; it is not established to improve detection accuracy.

Strict output schemas do not establish correct medical/compliance judgments. The current coaching schema constrains keys, types, level enum, and confidence range. It does not require plain text inside `message`, a snake_case `issue_tag`, an empty message for silence, word limits, or appropriate severity. The proposed removal of pseudo-JSON examples therefore retains those non-schema behavioral requirements in prose. Structured outputs can still contain substantive mistakes; examples can remain useful. [OpenAI structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs)

Prefix stability and proposed ordering

The local equality probe held all reference/options bytes constant and varied only live transcript/app state: all four system strings stayed identical. Changing RAG or review mode changed each system. Thus `buildCachedPrompt` separates some volatility successfully, but the name does not establish that its entire system output is static.

Retrieved references change with the latest speech/query: result selection/order, three-decimal similarity, speaker/topics, excerpt text, and reference metadata all contribute bytes. Dates use locale formatting, so environments can also differ. MA CMS topic selection and SEP material can vary with section, transcript, question, and app state. The tenant script is relatively stable only within a fixed template revision. The flow block marks the current section/gate and includes neighbors; it is not a fixed full-script prefix.

Proposed order: fixed role/product/audio policy and behavioral/output guidance; tenant script where present; section/gate rules; mode guidance; current flow and MA CMS selections; retrieved references; then live state, transcript, question, and history in their existing user messages. The last group already uses separate messages through the helper. All reference chunks remain ahead of live messages, but per-turn retrieval is treated as variable reference material after the reusable core. Do not freeze stale CMS content, change retrieval ranking, sort citations, drop chunks, or insert the entire 167-intent catalog into each live coach merely to lengthen a cache prefix.

Exact prefix stability is necessary, but is not sufficient to promise cache hits. Current GPT-5.6 caching guidance calls for an explicit breakpoint after reusable content when the implicit endpoint includes changing content. The current adapter does not add that breakpoint. Treat an adapter-level breakpoint change as a separate proposal, with SDK verification and telemetry measurement; it is not included in the prompt diffs. Model/settings/schema/tool differences also affect reuse. Do not pad short prompts to qualify or claim savings from these character estimates. [OpenAI prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)

Estimated proposal sizes, with the same empty appendices as the base measurements:

| Engine | Proposed coaching tokens | Fixed coaching prefix before Reference context | Proposed Q&A tokens |
| --- | --- | --- | --- |
| MA | 1,888 | 1,495 | 909 |
| MedSup | 1,589 | 1,338 | 454 |
| ACA | 1,114 | 863 | 439 |
| U65 | 1,437 | 1,223 | 561 |

These are estimates, not measured savings. Most coaching character reduction comes from divider removal and the redundant shape example. Q&A grows slightly because of headings; its proposal improves ordering rather than reducing total text. Prefix length also varies with audio mode and reference revisions.

Compliance classifier: preserve the request exactly

The classifier has no local XML wrapper. Its constant system is 874 characters (~219 tokens). Rendering the entire 167-intent catalog gives a 90,077-character prefix before TRANSCRIPT SEGMENT (~22,520 tokens); together that is approximately 22,739 tokens before transcript/context and schema overhead. Actual requests use the applicable intent subset, so inbound/outbound applicability and catalog revisions change both length and bytes. For the same intent list and ordering, the system and pre-transcript prefix repeat.

The user prompt still says “Respond with JSON” and includes a sample detections/sentiment object despite strict schema enforcement. The system still says “Follow the supplied response schema.” The first two sample phrases and first two anti-patterns for each intent are substantive matching evidence. Keep those exact entries, truncation, and order. The pseudo-JSON example is structurally redundant but contains potentially influential defaults: detected=true, confidence=0.95, agent speaker, sequence position=3, and professional/engaged sentiment.

Recommendation: no classifier rewrite before AEP under the requirement of identical intent resolution. Even deleting redundant JSON wording, replacing RULES with a markdown heading, or moving its output example could change salience or confidence and therefore resolved IDs. A schema cannot prove semantic equivalence. Removing sample phrases/anti-patterns, changing their truncation, reordering intents, changing meaning-vs-verbatim wording, speaker attribution, confidence bands, transcript boundaries, direction filtering, or already-detected context is expressly excluded.

Classifier before/after decision:

```diff
--- src/compliance/prompts/intent-classification.js (current)
+++ src/compliance/prompts/intent-classification.js (proposed)
(no changes; preserve INTENT_CLASSIFICATION_SYSTEM and buildClassificationPrompt exactly)
```

No changes are proposed to its schema, segmentation/overlap, PHI redaction, intent filtering, merging, sequence handling, or scoring. This preserves the existing request construction; it does not claim deterministic model output. A future experiment would need per-intent resolved-ID and confidence/threshold comparisons, with speaker/evidence/sequence/anti-pattern review on labeled calls, before any reconsideration. The unused PLAN_FIT_SYSTEM in the same file still says “Respond ONLY in valid JSON format, no markdown, no code fences”; no callers were found. It is outside the four live prompt rewrites and remains untouched.

Behavioral risks and unresolved findings

- The existing helper passes empty `recentInterventionText` and `isSpoken: false` to builders, then puts their original values in a user data object. This omits the builders' conditional “do not repeat” and spoken-question instructions from actual system text. MA's conditional customer-speech block is similarly omitted while its speech data remains in live context. The proposal preserves current helper behavior; restoring those instructions is a separate behavior change requiring a decision.
- MedSup contains two year-round GI state lists: one lists CT, ME, MA, NY; another also includes NJ. Its birthday-window wording is broad. U65 combines blanket NOT-MEC language with a major-medical product description and legacy PALIC severity rules. These are source-text inconsistencies flagged for domain review, not determinations about applicable law or product coverage. The diff retains them verbatim rather than choosing a rule.
- Empty-transcript silence instructions coexist with periodic-review non-silence requirements. MA has explicit forced-review guidance; the other prompts also have potentially competing directives. Reordering mode guidance may change which directive receives more weight. No new precedence rule is proposed.
- MA's example level list omits schema-permitted `info`; removing that list might affect level distribution. Its style rules and examples also contain tensions (for example, “make sure” restrictions versus an audio example). All behavioral examples remain unchanged.
- Replacing XML boundaries and moving reference content can change how a model weighs instructions even when the factual text is retained. These coaching diffs are candidates for approval and evaluation, not a claim of behavior-equivalent deployment. If exact identity is required for the live coaching judgments too, retain their current prompts as with the classifier.

Before/after diffs — not applied

The four diffs below include coaching and Q&A plus their local prompt helper definitions. Hunk numbers refer to extracted prompt-builder blocks, not absolute lines in the hook files. Omitted context is unchanged. No request roles, output schemas, runtime consumers, or annuity code are changed by these proposals. Apply only after explicit approval and relevant replay evaluation; do not use these documentation excerpts as an automatic patch.

MA — `src/hooks/useCopilotEngine.js`

```diff
--- src/hooks/useCopilotEngine.js (current prompt builders)
+++ src/hooks/useCopilotEngine.js (PROPOSED, NOT APPLIED)
@@ -2,7 +2,5 @@
   if (!knowledge) return "";
   return `
-════════════════════════════════════════════════════════
-SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
-════════════════════════════════════════════════════════
+## SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
 
 VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases, speech recognition may garble words slightly):
@@ -26,7 +24,5 @@
   if (reviewMode === "periodic") {
     return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
-═══════════════════════════════════════════════════════
+## YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
 This is a scheduled 90-second review. You MUST respond with either encouragement or correction.
 
@@ -41,7 +37,5 @@
 
   return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: SILENT COMPLIANCE SAFETY NET
-═══════════════════════════════════════════════════════
+## YOUR ROLE: SILENT COMPLIANCE SAFETY NET
 
 DEFAULT STATE: SILENT. You are monitoring, not commentating. You do NOT need to respond to every transcript update. Silence means everything is fine.
@@ -62,7 +56,5 @@
 function buildAudioConstraintBlock(hasCustomerAudio) {
   if (hasCustomerAudio) {
-    return `════════════════════════════════════════════════════════
-DUAL AUDIO MODE, AGENT + CUSTOMER
-════════════════════════════════════════════════════════
+    return `## DUAL AUDIO MODE, AGENT + CUSTOMER
 You can hear BOTH the agent and the customer. The transcript below includes lines labeled AGENT: and CUSTOMER:. Use the customer's responses to provide more accurate, contextual coaching.
 
@@ -78,7 +70,5 @@
   }
 
-  return `════════════════════════════════════════════════════════
-CRITICAL AUDIO CONSTRAINT, THIS IS NON-NEGOTIABLE
-════════════════════════════════════════════════════════
+  return `## CRITICAL AUDIO CONSTRAINT, THIS IS NON-NEGOTIABLE
 You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words captured through their microphone. You have ZERO access to what the client/beneficiary says, asks, confirms, or agrees to.
 
@@ -95,7 +85,5 @@
 
 const OBSERVATION_STAY_TALKING_POINT = `
-════════════════════════════════════════════════════════
-OBSERVATION STAY TALKING POINT, USE ONLY FOR MA + HIP CROSS-SELL
-════════════════════════════════════════════════════════
+## OBSERVATION STAY TALKING POINT, USE ONLY FOR MA + HIP CROSS-SELL
 Context for agent: Hospitals frequently place Medicare patients on observation status instead of admitting them as inpatient. This is classified as outpatient care under Medicare, which means:
 1. The client pays outpatient copays or coinsurance instead of inpatient rates.
@@ -124,29 +112,11 @@
   const audioBlock = buildAudioConstraintBlock(hasCustomerAudio);
 
-  return `You are an expert CMS Medicare enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required disclosure, or something the agent needs to correct RIGHT NOW.
+  return `# Medicare Advantage live coaching
+
+You are an expert CMS Medicare enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required disclosure, or something the agent needs to correct RIGHT NOW.
 
 ${audioBlock}
 
-════════════════════════════════════════════════════════
-CURRENT SECTION: "${sectionKey}"
-════════════════════════════════════════════════════════
-FLOW POSITION (previous → current → next):
-${flowOrder}
-
-${scriptTemplateBlock}
-${complianceContext}
-${cmsBlock}
-${transcriptRefBlock}
-${recentInterventionText ? `════════════════════════════════════════════════════════
-RECENT PRIOR INTERVENTIONS, DO NOT REPEAT THESE UNLESS THERE IS SUBSTANTIAL NEW CONTENT AND THE ISSUE STILL CLEARLY REMAINS:
-════════════════════════════════════════════════════════
-${recentInterventionText}
-` : ""}
-════════════════════════════════════════════════════════
-STRUCTURED CALL CONTEXT, TREAT THIS AS RELIABLE APP STATE
-════════════════════════════════════════════════════════
-${copilotContextJson}
-
-HOW TO USE THIS CONTEXT:
+## HOW TO USE THIS CONTEXT
 - Inspect sectionChecklistState to see exactly which checklist items are complete vs. pending for the current section. If an item is marked complete, do NOT warn that it is missing. If an item is still pending and the agent appears to be moving on, flag it.
 - Use derivedSignals to detect broader patterns: pacing issues, repeated missed items, sections completed out of order, or unusual call progression.
@@ -156,22 +126,17 @@
 ${OBSERVATION_STAY_TALKING_POINT}
 
-════════════════════════════════════════════════════════
-EMPTY OR SPARSE TRANSCRIPT:
-════════════════════════════════════════════════════════
+## EMPTY OR SPARSE TRANSCRIPT:
 If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.
 
-${buildCoachingModeGuidance(reviewMode)}
-
-PRIORITY WEIGHTING:
+
+## PRIORITY WEIGHTING
 - Prioritize risky language and compliance-danger behaviors over missing-word disclosure checks.
 - Do not escalate on technical wording misses if the semantic intent appears covered.
 
-════════════════════════════════════════════════════════
-RESPONSE FORMAT: TELEPROMPTER MODE
-════════════════════════════════════════════════════════
+## RESPONSE FORMAT: TELEPROMPTER MODE
 
 You are a teleprompter. The agent glances at you for ONE SECOND while talking to a real person.
 
-HARD LIMITS:
+## HARD LIMITS
 - silent/tip: 8 words max
 - remind: 12 words max
@@ -179,5 +144,5 @@
 - critical: 18 words max. Format: "[Violation]. Say now: '[exact script]'"
 
-STYLE RULES:
+## STYLE RULES
 - No explanations. No context. No reasoning. Just the fix.
 - Never start with "I noticed" or "It appears" or "You may want to"
@@ -186,5 +151,5 @@
 - One thought per message. Never two ideas.
 
-GOOD examples:
+## GOOD examples
 - tip: "Nice TPMO read, clean delivery"
 - remind: "Still need recording consent before moving on"
@@ -192,18 +157,32 @@
 - critical: "Illegal benefit guarantee. Say now: 'Benefits vary by plan and may change'"
 
-BAD examples (too long, would be ignored):
+## BAD examples (too long, would be ignored)
 - "I noticed the agent hasn't mentioned the recording consent yet. They should make sure to cover this before proceeding to the next section."
 - "The agent did a great job covering the TPMO disclaimer. They clearly stated that they don't represent every plan available in the area, which satisfies the CMS requirement."
 
-RESPONSE FORMAT:
-Follow the supplied response schema.
+## RESPONSE FORMAT
 Do NOT include markdown, bold, bullets, dashes, asterisks, emojis, or special characters in the message field.
 
-{
-  "level": "silent | tip | remind | warn | critical",
-  "issue_tag": "short_snake_case_or_empty",
-  "confidence": 0.0,
-  "message": ""
-}`;
+Use a short snake_case issue_tag, or an empty string.
+
+## Reference context
+${scriptTemplateBlock}
+
+${complianceContext}
+
+${buildCoachingModeGuidance(reviewMode)}
+
+## CURRENT SECTION: "${sectionKey}"
+FLOW POSITION (previous → current → next):
+${flowOrder}
+
+${cmsBlock}
+${transcriptRefBlock}
+${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT THESE UNLESS THERE IS SUBSTANTIAL NEW CONTENT AND THE ISSUE STILL CLEARLY REMAINS:
+${recentInterventionText}
+` : ""}
+## STRUCTURED CALL CONTEXT, TREAT THIS AS RELIABLE APP STATE
+${copilotContextJson}
+`;
 }
 
@@ -224,19 +203,13 @@
     : "";
 
-  return `You are a knowledgeable Medicare compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.
-${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting their microphone (customer cannot hear). Answer it directly and concisely." : ""}
-CRITICAL CONTEXT:
+  return `# Medicare Advantage agent questions
+
+You are a knowledgeable Medicare compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.
+## CRITICAL CONTEXT
 ${audioContext}
-- The agent is currently in the "${sectionKey}" section of the enrollment flow
 - They need a fast, practical answer they can use RIGHT NOW on this call
-${sectionContext}
-${scriptTemplateBlock}
-${cmsBlock}
-${transcriptRefBlock}
-${recentTranscript ? `\nRecent agent transcript for context:\n"${recentTranscript.slice(-1000)}"\n` : ""}${customerContext}
-Structured app context:
-${copilotContextJson}
-
-YOUR CAPABILITIES, you can answer questions about:
+
+
+## YOUR CAPABILITIES, you can answer questions about
 - CMS compliance rules and requirements
 - MA plan types, general benefits structure, eligibility
@@ -249,5 +222,5 @@
 - How to handle specific client scenarios on the call
 
-HARD BOUNDARY, DO NOT ANSWER (no live data access):
+## HARD BOUNDARY, DO NOT ANSWER (no live data access)
 - Specific drug formulary or tier info for any plan -> tell agent to check Sunfire or carrier formulary tool
 - Whether a specific provider is in-network for a plan -> tell agent to use Sunfire provider search or call carrier
@@ -258,5 +231,5 @@
 SCOPE RULE: If the question is not directly relevant to the current section or enrollment flow, answer it briefly and then redirect the agent back to completing the current section. Example: "Quick answer: [answer]. You're currently in ${sectionKey}, make sure to cover [key remaining item] before moving on."
 
-STRUCTURED CONTEXT USAGE:
+## STRUCTURED CONTEXT USAGE
 - Check sectionChecklistState for exactly what is complete and pending in the current section.
 - Use derivedSignals to understand call progression and any flagged patterns.
@@ -265,5 +238,5 @@
 EMPTY TRANSCRIPT: If no transcript is available, answer based on the agent's question and current section context only. Do not speculate about what was or wasn't said on the call.
 
-RESPONSE RULES:
+## RESPONSE RULES
 - Keep answers concise and actionable, the agent is on a live call
 - If providing script language, put it in quotes so the agent can read it directly
@@ -272,5 +245,5 @@
 - If transcript references are provided, cite them inline as [R1], [R2], etc.
 
-RESPONSE FORMAT RULES:
+## RESPONSE FORMAT RULES
 - Respond ONLY in plain, conversational English
 - NEVER include JSON, code, or structured data in your response
@@ -281,4 +254,23 @@
 - Keep responses very short: 1-3 sentences max. The agent is mid-call and can only glance at the answer.
 - No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters
-- Write natural conversational sentences. Separate multiple items with numbered lines or semicolons, never with dashes or symbols.`;
+- Write natural conversational sentences. Separate multiple items with numbered lines or semicolons, never with dashes or symbols.
+
+## Reference context
+${scriptTemplateBlock}
+
+${sectionContext}
+
+- The agent is currently in the "${sectionKey}" section of the enrollment flow
+
+${cmsBlock}
+
+${transcriptRefBlock}
+
+${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting their microphone (customer cannot hear). Answer it directly and concisely." : ""}
+
+${recentTranscript ? `\nRecent agent transcript for context:\n"${recentTranscript.slice(-1000)}"\n` : ""}${customerContext}
+
+Structured app context:
+${copilotContextJson}
+`;
 }
```

MedSup — `src/hooks/useMedSupCopilotEngine.js`

```diff
--- src/hooks/useMedSupCopilotEngine.js (current prompt builders)
+++ src/hooks/useMedSupCopilotEngine.js (PROPOSED, NOT APPLIED)
@@ -2,7 +2,5 @@
   if (!knowledge) return "";
   return `
-════════════════════════════════════════════════════════
-SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
-════════════════════════════════════════════════════════
+## SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
 
 VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases, speech recognition may garble words):
@@ -26,7 +24,5 @@
   if (reviewMode === "periodic") {
     return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
-═══════════════════════════════════════════════════════
+## YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
 This is a scheduled 90-second review. You MUST respond with either encouragement or correction.
 - NEVER return "silent" or "info"
@@ -38,7 +34,5 @@
 
   return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: SILENT COMPLIANCE SAFETY NET
-═══════════════════════════════════════════════════════
+## YOUR ROLE: SILENT COMPLIANCE SAFETY NET
 
 DEFAULT STATE: SILENT. You are monitoring, not commentating.
@@ -55,7 +49,9 @@
   const complianceContext = buildComplianceContext(knowledge);
 
-  return `You are an expert Medicare Supplement (Medigap) enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.
-
-IMPORTANT MED SUP CONTEXT:
+  return `# Medicare Supplement live coaching
+
+You are an expert Medicare Supplement (Medigap) enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.
+
+## IMPORTANT MED SUP CONTEXT
 - This is a Medicare Supplement (Medigap) enrollment, NOT Medicare Advantage or ACA
 - Medigap plans are standardized by letter (A, B, C, D, F, G, K, L, M, N)
@@ -69,5 +65,5 @@
 - Replacement/switching compliance: cannot misrepresent benefits of switching carriers
 
-2026 MEDICARE COST-SHARING REFERENCE (use these verified CMS numbers):
+## 2026 MEDICARE COST-SHARING REFERENCE (use these verified CMS numbers)
 - Part A deductible: $1,736 | Part B deductible: $283 | Part B premium: $202.90/mo
 - Part A coinsurance days 61-90: $434/day | Lifetime reserve: $868/day
@@ -79,12 +75,10 @@
 - Part D OOP cap: $2,100 | Part D max deductible: $615 | Insulin cap: $35/mo
 
-STATE GI RULES (included in structured context as stateGIRules):
+## STATE GI RULES (included in structured context as stateGIRules)
 - Year-round GI (no UW): CT, ME, MA, NJ, NY
 - Birthday rule states (annual 30-day window): CA, ID, IL, LA, NV, OK, OR
 - Federal OEP only: all other states, 6 months from Part B effective date at 65
 
-════════════════════════════════════════════════════════
-CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
-════════════════════════════════════════════════════════
+## CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
 You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words. You have ZERO access to what the client says.
 
@@ -96,25 +90,5 @@
 - The agent may have started before recording began, absence is not proof of omission
 
-════════════════════════════════════════════════════════
-CURRENT SECTION: "${sectionKey}"
-════════════════════════════════════════════════════════
-FLOW POSITION:
-${flowOrder}
-
-${complianceContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentInterventionText ? `════════════════════════════════════════════════════════
-RECENT PRIOR INTERVENTIONS, DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
-════════════════════════════════════════════════════════
-${recentInterventionText}
-` : ""}
-════════════════════════════════════════════════════════
-STRUCTURED CALL CONTEXT
-════════════════════════════════════════════════════════
-${copilotContextJson}
-
-HOW TO USE THIS CONTEXT:
+## HOW TO USE THIS CONTEXT
 - Check gate states to see what is complete vs pending. If a gate is complete, do NOT warn that its items are missing.
 - Use derivedSignals for broader patterns: timeInSectionMs and likelyCoveredByParaphrase.
@@ -124,19 +98,14 @@
 - salesForumContext contains sidebar values for Plan G vs N rates, HDG + Hospital Protection analysis, carrier selection, and cross-sell acknowledgement. During quoting, use it to remind agents about state excess-charge risk, HDG combo savings, CSG/manual rate workflow, and required ancillary cross-sell acknowledgement.
 
-════════════════════════════════════════════════════════
-EMPTY OR SPARSE TRANSCRIPT:
-════════════════════════════════════════════════════════
+## EMPTY OR SPARSE TRANSCRIPT:
 If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.
 
-${buildCoachingModeGuidance(reviewMode)}
-
-PRIORITY WEIGHTING:
+
+## PRIORITY WEIGHTING
 - Prioritize risky language and compliance-danger behaviors over missing-word checks.
 - Do not escalate on technical wording misses if the semantic intent appears covered.
 - For Med Sup: underwriting misrepresentation, GI rights violations, and TPMO omissions are the highest severity items.
 
-════════════════════════════════════════════════════════
-RESPONSE QUALITY REQUIREMENTS
-════════════════════════════════════════════════════════
+## RESPONSE QUALITY REQUIREMENTS
 
 Every non-silent response MUST:
@@ -153,14 +122,27 @@
 - Before issuing warn/remind, ask: "Could this have happened before recording started?" If yes, bias toward silence.
 
-════════════════════════════════════════════════════════
-RESPONSE FORMAT
-════════════════════════════════════════════════════════
-Follow the supplied response schema. Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
-{
-  "level": "silent | info | tip | remind | warn | critical",
-  "issue_tag": "short_snake_case_tag_or_empty",
-  "confidence": 0,
-  "message": "Your message here. Empty if silent."
-}`;
+## RESPONSE FORMAT
+Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
+Use a short snake_case issue_tag, or an empty string.
+For level "silent", use an empty message.
+
+## Reference context
+${complianceContext}
+
+${buildCoachingModeGuidance(reviewMode)}
+
+## CURRENT SECTION: "${sectionKey}"
+FLOW POSITION:
+${flowOrder}
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
+${recentInterventionText}
+` : ""}
+## STRUCTURED CALL CONTEXT
+${copilotContextJson}
+`;
 }
 
@@ -171,19 +153,13 @@
   }
 
-  return `You are a knowledgeable Medicare Supplement compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
-${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
-CRITICAL CONTEXT:
+  return `# Medicare Supplement agent questions
+
+You are a knowledgeable Medicare Supplement compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
+## CRITICAL CONTEXT
 - You can ONLY hear the AGENT speaking
-- The agent is currently in the "${sectionKey}" section of the Med Sup enrollment flow
 - They need a fast, practical answer for this live call
-${sectionContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
-Structured app context:
-${copilotContextJson}
-
-YOUR CAPABILITIES:
+
+
+## YOUR CAPABILITIES
 - Medicare Supplement (Medigap) plan details and standardized benefits
 - Guaranteed Issue rights and qualifying events
@@ -195,5 +171,5 @@
 - TPMO disclosure requirements
 
-HARD BOUNDARY, DO NOT ANSWER:
+## HARD BOUNDARY, DO NOT ANSWER
 - Specific premium quotes → tell agent to check carrier rating tool
 - Whether a specific doctor accepts Medicare → direct to Medicare.gov provider lookup
@@ -201,8 +177,26 @@
 You CAN answer Medicare cost-sharing questions using the medicareReference data in context (Part A/B deductibles, coinsurance, MOOP limits). These are verified 2026 CMS numbers.
 
-RESPONSE RULES:
+## RESPONSE RULES
 - Keep answers concise and actionable
 - Put script language in quotes so agent can read it directly
 - Always prioritize compliance
-Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.`;
+Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.
+
+## Reference context
+${sectionContext}
+
+- The agent is currently in the "${sectionKey}" section of the Med Sup enrollment flow
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+
+
+${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
+
+${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
+
+Structured app context:
+${copilotContextJson}
+`;
 }
```

ACA — `src/hooks/useAcaCopilotEngine.js`

```diff
--- src/hooks/useAcaCopilotEngine.js (current prompt builders)
+++ src/hooks/useAcaCopilotEngine.js (PROPOSED, NOT APPLIED)
@@ -2,7 +2,5 @@
   if (!knowledge) return "";
   return `
-════════════════════════════════════════════════════════
-SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
-════════════════════════════════════════════════════════
+## SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
 
 VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases, speech recognition may garble words):
@@ -26,7 +24,5 @@
   if (reviewMode === "periodic") {
     return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
-═══════════════════════════════════════════════════════
+## YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
 This is a scheduled 90-second review. You MUST respond with either encouragement or correction.
 - NEVER return "silent" or "info"
@@ -38,7 +34,5 @@
 
   return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: SILENT COMPLIANCE SAFETY NET
-═══════════════════════════════════════════════════════
+## YOUR ROLE: SILENT COMPLIANCE SAFETY NET
 
 DEFAULT STATE: SILENT. You are monitoring, not commentating.
@@ -55,7 +49,9 @@
   const complianceContext = buildComplianceContext(knowledge);
 
-  return `You are an expert ACA Marketplace enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.
+  return `# ACA Marketplace live coaching
 
-IMPORTANT ACA CONTEXT:
+You are an expert ACA Marketplace enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.
+
+## IMPORTANT ACA CONTEXT
 - This is an ACA On-Exchange (Marketplace) enrollment, NOT Medicare
 - Key regulations: 45 CFR Part 155, ACA Section 1311, CMS Marketplace rules
@@ -64,7 +60,5 @@
 - CSR (Cost Sharing Reductions) only apply to Silver plans for clients 100-250% FPL
 
-════════════════════════════════════════════════════════
-CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
-════════════════════════════════════════════════════════
+## CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
 You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words. You have ZERO access to what the client says.
 
@@ -76,25 +70,5 @@
 - The agent may have started before recording began, absence is not proof of omission
 
-════════════════════════════════════════════════════════
-CURRENT SECTION: "${sectionKey}"
-════════════════════════════════════════════════════════
-FLOW POSITION:
-${flowOrder}
-
-${complianceContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentInterventionText ? `════════════════════════════════════════════════════════
-RECENT PRIOR INTERVENTIONS, DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
-════════════════════════════════════════════════════════
-${recentInterventionText}
-` : ""}
-════════════════════════════════════════════════════════
-STRUCTURED CALL CONTEXT
-════════════════════════════════════════════════════════
-${copilotContextJson}
-
-HOW TO USE THIS CONTEXT:
+## HOW TO USE THIS CONTEXT
 - Check gate states to see what is complete vs pending. If a gate is complete, do NOT warn that its items are missing.
 - Use derivedSignals for broader patterns: subsidyCliffRisk, medicaidLikely, csrEligible, sepValid, sepExpiringSoon.
@@ -102,19 +76,14 @@
 - If planData is present, use it to ground your coaching with real market data (plan counts, premium/deductible ranges by metal tier). Do NOT quote exact dollar amounts to the agent, use ranges and tier comparisons.
 
-════════════════════════════════════════════════════════
-EMPTY OR SPARSE TRANSCRIPT:
-════════════════════════════════════════════════════════
+## EMPTY OR SPARSE TRANSCRIPT:
 If the transcript is empty or very short, return silent and wait for meaningful speech.
 
-${buildCoachingModeGuidance(reviewMode)}
 
-PRIORITY WEIGHTING:
+## PRIORITY WEIGHTING
 - Prioritize risky language and compliance-danger behaviors over missing-word checks.
 - Do not escalate on technical wording misses if the semantic intent appears covered.
 - For ACA: subsidy misrepresentation, income falsification coaching, and SSN mishandling are the highest severity items.
 
-════════════════════════════════════════════════════════
-RESPONSE QUALITY REQUIREMENTS
-════════════════════════════════════════════════════════
+## RESPONSE QUALITY REQUIREMENTS
 
 Every non-silent response MUST:
@@ -131,14 +100,27 @@
 - Before issuing warn/remind, ask: "Could this have happened before recording started?" If yes, bias toward silence.
 
-════════════════════════════════════════════════════════
-RESPONSE FORMAT
-════════════════════════════════════════════════════════
-Follow the supplied response schema. Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
-{
-  "level": "silent | info | tip | remind | warn | critical",
-  "issue_tag": "short_snake_case_tag_or_empty",
-  "confidence": 0,
-  "message": "Your message here. Empty if silent."
-}`;
+## RESPONSE FORMAT
+Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
+Use a short snake_case issue_tag, or an empty string.
+For level "silent", use an empty message.
+
+## Reference context
+${complianceContext}
+
+${buildCoachingModeGuidance(reviewMode)}
+
+## CURRENT SECTION: "${sectionKey}"
+FLOW POSITION:
+${flowOrder}
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
+${recentInterventionText}
+` : ""}
+## STRUCTURED CALL CONTEXT
+${copilotContextJson}
+`;
 }
 
@@ -149,19 +131,13 @@
   }
 
-  return `You are a knowledgeable ACA Marketplace compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
-${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
-CRITICAL CONTEXT:
+  return `# ACA Marketplace agent questions
+
+You are a knowledgeable ACA Marketplace compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
+## CRITICAL CONTEXT
 - You can ONLY hear the AGENT speaking
-- The agent is currently in the "${sectionKey}" section of the ACA enrollment flow
 - They need a fast, practical answer for this live call
-${sectionContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
-Structured app context:
-${copilotContextJson}
 
-YOUR CAPABILITIES:
+
+## YOUR CAPABILITIES
 - ACA Marketplace compliance rules and regulations (45 CFR 155)
 - APTC/subsidy eligibility and calculation (FPL thresholds, 2026 cliff)
@@ -173,5 +149,5 @@
 - Enrollment process compliance
 
-HARD BOUNDARY, DO NOT ANSWER:
+## HARD BOUNDARY, DO NOT ANSWER
 - Whether a specific provider is in-network → direct to plan's provider directory
 - Specific drug formulary/tier info → direct to plan's formulary tool
@@ -179,8 +155,26 @@
 If planData is present in the context, you CAN reference plan counts and premium/deductible ranges by metal tier. Do NOT invent specific plan names or exact costs beyond what the data shows.
 
-RESPONSE RULES:
+## RESPONSE RULES
 - Keep answers concise and actionable
 - Put script language in quotes so agent can read it directly
 - Always prioritize compliance
-Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.`;
+Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.
+
+## Reference context
+${sectionContext}
+
+- The agent is currently in the "${sectionKey}" section of the ACA enrollment flow
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+
+
+${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
+
+${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
+
+Structured app context:
+${copilotContextJson}
+`;
 }
```

U65 — `src/hooks/useU65CopilotEngine.js`

```diff
--- src/hooks/useU65CopilotEngine.js (current prompt builders)
+++ src/hooks/useU65CopilotEngine.js (PROPOSED, NOT APPLIED)
@@ -2,7 +2,5 @@
   if (!knowledge) return "";
   return `
-════════════════════════════════════════════════════════
-GATE-SPECIFIC COMPLIANCE INTELLIGENCE
-════════════════════════════════════════════════════════
+## GATE-SPECIFIC COMPLIANCE INTELLIGENCE
 
 VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING:
@@ -26,7 +24,5 @@
   if (reviewMode === "periodic") {
     return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
-═══════════════════════════════════════════════════════
+## YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
 This is a scheduled 90-second review. You MUST respond with either encouragement or correction.
 - NEVER return "silent" or "info"
@@ -37,7 +33,5 @@
 
   return `
-═══════════════════════════════════════════════════════
-YOUR ROLE: SILENT COMPLIANCE SAFETY NET
-═══════════════════════════════════════════════════════
+## YOUR ROLE: SILENT COMPLIANCE SAFETY NET
 
 DEFAULT STATE: SILENT. You are monitoring, not commentating.
@@ -54,7 +48,9 @@
   const complianceContext = buildComplianceContext(knowledge);
 
-  return `You are an expert U65 off-exchange private health products compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue.
+  return `# U65 off-exchange live coaching
 
-CRITICAL U65 OFF-EXCHANGE CONTEXT:
+You are an expert U65 off-exchange private health products compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue.
+
+## CRITICAL U65 OFF-EXCHANGE CONTEXT
 - This is a U65 (under-65) off-exchange enrollment, NOT ACA marketplace, NOT Medicare
 - Products sold are PRIVATE health products that are NOT minimum essential coverage (MEC)
@@ -69,5 +65,5 @@
 - For HIGH UW risk clients: agent should pivot to ACA (guaranteed issue) rather than forcing off-exchange
 
-HIGHEST SEVERITY COMPLIANCE ITEMS (intervene immediately):
+## HIGHEST SEVERITY COMPLIANCE ITEMS (intervene immediately)
 1. Presenting products without delivering NOT-MEC / NOT-ACA-substitute disclosures
 2. Guaranteeing acceptance or saying the client is "approved" before UW confirmation
@@ -77,7 +73,5 @@
 6. Not disclosing the 12-month pre-existing condition exclusion for PALIC
 
-════════════════════════════════════════════════════════
-CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
-════════════════════════════════════════════════════════
+## CRITICAL AUDIO CONSTRAINT, NON-NEGOTIABLE
 You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words.
 
@@ -88,25 +82,5 @@
 - The agent may have started before recording began, absence is not proof of omission
 
-════════════════════════════════════════════════════════
-CURRENT GATE: "${sectionKey}"
-════════════════════════════════════════════════════════
-FLOW POSITION:
-${flowOrder}
-
-${complianceContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentInterventionText ? `════════════════════════════════════════════════════════
-RECENT PRIOR INTERVENTIONS, DO NOT REPEAT:
-════════════════════════════════════════════════════════
-${recentInterventionText}
-` : ""}
-════════════════════════════════════════════════════════
-STRUCTURED CALL CONTEXT
-════════════════════════════════════════════════════════
-${copilotContextJson}
-
-HOW TO USE THIS CONTEXT:
+## HOW TO USE THIS CONTEXT
 - Check gate states to see what is complete vs pending. If a gate is complete, do NOT warn that its items are missing.
 - uwRisk tells you the client's health risk level, impacts which products are appropriate and compliance requirements.
@@ -116,12 +90,9 @@
 - If acaBenchmark is present, it contains real ACA Silver benchmark and Bronze premiums for the client's area. Use this to coach the agent on concrete subsidy cliff comparisons: "Without enhanced PTCs, ACA costs $X/mo vs. off-exchange at $Y/mo." Do NOT read raw numbers to the agent, frame them as talking points.
 
-════════════════════════════════════════════════════════
-EMPTY OR SPARSE TRANSCRIPT:
-════════════════════════════════════════════════════════
+## EMPTY OR SPARSE TRANSCRIPT:
 If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.
 
-${buildCoachingModeGuidance(reviewMode)}
 
-PRIORITY WEIGHTING:
+## PRIORITY WEIGHTING
 - NOT-MEC/NOT-ACA-substitute disclosure violations are the HIGHEST priority
 - UW guarantee violations are SECOND highest
@@ -129,7 +100,5 @@
 - Prioritize substance over wording, if the intent is clearly covered, don't flag minor phrasing differences
 
-════════════════════════════════════════════════════════
-RESPONSE QUALITY REQUIREMENTS
-════════════════════════════════════════════════════════
+## RESPONSE QUALITY REQUIREMENTS
 
 Every non-silent response MUST:
@@ -146,14 +115,27 @@
 - Before issuing warn/remind, ask: "Could this have happened before recording started?" If yes, bias toward silence.
 
-════════════════════════════════════════════════════════
-RESPONSE FORMAT
-════════════════════════════════════════════════════════
-Follow the supplied response schema. Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
-{
-  "level": "silent | info | tip | remind | warn | critical",
-  "issue_tag": "short_snake_case_tag_or_empty",
-  "confidence": 0,
-  "message": "Your message here. Empty if silent."
-}`;
+## RESPONSE FORMAT
+Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
+Use a short snake_case issue_tag, or an empty string.
+For level "silent", use an empty message.
+
+## Reference context
+${complianceContext}
+
+${buildCoachingModeGuidance(reviewMode)}
+
+## CURRENT GATE: "${sectionKey}"
+FLOW POSITION:
+${flowOrder}
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT:
+${recentInterventionText}
+` : ""}
+## STRUCTURED CALL CONTEXT
+${copilotContextJson}
+`;
 }
 
@@ -164,21 +146,15 @@
   }
 
-  return `You are a knowledgeable U65 off-exchange private health products compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
-${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting. Answer directly and concisely." : ""}
-CRITICAL CONTEXT:
+  return `# U65 off-exchange agent questions
+
+You are a knowledgeable U65 off-exchange private health products compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
+## CRITICAL CONTEXT
 - This is a U65 (under-65) OFF-EXCHANGE enrollment. NOT ACA marketplace. NOT Medicare. NOT Medicare Supplement.
 - You can ONLY hear the AGENT speaking
-- The agent is in the "${sectionKey}" gate of the U65 off-exchange enrollment flow
 - Products: MedPerformance (Cigna PPO major medical), MedMax (First Health PPO defined benefit), and MedAccess MVP. These are private off-exchange plans, NOT Medicare products despite the "Med" prefix.
 - Legacy U65 product names may appear in older call scripts.
-${sectionContext}
-${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
-${transcriptReferenceBlock}
-` : ""}
-${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
-Structured app context:
-${copilotContextJson}
 
-YOUR CAPABILITIES:
+
+## YOUR CAPABILITIES
 - U65 off-exchange product details, including MedPerformance, MedMax, MedAccess MVP, and legacy script references
 - NOT-MEC / NOT-ACA-substitute disclosure requirements
@@ -191,5 +167,5 @@
 - Enrollment platform details (enrollprime.com, apps.neweralife.com)
 
-HARD BOUNDARY, DO NOT ANSWER:
+## HARD BOUNDARY, DO NOT ANSWER
 - Specific premium quotes → tell agent to check the enrollment portal
 - Whether a specific provider is in-network → direct to the First Health or Cigna provider finder for the selected product
@@ -198,8 +174,26 @@
 Do NOT guess product-specific data.
 
-RESPONSE RULES:
+## RESPONSE RULES
 - Keep answers concise and actionable
 - Put script language in quotes so agent can read it directly
 - Always prioritize compliance, especially NOT-MEC disclosure and UW honesty
-Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.`;
+Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.
+
+## Reference context
+${sectionContext}
+
+- The agent is in the "${sectionKey}" gate of the U65 off-exchange enrollment flow
+
+${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
+${transcriptReferenceBlock}
+` : ""}
+
+
+${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting. Answer directly and concisely." : ""}
+
+${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
+
+Structured app context:
+${copilotContextJson}
+`;
 }
```


Shared retrieved-reference wrapper proposal, used by all four engines:

```diff
--- src/lib/transcriptSearch.js (current)
+++ src/lib/transcriptSearch.js (PROPOSED, NOT APPLIED)
@@
-    "<enrollment_call_references>",
+    "## Enrollment call references",
     "The following excerpts are from real, scrubbed calls retrieved from Supabase.",
     "Use them for reference and include citations using [R#] tags when you rely on them.",
@@
-    "</enrollment_call_references>",
+    "## End enrollment call references",
```

The explicit end heading preserves a visible boundary before following context. Reference body, R# citation identifiers, ordering, metadata, and text remain unchanged. This shared formatter change would require checking every caller before application; the current proposal does not apply it globally.

Task 2 deliverable accounting

Only `docs/LLM_MIGRATION.md` changed during this audit: it records the accepted buffering decision, measurements, per-engine findings, four unapplied builder diffs, shared wrapper proposal, classifier no-change recommendation, and unresolved behavioral risks. Earlier migration changes in the working tree remain as they were.

New environment variables: none. New tests: none. Validation: the eight candidate coaching/Q&A builders and supporting prompt definitions parsed and rendered locally; current-system equality probes distinguished live-context changes from RAG/mode changes. These checks establish source/render consistency, not model or compliance equivalence. No live API evaluation was performed.

Not done: no application prompt edits (Task 2 is proposal-only); no classifier cleanup (identical intent behavior takes precedence over formatting/token savings); no few-shot ablation (no evidence it is safe); no domain-rule corrections or restoration of omitted conditional instructions (requires a separate behavior decision); no adapter cache-breakpoint implementation (outside this prompt proposal); no streaming contract work (user declined it); no silence guard or off-topic gating yet (latest authorization was to proceed to Task 2). Deterministic annuity and site styling remain untouched.

Task 2 approval applied — stable prompt blocks (September 9, 2026)

The user subsequently approved the coaching rewrites and requested a byte-identical prefix before Task 3. Applied to all four migrated engines (MA, MedSup, ACA, U65), including the audited Q&A builders. Each builder now explicitly returns staticPrefix and variableSuffix. The helper emits two system text blocks, preserving existing user-context messages and roles. The OpenAI adapter places an explicit cache breakpoint on the first block only, with explicit caching mode. Anthropic rollback translates the internal prefix marker to its own cache control; OpenAI receives no Anthropic markers. Unmarked classifier and summary requests retain their prior mapping.

The prefix contains invariant role/product policy, behavioral examples, output constraints, and fixed compliance guidance. MA audio-mode instructions moved intact into the suffix because audio availability varies. The active/neighbor script flow, tenant template, selected section rules, CMS selections, RAG and active mode remain variable: making those engine-invariant would require adding a full flow/catalog or freezing changing content, neither of which is authorized. The existing live transcript/history/context remains after the two system blocks. No content was added or removed by this restructuring beyond the previously approved formatting/example edits. Q&A has its own invariant prefix because it is a different task from structured coaching.

| Engine | Coaching prefix characters | Coaching prefix tokens (proxy) | Q&A prefix tokens (proxy) |
| --- | --- | --- | --- |
| MA | 4,264 | 905 | 644 |
| MedSup | 5,351 | 1,235 | 329 |
| ACA | 3,450 | 771 | 333 |
| U65 | 4,891 | 1,057 | 425 |

Counts use js-tiktoken's o200k_base tokenizer installed only under /tmp for this audit, not as a project dependency. Its model map does not identify gpt-5.6-luna, so these are reproducible proxy counts, not authoritative Luna billing counts. Schema/message framing is excluded. Byte equality is tested directly, including whitespace, across section, mode, audio, transcript, RAG and template changes. Prefix equality is per engine and task for this prompt revision.

The cache breakpoint fixes the reusable-boundary issue, but does not guarantee hits or 10x total input savings. MA/ACA coaching text and all Q&A text prefixes may be shorter than the model minimum; schema/framing also contributes to the actual provider prefix. No padding or rule duplication was introduced. Cache reads, writes, suffix tokens, model settings and expiry all affect cost. Measure cached_tokens in production rather than inferring savings from the full system changing. [OpenAI prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)

Before starting Task 3: all 33 adapter/prompt tests passed and the LLM typecheck passed. Ten new tests cover all eight builders' prefix byte equality, provider boundary/text/role preservation, and unchanged unmarked request mapping. A separate local 32-case comparison against the approved proposal preserved the complete whitespace-token inventory and exact live messages through the ordering change. That verifies content preservation, not model decision equivalence. The documented rule inconsistencies and omitted conditional instructions remain unchanged and are reported separately below.

Task 3 applied — silence guard (September 9, 2026)

All four LLM coaching engines share a hasNewTranscript guard backed by transcript revisions. The final-segment callback sets it as content arrives; observing the transcript also catches restored/capped content and MA's merged final customer segments. The agent-mic hook currently uses browser SpeechRecognition, not a direct Deepgram subscription; the guard attaches to its existing onNewFinal callback. MA customer audio/remote transcription enters through the final merged transcript. No ASR provider was changed.

Each coaching request captures a revision with its transcript snapshot and acknowledges that revision when dispatching the HTTP request, after retrieval. Segments arriving during retrieval or completion remain pending. A stale completion cannot clear a newer call's guard. Q&A does not consume pending coaching speech: answering a question is not equivalent to reviewing the new transcript for coaching.

Periodic and debounced timers skip before invoking the engine when no content remains pending after a first dispatch. Skips perform no retrieval, LLM call, or synchronous telemetry request. New content can fire even if the old periodic context signature matches (for example, customer-only content). The signature still accompanies reviews. The first request is exempt; a new call or clear resets the exemption. Explicit Analyze and section-entry actions bypass the silence gate; Q&A is unguarded. Existing empty-transcript, loading, cooldown and other eligibility checks remain. “Always fire manual” here means the silence guard never adds a suppression reason; it does not remove existing manual cooldown policy.

MA call-start state now passes from ScriptFlow through ScriptPrompter to the core; ACA forwards its existing callStarted state. This scopes the periodic timer to calls and resets first-turn state for new calls. MedSup/U65 already forwarded callStarted. No styling changed.

Telemetry increments a memory counter and flushes separately every 60 seconds, on clear, and best-effort on pagehide/unmount. One cumulative usage_records row per tenant/engine/browser call session uses record_type=llm_skipped_ticks and quantity=skipped ticks. The telemetry-only endpoint validates engine, UUID, and bounded integer count, authenticates with Clerk, resolves the tenant server-side, and enforces the existing Pro subscription gate. It never imports an LLM client. Counters contain no transcript, prompt, customer identity, or model output.

Migration 035 adds the record type, partial unique index, and service-role-only RPC. Its upsert takes the greatest cumulative count: retried or out-of-order flushes cannot double-count or decrease totals. The index does not constrain primary/retry/fallback token rows sharing request IDs. Failed flushes retain counts without blocking coaching. Browser termination/offline shutdown can lose unflushed counts; this is operational telemetry, not a compliance evidence store. Existing token-billing queries exclude this record type.

Migration 035_llm_silence_counters.sql is provided and locally validated, but has not been applied to Supabase. The user previously applied 034; 035 is additionally required for persistent counters. No production database was accessed.

Counter query:

```sql
SELECT engine_name, SUM(quantity)::bigint AS skipped_ticks
FROM public.usage_records
WHERE record_type = 'llm_skipped_ticks'
GROUP BY engine_name;
```

These are skipped scheduling attempts, including debounces consumed by another request. They do not imply every tick would previously have produced a billable request: earlier loading/signature/cooldown gates also suppressed work. Compare actual llm_tokens request/token totals and cached_tokens before/after for realized savings.

Rule inconsistencies reported separately — not silently corrected

- MedSup: its initial year-round GI list includes CT, ME, MA, NY; the later list also includes NJ. The blanket birthday-window wording needs domain review. Both rule passages remain verbatim.
- U65: blanket NOT-MEC/NOT-ACA-substitute directives coexist with the MedPerformance major-medical description and legacy PALIC exclusion/severity instructions. Product classifications and disclosure requirements were not corrected.
- All four: sparse-transcript silence and periodic-review non-silence guidance coexist. No new precedence rule was inserted.
- MA: “make sure” style restrictions conflict with an audio example using that phrase; semantic paraphrase credit coexists with exact-script correction examples. Those instructions remain. The pseudo-JSON level list omitting info was removed as approved; schema/severity logic did not change.
- The prior helper still omits conditional no-repeat/spoken-question/customer-speech instruction blocks by passing empty values to builders, while retaining the data in user context. This behavior was documented, not restored.

Final file accounting for this approval and Task 3

| File | Change in this follow-up |
| --- | --- |
| src/hooks/useCopilotEngine.js | Approved MA coaching/Q&A formatting, explicit static/variable blocks, variable audio guidance, transcript revision capture/dispatch acknowledgment, merged customer transcript and call-start wiring. |
| src/hooks/useMedSupCopilotEngine.js | Approved MedSup prompt blocks and coaching transcript revision handling. |
| src/hooks/useAcaCopilotEngine.js | Approved ACA prompt blocks, transcript revision handling, and call-start gating. |
| src/hooks/useU65CopilotEngine.js | Approved U65 prompt blocks and transcript revision handling. |
| src/lib/llm/prompts.js | Explicit prefix/suffix system blocks, preserving existing live context messages. |
| src/lib/llm/openai.ts | Explicit Responses cache breakpoint/mode for marked prefixes; unchanged unmarked request mapping. |
| src/lib/llm/anthropic.ts | Maps the shared prefix marker to Anthropic cache control for rollback, preserving text blocks. |
| src/lib/transcriptSearch.js | Approved XML-to-markdown start/end headings; reference contents/citations unchanged. Callers are the four migrated hooks. |
| src/lib/llm/transcriptGuard.js | Revision-aware silence state and background cumulative-counter reporter. |
| src/hooks/useCopilotEngineCore.js | Final-segment/timer guard, call reset, counter flushing, capture/dispatch callbacks. |
| src/components/ScriptFlow.jsx | Forwards existing MA callStarted state. |
| src/components/ScriptPrompter.jsx | Passes that state to the MA engine. |
| netlify/functions/copilot-skip-counter.js | Authenticated, tenant-scoped telemetry-only counter endpoint. |
| netlify/functions/_copilotSkipCounter.js | Counter validation and scoped Supabase RPC invocation. |
| supabase/migrations/035_llm_silence_counters.sql | Counter record type, index, RPC, and service-role-only execution. |
| tests/copilot-prompts.test.js | Ten tests: eight engine/task prefix-byte-equality cases; provider boundary/content/role preservation; unchanged unmarked request mapping. |
| tests/helpers/copilotPrompts.js | Loads actual pure builders and supplies variable reference/context fixtures. |
| tests/copilot-silence.test.js | Nine tests: four engine first/silence/new/manual/call-reset scheduling cases; MA customer-only speech; in-flight revisions; identical segments/first turn; counter retry/race; tenant/payload validation. |
| tests/helpers/copilotCoreHarness.js | Actual shared core with controlled hook storage, effects, timers, and mocked telemetry. |
| package.json | Includes new prompt/silence tests in test:llm. |
| docs/LLM_MIGRATION.md | Implementation, counts, limitations, validation, inconsistencies and file accounting. |

New environment variables: none. No project dependencies were added; tokenizer and local PostgreSQL verification tools were installed only under /tmp. Streaming consumer semantics are unchanged.

Validation: all 55 repository tests passed, including 19 new tests. LLM typecheck and targeted ESLint passed. Four server functions bundled for Node 22. Frontend production build passed using the same subprocess-only public-secret overrides as earlier migration validation; no env file was edited. A local in-memory PostgreSQL check applied 034 then 035, reapplied 035, verified monotonic/idempotent counts, allowed duplicate LLM retry request IDs, rejected the annuity engine, and denied authenticated-role RPC access. This does not verify a deployed Supabase instance. Hash checks confirmed the inspected classifier/compliance and deterministic annuity files remained unchanged from the start of this approval.

Not done: classifier rewrite, scoring-rule changes, omitted-instruction restoration, prompt padding, full-catalog insertion, streaming-contract work, production deployment, or live model calls. The latest instruction was to apply the approved prompts and proceed through Task 3; Task 4 off-topic gating remains unapplied and was not designed in this follow-up.

NJ MedSup correction and U65 verbatim audit (September 9, 2026)

Applied the user's NJ correction. The local NJ entry now sets continuousOE=false and provides separate age65Plus, disabledAge50To64, and underAge50 branches. Age 65+ uses federal open enrollment/GI windows and underwriting outside protected windows. The disability age-50–64 branch provides state-mandated access with same-policy age-65 premium caps and conditional underwriting after the applicable Part B window. Under-50 access specifies Horizon BCBSNJ and Plan D, with Plan C for pre-2020 eligibility. Missing age, eligibility basis, first eligibility date/age, Part B date, or GI event must be verified before asserting protection.

Two source qualifications were retained to prevent a replacement overgeneralization: beneficiaries already on Part B before 65 get a new federal Medigap window at 65; the age-50–64 legacy Plan C rule used six months, while the post-2020 Plan D path uses twelve. The age at first Medicare eligibility also matters for the state program. [NJ DOBI program guidance](https://www.nj.gov/dobi/division_insurance/medsuppunder50/intro.html), [Medicare open enrollment](https://www.medicare.gov/health-drug-plans/medigap/ready-to-buy/when), [NJ 2026 under-50 program](https://www.nj.gov/humanservices/doas/documents/2026%20Medicare%20Supplement%20Coverage%20Sold%20In%20New%20Jersey%20Under%2050%20Plan%20Information%201.8.26.pdf)

Removed NJ from the prompt's blanket year-round list and explicitly excluded it from the generic “all other states” shortcut. Coaching and Q&A receive the corrected structured rules. The database reference previously replaced the local fallback entirely; resolveMedSupStateGIRules now makes the reviewed NJ entry authoritative while preserving every other database state entry. This prevents an old seeded/tenant NJ record from reinstating the blanket claim. Future NJ policy edits must update this reviewed source rather than relying on a database-only override.

Migration 036_correct_nj_medigap_gi.sql corrects only the exact legacy NJ structured object and matching markdown section from seed 009, including unchanged tenant copies, and records old/new content in knowledge_updates. It preserves custom NJ entries and all other state data/text. Historical 009 remains immutable. Migration 036 was locally validated but has not been applied to Supabase; the runtime safeguard works even before it is applied. Custom remote prose outside the known seed was not fetched or audited.

Other entries flagged, not modified

- ME (src/data/medicareReference2026.js:60): “ME guarantees open enrollment year-round.” Maine distinguishes a carrier-selected one-month annual Plan A GI period and conditional equal/lower-benefit switching with coverage-continuity limits. Disabled beneficiaries also have their own initial and age-65 windows. This is not blanket continuous open enrollment. [Maine switching/GI guidance](https://www.maine.gov/pfr/insurance/consumers/medicare-supplement-insurance/buy-switch-outside-open-enrollment), [Maine disability guidance](https://www.maine.gov/pfr/insurance/consumers/medicare-supplement-insurance/for-people-with-disabilities)
- PA (line 63): “Federal OEP only — 6 months from Part B at 65.” The insurance department's Medigap guide describes purchase rights during open enrollment for under-65 beneficiaries with disability/ESRD. The entry omits that distinction and separate GI events. The indexed official guide was available through search; its old direct URL failed to open, so this is flagged for current-document follow-up rather than used to change PA rules. [Pennsylvania insurance department guide](https://www.insurance.pa.gov/Coverage/Documents/Older%20Pennsylvanians/Medigap4-16.pdf)
- VA (line 64): “Federal OEP only.” Virginia has state-mandated under-65 access; its official FAQ addresses disability/ESRD and its insurer guidance addresses age-65 premium caps. The existing entry should not collapse that into federal-only OEP. [Virginia under-65 FAQ](https://www.scc.virginia.gov/media/sccvirginiagov-home/consumer-home/insurance/life-amp-health/tips-guides-amp-publications/faq-medigap.pdf), [Virginia insurer guidance](https://www.scc.virginia.gov/media/sccvirginiagov-home/regulated-industries/insurance/insurance-companies/life-health-companies/naic-product-checklists/medsupprevclean.pdf)
- CT (line 59) and MA (line 61): their blanket labels also warrant age/eligibility-scope review. Connecticut's published chart distinguishes under-65 plan availability; Massachusetts' published bulletin identifies an under-65 ESRD exception. These are review flags, not verified replacement rules: the CT chart is older, and Massachusetts blocked direct retrieval of its current PDF. [Connecticut chart](https://portal.ct.gov/-/media/AgingandDisability/AgingServices/CHOICES/English-Monthly-Medicare-Supplement-Rate-and-Benefit-Chart-Nov-21-update.pdf), [Massachusetts bulletin](https://www.mass.gov/doc/addendumpdf/download)
- GA (line 65): “Federal OEP only” also omits the distinct GI situations described by Rule 120-2-8-.12. This audit did not establish its full state-specific under-65 access rules. Do not treat the shorthand as an exhaustive eligibility determination. [Georgia Medigap regulations](https://rules.sos.ga.gov/gac/120-2-8)
- NY was not flagged for this particular conflation: DFS explicitly describes year-round acceptance with protections covering age, disability and ESRD. This is not certification of every other detail in the list. [New York DFS](https://www.dfs.ny.gov/consumers/health_insurance/information_for_medicare_beneficiaries)

U65 exact source text — read-only, no fix proposed

The principal internal tension is the universal NOT-MEC/NOT-ACA-substitute language versus the MedPerformance “major medical” description. The names/descriptions alone do not establish actual product MEC status; this audit reports conflicting prompt assertions, not a product coverage determination. The PALIC instructions are product-specific legacy rules alongside the newer product list. The following are verbatim source excerpts, with source line numbers as of this audit.

Blanket instructions

src/hooks/useU65CopilotEngine.js:303

```text
- Products sold are PRIVATE health products that are NOT minimum essential coverage (MEC)
```

src/hooks/useU65CopilotEngine.js:304

```text
- Products are NOT substitutes for ACA-compliant major medical insurance
```

src/hooks/useU65CopilotEngine.js:311

```text
- NOT-MEC and NOT-ACA-substitute disclosures are MANDATORY before presenting products
```

src/hooks/useU65CopilotEngine.js:315

```text
1. Presenting products without delivering NOT-MEC / NOT-ACA-substitute disclosures
```

src/hooks/useU65CopilotEngine.js:318

```text
4. Describing off-exchange products as equivalent to or a substitute for ACA plans
```

src/hooks/useU65CopilotEngine.js:335

```text
- mecDisclosureAcknowledged indicates if the mandatory NOT-MEC disclosure has been given.
```

src/hooks/useU65CopilotEngine.js:344

```text
- NOT-MEC/NOT-ACA-substitute disclosure violations are the HIGHEST priority
```

src/hooks/useU65CopilotEngine.js:407

```text
- NOT-MEC / NOT-ACA-substitute disclosure requirements
```

src/hooks/useU65CopilotEngine.js:426

```text
- Always prioritize compliance, especially NOT-MEC disclosure and UW honesty
```

Product descriptions

src/hooks/useU65CopilotEngine.js:305

```text
- Private plan reference products include MedPerformance, MedMax, and MedAccess MVP
```

src/hooks/useU65CopilotEngine.js:306

```text
- MedPerformance is a Cigna PPO major medical structure, MedMax is a First Health PPO defined benefit structure, and MedAccess MVP has Basic and Pro paths
```

src/hooks/useU65CopilotEngine.js:401

```text
- Products: MedPerformance (Cigna PPO major medical), MedMax (First Health PPO defined benefit), and MedAccess MVP. These are private off-exchange plans, NOT Medicare products despite the "Med" prefix.
```

Legacy rules and acknowledgment

src/hooks/useU65CopilotEngine.js:308

```text
- PALIC has a 12-month pre-existing condition exclusion that MUST be disclosed
```

src/hooks/useU65CopilotEngine.js:309

```text
- PALIC is fixed-benefit (set dollar amounts per service), NOT percentage-based coverage
```

src/hooks/useU65CopilotEngine.js:319

```text
5. Misrepresenting PALIC fixed-benefit payouts as comprehensive coverage
```

src/hooks/useU65CopilotEngine.js:320

```text
6. Not disclosing the 12-month pre-existing condition exclusion for PALIC
```

src/hooks/useU65CopilotEngine.js:402

```text
- Legacy U65 product names may appear in older call scripts.
```

Separate deterministic gate-entry message (not model prompt)

src/hooks/useU65CopilotEngine.js:564

```text
const msg = "MANDATORY: Deliver NOT-MEC and NOT-ACA-substitute disclosures BEFORE presenting any product details. This is a compliance requirement.";
```

This follow-up changed six files: src/data/medicareReference2026.js (NJ branches and safe database resolution); src/hooks/useMedSupCopilotEngine.js (remove blanket NJ list entry and consume reviewed branches); supabase/migrations/036_correct_nj_medigap_gi.sql (scoped seed correction/audit); tests/medsup-nj.test.js (four new regression tests); package.json (include them in test:llm); docs/LLM_MIGRATION.md (findings and verbatim excerpts). No new environment variables or dependencies.

Validation: 14 targeted tests passed, including four new NJ tests for stale database overrides, branch/eligibility/window constraints, coaching/Q&A context and prompt routing, and migration/source consistency. Existing per-engine prompt-prefix tests still pass. Targeted ESLint and git diff --check passed. Local in-memory PostgreSQL verified migration 036 changes only the known NJ seed, preserves other-state data/text and custom NJ entries, and emits one audit row on repeated application. MedSup's revised static coaching prefix is 5,858 characters / 1,349 o200k_base proxy tokens; it remains byte-identical across turn variants. No live model or production database calls were made.

U65 prompt/runtime code, other states' entries, the 167-intent classifier, deterministic annuity code, and styling were not changed. No U65 fix is proposed.

### Deployment follow-up: retained availability integration

The production build failed because the new public-secret guard rejected the existing VITE_AGENT_API_KEY. The user had explicitly retained this first-party availability integration. src/lib/llm/config.js now exempts only that exact variable name from name-based rejection; provider-key patterns and equality with server-side secrets still fail. Other public API-key variables remain rejected. This is a documented exception to the original blanket guard requirement, not a claim that browser-visible credentials are secret.

### Softphone audio and transcript follow-up

The Railway telephony service reads its Deepgram credential from `DEEPGRAM_API_KEY` (`telephony/src/config.js`). The browser outbound softphone path distinguishes `activeCall.params.direction === "outbound"` from an inbound PSTN call. Outbound calls use `call.getRemoteStream()` from `InboundCallContext` and pass that stream to `useCustomerAudio.startCapture({ mediaStream })`; inbound PSTN calls continue consuming Railway's server-labeled customer transcript. Exhausted remote-stream polling now sets the shared softphone error and the dialer renders it visibly.

The agent path remains intentionally unchanged: browser `SpeechRecognition` populates `speech.transcriptRows`, while Railway's `agentRows` remain unused by `ScriptPrompter`. A unified Deepgram agent path would require capturing the Twilio/browser local mic stream (`call.getLocalStream()` or the existing `getUserMedia` stream), resampling/encoding it for a second Deepgram connection, forwarding final results with `speaker: "agent"`, then replacing or explicitly reconciling browser SpeechRecognition rows in the merged transcript and coaching transcript reference. It would also require authentication, lifecycle cleanup, reconnect handling, and duplicate-suppression rules across the two recognizers.

tests/llm.test.js adds a regression test covering the retained availability key, disguised OpenAI/Anthropic secrets, and rejection of other API-key names. All 47 focused LLM tests and the LLM typecheck passed. The production frontend build passed with VITE_AGENT_API_KEY present; only the local-only VITE_BIBLIA_API_KEY was blanked for that subprocess to match the supplied Netlify environment. No environment files, provider selection, prompts, or integrations were changed. No new environment variables.
