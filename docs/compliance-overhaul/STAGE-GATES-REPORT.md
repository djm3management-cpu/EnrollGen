> Historical policy/report. The current full-rubric restoration is [FULL-RUBRIC-REPORT.md](FULL-RUBRIC-REPORT.md), version cy2027-full-rubric-5.

# Stage and script applicability dry run

Superseded grading policy: the current CMS-only authority and dry run are in [CMS-ONLY-REPORT.md](CMS-ONLY-REPORT.md) and [cms-only-rules.md](cms-only-rules.md). Earlier figures below are retained as historical before-states.

No calls were actually scored or repaired. All figures below come from the same 376-call local snapshot starting October 1. No new production queries were run. Source scripts were read, not modified.

Rules: cy2027-script-stages-3. 87 kept definitions (86 on MA), 75 excluded. 62 calls had a numeric previous-draft estimate; now 24 qualify for a numeric estimate, 318 are N/A, 34 remain INCOMPLETE. 311 calls have a known talk time under 15 minutes, including 6 zero-duration calls.

N/A reason precedence: excluded outcome first, then known nonnegative talk time under 900 seconds, then connected conversation. Missing/invalid duration or incomplete coverage remain INCOMPLETE unless an explicit exclusion already applies. Exactly 15:00 is eligible. The trigger remains INCOMPLETE, with no percentage and no AUTO-FAIL.

N/A reason counts: Talk time below 15 minutes: 221; Excluded call outcome: 95; No connected product conversation reached: 2.

## Same 15 rules, before and after

The original column is the first 193-call matcher dry run. The previous column is the committed wording corrections immediately before this task. After uses the same 193 endpoint-qualified calls, then applies the new 15-minute/outcome/stage gates. Cells are fail/applicable; 0/0 means N/A, not a pass. Unknown conditional metadata is REVIEW with zero points.

| Rule / plain-English name | Original | Previous | After | Basis |
|---|---|---|---|---|
| SOA_001_SOA_REFERENCE: Scope agreement obtained | 181/181 | 173/181 | 18/24 | Kept, opening stage |
| SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027: SOA obtained before plan discussion | 181/181 | 174/181 | 20/24 | Kept, opening stage |
| SOA_004_SOA_SCOPE_STATED: Agent states SOA scope | 181/181 | 173/181 | 22/24 | Kept, opening stage |
| ELIG_007_SEP_REASON_DOCUMENTED: SEP qualifying reason documented | 1/1 | 1/1 | 0/0 | Kept, qualifications stage |
| NEEDS_014_TRAVEL_FREQUENCY: Asks about travel or living elsewhere | 181/181 | 181/181 | 24/24 | Kept, needs stage |
| PLAN_006_MOOP_STATED: States maximum out-of-pocket | 181/181 | 180/181 | 22/23 | Kept, plan stage |
| PLAN_009_REFERRAL_REQUIREMENTS: Explains referral requirements | 181/181 | 181/181 | 0/0 | Removed, no exact script basis |
| IMPACT_008_COVERAGE_GAP_WARNING: Explains coverage gap during transition | 181/181 | 181/181 | 0/0 | Removed, no exact script basis |
| PECL_001_CHECKLIST_REFERENCED: References the Pre-Enrollment Checklist | 10/10 | 10/10 | 0/0 | Removed, no exact script basis |
| PECL_003_DEDUCTIBLE_CONFIRMED: PECL: deductible amount confirmed | 10/10 | 9/10 | 0/0 | Removed, no exact script basis |
| PECL_004_MOOP_CONFIRMED: PECL: maximum out-of-pocket confirmed | 10/10 | 10/10 | 0/0 | Removed, no exact script basis |
| PECL_006_PHARMACY_NETWORK_CONFIRMED: PECL: pharmacy network confirmed | 10/10 | 10/10 | 0/0 | Removed, no exact script basis |
| PECL_007_DRUG_COVERAGE_CONFIRMED: PECL: drug coverage confirmed | 10/10 | 10/10 | 0/0 | Removed, no exact script basis |
| PECL_008_BENEFITS_UNDERSTOOD: PECL: beneficiary confirms understanding of benefits | 10/10 | 9/10 | 0/0 | Removed, no exact script basis |
| PECL_009_COST_SHARING_UNDERSTOOD: PECL: cost sharing understood | 10/10 | 10/10 | 0/0 | Removed, no exact script basis |

