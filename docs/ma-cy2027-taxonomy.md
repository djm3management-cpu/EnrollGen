# MA CY2027 taxonomy audit and implementation

Repository audit and changes prepared October 23, 2026. No push, deployment,
production migration, or historical rescore was performed.

CMS describes these marketing changes as applicable beginning October 1, 2026
for CY2027 marketing and communications. The broader final rule's legal
effective date is June 1, 2026; October 1 is the marketing applicability date.

Sources:

- [CMS CY2027 marketing changes](https://www.cms.gov/files/document/changes-medicare-advantage-organization-medicare-drug-plan-sponsors-marketing-guidelines.pdf)
- [CMS final-rule fact sheet](https://www.cms.gov/newsroom/fact-sheets/contract-year-2027-medicare-advantage-part-d-final-rule)
- [Published final rule](https://www.govinfo.gov/content/pkg/FR-2026-04-06/html/2026-06600.htm)

The CMS marketing summary directly supports the SOA, before-benefits disclaimer,
SHIP, and supportable-superlative changes. The later-contact versus current-call
warm-transfer boundary below implements the requested scoring scope. It is not
presented as a newly verified blanket legal exemption for every transfer or data
disclosure. General privacy, enrollment, and transfer obligations remain separate.

## Audit findings and resulting behavior

| Area | Before | Implemented |
| --- | --- | --- |
| SOA | Advance-wait flag and two exception flags; scheduled-outbound prompt branch | Retired all three from active JS catalog and new template; added `SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027`, required and critical. Telephone same-call recorded agreement is allowed on inbound and outbound calls. No additional auto-fail was requested for this new flag. |
| TPMO timing | Shared evaluator required both early completion and before-benefits order; live checklist repeated that deadline | Only before-benefits order determines compliance; elapsed time does not fail it. New template retains auto-fail, including when other weighted items would yield a passing percentage. |
| Resource referral | Saved catalog partly corrected already; Co-Pilot knowledge still allowed SHIP as a substitute | Medicare.gov OR 1-800-MEDICARE satisfies the rule. SHIP is not required and SHIP alone does not substitute. |
| Superlatives | Standalone `PLAN_026_NO_SUPERLATIVES` and lexical comparative-claim deductions | Retired standalone flag; merged into `PLAN_028_NO_UNSUBSTANTIATED_CLAIMS`, with no standalone superlative auto-fail. Accurate, supportable statements pass. Missing plan documents alone is not evidence of a violation. |
| Data sharing | Broad third-party consent rule also described routine carrier submissions | `RECORD_005_DATA_SHARING_CONSENT` requires affirmative applicability: another TPMO receiving beneficiary data for later contact. Check prior express written consent naming the recipient. No sharing, current-call warm transfers, carrier enrollment submissions, and uncertain applicability are N/A. Confirmed unauthorized sharing can auto-fail; silence cannot prove it. |
| Language insert | `PECL_014_MULTI_LANGUAGE_INSERT` in active catalog/template | Retired the requested flag. This does not remove other language-access obligations. |
| Carrier names | Code ended in `_12PT` despite a spoken carrier-identification description | Renamed to `CONDUCT_012_CARRIER_NAMES`; retained spoken carrier identification. |
| Co-Pilot | Classification prompt referenced advance waiting; live timing evaluator and catalog retained the elapsed-time limit | Updated classifier, live checklist, MA coaching/Ask prompts, assessment guidance, CMS knowledge, and MA script revision. Obsolete retrieved timing guidance is filtered from CMS text and structured MA knowledge overrides. |

The previous runtime calibration silently suppressed the catalog's TPMO
auto-fail setting. A template policy version now enables the specified behavior
only for the new MA template; legacy score aggregation keeps its prior policy.

## Existing scorecards and historical impact

Migration `115_ma_cy2027_taxonomy.sql` creates active MA template v3 with policy
`ma-cy2027-2026-10-01`, clones v2 into new template-item rows, replaces/removes
the requested items, and recomputes total/category possible points. The two SOA
exceptions, standalone superlative flag and language-insert flag are removed;
the former SOA-wait slot becomes the new scope-before-plan flag.

It leaves old template-item rows, scorecards, scorecard items, detections,
scoring jobs, call metadata, and saved transcripts untouched. Retired intent
records stay in PostgreSQL to preserve historical references; they are absent
from the active application catalog and v3 template. Shared master descriptions
for retained codes are brought current, while saved scorecard question text and
old template-item wording remain unchanged.

Existing numeric scores, grades, auto-fail reasons, evidence, human overrides,
and displayed historical line items do not change. Previously penalized calls
remain as saved until a separately approved correction. The existing completed
job reuse also prevents this template activation from automatically reprocessing
completed calls. The migration queues no jobs and resets no failures.

New scoring uses v3. Future comparisons across template versions must account
for the changed rule set and denominator. Removing a timing limit or a retired
item may improve a future result; restoring the explicitly requested TPMO
auto-fail can instead make a before-benefits violation fail despite a high
percentage. No exact historical score delta is claimed without an approved
rescore. No rescore/reaggregate/recalculate command was run.

## Migration and rollout constraints

The migration is prepared, not applied. It expects the seeded active MA v2 from
migration 075, rejects an unexpected competing active MA template, and is safe
to repeat. Custom templates require review rather than silent conversion.

Migration 115 and the matching scorer must be cut over together without scoring
calls during a version mismatch: an older scorer does not know the new SOA or
renamed carrier code. Coordinate draining/holding scoring work for that cutover;
this change does not perform it. Railway push and Netlify publication remain
separate deployment actions. No push or publish was performed.

Historical seed files and applied migrations retain their original definitions
for reproducibility; migration 115 supplies the current active version. The MA
script revision rejects stale persisted script copies in favor of the updated
source. No provider credentials, routing reservations, or other product scripts
were changed.

## Validation

Tests cover catalog removal/replacement, required critical SOA on inbound and
outbound calls, before-benefits timing after the old deadline, new-version-only
TPMO auto-fail, single-resource referral, supported superlatives, conditional
sharing consent, warm-transfer/no-sharing N/A, prompt precedence, and obsolete
retrieved guidance. Migration tests execute twice against PostgreSQL/PGlite and
compare historical scorecards and old template items before and after.

The full app suite passed 523 tests. Lint, LLM type checking and production build
passed. All scoring-model test calls use mocks; no live LLM or production scoring
request was made.
