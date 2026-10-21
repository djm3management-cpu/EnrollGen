# Live Co-Pilot assistant retune

Scope: MA/PDP, Medicare Supplement, ACA and U65 live assistance. Post-sale disposition eligibility, stored dual-audio transcripts, queueing, hashes, scoring prompts and result persistence are unchanged.

## Before the change (reported before edits)

Prompt builders were in `src/hooks/useCopilotEngine.js`, `useMedSupCopilotEngine.js`, `useAcaCopilotEngine.js` and `useU65CopilotEngine.js`.

The MA role was “expert CMS Medicare enrollment compliance monitor”; the other engines used the same monitoring role for their product. Live mode explicitly allowed missing-disclosure alerts. Periodic mode said “You MUST respond”, “NEVER return silent or info”, and supplied encouragement even when the model returned silence. Section-entry effects separately emitted SOA, TPMO, income and product-disclosure alerts. Ask prioritized compliance and redirected drug/provider questions to authoritative tools.

| Engine | Warn / remind confidence | Section settle | Debounce / minimum new characters |
| --- | --- | --- | --- |
| MA / ACA | 85 / 75, with section overrides | 45 seconds | 6 seconds / 80 |
| MedSup | 72 / 68 | 6 seconds | 4 seconds / 40 |
| U65 | 70 / 65, with section overrides | 6 seconds | 4 seconds / 40 |

Critical alerts had no confidence floor. MA/ACA cooldowns were critical 0, warn 15, remind 45, tip 60, silent/info 4 seconds. MedSup/U65 cooldowns were critical 30, warn 25, remind 35, tip 45, info 20 seconds. Shared short-speech debounce was 1.8 seconds at 24 characters, section entry 12 seconds, periodic review 90 seconds, silent heartbeat 8 seconds. Server completion cap was 2,048 tokens. Live rails/panels displayed local scores and violation counts.

The complete before-edit prompt output for all four engines and modes was shown in `/tmp/enrollgen-copilot-prompts-before.md` during the session. That output used synthetic runtime context, not customer data.

## Current behavior

`src/lib/liveAssistantPolicy.js` supplies the shared assistant instructions and delivery filter. Helpful next steps, grounded benefit answers, objections and lookup guidance use info/tip. Ordinary warn/remind responses and legacy entry alerts are suppressed. Only critical responses with `hard_stop_prohibited_claim` or `hard_stop_missing_prerequisite`, at confidence 85 or higher, can interrupt. The prompt requires clear agent speech/intent; customer questions, negations, paraphrases and partial transcripts are not violations. This remains model-based interpretation, not a claim of perfect speech detection.

The shared core emits one local, batched disclosure checklist at presentation/enrollment checkpoints: MA 6/7, MedSup 5/6, ACA 4/5, U65 3/4. Completed items are omitted; revisiting a checkpoint does not repeat the checklist. A new call resets checkpoint history. No model request is needed for the checklist. Premature section-entry disclosure alerts and forced periodic filler are removed. Answers are capped at 40 words, with one or two short lines requested; score/count text is suppressed. Product facts and approved closing guidance remain available.

Ancillary rule-based Analyze messages also give next-step help instead of numeric scores; their repeated per-step disclosure nag is removed. No LLM requests were added for ancillary products.

Live score calculations in the four LLM hooks, the MA scoring worker mount and the full live score dashboard are removed. The separate Compliance Mini widget is restored in the bottom-left footer; Ask Co-Pilot remains in the right-hand rail. The static compliance reference remains accessible. Existing post-sale scoring is untouched.

Drug/provider help uses verified existing context and directs exact drug/dose/form/pharmacy or provider/location/plan-network verification to Sunfire or the carrier. This change does not add an external live formulary/network integration.

## Request and token budget

Existing transcript guard, debounce, section-entry scheduling, periodic interval, retrieval and provider retry/fallback paths are retained. No new model-call path or tool loop is added. Completion caps decrease from 2,048 to 768 tokens, server-side and at callers. Prompt prefixes remain stable across runtime context changes.

Before/after prompt tokens below use the same synthetic context and both common tokenizer encodings (`js-tiktoken`, installed only in `/tmp` for the audit). Every prompt/mode is smaller. These counts measure prompt text, not a prediction of actual billed usage or model reasoning on any particular call.

| Engine / mode | o200k before → after | cl100k before → after |
| --- | ---: | ---: |
| MA live | 2430 → 1030 | 2465 → 1045 |
| MA periodic | 2352 → 1030 | 2379 → 1045 |
| MA ask | 901 → 649 | 903 → 654 |
| MEDSUP live | 1873 → 1293 | 1893 → 1304 |
| MEDSUP periodic | 1781 → 1293 | 1796 → 1304 |
| MEDSUP ask | 506 → 488 | 507 → 493 |
| ACA live | 1189 → 739 | 1199 → 743 |
| ACA periodic | 1097 → 739 | 1102 → 743 |
| ACA ask | 403 → 385 | 402 → 388 |
| U65 live | 1538 → 1076 | 1561 → 1086 |
| U65 periodic | 1459 → 1076 | 1477 → 1086 |
| U65 ask | 662 → 639 | 666 → 646 |

## Validation

- 74 targeted tests pass, including assistant policy/delivery, all checkpoint mappings, no extra checkpoint requests, score-free mobile/minimized rails, ancillary Analyze, prompt cache stability, silence cadence, MA script, U65 references, MedSup NJ and approved closing.
- 211 telephony tests pass.
- Full app suite: 459/460 pass. The existing `tests/housekeeping.test.js` static-diagnostics assertion fails in unchanged `src/lib/sepCms.js` (8 diagnostic occurrences versus 7 matches). The final ancillary-message change is covered by the later targeted run.
- `npm run lint`, `npm run build` and `git diff --check` pass.
- No database changes, rescoring, model evaluation requests or manual production deployment.

Layout correction (2026-10-21): the retune mistakenly replaced the separate bottom-left Compliance Mini with Co-Pilot placeholder text. Restored the original Compliance Mini component and live-call props, while keeping Ask in its existing right-hand rail. Nineteen assistant/layout tests and targeted lint pass.
