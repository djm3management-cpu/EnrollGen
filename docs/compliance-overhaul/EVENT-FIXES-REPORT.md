# Event, applicability and coverage fixes

cy2027-full-rubric-6: unchanged 135 active MA definitions / 251 original points; three approved retirements unchanged. Offline preview only.

**22 scored, 316 N/A, 38 INCOMPLETE** across the same 376-call Oct 1-onward snapshot. Trigger remains INCOMPLETE.

| Agent | Before mean (n) | After mean (n) | Same retained calls before / after | Section 3 SOA given / on time | Complete TPMO given / on time |
|---|---|---|---|---|---|
| dylan_maria | 57.19 (12) | 70.3 (10) | 61.56 / 70.3 (10) | 7 / 7 of 10 | 10 / 7 of 10 |
| mark_endres | 35.95 (12) | 47.1 (12) | 35.95 / 47.1 (12) | 0 / 0 of 12 | 3 / 3 of 12 |
| mike_shiomos | N/A (0) | N/A (0) | N/A / N/A (0) | 0 / 0 of 0 | 0 / 0 of 0 |

Means are per-call, not pooled rubric points. Before and after cohorts differ because per-channel coverage excludes calls. SOA given counts real Section 3 named-product/request/affirmative evidence even when late; on time counts agreements before plan discussion. TPMO given counts complete passages including the all-options/help-with-plan-choices clause, even when late. POA/self questions never count. No automatic rescoring or new model classification ran; stored judgment is reused where supported.

## Nonstacking deductions

Every definition and original point weight remains. A missing group event has one failure, chosen by highest weight, with a documented tie priority. Other failed rows become “Covered by [rule ID]”, 0/0, with no auto-fail; passing rows retain their original points. For TPMO, a complete-but-late passage selects timing; partial passages with a specifically missing component select that component rather than both header rules. Multiple absent elements still produce one group deduction. Different judgment violations are grouped only when their timestamp and quote identify the same event.

- **soa:** SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027, SOA_001_SOA_REFERENCE, SOA_004_SOA_SCOPE_STATED.
- **tpmo:** CALL_OPEN_009_TPMO_TIMING_2027, CALL_OPEN_008_TPMO_DISCLAIMER_2027, CALL_OPEN_010_TPMO_ORG_COUNT, CALL_OPEN_011_TPMO_PLAN_COUNT, CALL_OPEN_013_TPMO_RESOURCE_2027.
- **coverage-effect:** PECL_010_DISENROLLMENT_UNDERSTOOD, IMPACT_001_CURRENT_PLAN_DISENROLL.
- **premium:** PECL_002_PREMIUM_CONFIRMED, PLAN_004_PREMIUM_STATED.
- **service-cost:** PECL_009_COST_SHARING_UNDERSTOOD, PLAN_007_COPAY_STRUCTURE.
- **drug-topic:** PECL_007_DRUG_COVERAGE_CONFIRMED, PLAN_010_DRUG_COVERAGE_OVERVIEW.
- **provider-network:** PECL_005_PROVIDER_NETWORK_CONFIRMED, PLAN_014_PROVIDER_NETWORK_CHECK.
- **voluntary:** ENROLL_001_ENROLLMENT_VOLUNTARY, IMPACT_009_VOLUNTARY_DISENROLLMENT.
- **scope-violation:** SOA_005_SOA_SCOPE_MATCH, SOA_006_SOA_SCOPE_VIOLATION, CONDUCT_005_NO_SCOPE_CREEP (same quoted event only).
- **misleading-conduct:** CONDUCT_004_NO_MISLEADING_LANGUAGE, CONDUCT_009_ACCURATE_INFORMATION, CONDUCT_010_NO_GUARANTEES, CONDUCT_011_NO_SAVINGS_CLAIMS, PLAN_025_BENEFITS_ACCURATE, PLAN_027_NO_MISLEADING_COMPARISONS, PLAN_028_NO_UNSUBSTANTIATED_CLAIMS (same quoted event only).

## Conditional rules

