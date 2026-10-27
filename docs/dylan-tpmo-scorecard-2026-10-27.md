# Dylan's inbound scorecard and TPMO timing repair

Call `affe804c-6fe6-4eb7-aca8-719edc8b9148`, October 27, 2026 at 2:43 PM Eastern.
The saved call and its authoritative telephony attempt both identify it as inbound.

## Confirmed defects

The original scorecard `8cedba24-f40a-467a-8fbc-1a4760f9d3ec` calculated
90.83% (109/120 points). Its F was the explicit TPMO timing auto-fail override,
not the percentage-to-grade conversion.

An opening TPMO passage starts at 186,440 ms (3:06). It includes organization
and product counts plus Medicare.gov. Punctuation, filler words and an uncertain
referral phrase prevented the strict text matcher from recognizing that passage.
It instead recognized a repeated disclaimer around 48 minutes, after its first
detected specific benefit at 1,003,910 ms (16:43), and incorrectly treated the
later repeat as proof that the initial disclosure was late.

The early transcript does not establish every word of the approved disclaimer.
The correction therefore requires review of the recording; it does not certify
the early wording or remove verified late-disclosure failures. The applicable
[CY2027 final rule](https://www.govinfo.gov/content/pkg/FR-2026-04-06/html/2026-06600.htm)
requires the disclosure before benefit discussion.

Outbound-only checks were already excluded from the saved score with `na`, zero
possible points and notes saying they were inapplicable to this inbound call.
The review component rendered every non-pass item as FAIL and included N/A rows
in its category pass-count denominator. That was a display defect.

## Changes

- Recognize punctuated counts and limited speech fillers across transcript chunks.
- Bound disclosure accumulation so unrelated distant counts/referrals cannot combine.
- Preserve strong earlier disclosure evidence as an explicit timing REVIEW finding
  when exact wording remains uncertain. Genuine late timing still auto-fails.
- Retain review evidence/timestamps and create a review task, even with a high score.
- Show N/A, REVIEW and PARTIAL separately from FAIL, with neutral/pending site colors.
  Exclude unscored rules from category counts and show REVIEW REQUIRED in the banner.
- Preserve a saved call direction during retroactive calculations.

## Production repair and audit history

Migration `116_tpmo_evidence_repair.sql` installs a service-only atomic repair
operation. The ordinary completed-call scoring guard remains unchanged. The
repair requires the original current scorecard, an unchanged transcript, an
inactive repair template and an explicit unscored timing review with evidence.
It locks the original card and evidence, refuses human-reviewed findings, and
rolls back the entire revision if persistence fails. Original cards and detection
rows are retained. Superseded, unassigned automatic tasks are closed as superseded;
assigned tasks are left with their reviewer.

The migration was applied and the one-call repair was executed through
`scripts/post-call/repair-tpmo-timing.mjs`. The new current scorecard is
`34abea3f-e29e-4c1f-bdf7-904fae5f50ab`: 97.44% (114/117 points), A+, no auto-fail,
with TPMO timing unscored pending manual review. Original scorecard/evidence
remain available. No model requests or enrollment/webhook replays were made.

## Validation

Regression coverage checks fragmented speech, unclear referral wording, real
late disclosure, customer-only speech, separated references, N/A display,
inbound direction despite outbound-sounding script text, prominent review status,
human-review protection, original evidence retention and atomic rollback.
The database repair test loads the deployed migration 110 completed-call guard
and persistence functions, then exercises the explicit migration 116 repair.
All 554 application tests pass, including the repair tests; the focused database
suite passes 36 tests. The production build, targeted ESLint and diff checks pass.
Production readback confirmed the new current score, inbound direction, open
review task, zero model input tokens and byte-for-byte unchanged original card.
