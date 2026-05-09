# EnrollGen Code Review

Review date: 2026-05-08

Scope: local repository review of `src/`, Netlify functions, Supabase migrations/seeds, scripts, and docs. Hosted Clerk, Supabase, Stripe, Netlify deploy status, and production data were not verified from the local repo unless the code itself proves the state.

## Executive Summary

| Area | Status | Notes |
| --- | --- | --- |
| Core architecture | Partially built | Vite/React app shell is coherent, but routing is internal state rather than route-driven, SaaS/tenant boundaries are incomplete, and hosted env state is not locally verifiable. |
| MA script flow | Working | Main 8-section MA flow renders from code, has session tracking, customer audio controls, checklist gates, and MA copilot wiring. D-SNP stop-gate is only partial. |
| Med Sup script flow | Partially built | Renders as a 7-section flow with populated script lines and gates, but content depth and tools are thin compared with MA. |
| ACA script flow | Partially built | 7 gates exist for core/state variants with populated lines; lint blocker fixed. Cross-flow transitions and full calculators are incomplete. |
| U65 script flow | Partially built | 8 gates exist and render from code, but several sections are short and spec-level depth is not fully implemented. |
| Copilot engines | Partially built | MA was the most complete. Med Sup, ACA, and U65 now use Anthropic `data.content`, include `max_tokens`, use the shared `fetchWithClerk(getToken, ...)` shape, retrieve transcript references, and log compliance flags when sessions exist. |
| Compliance engine | Partially built | 143 intents/99 required/22 auto-fail confirmed in code. False-positive handling improved locally. Real-call scoring quality still needs eval. |
| Audio pipeline | Partially built | Agent mic and optional tab/customer audio code exist. Batch Deepgram transcription exists. Intelligence params are not enabled in `transcribe.js`. |
| Agent tools | Partially built | SEP Qualifier, SEP Finder, carrier refs, daily verse, and SNP routing exist. Med Sup plan letter lookup and MA drug formulary capture are missing. |
| Multi-tenant SaaS | Never started to partial | Clerk sign-in exists, but Clerk organizations, tenant onboarding, Stripe billing, and tenant admin workflows are not implemented. |
| Intelligence layer | Partially built | Post-call records, scoring, operations views, and upload/score pipeline exist. Nightly analytics, weekly digest, follow-up queue, and heatmap are not complete. |
| Session tracking | Partially built | Four-table migration exists and hook works locally in code. Hosted migration/JWT template/RLS cannot be confirmed locally. Non-MA rails now start/end sessions. |
| GHL integration | Partially built | Outbound enrolled-call webhook exists. Requested inbound webhooks and transfer routing are not present. |
| Build and deploy | Partially verified | `npm run lint` and `npm run build` are clean locally. Hosted deploy and remote branch status are not locally verified. |

## Core Architecture

Status: partially built.

- `src/` is organized into `components`, `context`, `flows`, `hooks`, `lib`, `data`, `compliance`, `stores`, `config`, and `assets`.
- `src/App.jsx` is a single React shell with internal mode state for MA, ACA, Med Sup, U65, Ancillary, Operations, and tools. There is no React Router for most views.
- `src/main.jsx` wraps the app in Clerk unless `VITE_DISABLE_CLERK_AUTH=true`.
- `vite.config.js` uses manual chunks for React, Clerk, Supabase, Framer, lucide, jspdf, and xlsx.
- `netlify.toml` has SPA fallback, `/api/*` function redirect, Netlify functions, and one scheduled `sync-bulletins` cron.
- Env names found: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_ENABLE_CUSTOMER_AUDIO`, `VITE_AGENT_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `VITE_BIBLIA_API_KEY`.
- Supabase client setup exists in `src/lib/supabase.js`, including `getAuthSupabase(token)`.
- Clerk/Supabase JWT use was inconsistent. Session tracking and call history now request `getToken({ template: "supabase" })`.
- Bundle splitting is present, but no bundle analyzer output was reviewed. Unused/dead code exists, including features that are built but not wired everywhere.

## Script Flows

| Flow | Status | Details |
| --- | --- | --- |
| MA | Working with partial gaps | `ScriptFlow.jsx` drives the main flow. Sections 1-8 plus conditional SNP section exist, gate/checklist state is substantial, session logging exists, and copilot is wired. D-SNP routing is not a mandatory plan-selection stop-gate. |
| Med Sup | Partially built | 7 sections exist in `MedSupScript.js`/`MedSupFlow.jsx`. Script lines are populated, not empty placeholders, but plan-letter lookup and deeper GI/underwriting tools are missing. |
| ACA | Partially built | `ACAData.js` and `StateACAData.js` define 7-gate flows. State/default flow renders via `ACAScript.jsx`. Constant-condition lint issue was fixed by making reference detail display env-driven. |
| U65 | Partially built | `U65Data.js` defines 8 gates. Context has calculator/product/UW state, but UI script content is much thinner than `docs/u65-aca-spec.md`. |