## Agent averages

Scores are unweighted means of each call percentage. Each call appears once, using its linked/latest saved card where available; missing stored judgment remains REVIEW, never a new paid classification. Different scored cohorts are shown separately. The paired comparison uses the same calls in both columns. These are draft compliance estimates, not validated employee performance ratings.

| Agent | Calls | Before scored / mean | After scored / mean | Paired before / after (n) | Stored production mean (n) |
|---|---|---|---|---|---|
| dylan_maria | 184 | 39 / 37.14 | 12 / 60.26 | 55.52 / 60.26 (12) | 33.51 (41) |
| mark_endres | 168 | 22 / 30.38 | 12 / 37.44 | 35.04 / 37.44 (12) | 39.33 (34) |
| mike_shiomos | 24 | 1 / 0 | 0 / N/A | N/A / N/A (0) | 0 (3) |

Agent attribution uses the unique same-tenant assignment when present, otherwise the protected enrolled-agent membership and availability subject. Michael is stored as mike_shiomos. Ambiguous/unresolved attribution, if any, has its own row rather than being assigned by guess.

## Trigger

```json
{
  "call_id": "9e5f7473-e4dc-4325-8bad-763a7300d04e",
  "agent": "dylan_maria",
  "talk_seconds": 4390,
  "outcome": "enrolled",
  "before_score": null,
  "before_state": "incomplete",
  "stored_score": 62.5,
  "after_score": null,
  "after_state": "incomplete",
  "reason": "Transcript coverage or talk duration is incomplete",
  "stages": {
    "opening": true,
    "qualifications": true,
    "needs": true,
    "plan": true,
    "application": true,
    "enrollment": true,
    "identifiedSep": false
  }
}
```

## Full scorecard examples

- 0e9f4a74-4d41-45fa-84d2-b531f9ef8d52, mark_endres: original production 78%; previous draft 47.33%; proposed 49% (49/100).
- 13281a25-f547-4b28-956c-879c739ac099, dylan_maria: original production 78.43%; previous draft 77.71%; proposed 81.98% (91/111).

[Every line item, original/before/after](stage-scorecard-samples.md) and [machine-readable full cards](stage-scorecard-samples.json). Private local artifacts, not committed. [All call outcomes and averages](stage-gates-results.json).

## Script and PECL decisions

[Full kept and removed lists with exact source lines](script-backed-rules.md). Travel is kept because MA 229 expressly asks about travel/living elsewhere. Referrals and generic coverage gaps are excluded. All 14 PECL items are excluded because no exact PECL wording is stored in the named MA sources. General benefit instructions are still graded under their supported PLAN IDs after an actual presentation. Application questions cannot stand in for a carrier checklist.

The dormant PECL acknowledgment policy accepts the requested affirmative variants within 30 seconds or at the next customer utterance, whichever is later; explicit refusal blocks acceptance. Ordering uses submission, not application start. No PECL passage was invented.

Only local scoring source, scoring API/UI, scoring migrations and fixtures changed. No transcription, Deepgram, Railway transport or telephony code changed. No automatic scoring path was broadened: existing automatic sale eligibility remains; offline/manual re-evaluation can evaluate supported stages on other eligible calls. Lifetime paid-pass locks remain unchanged.

## Reproduce offline

```sh
node scripts/compliance-overhaul/stage-gates-report.mjs --dry-run
```

The private baseline and audit snapshot must already be present. There is no execute mode. Migration 142 is generated as an unapplied proposal; no SQL in any migration was executed.

## Validation and limits

296 selected scoring/script tests passed, including zero-provider gates, stage applicability, exact Enrolled filtering, source/CMS allowlist checks, unsupported legacy/admin rows, PECL acknowledgment/order policy and metadata-only recording integrity. LLM typecheck, targeted ESLint, build and whitespace checks passed. All provider boundaries used fixture doubles.

SQL was not applied or integration-tested against PostgreSQL. Database concurrency/RLS and real-provider behavior are not claimed. The broader legacy repository suite was not claimed to pass. The existing endpoint coverage screen is unchanged and does not prove complete interior speech or per-channel capture; no recording/transcription data was repaired. Numeric results are offline previews, not production score changes.
