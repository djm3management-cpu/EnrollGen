# Compliance calibration and saved-result re-aggregation

The historical pass changes only merge behavior and auto-fail weighting. It does
not classify transcripts, reinterpret historical SOA/cross-sell/lookup findings,
or use the earlier reference-call classification preview. The CLI imports no LLM
client. Original cards, template wording and evidence remain available.

Missing/unscored observations are excluded from possible points. A later positive
observation supersedes a window's absence, even if the absence had higher
confidence. Missing prerequisites cannot create a sequence deduction. Supported
observed violations remain weighted deductions. Template auto-fail flags alone
are insufficient: a catalog allowlist, explicit hard-CMS confirmation, quoted
evidence and at least 0.90 confidence are required. Legacy detections lack that
confirmation and remain weighted findings, rather than automatic failures.

New calls additionally use context-aware rules: verbal SOA satisfies inbound;
48-hour SOA applies to established scheduled outbound appointments; brief product
mentions after enrollment are allowed; MBI/SSN eligibility/current-coverage lookup
is allowed; uncertain transcription is not evidence of misconduct. Existing model
windows receive relevant opening, closing and lookup context. No extra model pass
was added. The strict schema carries hard-CMS confirmation through the existing
persisted detection-method field.

The API shares the scoring policy, shows current scorecard revisions in the list,
and excludes superseded revisions and N/A zeros from averages. Agent grouping uses
agent IDs. Site styling is unchanged.

## Historical execution

The interval is September 20 through October 19, 2026. There were 55 call records.
Fourteen cards were re-aggregated from saved segments, detections or item evidence;
one became N/A because it had no evaluated requirements. Thirteen calls have paired
numeric results. One older numeric card has no recoverable saved evidence and was
left unchanged. Remaining calls were already N/A or had no scorecard.

| Agent | Paired calls | Before | After |
|---|---:|---:|---:|
| Dylan Maria | 5 | 14.26 | 82.73 |
| Mark Endres | 8 | 12.26 | 57.58 |
| Mike Shiomos | 0 | N/A | N/A |

The reference call changed from 43.02 to 72.15 without automatic failure. Legacy
context findings remain in that result. Seven revised cards are below 70; one
unrecoverable older card remains at 0. The local report includes every call,
coverage counts and every deduction's original reason, evidence and point value.

Re-aggregation used zero model requests and zero tokens. A reference-call-only
classification preview occurred before the user prohibited further model calls;
it was never persisted and was excluded from this pass. No other call was newly
classified. Its provider usage was not retained, so exact earlier token usage
cannot be reported from the saved preview.

The CLI creates inactive template revisions solely to identify the new aggregates
in the existing atomic persistence transaction. It preserves all 26 original
cards, and database verification confirmed the 14 current call/card links and
scores. Unassigned automatic corrective actions attached to superseded cards are
marked superseded; assigned actions are retained for their reviewers.

Private source snapshots, per-call report, results and verification are stored in
`/tmp/enrollgen-reaggregate-20261019/` and are excluded from Git.

## Reproduction

Preview defaults to no database writes. Reuse the output directory to retain its
baseline; repeat with `--apply` to save the reviewed aggregates idempotently.

```sh
node --env-file=.env.local scripts/reaggregate-saved-calls.js \
  --since=2026-09-20T00:00:00.000Z --until=2026-10-20T00:00:00.000Z \
  --output=/tmp/enrollgen-reaggregate-20261019
```

## Verification

- 55 targeted regression, classifier, schema, TPMO and persistence tests pass.
- Full suite: 378 pass; one existing housekeeping failure in unmodified
  `src/lib/sepCms.js` (dynamic debug label count).
- Production build, targeted lint and whitespace checks pass.
- Database verification: 14 revised current cards verified, 26 originals retained.
