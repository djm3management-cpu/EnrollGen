# Gold Standards: measurement and workflow for a national FMO network

Branch `feature/gold-standards`, cut from `feature/ping-platform` at `6b332a9`. Every behavior is multi-tenant, default off and fenced in SQL with `deployment_feature_enabled`. No push, deploy, hosted or live database, live migration, real provider or carrier request, real environment file, historical migration edit, stylesheet rewrite or new dependency. Migrations **188**, **189** and **190** are new, forward only, start with `-- UNAPPLIED: isolated pilot only` and are copied verbatim into the checksummed bootstrap with the manifest, catalog, operator inventory and statement hashes regenerated in process (the method of `990e4f7`).

## Standards map

The eight standards below are the NAIFA Medicare Collective "Call Center Gold Standards" as summarized in the work order. The source document itself was not available in this repository and was not reviewed.

| # | Standard | Tables | Functions and routes | Flags | Views |
|---|---|---|---|---|---|
| 1 | Track complaints to Medicare (CTMs) per lead source, carrier and agent | `ctm_records`, `member_status_import_files`, `member_unmatched_rows`, `member_carrier_ids` | `member_status_import` (kind `ctm`), `read_ctm_records`, `resolve_ctm`, `gold_standard_scorecard` (`ctms`, `ctm_rate_per_1000_mm`) | `CTM_IMPORT_ENABLED`, `GOLD_STANDARDS_METRICS_ENABLED` | Gold Standards (CTM columns), consumer lifecycle |
| 2 | Track accretion (effectuation) per lead source, carrier and agent | `member_status_events`, `member_status_import_files`, `member_status_column_maps` | `member_status_import`, `member_match`, `enrollment_attribution`, `gold_standard_scorecard` (`effectuated`, `effectuation_per_call`) | `MEMBER_STATUS_IMPORT_ENABLED`, `GOLD_STANDARDS_METRICS_ENABLED` | Gold Standards |
| 3 | Track retention per lead source, carrier and agent | `member_status_events` | `gold_standard_scorecard` (`matured`, `pending`, `retained`, `r_rdp`, `retained_per_1000_calls`) | same | Gold Standards |
| 4 | Retention above 70 percent at the end of the rapid disenrollment period | `member_status_events` | `gold_standard_scorecard` (`below_threshold`, `threshold`) | `GOLD_STANDARDS_METRICS_ENABLED` | Gold Standards "Below 70%" badge (visual only, never an action) |
| 5 | Activate benefits and service members shortly after the sale | `activation_tasks`, `activation_task_items`, `activation_item_records`, `activation_settings` | `activation_open_task`, `read_activation_tasks`, `activation_record_item`, `activation_add_benefit`, `activation_close_task`, `/api/activation-tasks` | `BENEFIT_ACTIVATION_ENABLED` | CRM Activation view, Gold Standards activation split |
| 6 | Balanced mix of business, no over-weighting of D-SNP | `cms_plans_py<year>` (read only) | `gold_coverage`, `gold_snp_label`, `gold_standard_scorecard` (`dsnp_share`, `mix`, `product_line` and `snp_type` groupings) | `GOLD_STANDARDS_METRICS_ENABLED` | Gold Standards mix |
| 7 | Quality lead vendors: onshore, no resale, compliant consent language | `lead_sources` attestation columns, `ping_campaigns.require_source_attestations` | `ping_source_attested`, the `source_attestation_missing` gate in `ping_decide_campaign` and `lead_campaign_eval`, operator `source_attestations` / `source_attestation` / `campaign_attestations`, buyer `sources` | `SOURCE_ATTESTATIONS_ENABLED` | Exchange Attestations (operator) and Sources (buyer) tabs |
| 8 | Measure contracted downline shops separately | every table carries `tenant_id` | `gold_standard_scorecard` (one agency), `gold_standard_network_scorecard` (operator, aggregates only, `agency` grouping, network de-duplication, `cross_agency_moves`) | `GOLD_STANDARDS_METRICS_ENABLED` | Gold Standards Agency and Network scopes |

## Flags

`GOLD_STANDARDS_METRICS_ENABLED`, `MEMBER_STATUS_IMPORT_ENABLED`, `CTM_IMPORT_ENABLED`, `BENEFIT_ACTIVATION_ENABLED`, `SOURCE_ATTESTATIONS_ENABLED`. All default off, parsed by the strict switch parser, sent to SQL in `x-enrollgen-features` and recorded by operator provisioning (migration 188 extends `configure_operational_profile`). `.env.example` gains only these five; `telephony/.env.example` gains `SOURCE_ATTESTATIONS_ENABLED` because the phone server makes ping decisions.

