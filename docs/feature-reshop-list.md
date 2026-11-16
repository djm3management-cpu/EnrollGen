# Annual re-shop list

Local feature on `pilot/release`, after `c3d59f8`. Default off. No push, deployment, hosted database, real provider request, dependency addition, vendored file, real environment-file edit, historical migration edit, telephony source edit, stylesheet edit or active-secret-exception change. All comparisons execute deterministically in PostgreSQL. There is no model request, dialer, scheduler, outreach queue, message or call action.

## Current plan and writing agent

The source is the most recent **completed, non-test enrollment intake per contact and coverage type**, ordered by `submitted_at`, `completed_at` and UUID, descending. Selection happens before writer scope, so a superseded enrollment cannot reappear for a former writer. MA, MA-PD and SNP types share MA coverage; an explicit PDP/Part D type or structured S-contract identifies PDP coverage. Other coverage types remain separate and receive no CMS reasons.

`enrollment_intakes.data.contractId`, `planId` and `segmentId` identify the current plan. Contract IDs are trimmed/uppercased; numeric plan/segment IDs are padded to three digits. Missing IDs stay missing. The row displays these identifiers and its recorded carrier, rather than interpreting a plan name. The intake premium is the baseline for premium changes. The actual prior plan subtype comes from the matching prior-year CMS landscape, or an explicitly recorded HMO/PPO/HMO-POS/PFFS/MSA subtype. Broad intake categories such as `MA/MAPD/PDP` do not establish an HMO or PPO subtype.

The installed contacts schema has `current_plan` and `current_carrier` text, but **no structured contract/plan/segment fields**. Neither is parsed into IDs. Contacts without a completed intake cannot establish a current structured enrollment or writing agent and do not become invented enrollment rows. No transcript, note, policy prose, plan name or ZIP alone is used to guess a plan or county.

Writer resolution uses the intake's existing `writingAgentId` (CRM roster UUID), then `writingAgentSlug`, then the legacy recorded `aor` slug, with protected enrolled-agent/roster joins. Only intakes lacking all writer attribution fall back to their call's protected owner. An explicit but unresolved writer does not silently become the call owner. Writer assignment can differ from the call owner or current contact assignment. Historical inactive writers remain attributable for authorized agency/team review; viewers must have complete active deployment membership.

County comes from the contact's explicit five-digit FIPS, or an unambiguous exact county-name/state match in the existing county reference. Unknown/ambiguous counties remain unknown. Permission to contact displays the latest existing call's `ptc_on_file`, `ptc_date` and `ptc_expiry`, without updating them or granting consent. Missing, undated, future and expired permission remains visible as such.

Only the returned page's first and last names are decrypted, using the existing Vault-backed `decrypt_pii_value` primitive. Existing `pii_access_log` records those name reads. No phone, address, DOB, Medicare/Medicaid identifier or intake identity JSON enters the response. The list has one existing evidence-access collection event per request; failed audit writes withhold reads and prevent actions.

## Plan years and CMS evidence

The enrollment year is the calendar year of its strictly valid `effectiveDate`, never submission year or a hardcoded comparison year. Target year is enrollment year plus one. Missing/invalid effective dates form **Effective date not recorded**, with no reasons.

The private annual adapter selects the existing canonical `public.cms_plans_py<target year>` table using a validated numeric year and quoted catalog relation. It reads only reviewed structured fields and never changes, copies or relabels CMS data. Both a nonempty annual landscape and crosswalk rows for the target year are required before comparisons run. Missing either gives **Next year not loaded**, no reasons and no successors. Loaded-year presence is not certification of load completeness; annual loading must verify complete source coverage independently.

The crosswalk joins `plan_terminations.plan_year` to the target year and its `old_contract_id`/`old_plan_id` to the current IDs. All recorded CMS associations/statuses are considered, including terminated rows without counties. Successors must be explicitly linked by `new_contract_id`/`new_plan_id`, present in the target-year landscape for the client's county/state, and share the current contract or the exact recorded/current-CMS carrier label. A different contract with unconfirmed carrier continuity is withheld. There is no other-carrier inventory search or comparison. Successor IDs from withheld plans are not exposed in crosswalk metadata.

Crosswalk records do not map segments. A same-plan renewal must preserve the enrolled segment. For a changed plan, the list exposes each actual matching successor segment without claiming a segment mapping CMS did not supply. Stars and low-performing flags join the successor contract/county and target year in `star_ratings_by_county`; no prior-year rating, Part C summary rating or numeric-rating inference substitutes for a missing flag.

