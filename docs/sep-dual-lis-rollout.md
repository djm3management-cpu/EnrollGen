# F35: monthly dual/LIS and integrated-care SEP

Branch: `fix/sep-dual-lis`. Migration: `068_sep_dual_lis.sql`.

## Rollout

1. After approval, merge and deploy the code to Netlify. No Railway changes are required for this batch. Do not apply production SQL during branch review.
2. Confirm Agent Tools shows the new Dual / LIS SEP Quiz and the revised MA SEP reference/guide. Confirm the SEP Finder still loads. The code works before 068: it replaces the legacy quarterly D-SNP RPC card with two conditional reference cards and discards generic D-SNP plans as integrated-plan proof.
3. Run the complete `supabase/migrations/068_sep_dual_lis.sql` in the SQL Editor. It replaces `get_available_seps(text)`, corrects active known knowledge references and the deployed compliance sample, and clarifies guidance-only routing paths. The migration runs in one transaction. No historical migration is edited; no production data is deleted.
4. Refresh the app to clear cached knowledge. Check a ZIP with current county plan data: standalone PDP guidance requires member verification; the integrated card lists only FIDE/HIDE/AIP plans with explicit current-year integration evidence. The list proves area availability, not full-benefit status, aligned enrollment or monthly use. Missing integration data produces no verified integrated plans.
5. Try the eight-question quiz and check its explanations. Verify the PDP-only partial-dual/LIS cases and the full-dual alignment case; check that the quiz is a knowledge check, not a vendor certification.

Code first is recommended because it immediately suppresses the old RPC wording during the SQL rollout. The updated RPC keeps the existing response shape and function signature, so it is compatible with the old consumer; however, only the new UI explicitly labels these rights as requiring member verification. Both stages must be completed to correct deployed source, database-backed content and scoring examples.

## Rules and scope

- The dual/LIS SEP supports one monthly standalone PDP election, including MA-PD to Original Medicare plus PDP. Full and partial duals and LIS-only beneficiaries may qualify; it does not authorize MA-to-MA enrollment. Verify Part D at-risk/potential-at-risk status and monthly use.
- The integrated-care SEP requires full-benefit dual status, an eligible FIDE/HIDE/AIP plan in the service area, and verified aligned Medicaid MCO enrollment. Enrolling through an approved process that establishes alignment must be verified; do not assume automatic enrollment or a carrier change. Remaining in FFS or an unaligned MCO does not qualify.
- Unknown evidence stays verification-required. These checks do not change plan-routing priorities, state routing, other SEP rules, admission or Paragon behavior.
- CMS plan data retains the existing PY2027 restriction. This batch does not import integration data, infer it from another plan, or include the unrelated uncommitted D-SNP import changes.
- The six known active `sep_guide` keys are corrected in both text and nested metadata, including active tenant overrides. Inactive history and unrelated custom text remain intact. `knowledge_updates` records old content and metadata for review. The compliance intent correction preserves other examples and intent fields.
- Original uncommitted workspace changes remain untouched. No production SQL, email or live test call was executed.

Primary references:

- [CMS monthly dual/LIS and integrated-care SEP job aid](https://www.cms.gov/files/document/duals-lissepsjobaid01012025.pdf)
- [Medicare.gov Special Enrollment Periods](https://www.medicare.gov/basics/get-started-with-medicare/get-more-coverage/joining-a-plan/special-enrollment-periods)
- [CMS 2026 enrollment and disenrollment guidance, integrated-care SEP section 30.6.35](https://www.cms.gov/files/document/cy-2026-cd-enrollment-and-disenrollment-guidance.pdf)

## Validation

- Application suite: 204 passing tests, including 11 new F35 tests.
- Telephony regression suite: 153 passing tests.
- Production build and `typecheck:llm`: passed.
- Changed JavaScript/JSX/test files: lint passed. Full repository lint retains 45 existing errors, zero warnings, in unchanged files.
- Entire 068 executes in a disposable PGlite PostgreSQL database using the actual historical knowledge seed text/metadata. Tests cover active tenant overrides, inactive history, custom text, correction audits, repeat application and preserved routing fields.
- Beneficiary tests: full dual, partial dual with/without LIS, LIS-only, neither; PDP at-risk and monthly-use exclusions; independent integrated-care monthly use; unknown evidence; unaligned MCO/FFS; non-integrated plans; service area; explicit FIDE/HIDE/AIP versus No/pending/missing evidence.
- Browser state/ZIP engine paths, legacy/current RPC compatibility, county/type integration filtering and the eight quiz scenarios are covered. No production end-to-end eligibility determination was made.

## Changed files

- `supabase/migrations/068_sep_dual_lis.sql`: complete RPC replacement, live knowledge/compliance corrections, correction audit and guidance-only routing paths.
- `scripts/sep-data/schema.sql`: reusable RPC definition aligned with 068.
- `src/lib/dualLisSep.js`: shared wording, evidence checks, cards and pre-068 RPC adapter.
- `src/lib/sepEngine.js`: two separate rights in both state and ZIP engines.
- `src/lib/sepGeo.js`: explicit JavaScript module import extension for direct test execution.
- `src/lib/snpRouting.js`, `src/data/snpRoutingData.js`, `supabase/seeds/003_snp_routing_seed.sql`: correct election guidance without changing routing priorities.
- `src/context/SEPScript.js`, `src/data/sepQualifierData.js`: separate script/qualifier rights and evidence requirements.
- `src/context/CopilotCmsKnowledge.js`: precise monthly rights, alignment and primary-source attribution.
- `src/compliance/intents/eligibility.js`, `supabase/seeds/001_compliance_intents.sql`: corrected approved compliance example.
- `docs/MA_SEP_Guide_2026.md`, `src/data/stateSepData.js`: training/reference and structured guide corrections.
- `src/components/SEPResultsPanel.jsx`, `src/components/sep/SEPCard.jsx`: explicit conditional guidance and compatible legacy/current rendering using existing styles.
- `src/data/dualLisSepQuiz.js`, `src/components/AgentTools.jsx`: new eight-question quiz using the existing quiz renderer and styles.
- `tests/sep-dual-lis.test.js`: eligibility, SQL, knowledge and quiz regression coverage.
- `docs/sep-dual-lis-rollout.md`: rollout, source references, validation and inventory.