## The enrollment record

`enrollment_intakes` is the enrollment record; `policies` is not used. Only completed, submitted, non-test intakes take part (`gold_enrollments`). Metrics count the re-shop selection: the most recent intake per contact and coverage, by `submitted_at`, `completed_at` and UUID. Matching may target any qualifying intake. The writing agent follows the re-shop writer rules (`writingAgentId`, `writingAgentSlug`, recorded `aor` slug, else the call owner); an unresolved writer stays null.

Product line: Medicare Supplement from the intake coverage type (`MS`, `MEDSUPP`, `MED SUPP`, `MEDICARE SUPPLEMENT`); an S-contract is PDP; otherwise the plan year landscape `cms_plans_py<effective year>.category` by contract, plan and segment (`MA` is MA, `MA-PD` and `SNP` are MAPD, `PDP` is PDP). A missing landscape row leaves the product line null. The SNP label comes from the same row: `D-SNP`, `C-SNP`, `I-SNP`, `non_snp` for a plan that is not a SNP, null when the landscape has no row.

## Matching rules

No fuzzy matching on names, phones or addresses. Every key must identify exactly one qualifying intake in the importing tenant; two or more is `ambiguous` and goes to the queue. First match wins, recorded in `matched_by`:

1. `confirmation`: the row's confirmation or application id equals the intake's `enrollmentId` or `sunfireCode`, compared after uppercasing and removing whitespace.
2. `carrier_member_id`: the row's carrier member id equals one in `member_carrier_ids` for the same carrier label. Rows are written the first time a row matches by key 1 or 3 and never rebound.
3. `mbi_key`: the peppered HMAC of the normalized MBI equals the intake's `mbi_match_key`, the carrier label matches the intake carrier (case insensitive, otherwise exact) and the effective date matches.

Anything else is an `member_unmatched_rows` entry (`no_match` or `ambiguous`) that a protected admin links (`member_link_unmatched`, `matched_by` `manual`) or dismisses, each with a reason, each written to `admin_action_log`. The MBI key is `HMAC-SHA256(pepper, normalized MBI)` where normalization removes spaces and dashes, uppercases and requires the CMS MBI format. The pepper is a Vault secret referenced from `member_match_secrets`, provisioned once with `provision_member_mbi_pepper` (refused when shorter than 32 characters, when already provisioned or when equal to the phone pepper). `save_enrollment_intake` stores the key for new and edited intakes once the pepper exists. The raw MBI is never stored in any table these migrations add; unmatched rows keep only the key.

Imports: carrier and FMO CSV, TSV or XLSX through the existing bounded spreadsheet reader (`parseRtsFile`, 10 MB, 3,000 rows). Column mappings are configuration (`member_status_column_maps`, one per tenant, kind and carrier label), validated by `validateColumnMap`. Only mapped fields leave the parser. Narrative columns (named in the map, or headers such as description, comment, note, narrative, summary, detail) are dropped and only their names are recorded in `member_status_import_files.dropped_columns`. A file hash imports once per tenant and kind; a re-import returns the first summary. `member_status_events` rows are immutable; corrections are new rows.

## Metric definitions

`gold_standard_compute` in migration 189 and `telephony/src/ping/goldStandards.js` implement the same math; a property test compares them on 300 generated cases.