- All rules: original product/direction, minimum 15 minutes, excluded outcomes, reached stage and complete per-channel transcripts.
- PECL and ENROLL: exact Enrolled outcome; conduct/pressure exceptions retain their original opening applicability. Employer/union coverage check now requires the reached enrollment stage.
- Medigap loss: affirmative current Medigap/Supplement metadata or beneficiary/current-coverage statement. A catalog of products is not evidence of current Medigap.
- Coverage gap: explicit established-gap metadata, current-coverage-end/new-effective dates separated by an uninsured day, or an explicit statement establishing loss of coverage. Silence/unknown dates do not establish a gap.
- Original Medicare impact: known Original Medicare/Medigap transition, or an identified MA switch using the new-plan-benefits explanation. Unknown prior coverage is N/A. MA-to-MA is not required to explain Original Medicare as though leaving it.
- SEP reason: an identified SEP only; AEP/OEP excluded.
- Medicaid impact: known Medicaid=true. SNP eligibility: identified SNP plan type/name.
- Supplemental plan benefits (dental, vision, hearing, OTC, fitness, transportation, telehealth, giveback): benefit present in metadata or discussed in the actual plan stage; no invented benefits.
- Outbound PTC / inbound greeting: matching direction. Recording refusal: actual refusal; later explicit renewal may resolve it. TPMO sharing: identified inter-TPMO sharing=true and verified written-consent metadata; unknown applicability N/A. Recording integrity needs verified metadata, otherwise REVIEW. No POA rubric item exists, so none was created.

## Section 3 regression calls

- 13281a25-f547-4b28-956c-879c739ac099: PASS at 268582ms; Yeah. So, would you like to discuss, of course, the the Medicare Advantage Plan plans that potentially could, have made... That may include that part b giveback or a OTC benefit or food card. Is that what you're, interested in discussing? / Customer: Yes. Brilliant.. This replaces any earlier POA-based credit.

- 75e3b687-6730-44dd-b316-76719a517df2: PASS at 270301ms; So I can give you a brief overview of, some Medicare Advantage plans that could potentially have those, OTC allowance or, get back. Is that... Would that be okay? / Customer: Yes.. This replaces any earlier POA-based credit.

## Every call whose scoring status changed

Per-channel coverage is (last utterance end minus first utterance start) / talk time, separately for each speaker. It measures timestamp span, not the sum of speech seconds: conversational silence is normal and is not charged as lost audio. Agent start >120 seconds or either span <95% is INCOMPLETE. This cannot prove interior audio continuity.

| Call | Agent | Before → after | Agent start ms / span | Customer start ms / span |
|---|---|---|---|---|
| 0ff12b4d-4fc7-4e3c-9c17-1cc6bbf123b3 | dylan_maria | na → incomplete | 4233052 / 5.93% | 0 / 23.60% |
| 7a0bec71-e4c0-42b2-9bf9-37e8d00dd3ae | dylan_maria | complete → incomplete | 6308747 / 5.04% | 0 / 99.71% |
| cec0b7eb-e9b4-412e-a07c-64d5a106e97d | mark_endres | na → incomplete | 2262755 / 24.06% | 0 / 99.23% |
| e9ddbdb9-6eb4-485b-8dce-3a8bb5db5c00 | dylan_maria | complete → incomplete | 270 / 88.03% | 6040 / 99.64% |

## Top 10 remaining point losses

Actual positive-loss rows only. Failed/applied uses nonzero denominator; pending REVIEW and N/A cost no points. Each example is a recorded failed row, not proof of audio reviewed. Labels and closest excerpts are supplied in the private companion report after text review. [Top-10 examples](event-fixes-top-losses.md). [Full private per-call results](event-fixes-results.json).

## Boundaries

Only scoring source, scoring display helper, tests, local reports and unapplied version SQL changed. No transcription, Deepgram, telephony or Railway transport source changed. Zero LLM/transcription calls, production SQL/RPC queries or writes, dispatch/requeue actions, migrations applied, deploys, pushes or merges. SQL is a proposal, not database-integration validation. Provider pricing, request count, daily cap, output limit and assessment behavior are unchanged; CPU-only changes add no provider cost.

Legacy in-place override and bulk recalculation routes are disabled for full-rubric versions because they bypass channel coverage, grouped deductions and version retention. Use the existing versioned Compliance Review actions. No such route was executed. Scoring-incomplete metadata now describes the specific failing channel.

[Validation and limitations](VALIDATION-EVENT-FIXES.md).