Known flow gaps:

- ACA to U65 and U65 to ACA transitions are documented in `docs/u65-aca-spec.md` but not fully implemented with data passing.
- ACA/U65 checklist validation exists in parts, but spec-level calculators and transition logic remain incomplete.
- MA drug formulary capture panel is not built.

## Copilot Engines

Status: partially built, with Phase 1 fixes applied.

| Engine | Status | Findings |
| --- | --- | --- |
| MA `useCopilotEngine.js` | Working | Uses `fetchWithClerk(getToken, ...)`, `data.content`, `max_tokens`, RAG transcript search, ask flow, transcript windows, and `logComplianceFlag`. |
| Med Sup `useMedSupCopilotEngine.js` | Working after local fixes | Signature/content/max_tokens were already correct. RAG transcript search and `logComplianceFlag` wiring were missing and are now added. |
| U65 `useU65CopilotEngine.js` | Working after local fixes | Signature/content/max_tokens were already correct. RAG transcript search and `logComplianceFlag` wiring were missing and are now added. |
| ACA `useAcaCopilotEngine.js` | Working after local fixes | Engine exists. Signature/content/max_tokens were functional. RAG transcript search and `logComplianceFlag` wiring were missing and are now added. |

RAG status:

- `src/lib/transcriptSearch.js` queries Supabase RPC `search_transcript_chunks`.
- MA already used RAG for coaching and ask.
- Med Sup, ACA, and U65 now add call-reference context to coaching and ask prompts.
- Actual retrieval quality depends on the embedding function, RPC deployment, and transcript data in Supabase; not verified locally.

Compliance flag logging:

- MA already passed `session.logComplianceFlag`.
- Med Sup, ACA, and U65 copilot rails now start/end sessions and pass `logComplianceFlag` into their engines.
- Warnings, reminders, and critical AI interventions now persist through session tracking when a session exists.

## Compliance Engine

Status: partially built.

Confirmed from `src/compliance/intents/index.js`:

- Total intents: 143.
- Required intents: 99.
- Auto-fail intents: 22.
- Seed file `supabase/seeds/001_compliance_intents.sql` also documents 143 intents across 10 categories.

`TranscriptAnalyzer.js` findings:

- Comparative/superlative detection used token windows, but benign phrases such as "find the best plan" still risked false positives.
- Pressure/misleading phrase detection used broad substring matching.
- SOA timing could flag generic plan mentions before scope as a violation.

Local fixes applied:

- Added benign comparative exclusions for "find the best", "best plan for your", "best option", "best fit", and compare/shop/review contexts.
- Switched pressure/misleading phrase checks to word-boundary regex matching.
- Removed generic SOA plan triggers and added context checks so general plan discussion before SOA is not auto-flagged unless concrete benefits/costs are detected.

Open compliance work:

- `ComplianceScorer.js` needs real-call eval against the 63 ingested recordings. Current scoring quality cannot be proven from code.
- `scripts/rescore-calls.js` exists for rescoring, but no completed `docs/COMPLIANCE_EVAL.md` exists.
- `conversely_submit.py` was not found. Conversely-style intent classification exists in JS modules, but the named Python integration is missing.

## Audio Pipeline

Status: partially built.

- Agent mic capture exists through `useSpeechRecognition.js`.
- Customer/tab audio capture exists through `useCustomerAudio.js`.
- `VITE_ENABLE_CUSTOMER_AUDIO` gates customer audio; default behavior in code enables it unless set to `"false"`.
- Deepgram token function exists at `netlify/functions/deepgram-token.js`.
- Batch transcription exists at `netlify/functions/transcribe.js`.
- Deepgram intelligence parameters (`sentiment`, `intents`, `topics`, `summarize`) are not enabled in `transcribe.js`; only transcription/utterances/diarization style behavior is present.
- Audio recording storage/retrieval is partially handled through post-call pipeline and Supabase records, but full hosted behavior was not verified locally.

## Agent Tools Panel

Status: partially built.

Working or partially working:

- SEP Qualifier sidebar exists in `src/components/leftRail/SEPQualifier.jsx`.
- SEP Finder exists through Supabase RPC/client code in `useSEPLookup` and related SEP components.
- Carrier eligibility/reference links exist in `AgentTools.jsx` and carrier reference components.
- Daily Verse feature exists in `DailyVerse.jsx`.
- SNP routing exists through `SNPRoutingWidget`, `snpRoutingData`, `snpRouting.js`, and SNP Supabase seed/migrations.

Missing or incomplete:

- Med Sup Plan Letter Lookup is not built as a sidebar component.
- MA drug formulary capture is not built as a session-persisted sidebar tool.
- D-SNP MCO verification exists as reference/routing logic, but not as the mandatory auto-expanding MA stop-gate requested.

