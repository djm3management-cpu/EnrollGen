# F57 Step 2 handoff

Work is isolated in `/private/tmp/EnrollGen-u65-copilot`, branch `fix/u65-copilot`, based on current local main `51fccc305356662ff809f85f2b36e2b6df49fdbf`. No live SQL, deployment, push, or merge into main was performed. The Desktop workspace was read only. Telephony, call routing, billing, recordings, all CSS files, and the existing playbook stylesheet are unchanged.

## Product guidance

[Full 59-variant per-product table](f57-u65-step2-products.md) includes type, network, individual/family INN/OON deductible and OOP, hospital/office/other limits, Rx, maternity, waits, required statements and source cell references. Groups: 13 major medical, 7 HSA, 25 limited copay, 2 MEC/preventive, 12 fixed indemnity. No cross-group premium comparison is presented.

The canonical catalog is `src/data/u65PlanCatalog.json`, including hashes of both supplied source files, exact workbook cell addresses and the complete Sources register. `U65_Plan_Map.pdf` was absent. Explicit user-supplied map warnings are retained, with that gap identified. No external insurance facts were added.

Enroll Prime remains the CURRENT agent portal. The market is DE, MD, FL agents and higher earners priced out of unsubsidized ACA. PALIC-only obligations, unsupported prescreens, personal eligibility judgments, blanket NOT-MEC language, hard-coded ACA estimates and unverified personalized rate tables were removed from U65 guidance. Ancillary dental references outside the U65 panel were preserved.

Script, left rail, Agent Tools, Co-Pilot live coaching and Q&A share the exact selected workbook variant. Switching variants cancels responses for the previous selection and refreshes coaching when live speech is present. Reset/leaving the U65 script clears selection. Without a variant, coaching asks for selection and does not infer facts. Unknowns say “verify with carrier”; conflicts say “confirm with carrier.” All Vault disputed/provisional schedule amounts are withheld; cancer exclusions and exposure warnings remain.

The public playbook and both quizzes derive from the same catalog. `node scripts/render-u65-guidance.mjs` regenerates the playbook and full product table while preserving the existing stylesheet. Script navigation actions and capture topology remain intact; current screen and completion are exposed to Co-Pilot.

## Migration

[Full migration 082](../supabase/migrations/082_u65_source_guidance.sql) is the only new migration. It runs transactionally and idempotently. It deactivates all active tenant/global `compliance_u65` knowledge and U65 script overrides, preserves their rows for audit, and upserts five source-versioned global knowledge entries matching the current five-screen script. U65 script/editor use the source-grounded local fallback. No other knowledge category, flow, or operational table is changed. The client also rejects unversioned old knowledge/templates before this migration is applied.

No U65 grading template is created and no carrier approval/status is inferred. Product coaching is not a carrier eligibility determination.

## Validation

- Final `npm test`: **296/296 passed**.
- Final targeted U65 + prompt-cache + silence regression run: **29/29 passed**.
- Production build: passed.
- Changed-file ESLint: passed, including new generator and tests.
- `npm run typecheck:llm`: passed.
- `git diff --check`: passed.
- Migration PGlite tests: repeated execution, tenant/global stale overrides, structured fallback parity, retained historical rows, and non-U65 isolation passed.
- Content checks: all 59 variants, conflict withholding, indemnity/wait rules, hard caps, network warnings, per-product quiz answers, both prompt paths, shared selection and reset behavior.
- Scope checks: script actions/capture topology and public stylesheet unchanged; no operational-domain or CSS changes.
- Source workbook and Word file SHA-256 hashes verified unchanged.

Repository-wide `npm run lint` reports **51 existing errors**; unchanged current-main baseline produces the same 51. No unrelated fixes were made. The initial full test attempt required installing the separate telephony package’s locked dependencies in the isolated clone. A subsequent run hit two unchanged daily-cap assertions around the day boundary; isolated baseline and working-clone rechecks passed, and the final complete suite passed. No telephony source or lockfile changed.

Visual browser verification is unavailable: browser security review rejected opening the localhost preview and reported declined permission. No alternate browser route was attempted. Static scroll-layout, per-plan navigation, complete-content and stylesheet checks passed; screenshots and an authenticated live-call browser test were not performed.

## Rollout order (not executed)

1. Review the full product table and source gaps. Obtain the missing map and current carrier confirmation for unresolved terms, eligibility/ACA/MEC status and exact network participation. Until then the shipped guidance retains verification language.
2. Back up the active U65 knowledge and U65 script rows so the exact pre-rollout state can be restored. Treat custom U65 tenant overrides as retired by 082.
3. Deploy this application commit first. Its source-version guard prevents old database overrides from reintroducing unsupported product rules. Do not allow agents to edit old U65 templates during rollout.
4. Apply `082_u65_source_guidance.sql` once through the normal migration runner after 081. Never run an older U65 seed afterward.
5. Refresh agent tabs/knowledge caches. Verify plan selection in script and Agent Tools reaches live coaching and Q&A. Spot-check MedAccess Basic/Pro, Ultimate EPO, Vault, Life-X VL, BMI/DVP, Bloom and Everest disclosures; confirm only the five new source-versioned U65 knowledge rows are active and old U65 script overrides are inactive.
6. Confirm the existing call routing, telephony, billing and recordings continue normally. Keep verification wording for unresolved carrier questions.

## Files changed

- `docs/f57-u65-step2-products.md`
- `docs/f57-u65-step2-handoff.md`
- `public/private-plan-playbook.html`
- `scripts/render-u65-guidance.mjs`
- `src/components/AgentTools.jsx`
- `src/components/AgentToolsProductQuiz.jsx`
- `src/components/PrivatePlanPanel.jsx`
- `src/components/UnderwritingChecker.jsx`
- `src/components/U65ProductGuidance.jsx`
- `src/data/privatePlanRates.js`
- `src/data/privatePlans.js`
- `src/data/u65ComplianceKnowledge.js`
- `src/data/u65Guidance.js`
- `src/data/u65PlanCatalog.json`
- `src/flows/u65/U65Context.jsx`
- `src/flows/u65/U65Data.js`
- `src/flows/u65/U65Flow.jsx`
- `src/flows/u65/U65Script.jsx`
- `src/hooks/useU65CopilotEngine.js`
- `src/hooks/useU65ProductSelection.js`
- `src/lib/u65ProductSelection.js`
- `supabase/migrations/082_u65_source_guidance.sql`
- `tests/u65-guidance.test.js`

The pre-existing Step 1 inventory remains untracked and unchanged in this clone; it is not part of the application commit or bundle.
