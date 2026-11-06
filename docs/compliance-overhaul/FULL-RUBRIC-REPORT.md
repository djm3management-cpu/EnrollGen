# Full-rubric dry run

Rules cy2027-full-rubric-5. **135 MA items / 251 original points** restored (138 / 255 before the three retirements). Separate annuity catalog: 24; full active catalog: 159. The saved active MA rubric contains 138, not approximately 152; no missing definitions were invented.

Same saved Oct 1-onward snapshot: **24 scored, 318 N/A, 34 INCOMPLETE** across 376 calls. Trigger: **INCOMPLETE**, score none, AUTO-FAIL false.

| Agent | Scored calls | Average |
|---|---|---|
| dylan_maria | 12 | 57.19 |
| mark_endres | 12 | 35.95 |
| mike_shiomos | 0 | N/A |

These are offline preview means, not production scores or validated employee performance ratings. All original agency points/wording are restored. Applicable deterministic checks and anchored stored agency judgment pass/partial results count; pending AI REVIEW never deducts until admin confirmation. Missing historical judgment cannot be regenerated without a paid pass and remains visible as REVIEW. No such pass ran.

[All kept items, original points, CMS changes and citations](FULL-RUBRIC-INVENTORY.md). [Every Mark call and every rule](full-rubric-mark-calls.md). [Every TPMO fail with excerpts and classification](full-rubric-tpmo-fails.md). [Machine-readable per-call scorecards](full-rubric-results.json). Evidence reports stay private/local and excluded from Git.

Regression cases: Mark 0e9f4a74… has complete TPMO at 145180–174340ms before first detected benefits; the observed "free plan" ASR variant is accepted only with the other required disclaimer elements. Dylan 13281a25… has valid enrollment-section named-plan evidence, a name/DOB/agreement signature request and customer "And I agree" at 6689391ms; actual submission is 6691632ms, not the unrelated doctor-name submission at 6088802ms. The user-supplied approximate 6270000ms is the lead-in to the final signature, not its completion.

The August 3 FINAL wording reference is unchanged. No September draft supplies matcher requirements. Early small talk cannot satisfy plan/pre-enrollment items. The 15-minute, excluded outcome, exact-Enrolled, SEP and transcript coverage gates remain.

No production SQL/RPC was run, so there are no production queries to list. No LLM/transcription request, rescore, redispatch, requeue, live write, deploy, push or merge occurred. No transcription, Deepgram, Railway transport or telephony source changed. Migration 143 is a local unapplied proposal; it clones the original 138-item template, excludes only the three retirements and retains historical versions.

Reproduce: `node scripts/compliance-overhaul/full-rubric-report.mjs --dry-run`. Requires the private saved snapshot. No execute mode. See VALIDATION-FULL-RUBRIC.md for tests and limits.