## Multi-Tenant SaaS Layer

Status: never started to partially built.

- Clerk sign-in is present.
- Clerk organizations are not used in code (`useOrganization`/org workflows not found).
- Stripe checkout/products/billing are not implemented in repo code.
- Tenant onboarding wizard was not found.
- Tenant-isolated RLS cannot be verified locally.
- `enrollgen.com` deployment status cannot be verified from the local repo.

## Intelligence Layer

Status: partially built.

Present:

- Post-call pipeline in `src/lib/postCallPipeline.js`.
- Netlify functions: `post-call.js`, `score-call-background.js`, `compliance.js`, `embeddings.js`.
- Operations/CALLS dashboard in `OperationsTab.jsx`.
- Transcript upload/scoring and intent classifier modules.

Missing or not verified:

- Deepgram intelligence params are not enabled in `transcribe.js`.
- Only `sync-bulletins` is scheduled in `netlify.toml`; nightly analytics and weekly coaching digest crons were not found.
- Follow-up queue is only represented in Operations empty/count states, not a complete workflow.
- Carrier heatmap was not found as a functional dashboard.
- Backfill/rescore script exists, but no evidence it has run in hosted data.

## Session Tracking

Status: partially built.

Repo state:

- `supabase/migrations/001_session_tracking.sql` defines `enrolled_agents`, `sessions`, `compliance_flags`, and `section_scores`.
- RLS policies use Clerk JWT `sub`.
- `useSessionTracker.js` resolves/creates `enrolled_agents` with real `clerk_user_id`, not placeholder `"self"`.
- Diagnostic helper exists at `src/lib/sessionTrackingDiagnostic.js`.

Local fixes applied:

- Session tracking and call history now request Clerk's `supabase` JWT template.
- Med Sup, ACA, and U65 rails now call `startSession(flow)`/`endSession(...)` and pass `logComplianceFlag`.

Not locally verifiable:

- Whether migration `001_session_tracking.sql` was applied in hosted Supabase.
- Whether Clerk's Supabase JWT template is configured in the Clerk dashboard.
- Whether hosted RLS works with the deployed JWT claims.

## GHL Integration

Status: partially built.

- Outbound GHL webhook exists for enrolled MA/post-call outcomes through `postCallPipeline.js`.
- `post-call.js` stores webhook status/error fields.
- `SectionWrapUp.jsx` exposes webhook status.
- Inbound webhooks for Medicare intake, ACA intake, Moonshot 2030, Life insurance, and EnrollPrime were not found.
- Agent availability API is represented by a client component calling an external API; no internal Netlify API was found.
- Medigap Life transfer routing is not implemented beyond post-call product options.

## Build, Deploy, Git

Status: partially verified.

- `npm run lint` is clean after local fixes.
- `npm run build` is clean locally.
- Netlify deploy status is not locally verifiable.
- Local branch list only shows `main` and `origin/main`; requested feature branches were not present locally. Remote branch truth requires fetch/network verification.
- Existing unrelated dirty file: `.claude/settings.local.json`. It was not touched by this review.

## Implementation Roadmap

### Priority 1: Stabilize Current Runtime

Status: in progress.

- Finish build verification.
- Confirm Supabase migration application and Clerk JWT template in hosted services.
- Smoke-test all four rails locally through start/analyze/ask/end session.
- Verify RAG returns references for MA, ACA, Med Sup, and U65 where product-line data exists.

### Priority 2: Complete High-Impact Sales Tools

Status: not started to partial.

- Build Med Sup Plan Letter Lookup sidebar with standardized A/B/D/F/F-HD/G/G-HD/K/L/M/N matrix.
- Build MA drug formulary capture panel with session persistence and copilot context injection.
- Turn existing D-SNP/SNP routing assets into a mandatory MA plan-selection stop-gate when a D-SNP is selected.

### Priority 3: Complete ACA and U65 Spec Coverage

Status: partial.

- Bring ACA and U65 script content up to `docs/u65-aca-spec.md`.
- Add data-passing transitions between ACA and U65.
- Complete FPL/APTC/SEP calculators and checklist validation.

### Priority 4: Activate Intelligence and Evaluation

Status: partial.

- Enable Deepgram intelligence params only after validating cost and output shape.
- Run the rescore/eval loop against ingested recordings.
- Produce `docs/COMPLIANCE_EVAL.md` with before/after scores, false positives, and false negatives.
- Add scheduled analytics/digest jobs and verify Operations data.

### Priority 5: SaaS and AEP 2026 Layer

Status: not started to partial.

- Add Clerk organizations and agent profiles.
- Implement Stripe sandbox checkout and plan entitlements.
- Add admin view for Mike across agents.
- Add enrollment outcome tracking and dashboards by agent/carrier/week.
- Add SOA auto-generation and training mode after session/compliance data is stable.