- Window: enrollments submitted in `[p_from, p_to)` in the tenant's own zone; inbound calls created in the same window.
- Rapid disenrollment period end: effective date plus 3 calendar months (month end clamps). The effective date is the intake's, else the earliest effectuation event.
- Effectuated: at least one `effectuated` event.
- Retained: effectuated and no `disenrolled` or `terminated_by_carrier` event effective before the period end, unless a later reinstatement (higher `seq`) effective on or before that loss date restores continuous coverage.
- Right censoring: an effectuated member is matured only when the period end is on or before `p_to` and on or before the latest imported member status file date (`file_as_of`) for the member's carrier. Otherwise the member is pending and leaves both numerator and denominator of `r_RDP` and retained per call. `pending` is returned separately; no file for the carrier is pending.
- `r_RDP` = retained / matured. Retained per 1,000 calls = 1000 x retained / matured calls, where a call is matured when its date plus 6 calendar months is on or before `p_to`.
- Member-months = sum of days from the effective date to the earlier of coverage end (the first uncured loss) or `p_to`, divided by 30.4375. CTM rate per 1,000 member-months = 1000 x CTMs received before `p_to` / member-months.
- Calls N: every inbound call attributed to the group, including missed and transferred. Calls carry source, sub id, agency, answering agent and that agent's cohort, so they attach only to those groupings; any other grouping returns calls and per call rates as null, never zero.
- Cost: `ping_call_billing.rate` for finalized billable calls, 0 for finalized calls under the threshold, null without billing. Cost per retained = cost of matured calls / retained.
- D-SNP share = effectuated D-SNP members / effectuated.
- Every rate has a Wilson score interval at z = 1.96 computed in IEEE doubles in the same order in SQL and JS and rounded as PostgreSQL casts a float8 (15 significant digits, then half away from zero to 6 places). n = 0 returns null rate and null interval. A rate whose count exceeds its exposure (CTMs above member-months) returns the rate with a null interval.
- Unattributed: enrollments with a null value in any selected grouping (source when no grouping is selected); `unattributed` and `unattributed_share` are in every result, and the null keys form an explicit Unattributed row.
- Network de-duplication: a member is the MBI key (else the single intake, never merged) per coverage. Within any view the latest submitted enrollment represents the member. In the operator view a member who moves between agencies counts once, under the latest enrollment; `cross_agency_moves` counts members with enrollments in more than one agency in the window. An agency's own view counts its own enrollments.
- Agent cohort: days from the agent's earliest ready to sell date in the plan year (the earliest `carrier_rts.effective_date` with status active, rts or complete; `cert_date` is never parsed) to the first effectuated enrollment. Agents with no usable date are in the `unknown` cohort, reported, never dropped. `agent_cohort_month` groups `r_RDP` by cohort. The agency view lists agents; the operator view aggregates by cohort month.
- Activation split: `r_RDP` among matured members with a completed activation task and without, each with intervals.
- The 70 percent threshold is the `below_threshold` visual state. Nothing acts on it.