| Fixed code | Fixed label | Source facts |
|---|---|---|
| `terminated` | Plan terminated or not renewed | Crosswalk `termination_type='terminated'`, retaining the exact `source_status` as evidence. Does not require invented county evidence. |
| `county_dropped` | County dropped from service area | `termination_type='service_area_reduction'`, `county_mapping_status='affected_service_area'`, and exact client `county_fips`. |
| `crosswalked` | Plan consolidated or crosswalked | `termination_type='consolidated_renewal'`, or an explicit changed `new_contract_id`/`new_plan_id`. |
| `low_performing` | Successor flagged low performing | Successor county-contract `star_ratings_by_county.low_performing=true`. |
| `stars_below_3` | Successor star rating below 3.0 | Successor county-contract `overall_star_rating < 3.0`. NULL remains unknown. |
| `premium_increase` | Monthly premium increased | Successor landscape `monthly_premium` exceeds the numeric intake `premium`. Missing premiums do not become zero. |
| `type_changed` | Plan type changed | Successor landscape `plan_type` differs from the known structured prior subtype. Unknown subtype does not imply a change. |
| `renewing` | Renewing with no flagged change | Explicit renewal/consolidated/SAR association, a county-confirmed loaded successor, and no preceding flagged reason. Never inferred solely from absence. |

Every applicable reason is retained. `county_mapping_status='current_service_area'` establishes successor coverage only; it never establishes a dropped county. A plan without matching county evidence displays **County not confirmed**. The documented PY2027 terminated associations lack historical counties, so they can receive `terminated` while never receiving `county_dropped` from that absence. A loaded year without enough matching transition/successor evidence forms **CMS transition not confirmed**, with no invented renewal reason. Unsupported products, including Medicare Supplement, form **Not covered by CMS data**, with no reasons or successors.

Rows rank by the table's reason order, then largest monthly premium increase descending, then oldest enrollment submission first, then UUID. Only-renewing rows have their own group, collapsed by default. Header reason counts cover the full filtered, authorized collection. Filters cover reason, writing agent, carrier, state and review outcome/unreviewed. Paging defaults to 100 and caps at 200; counts are enrollment/coverage rows, so a consumer with MA and PDP can contribute two rows. Group counts on a page describe that page.

All summaries/labels are fixed. The list expresses recorded CMS changes only. It does not determine an election-period entitlement, select a replacement product or expose unrelated plans.

## Exclusions and database access

The source excludes incomplete/test intakes, superseded intakes of the same coverage, unresolved attribution, and broken same-tenant enrollment/call/contact relationships. Any opportunity in the existing **Disenrolled** stage excludes that contact. Existing `contacts.do_not_call` records exclude the contact, including another same-tenant DNC record matching its phone blind index or normalized phone. No new consent/DNC table or outreach suppression system is introduced. Permission missing/expired by itself does not remove a review row; it remains explicitly visible.

`read_reshop_list` and `act_on_reshop` are service-only, feature-gated SECURITY DEFINER routines with pinned paths. Both independently resolve `resolve_deployment_subject(actor, org)` and apply tenant and writer scope in SQL:

- Agent: only enrollments attributed to the viewer's protected enrolled-agent UUID.
- Manager: only writers in the protected explicit `team_agent_ids`; no implicit own/agency expansion.
- Admin: the protected deployment agency. Request-supplied roles/agent IDs never grant authority.
- Unprovisioned, inactive, foreign-organization and foreign-agency viewers: denied.

The HTTP handler verifies Clerk without bypass and uses `resolveCallAccessIdentity`, `serverRequest`, the structured logger, existing admission counters and `auditedEvidenceAccess`. The private source/comparison/annual-adapter functions have no browser or service EXECUTE grant. The review table has RLS, no browser grants/policies and no direct server insert/update privilege. Managers do not gain access to another contact's full record: Open contact navigates through the existing audited contact path and retains its existing authorization.

Named application admission entries `reshopRead`, `reshopTask`, and `reshopReview` use the existing atomic `consume_admission` engine: respectively 30, 10 and 20 requests per verified subject/minute, with 3,000/subject UTC day and 30,000/deployment UTC day per route. They have separate hashed keys and use the same 429/Retry-After and fail-closed 503 contract. This follows the existing application-route adapter without modifying the phone-server registry or paid-request allowances.

## Explicit actions and storage

**Add task** rechecks the latest enrollment, scope, exclusions and current CMS facts after locking the intake. It creates one existing `follow_ups` task linked to the contact, assigned to the writing agent's existing slug, due now, with the fixed top-reason label as its title (`reason` in Tasks). The enrollment/target-year record reuses that task ID across retries. Rows with no CMS reason cannot create a reason-titled task.

**Mark reviewed** accepts only `kept_plan`, `reshopped`, `could_not_reach`, `asked_not_to_be_contacted`, or `no_longer_client`. It records the verified actor and database time. Repeating the same result is idempotent; a different result for that enrollment/target year refuses with 409. It does not modify contact status, opportunities, consent or DNC. Asked not to be contacted presents **Use contact do-not-call control**, linking the existing contact workspace.

Administrator actions use the existing transactional `execute_admin_action`/`admin_action_log` boundary; failure rolls back their mutation. A review appears once as lifecycle type **`reshop_review`**, fixed summary **Annual re-shop reviewed**, with its stored outcome/actor/time and record reference. Task-only reservations do not create a review timeline event. The lifecycle tab remains controlled by its own existing switch.