Groupings: `source`, `sub_id`, `agent`, `carrier`, `agency`, `product_line`, `snp_type`, `agent_cohort_month`, `effective_month`. `gold_standard_scorecard(p_tenant, p_from, p_to, p_group_by, p_plan_year)` serves agency admins and the buyer portal; the tenant comes from the verified identity, as `ping_scorecard` does. `gold_standard_network_scorecard(p_from, p_to, p_group_by, p_plan_year)` serves the operator (an administrator of the deployment's own tenant) and returns aggregates only. Both are SECURITY DEFINER, service role only and fenced. `enrollment_attribution(p_tenant)` returns one row per enrollment with agency, writing agent, carrier, product line, plan type, SNP label, lead source and sub id (from the originating inbound call and its ping decision), the call, submitted date and effective date; missing links stay null.

## CTMs and the complaint hold

`ctm_records` hold no narrative; a row carrying a `narrative` field is rejected. Categories map through the column map into a closed set (`enrollment_disenrollment`, `marketing`, `benefits_access`, `pricing_premium`, `pharmacy`, `provider_network`, `customer_service`, `plan_administration`, `other`); unknown values are `other`. A matched open CTM calls the existing `retention_flag_complaint`, so the existing complaint hold from migration 160 applies; no second hold mechanism exists. A later carrier file can only record `carrier_reported_status`; it never resolves. `resolve_ctm` (protected admin, reason and resolution code) resolves a CTM and, when no other open CTM remains on the contact, clears the complaint through the existing `retention_resolve_complaint`. Unmatched CTMs are stored unlinked and queued for an admin.

## Benefit activation

A task opens only when a matched `effectuated` event arrives (by import or manual link), once per enrollment, for MA, MAPD, PDP and Medicare Supplement. Due date: effective date plus the tenant's `activation_settings.due_days` (default 30, 7 to 90). Items: member card received; primary care provider assigned only when the landscape plan type is HMO or HMO-POS (never PPO, PFFS, MSA, PDP or Medicare Supplement; the agent may mark it not applicable); preferred pharmacy confirmed for MAPD and PDP; one supplemental benefit item per benefit the agent records as selected (`activation_add_benefit`), never generated from a plan's benefit list; member reachable and questions answered. Outcomes are `done`, `not_applicable`, `member_declined` or `unreachable`, recorded by a person in the append only `activation_item_records`, with an optional note of at most 200 characters that rejects digit runs and MBI shapes. Completion needs an outcome on every item. Agents see their own tasks, managers their protected team with completion rate and overdue counts by agent, admins the agency. No dialer, text, email or other outbound action exists anywhere in this workflow.

## Lifecycle file

`consumer_lifecycle_rows` gains, each behind its flag: `member_effectuated`, `member_disenrolled`, `member_reinstated`, `member_terminated_by_carrier` (MemberEffectuated, MemberDisenrolled, MemberReinstated, MemberTerminatedByCarrier), `complaint_recorded`, `complaint_resolved` (ComplaintRecorded, ComplaintResolved), `activation_task_opened`, `activation_item_recorded`, `activation_task_closed` (ActivationTaskOpened, ActivationItemRecorded, ActivationTaskClosed). They appear in the type list only when present.

## Retention classes

| Data | Class | Period |
|---|---|---|
| `ctm_records` | `complaint` (complaint evidence) | 10 years on the `enrollmentYears` schedule; legal and complaint holds apply |
| `member_status_events`, `member_status_import_files`, `member_carrier_ids`, `member_unmatched_rows`, `member_status_column_maps` | `enrollment` | 10 years (`enrollmentYears`) |
| `activation_tasks`, `activation_task_items`, `activation_item_records`, `activation_settings` | `enrollment` | 10 years (`enrollmentYears`) |
| `admin_action_log` rows written by these routines | existing `audit` | 10 years (`evidenceAuditYears`) |

Immutable tables reject UPDATE always and DELETE except inside the retention job (`RETENTION_PURGE_ENABLED`).

## Access, audit and logging

All tables have RLS with no browser grants. Every routine is service role only, pins its search path and resolves `resolve_deployment_subject` again. Imports, links, dismissals, mappings, CTM resolution and every activation change append `admin_action_log` in the same transaction; the CSV export appends one before any bytes return. Each HTTP request writes one `evidence_access_log` event (`gold_standards` or `activation_tasks`). The handlers use `serverRequest`, the structured logger, verified Clerk without bypass and the existing atomic admission counters (`goldRead` 30, `goldExport` 5, `goldWrite` 20, `goldImport` 5, `activationRead` 30, `activationWrite` 30 per subject per minute; 3,000 per subject and 30,000 per deployment per UTC day). The Gold Standards view and its CSV never contain member names, phone numbers, MBIs or dates of birth.

## Owner decisions

Recorded from the owner's answers on 2026-11-18, then the conservative choices made under decision 8.

1. `policies` is not used; `enrollment_intakes` is the enrollment record, with the re-shop selection rules.
2. Activation tasks open only on a matched effectuated event; there is no "policy becomes active" path.
3. Matching keys in order: confirmation (`enrollmentId` or `sunfireCode`), carrier member id (`member_carrier_ids`, learned only from a match by key 1 or 3, so a manual link does not teach a member id), MBI key plus carrier plus effective date. A key that identifies more than one intake is queued as ambiguous.
4. The MBI pepper is a dedicated Vault secret provisioned exactly like `ping_phone_pepper`. Because that mechanism is SQL provisioning, not an environment variable, no pepper setting name was added to `.env.example`. New intakes get the key in `save_enrollment_intake`; existing intakes only through `scripts/gold/backfill-mbi-keys.mjs`, off by default (dry run unless `--execute`, localhost only, flag required), which was written and tested on synthetic data and never executed against any real database.
5. Product type from the landscape category by contract, plan and segment with S-contracts as PDP; Medicare Supplement from the intake coverage type. The current intake form offers only `MA/MAPD/PDP`, `C-SNP` and `D-SNP`, so Medicare Supplement enrollments appear only once intakes record that coverage type.
6. Agent cohort from the earliest ready `carrier_rts.effective_date` in the plan year; ready means status active, rts or complete (the set migration 182 uses). The plan year is `p_plan_year`, else the year of `p_from`. Unknown cohorts are reported.
7. PCP item only for HMO and HMO-POS plans in MA or MAPD coverage.
8. Conservative choices:
   - Unmatched member status rows become events only when an admin links them, so events stay immutable.
   - CTMs from a carrier file never resolve and never clear a hold; only `resolve_ctm` does, and only when no other CTM on the contact is open.
   - CTM retention uses a `complaint` class on the existing 10 year `enrollmentYears` period. A separate `complaintYears` profile field would change the validated profile contract and an existing retention test.
   - Preferred pharmacy is an item only for MAPD and PDP; supplemental items exist only when the agent records them (the intake has no selected benefits field).
   - Notes reject digit runs of five or more and MBI shapes.
   - Calls attach only to call carried groupings; other groupings return null calls. Matured calls are those at least 6 calendar months old at `p_to`; file freshness censors members but not calls, so retained per call can read low while files are stale.
   - The CTM rate interval uses member-months as n and is null when CTMs exceed member-months.
   - Without a grouping, unattributed is measured on lead source.
   - Members without an MBI key are never merged across agencies.
   - The scorecard functions take the tenant from the verified identity (the `ping_scorecard` convention) instead of the three argument form in the work order; the operator uses a separate aggregate only network function.
   - The operator is an administrator of the deployment's own tenant (`deploymentProfile().tenantId`).
   - SQL write routines append `admin_action_log` themselves in the same transaction instead of going through `execute_admin_action`.
   - `require_source_attestations` is set by the operator only, because the buyer API campaign patch allowlist is shared with the S8a buyer API; buyers see the setting read only. The expiry column is `attestation_expires_at`.
   - The spec was already v4 (S9), so this change makes it v5.
   - Member status and CTM files share `member_status_import_files` with a `kind` column.
   - Lifecycle type names follow the existing snake case; the work order's names are listed beside them above.
   - The Gold Standards view is a top level GOLD STANDARDS tab for administrators and a Gold Standards sub tab in the exchange buyer portal.

## Demo

`npm run dev:ping-demo` opens the exchange demo. The Gold Standards sub tab, the Sources and Attestations tabs and `?tab=activation` use fictional data from `src/components/gold/demoGold.js`: three agencies, two publishers plus unattributed traffic, three fictional carriers, seven agents (one without a ready to sell date), matured and pending members, a few CTMs, activation tasks, one agency below 70 percent, one publisher with a high cost per retained member and one member who moves between agencies. Every figure is computed by the tested JS mirror, so each view is internally consistent; tests check every grouping up to three dimensions in both scopes. The demo loads only under `import.meta.env.DEV` with `VITE_PING_DEMO=1` and is absent from production bundles.

## Enabling in a separate authorized environment

1. Apply migrations 188, 189 and 190 through the reviewed process (or install from the bootstrap), after the existing backup and access acceptance gates.
2. Load the plan year landscape tables (`cms_plans_py<year>`) for every effective year you will measure; without them product line and SNP type are unknown.
3. Set `MEMBER_STATUS_IMPORT_ENABLED=true`, then provision the pepper once as the service role: `SELECT provision_member_mbi_pepper('<at least 32 random characters, different from the phone pepper>')`. Store it in your secret manager; it cannot be rotated without re-keying.
4. Optionally key earlier intakes: `node scripts/gold/backfill-mbi-keys.mjs --connection <localhost URL>` (dry run), then add `--execute` with `MEMBER_STATUS_IMPORT_ENABLED=true`.
5. Save a column map per carrier (`POST /api/gold-standards` with `action: save_map`) and import a test file; review the unmatched queue.
6. Set `CTM_IMPORT_ENABLED=true` and map CTM files the same way; confirm complaint ownership and the resolution procedure.
7. Set `BENEFIT_ACTIVATION_ENABLED=true`; choose `due_days` per tenant.
8. Set `GOLD_STANDARDS_METRICS_ENABLED=true` for the Gold Standards views.
9. Set `SOURCE_ATTESTATIONS_ENABLED=true` on the web functions and the phone server, record publisher attestations in the operator portal, then require them per campaign.

## Not verified

- Real carrier and FMO file layouts, value codes, date formats and CTM category labels; mappings were exercised on synthetic files only.
- Hosted Supabase RLS, PostgREST, Vault and pgcrypto behavior; all evidence is in process PGlite on the fresh install.
- Real volumes and latency. `gold_facts` builds facts per request; it has no load test.
- Landscape tables other than `cms_plans_py2027`; enrollments effective in other years have unknown product line and SNP type until those tables are loaded.
- The browser screens beyond unit tests and the local demo data; no visual review in a running browser was performed in this session.
- Network de-duplication for members whose intakes predate the pepper, until the backfill runs.