Migration **170_reshop_list.sql** adds only `reshop_reviews` storage, scoped routines, reference/query indexes and narrow extensions of existing administration/lifecycle routines. There is no materialized snapshot. Its stored columns are UUID references, target year, optional existing task UUID, fixed outcome, staff actor/time and immutable retention anchor. It contains no decrypted client field or plan-text copy. Every read recomputes from current enrollment/CMS rows. Distinct comparison keys share computation within a request; there is no cache to invalidate.

Reviews inherit the source enrollment's immutable `retention_started_at` and existing **enrollment** retention class/schedule, holds and transaction/savepoint group. The existing purge job deletes them with their enrollment and records the UUID-only lifecycle removal marker. No schedule or legal-hold behavior changes.

The migration is included verbatim after 169 in the fresh bootstrap, with the seal preserving narrow service grants. Manifest checksums, migration statement hash, operator routine/module inventory and catalog snapshot are regenerated with the existing local harness.

## Enablement and next annual load

In a separately authorized environment, apply migration 170 after 169 (or use the complete checksummed fresh-install bootstrap), retain protected deployment provisioning, and set server **`RESHOP_LIST_ENABLED=true`**. The existing strict parser accepts exact `true`; unset/empty/`false` is off and other values fail configuration. `.env.example` documents off. The public feature projection controls **CRM → Re-shop** (`/crm/reshop`). Both API and direct-function URLs return 404 before identity/client construction when off; no view mounts, timer runs or work queues. Existing lifecycle event projection independently omits this event type while the switch is off.

The next annual load must include:

1. Complete canonical `cms_plans_py<year>` landscape with matching `plan_year`, contract/plan/segment IDs, county/state, exact carrier label, plan type and monthly premium. Preserve reviewed annual-table publication/access policies and indexes; a changed schema needs separately reviewed annual-load work.
2. Complete `plan_terminations` crosswalk for that target year: old IDs, exact CMS `source_status` and category, explicit successor IDs, and honest county mapping status. An authorized annual schema migration must update existing year-only constraints before a future year can be loaded. This feature does not change those constraints or load CMS rows.
3. Same-year successor contract/county Overall ratings and independent low-performing flags in the existing star table. Missing ratings/flags stay unknown; complete data is required for all corresponding flags to be available. Its existing annual constraints also require the annual-load review.
4. Historical affected-county evidence before any dropped-county assertion is possible. Current successor counties cannot replace it. Prior-year structured plan subtype evidence is needed to compare types when the intake only records a broad product category.
5. Enrollment effective dates and precise IDs, recorded writer attribution, and explicit client county/state. Verify complete source counts and coverage independently; a single loaded row does not establish a complete annual load.

No live switch, migration or CMS load was applied in this session.

## Local validation and limits

Local measurement and final verification results are recorded below. The benchmark constructs **5,000 distinct enrolled clients**, 5,000 canonical calls/intakes and 100 synthetic plan associations in a fresh in-process PostgreSQL (PGlite) database. It times the complete server handler and JSON response for a 100-row page, including protected identity resolution, admission, full authorized collection computation, counts/ranking, name decryption/PII logs and the evidence-access write. Three requests are measured, including the first request; data construction/bootstrap are excluded.

- Measured list speed: **519.16 ms first request**, then **445.25 ms** and **434.97 ms**; worst **519.16 ms**, below 2,000 ms. Command: `node --import ./tests/fixtures/deployment-env.js --test --test-reporter=tap tests/reshop-load.test.js`.
- **Root: 1,903 passed** (1,834 baseline + 69), **telephony: 389 passed**, zero failures/cancellations/skips. **`npm run verify`: PASS, 10/10 checks**, including the earlier access matrix, two independent fresh bootstrap/catalog builds, lint, types, environment-free build/headers, both npm audits and agency/secret scans. Both audits reported zero vulnerabilities. The same active secret exception and review deadline remain unchanged. The full concurrent root run also measured the 5,000-client list at 1,101.81 / 696.07 / 959.40 ms, all below two seconds.

Coverage includes every reason from constructed canonical enrollment/CMS rows, multiple reasons, thresholds/unknowns, years and a synthetic future annual table, missing data, segment matching, county non-evidence, DNC/Disenrolled exclusions, direct database and endpoint scope, rank/filter/count/page behavior, retry idempotency, all review outcomes, lifecycle uniqueness, audit refusal, live source changes, retention grouping/purge provenance, switch-off absence, UI action handlers, bootstrap/catalog and the earlier access matrix.

Not verified locally: hosted Clerk/PostgREST/Storage behavior, real agency/CMS contents or annual load completeness, migration rollout, native PostgreSQL concurrent-process/crash behavior, production-scale CMS inventory and network latency, or interactive browser acceptance in Terminal/light themes (the browser access host was unavailable when opening the synthetic localhost preview). The UI reuses existing theme-aware classes/tokens with no stylesheet changes; it has no new surfaces/borders or font weight above 500. Tests exercise synthetic component trees and handlers; the environment-free build verifies bundling, not browser visual acceptance. No real provider connection, phone call, message, AI request, push or deployment was used to validate this feature.
