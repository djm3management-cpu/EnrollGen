# EnrollGen Full Codebase Audit

**Audit date:** August 14, 2026

**Scope:** The checked-out EnrollGen repository, including the React application, Netlify functions, the standalone telephony service, Supabase migrations and schema notes, data-loading utilities, and deployment configuration.

**Method:** Static code and schema tracing plus local build/lint/test execution. Hosted Supabase, Netlify, Railway, Twilio, Clerk, Stripe, Deepgram, GHL, and carrier-account state was not changed or queried; statements about production status are therefore limited to what the repository proves.

## Executive summary

EnrollGen is a substantial React/Vite insurance-sales workspace with guided scripts for Medicare Advantage, Medicare Supplement, ACA, under-65/private health, and four ancillary lines. It combines real-time call guidance, live deterministic compliance, post-call LLM compliance scoring, CRM, browser calling, SMS, post-call analytics, tenant configuration, and Stripe billing.

The repository contains a meaningful amount of production-grade implementation, but it is not a clean, self-contained deploy from migrations alone. The most important findings are:

- There are **five Co-Pilot hooks**, of which **four use Claude** and one—the annuity coach—is deterministic. The four LLM engines share a common scheduling/RAG core but have product-specific prompts and gate state.
- The advertised **“152-intent” compliance system is not actually a 152-intent canonical model**. The source defines 143 Medicare intents plus 24 annuity intents, or **167 total**. The UI obtains the number 152 by slicing a longer array to 152 entries, which exposes the 143 Medicare intents and only the first nine annuity intents. Nine additional UI-only runtime checks are appended after the 167 and are cut off entirely.
- The live compliance score is deterministic and continuously recomputed in the browser. Post-call intent detection is LLM-driven, but point calculation, sequence penalties, auto-fails, risk tiers, and corrective-action selection are deterministic.
- CRM migrations 017–029 provide a broad contacts/policies/follow-up/PII layer. However, key objects referenced by the dialer and messaging code—especially `v_call_log`, `messages`, `message_media`, and the `message-media` bucket—do not have migrations in this repository. Migration 020 is absent.
- Inbound Twilio calling has the deeper implementation: agent routing, recording, dual-track media streaming, two Deepgram channels, browser delivery, and voicemail fallback. Outbound calling is much thinner and does not have equivalent server-side streaming, recording association, or lifecycle logging.
- Multi-tenant data structures exist, but migration 028 deliberately removes organization isolation and the telephony server uses a fixed default tenant. The current system is therefore **architecturally tenant-aware but not securely multi-tenant-ready**.
- Stripe checkout, portal, webhook processing, subscription records, usage records, and server-side feature gates exist. The client `SubscriptionGate` is only a banner, however, and onboarding can continue without checkout.
- The local production build passes. ESLint currently fails with 31 errors, and the telephony package has no test script. Several substantial components are dormant or unreachable, including `OperationsTab`, the alternate `ContactDetail`, a demo mockup, and any calibration dashboard UI.

### Status vocabulary used in this audit

- **Implemented:** An end-to-end code path exists in the repository.
- **Partial:** A meaningful path exists, but an important dependency, branch, migration, or operational behavior is missing.
- **Dormant:** Substantial code exists but is not reachable from the current application shell.
- **Placeholder/reference:** UI copy, a link, stub, or configuration exists without an operating integration.
- **Externally unverifiable:** The repository has deployment/configuration code, but current hosted status is not provable locally.

## 1. Product and enrollment script flows

The top-level product selector exposes five primary script destinations:

| Primary flow | Route | Current script shape | Co-Pilot |
|---|---|---:|---|
| Medicare Advantage (MA) | `/` | 8 nominal sections, plus conditional SNP disclosure and pre-enrollment sub-gates | LLM |
| ACA | `/script/aca` | 7 gates for FFM or 7 gates for state-based marketplace | LLM |
| Medicare Supplement | `/script/medsup` | 7 gates | LLM |
| U65 / private health | `/script/u65` | 5 individual screens or 4 small-business screens | LLM, but state contract is stale |
| Ancillary | `/script/ancillary` | Selector for HIP, Final Expense, DVH, and Annuity | Deterministic only for annuity |

### 1.1 Medicare Advantage

The MA script is the most developed flow. It has eight nominal sections:

| # | Section | Gate/required state | Notable behavior |
|---:|---|---|---|
| 1 | Recording | `recordingOk`; compliance-locked | Captures the call-recording disclosure/permission. Dual-speaker transcript evidence can satisfy acknowledgment-related checks. |
| 2 | TPMO and federal contracting | `tpmoOk`; compliance-locked | Requires the TPMO disclaimer and contracting language. |
| 2.5 | SNP disclosure | `snpOk`; conditional | Appears when DSNP or CSNP is selected. It is a virtual section between TPMO and POA/SOA. |
| 3 | Permission to Contact / Scope of Appointment | `soaOk`; compliance-locked | Captures POA/SOA scope and timing. |
| 4 | Qualifications | `qualOk` | Covers Medicare eligibility and qualification facts. |
| 5 | NEADS discovery | `neadsOk` | Needs, eligibility context, doctors, prescriptions, priorities, and related discovery. |
| 6 | Plan Selection and Summary of Benefits | `sobOk` | Requires premium, deductible, maximum out-of-pocket, network, prescriptions, referrals, extras, and limitations. |
| 7 | Enrollment | `enrollOk`; compliance-locked | Includes enrollment permission, PII, plan confirmation, submission, and pre-enrollment checklist completion. |
| 8 | Wrap-up | No hard gate | Confirmation, next steps, contact information, and cross-sell/follow-up cues. |

The pre-enrollment checklist separately verifies providers, prescriptions, estimated costs, MOOP, plan rules, and impact on existing coverage. MA state is scored by both the live deterministic compliance worker and the MA Co-Pilot.

The MA Co-Pilot:

- Watches final transcript segments, section entry, checklist/gate state, and recent coaching.
- Produces silent/info/tip/remind/warn/critical coaching and a per-section score.
- Uses customer-side transcript when dual audio is available; otherwise it explicitly avoids inferring customer acknowledgment from agent-only text.
- Injects CMS/plan context, product-specific compliance knowledge, RAG call references, and optional tenant-customized script text.
- Can automatically populate plan-context notes unless the agent has manually overridden them.

Carrier/product-specific behavior includes:

- Carrier quick-reference matching for **Devoted, Humana, Aetna, UnitedHealthcare, Anthem/Elevance/Wellpoint, Braven, Clover, Zing, Cigna/HealthSpring, and Wellcare**.
- The quick-reference popup is driven by explicit enrollment-intent utterances and shows carrier-specific operational guidance from local profiles.
- DSNP/CSNP assets, SEP qualification, county/plan data, and carrier-verification tables support routing and plan research.
- The script provides official portal/reference links, but it does not submit an enrollment to a carrier API.
- Ancillary cross-sell coaching changes by MA stage: identify gaps during discovery, plant the seed during SOB, transition after enrollment, recap/last chance at wrap-up, and create a 14-day follow-up. GTL hospital/critical-illness and Delta Dental resources are referenced.

### 1.2 Medicare Supplement

Med Sup has seven sections/gates:

1. Recording.
2. TPMO disclosure.
3. Qualification.
4. Discovery.
5. Quote transition.
6. Close/enrollment.
7. Wrap-up.

Its Co-Pilot uses the common LLM core but a Med Sup compliance and sales prompt. It emphasizes eligibility, health/rate context, quote positioning, disclosure completeness, and enrollment readiness. The right/left supporting workspace includes:

- Rate comparison.
- Plan G/high-deductible Plan G combination analysis.
- State excess-charge rules.
- Birthday-rule and guaranteed-issue state information.
- Carrier profiles and a product sales forum.
- Mutual of Omaha and Wellabe differentiator content in the rate comparison path.

The CSG connection is **partial/placeholder**. `VITE_CSG_API_URL` and `VITE_CSG_API_KEY` are supported, but the UI says credentials are pending and falls back to manually entered/local rate data. Because a `VITE_` key is included in browser code, any configured CSG key is delivered to the client and should not be treated as a secret.

### 1.3 ACA

ACA supports two seven-gate variants selected inside the flow.

**Federally Facilitated Marketplace (FFM):**

1. Opening and identity.
2. Special Enrollment Period; skipped conditionally during Open Enrollment.
3. Household, income, and subsidy eligibility.
4. Needs and plan preferences.
5. Plan presentation.
6. Enrollment submission.
7. Closing and follow-up.

**State-based marketplace:**

1. Opening and current-coverage screening.
2. ZIP, date of birth, and household.
3. Income/FPL.
4. Doctors, prescriptions, and needs.
5. Plan review and selection.
6. Selection/login handoff.
7. Wrap-up/application readiness.

The ACA Co-Pilot uses the common engine with a longer response budget than MA/Med Sup/U65. It receives marketplace mode, benchmark/plan context, subsidy and household state, exact gate data, transcript windows, and retrieved references. It coaches missing qualification facts, marketplace disclosures, plan-presentation completeness, enrollment consent, and the correct next step. Carrier-reference matching is also available, but there is no carrier or marketplace enrollment-submission API.

The ACA client-information rail captures the application facts used in the script. FPL/benchmark and QHP datasets are represented in data utilities and Supabase access code; some of those datasets are installed by manual scripts rather than versioned migrations.

### 1.4 U65 / private health

U65 currently contains two different flows.

**Individual flow — five screens:**

1. Open and qualify.
2. Discovery.
3. Health and confirm.
4. Present, select, and add-on.
5. Enroll and close.

**Small-business flow — four screens:**

1. Connect and establish the situation.
2. Problem and consequence.
3. Direction and close.
4. Census capture.

The surrounding tools include a private-plan rail, an underwriting checker, eligibility/presentation guidance, and recommendation logic that can route toward PALIC, EnrollPrime, or an ACA pivot based on risk.

There is a material implementation mismatch: `useU65CopilotEngine` still expects the prior eight-gate contract (`gate0Ok` through `gate7Ok`) and calculates eight gate scores, while the current script exposes five individual screen states or four small-business gate states. This makes current U65 gate context and scoring unreliable or undefined. The database template history also reflects older U65 shapes, so UI, prompt, and stored-template content are not aligned.

Product vocabulary has also drifted:

- Current screen data references MedPerformance, MedMax, and MedAccess MVP/EnrollPrime-style tiers.
- Recommendation logic names PALIC and EnrollPrime.
- Compliance knowledge says the two products are EnrollPrime/AFI PPO and PALIC HSP Gold.

This should be reconciled before treating U65 recommendations as controlled product guidance. EnrollPrime is currently a playbook, URL, portal/reference, and product label—not an API integration.

### 1.5 Ancillary selector

The ancillary destination contains four subflows:

| Subflow | Sections | Implementation notes |
|---|---:|---|
| Hospital Indemnity (HIP) | 5 | Intro/transition; need build; present options; riders; close. |
| Final Expense (FE) | 1 | A single monolithic script covering qualification, need, presentation, and close. |
| Dental/Vision/Hearing (DVH) | 5 | Fact find; need build; present; waiting-period disclosures; close. |
| Annuity | 8 | Opening/recording; purpose/permission; suitability; education/recommendation; rate/comparison; best-interest disclosures; application/funding; wrap-up. |

#### Hospital Indemnity

HIP provides scripted step guidance and targeted callouts but no LLM Co-Pilot. Mutual of Omaha logic is the only explicit carrier-specific path: ages 64–74 can be guaranteed issue/no health questions; all riders must be selected at issue because they cannot be added later; and the MA observation-stay exposure must be explained. The rider bundle loads the Mutual of Omaha carrier profile.

#### Final Expense

Final Expense is a single guided flow. It qualifies age 50–80, bank/account/budget readiness, and recent applications before presenting/closing. Mutual of Omaha appears in marketing/reference content, but there is no carrier API or automated underwriting submission.

#### Dental/Vision/Hearing

DVH is a five-step scripted sale with explicit waiting-period disclosure. It has customer/product supporting panels, not an LLM Co-Pilot or carrier API.

#### Annuity

Annuity is the most compliance-heavy ancillary flow. Its eight steps include a hard suitability intake, NAIC Model Regulation 275 best-interest concepts, replacement/1035 exchange review, liquidity and surrender-period analysis, free-look disclosure, and application/funding confirmation. It contains both inbound and outbound script variants.

The annuity coach is deterministic. Its risk precedence is:

1. Liquidity need above 50%.
2. Customer younger than 59½.
3. Customer older than 85.
4. Replacement/1035 exchange.
5. Otherwise, current-step guidance and gate status.

Assurity Life appears in example/reference copy, but the script explicitly tells the agent to verify current minimums, issue ages, rates, surrender schedules, and product rules. No live annuity carrier API is present.

## 2. Co-Pilot engines

### 2.1 Engine count and coverage

There are five product Co-Pilot hooks:

| Engine | Flow | Type | Shared LLM core |
|---|---|---|---|
| `useCopilotEngine` | MA | Claude/RAG | Yes |
| `useACACopilotEngine` | ACA | Claude/RAG | Yes |
| `useMedSupCopilotEngine` | Med Sup | Claude/RAG | Yes |
| `useU65CopilotEngine` | U65 | Claude/RAG | Yes |
| `useAnnuityCopilotEngine` | Annuity | Deterministic rules | No |

HIP, FE, and DVH have scripted guidance/callouts, but they do not have dedicated Co-Pilot engines.

### 2.2 Shared LLM scheduling and coaching triggers

The four LLM engines use `useCopilotEngineCore`. Coaching can run from:

- Final speech/transcript chunks after debounce and minimum-new-text checks.
- Entry into a script section, after a delayed first analysis when transcript exists.
- A 90-second periodic check, but only when the context signature changed.
- Manual **Analyze**.
- Agent questions in Q&A mode.
- Checklist/gate transitions incorporated into the context signature.

The core also provides an eight-second silent heartbeat, request cancellation, duplicate-intervention suppression, recent-intervention memory, and cooldown/settling behavior.

Current product tuning is:

| Flow | Debounce | Minimum new transcript | Settle/cooldown | Warning score floor | Reminder floor |
|---|---:|---:|---:|---:|---:|
| MA | 6 seconds | 80 characters | 45 seconds | 85% | 75% |
| ACA | 6 seconds | 80 characters | 45 seconds | 85% | 75% |
| Med Sup | 4 seconds | 40 characters | 6 seconds | 72% | 68% |
| U65 | 4 seconds | 40 characters | 6 seconds | 70% | 65% |

Very short/meaningless transcript chunks are ignored; otherwise the shared core uses a short settling debounce before product-specific rules are applied.

### 2.3 Model routing

All four LLM coaches call `/.netlify/functions/coach`. That server function is hardcoded to **Anthropic `claude-sonnet-4-6`** and requires:

- Valid Clerk authentication.
- An active subscription.
- The Pro plan.
- Available configured credentials and an upstream response within the server timeout.

The normal output budget is 220 tokens for MA, Med Sup, and U65 and 500 for ACA. Q&A uses 300 tokens for MA, Med Sup, and U65 and 500 for ACA. Token use is logged to subscription usage records.

### 2.4 Prompt structure

Although content differs by product, the LLM prompts follow the same architecture:

1. **Role and non-negotiable behavior:** product-specialist role, compliance priority, brevity, no hallucinated acknowledgment, and no redundant coaching.
2. **Current location:** active section/gate, ordered flow map, and valid next steps.
3. **Structured compliance knowledge:** exact required disclosures, acceptable/verbatim phrases, common mistakes, critical omissions, red flags, and scoring signals.
4. **Current state:** JSON-serialized gates, checklists, timestamps, completed sections, detected signals, product/customer context, and recent interventions.
5. **Transcript evidence:** rolling transcript, current-section transcript, new delta, and for MA, separated customer/agent evidence when available.
6. **Retrieved knowledge:** RAG references from prior call/transcript chunks, with source labels used by Q&A answers.
7. **Product-specific context:** CMS/plan context and optional tenant script for MA; marketplace and plan/subsidy context for ACA; Med Sup rate/rule context; U65 underwriting/product context.
8. **Strict result contract:** JSON containing `level`, `issue_tag`, `confidence`, and `message`, where the implemented level set includes `silent`, `info`, `tip`, `remind`, `warn`, and `critical` (the normal MA prompt omits `info` from its displayed schema even though section-entry handling requests it).

Q&A mode asks the model to answer the agent rather than score the section and instructs it to cite retrieved items as `[R1]`, `[R2]`, and so on.

MA has the clearest dual-audio handling. ACA, Med Sup, and U65 prompt language is still largely agent-transcript-oriented, even though telephony can produce speaker-separated text.

### 2.5 Co-Pilot persistence

Warnings, reminders, and critical messages can be written to session/compliance records when a compatible session exists. MA, Med Sup, ACA, and U65 have session provider support; ancillary is not included in the session-flow constraint, and its deterministic annuity coach does not use the shared LLM logging path.

## 3. Compliance engine

EnrollGen has two complementary compliance systems: live deterministic feedback during a call and post-call LLM intent detection followed by deterministic scoring.

### 3.1 Live deterministic compliance

`TranscriptAnalyzer` and `ComplianceScorer` run in a browser worker and continuously recompute as transcript or script state changes. This path does **not** use an LLM.

It evaluates nine categories and 33 scored questions:

| Live category | Weight |
|---|---:|
| Call Opening | 10% |
| Required Disclosures | 15% |
| Scope of Appointment | 12% |
| Eligibility | 15% |
| Needs Assessment | 10% |
| Presentation / Summary of Benefits | 13% |
| Consent / Enrollment | 10% |
| Call Closing | 10% |
| Consumer Experience | 5% |

Evidence comes from two layers:

- Explicit UI gates/checklists and script state.
- More than 150 deterministic regular-expression/phrase detectors over transcript text.

The higher valid evidence score is used, while violations override positive evidence. When speaker-separated text is available, customer acknowledgment can be merged with agent language for recording and enrollment consent checks.

### 3.2 The “152 intent” discrepancy

The repository does not contain one coherent 152-intent catalog:

| Set | Count | Explanation |
|---|---:|---|
| Core Medicare compliance intents | 143 | Canonical `COMPLIANCE_INTENTS`; also the count seeded by the compliance SQL. |
| Annuity best-interest intents | 24 | Additional annuity catalog. |
| Canonical total | **167** | `ALL_INTENTS`. |
| UI runtime checks | 9 | Added by the accordion after `ALL_INTENTS`. |
| Accordion display | **152** | The combined array is forcibly truncated with `.slice(0, 152)`. |

Consequently, the UI's 152 rows are the 143 core Medicare intents plus only the first nine annuity intents. The remaining 15 annuity intents and all nine runtime checks are absent from that display. The “152” label should not be treated as the scoring engine's canonical intent count.

### 3.3 Canonical post-call intent categories

The full source catalog is:

| Category | Intents | Required | Auto-fail | Sequence-aware |
|---|---:|---:|---:|---:|
| Call Opening | 15 | 10 | 5 | 15 |
| SOA Verification | 8 | 4 | 3 | 6 |
| Eligibility Verification | 12 | 10 | 0 | 10 |
| Needs Assessment | 19 | 12 | 0 | 19 |
| Plan Presentation | 30 | 20 | 5 | 25 |
| Impact on Current Coverage | 9 | 9 | 2 | 9 |
| Pre-Enrollment Checklist | 15 | 15 | 1 | 15 |
| Enrollment Closing | 13 | 13 | 4 | 11 |
| Sales Conduct | 15 | 3 | 0 | 0 |
| Call Recording Compliance | 7 | 3 | 2 | 0 |
| **Core Medicare subtotal** | **143** | **99** | **22** | **110** |
| Annuity Best Interest | 24 | 11 | 6 | 8 |
| **Canonical total** | **167** | **110** | **28** | **118** |

Metadata also assigns category weights/max points—Opening 0.15/30, SOA 0.08/16, Eligibility 0.10/20, Needs 0.14/28, Presentation 0.15/30, Current Coverage 0.10/20, Pre-Enrollment 0.12/24, Closing 0.08/16, Conduct 0.06/12, Recording 0.02/4, and Annuity 1.0/100. Actual persisted score math uses `scoring_template_items.points_possible`; the metadata object is not the final point source.

### 3.4 Post-call classification and scoring

Post-call scoring is a hybrid pipeline:

1. **Deterministic call direction:** the first 60 seconds are inspected. Outbound requires at least two outbound indicators and more outbound than inbound indicators; otherwise direction defaults to inbound. Direction-inapplicable intents become N/A.
2. **Transcript preparation:** the diarized transcript is PHI-redacted and split into 45-second windows with 15-second overlap (30-second step).
3. **LLM detection:** `score-call-background` sends applicable intent definitions and transcript segments to Claude. Although comments call this category batching, the current request shape includes all applicable intents for each segment. The highest-confidence evidence per intent is retained.
4. **Deterministic validation:** missing evidence and anti-patterns fail; ordering is checked using timestamps; direction-inapplicable rules are excluded.
5. **Deterministic points:** confidence at or above 0.90 receives full points unless a sequence violation reduces it to half; 0.70–0.89 receives full points; 0.50–0.69 receives half; below 0.50 fails. Auto-fails are separately recorded.
6. **Deterministic risk:** the overall score is earned/possible points with an 85 default pass threshold. Critical means auto-fail or score below 60; high means score below 70 or more than three sequence violations; medium means score below 85 or more than one sequence violation.
7. **Corrective actions:** failures are grouped into coaching/remediation buckets and persisted with the scorecard.

Calls under 120 seconds are treated as insufficient and intents are marked N/A rather than being fully scored.

### 3.5 Models and execution mode

- Live compliance: deterministic, continuous, browser worker, no model.
- Co-Pilot compliance coaching: real-time-ish/debounced Claude calls through `coach`.
- Post-call intent detection: asynchronous/background Claude **`claude-sonnet-4-6`**, with an 8,192-token output ceiling and a 120-second upstream timeout.
- Post-call behavioral assessment: a separate LLM step in `ScorecardGenerator` creates agent/beneficiary assessments for suitable calls, then updates agent profiles and the analytics follow-up queue.

The `post-call` handler schedules background scoring, while `compliance.js` exposes read/administration routes for calls, scorecards, detections, overrides, templates, dashboard data, corrective actions, calibration runs/overrides, recalculation, and agents. Its direct `/calls/:id/score` route does not synchronously score a call; it directs callers to the background path.

### 3.6 Calibration

Calibration tables and API endpoints exist for runs and overrides. There is no routed calibration dashboard component in the current React application. Calibration is therefore a backend/data capability without a complete operator UI.

## 4. CRM and data model

### 4.1 CRM experience

The active CRM contacts home is a three-panel workspace:

- **Left:** contact list, unread/all/recent filters, search, create, CSV import, and conversation unread state.
- **Center:** Conversations, Activity, and Notes tabs.
- **Right:** All Fields, DND, and Actions, including contact/intelligence/policy/follow-up information and call initiation.

Opening a contact loads protected PII through audited functions. The current implementation automatically decrypts available PII when the record is opened; there is no separate “reveal” confirmation.

There is also an alternate, richer `ContactDetail.jsx` with overview/messages and conversations/activity/notes/calls organization, but it is not imported by the live app and is dormant.

### 4.2 Core CRM schemas from migration 017

#### `contacts`

Core identity and routing fields:

- `id`, `tenant_id`, `first_name`, `last_name`.
- E.164 `phone`, unique per tenant; `email`, `dob`.
- `zip`, `county`, `state`; migration 021 later adds one `address` text field.
- `mbi_last4`.
- `medicare_parts`: `none`, `a`, `b`, or `ab`.
- `current_carrier`, `current_plan`.
- `status`: `lead`, `client`, or `former`.
- `source`: `fmo_transfer`, `tms`, `manual`, or `ghl_import`.
- `assigned_agent_id`, `do_not_call`, `ghl_contact_id`, `created_at`, `updated_at`.

The tenant/phone uniqueness rule is the main deduplication anchor.

#### `contact_lead_intel`

- `contact_id` relationship.
- Raw vendor payload as JSONB.
- `lead_score`, `churn_risk`, `vendor_source`, `received_at`, `created_at`, and `updated_at`.

#### `contact_notes`

- Contact/tenant association.
- Note body, pin state, agent identity, and timestamps.

#### `contact_activities`

- `id`, `tenant_id`, and `contact_id`.
- `type`, constrained to `call`, `enrollment`, `note`, `status_change`, or `follow_up`.
- `ref_id`, `summary`, `occurred_at`, `created_at`, and `updated_at`.

#### `policies`

- Contact/tenant association.
- Carrier, plan/name/identifier.
- Product constrained to `MA`, `MS`, `ACA`, `U65`, or `ANC`.
- Effective date.
- Status: `pending`, `active`, `lapsed`, or `cancelled`.
- Writing agent and timestamps.

#### `follow_ups`

- `id`, `tenant_id`, and `contact_id`.
- `agent_id`, `due_at`, and `reason`.
- `status`: `open`, `done`, or `cancelled`.
- `created_at` and `updated_at`; there is no separate completion timestamp in migration 017.

Migration 017 also links `call_records.contact_id` and `sessions.contact_id`, adds indexes/triggers, and applies tenant-oriented RLS policies.

There are two distinct follow-up stores: CRM `follow_ups` for contact work and analytics `followup_queue` for generated post-call actions. They are not one unified queue.

### 4.3 Migrations 018–029

| Migration | What it adds/changes | Audit note |
|---|---|---|
| 018 | `inbound_calls`, `telephony_events`, and `call-recordings` storage | Foundation for inbound routing, event history, and recordings. |
| 019 | Seeds/updates the agent availability roster | Does **not** create `agent_availability`; it raises if that remote-only table is missing. Adds Mark and Dylan, removes Miguel, and deactivates a tenant agent. |
| 020 | **Absent** | Several UI errors/comments expect it, but no file exists. |
| 021 | Contact address fields | Extends contact profile/address storage. |
| 022 | PII protection phase 1 | Adds PII vault metadata, encrypted JSON, blind indexes, initials/last-four helpers, access logging, decrypt/search functions. Uses pgcrypto PGP AES-256 with MDC; code comments explicitly note this is not AES-GCM. Plaintext is retained during the staged migration. |
| 023 | PII column restrictions/phase 2 | Revokes ordinary column access, adds safe flags such as `email_set`/`dob_set`, secure phone matching and audit helpers. Decryption is restricted to admins or the assigned agent; shared lists are masked. |
| 024 | MBI last four exception | Removes `mbi_last4` from the encrypted blob and keeps last four available as non-full-PII metadata. |
| 025 | Full MBI/SSN write-only fields | Adds encrypted write-only `mbi_full`/`ssn`, audit and last-four synchronization behavior. |
| 026 | Mike admin seed/update | Adds/updates the named admin agent record. |
| 027 | Call outcome taxonomy | Expands outcomes across enrollment, positive, negative, unreachable, concern, system, and legacy categories. |
| 028 | Removes organization gating | Allows any authenticated user to access any existing tenant/settings row. This intentionally removes the previous tenant security boundary. |
| 029 | `carrier_rts` | Carrier ready-to-sell status, realtime publication, update trigger, public read, and own/admin update policies. |

## 5. Telephony

### 5.1 Service architecture

Telephony is a standalone Node/Express service under `telephony/`, packaged with a Dockerfile and Railway configuration. It is designed for a persistent server because it owns Twilio webhooks and WebSocket connections. Railway configuration includes a health check and restart-on-failure policy. Whether a Railway service is presently deployed and healthy is externally unverifiable from the repository.

### 5.2 Inbound calling

Inbound flow is the most complete:

1. Twilio calls the signed `/twilio/voice` webhook.
2. The service normalizes the caller, finds or creates a contact, and claims the longest-available agent atomically from `agent_availability`.
3. It creates an `inbound_calls` record, logs telephony/contact activity, and dials the selected browser Voice SDK client.
4. TwiML starts a `both_tracks` media stream and call recording.
5. If the browser agent cannot be reached, the route can move through failure/reroute behavior and voicemail fallback.
6. Status and recording callbacks update the call, download WAV content with Twilio credentials, upload it to the `call-recordings` bucket, and persist the storage reference.

The browser integration is controlled by `VITE_INBOUND_CALLS_ENABLED` and the telephony URL. It requests a one-hour Twilio access token with Clerk authentication, toggles availability, receives incoming calls, and connects to a separately signed agent WebSocket.

An accepted inbound call currently forces the **MA call cockpit**, regardless of the contact's likely product. There is no product-aware inbound router.

### 5.3 Dual-audio Deepgram pipeline

For inbound calls, Twilio sends inbound and outbound tracks over the media WebSocket. The server opens two Deepgram WebSockets—one for the customer/inbound track and one for the agent/outbound track—using `nova-2`, 8 kHz mu-law settings and interim/final transcription. It forwards speaker-tagged transcript events and a customer RMS audio level to the browser agent channel.

The browser also has a `useCustomerAudio` path that can transcribe the remote MediaStream through Deepgram when enabled. Because the server already transcribes both Twilio tracks, enabling the browser customer pipeline on the same telephony call may duplicate customer text and Deepgram usage unless deduplicated by deployment configuration.

### 5.4 Outbound calling

Outbound calls can be initiated from the browser through the Twilio Voice SDK. The server's `/api/voice/outbound` TwiML simply dials the destination with the configured caller ID; it does not establish the same media stream, recording callbacks, `inbound_calls` association, or full server lifecycle as inbound.

The UI can still enter MA cockpit mode and the post-call client path can create a `call_records` row, but outbound call recording, dual-track server transcription, and authoritative status logging are **partial** compared with inbound.

Mute is real microphone muting. “Hold” is effectively another microphone-mute state, not a Twilio hold operation. Transfer behavior is not implemented as a complete Twilio call transfer.

### 5.5 Tenancy and security notes

- Telephony defaults to one configured `DEFAULT_TENANT_ID`; routing is not organization-aware.
- Twilio request signature validation exists for voice/SMS webhooks.
- Agent WebSocket tickets are signed and short-lived.
- The default CORS configuration is `*` if not overridden.
- Availability depends on a table not created by repository migrations.

### 5.6 A2P 10DLC

The repository contains working SMS webhook/send/status code, but it contains no Twilio brand registration, campaign registration, messaging service SID, trust-hub provisioning, or A2P status artifact. Therefore A2P 10DLC is **not evidenced as complete**. Its live status is unknown and must be checked in the Twilio account.

## 6. Dialer, call logs, and SMS

### 6.1 Dialer

The phone dropdown exposes:

- Recents.
- Contacts.
- Keypad.
- Voicemail.
- Queue.

Contacts can be selected and called through the Twilio browser device. The live-call store provides timer/billable-duration concepts, but its `startCall` path is not called by the normal production flow; the only direct call found is a development keyboard shortcut. Real calls therefore rely on fallback state rather than a fully integrated `call_logs` lifecycle.

### 6.2 Call log system

The Calls tab and dialer Recents query `v_call_log`. No repository migration defines that view, and the Call Log error copy asks whether migration 020 has been run even though migration 020 is absent. In a database built solely from this repo, the call list will fail with a missing relation/API 404.

Where the view exists remotely, the call log supports:

- Outcome updates using the expanded taxonomy.
- Contact linking.
- Opening the Compliance Hub.
- Call detail tabs for Transcript, Analytics, Assessment, and Compliance.
- Compliance rescoring/review and override workflows.

There are two overlapping call stores: older `call_logs` for timer/outcome rows and richer post-call `call_records`/scorecard/analytics data. `v_call_log` appears intended to normalize them, but its definition is missing.

### 6.3 SMS and text

The telephony service implements inbound and outbound SMS/MMS:

- Twilio signature validation.
- Clerk-authenticated outbound send.
- DNC enforcement.
- Content validation that blocks SSN, full MBI, and full date of birth.
- MMS metadata/media storage.
- Delivery-status callbacks.
- Browser WebSocket notifications plus polling/unread behavior.

However, no migrations create `messages`, `message_media`, or the `message-media` storage bucket. There are also two clean-schema incompatibilities:

- Inbound SMS tries to create contact source `sms_inbound`, which violates migration 017's allowed contact sources.
- It tries to insert contact activity type `sms`, which violates migration 017's activity-type constraint.

Thus SMS is **code-complete in shape but not deployable from the checked-in schema** without an unversioned remote migration or additional repair.

## 7. User interface inventory

### 7.1 Application shell and navigation

The application uses internal state/history handling rather than React Router. The active top-bar tabs vary by product:

- Script: all modes.
- Agent Tools: MA and ACA.
- Intelligence: MA.
- ACA Intelligence: ACA.
- Calls: all modes.
- Contacts: all modes.
- RTS: all modes.
- Daily Verse: all modes.
- Admin/settings gear.

The Compliance Hub was removed from the top-level tab set and is opened from Calls/call details. A session-lock overlay prevents competing active call sessions.

### 7.2 Script workspaces

- **MA:** central script, SEP qualifier left rail, Co-Pilot/transcript/compliance right rail, plan/carrier/SNP supporting dialogs.
- **Med Sup:** script with the Sales Forum/rate/rules/carrier workspace.
- **ACA:** script with client-information rail, marketplace/plan context, and ACA Co-Pilot.
- **U65:** individual/small-business selector, private-plan rail, underwriting checker, and Co-Pilot.
- **Ancillary:** product selector, customer context, product/dental panels, scripted guidance, and annuity coach.

### 7.3 Agent Tools and intelligence

Agent Tools includes MA SEP material, a 2026 SEP guide, an off-market 30-question quiz, a MedMax 20-question scenario quiz, official regulations/CMS references, citizenship/immigration document images and field guide, admin script editing, eligibility links, carrier portals, and carrier quick reference.

MA Intelligence includes ZIP/county/state SEP lookup, plan and bulletin data, FEMA-related qualification context, maps/stats, and carrier reference. ACA Intelligence includes QHP/plan-landscape and knowledge-update material.

### 7.4 CRM conversations view

The active contacts screen is the three-panel view described in section 4: searchable/filterable contacts, center conversation/activity/notes tabs, and right-side fields/DND/actions. It is the CRM home rather than a separate dashboard.

### 7.5 Call cockpit mode

Starting or accepting a call switches the shell into the call workspace, exposes call controls and transcript/coaching surfaces, and ultimately opens post-call processing. Current inbound and outbound entry points force MA rather than selecting a product from contact context.

### 7.6 Compliance dashboard

MA has the fullest live compliance UI: the intent accordion labeled 152, the continuously updated compliance dashboard, transcript evidence, per-category scoring, and coaching. Calls can also open the post-call Compliance Hub with transcript, analytics, assessment, and formal scorecard evidence/overrides. Med Sup additionally has a transcript-upload entry point.

### 7.7 Calibration dashboard

No routed calibration dashboard exists. Only calibration tables and API routes were found.

### 7.8 Demo tab

No live Demo tab exists. A v3 mockup is stored under `docs/enrollgen-v3-mockup.jsx`, but it is not part of the active application.

### 7.9 Other views and dormant UI

- **RTS:** realtime ready-to-sell grid with channels/groups for SMS/Medigap Life, Savoy/RPS, EnrollPrime/O'Neill, attention states, and carrier appointment status.
- **Daily Verse:** devotional/Biblia-powered view.
- **Admin settings:** agency profile/states, GHL webhook URL/test/location, agents/seats, carriers, co-op rates, compliance thresholds/sliders, and billing.
- **Onboarding:** Welcome, Agents, CRM, Plan, and Ready steps for organizations without a bootstrapped tenant.
- **OperationsTab:** a substantial live-monitor/calls/enrollments/webhooks/follow-ups/analytics component, but it is not imported or routed and is dormant.
- **ContactDetail:** a second substantial contact-detail experience that is also unreferenced/dormant.

## 8. Authentication, roles, and tenant readiness

### 8.1 Clerk setup

The provider order is authentication, theme, Co-Pilot log, then live call. Clerk can be disabled with `VITE_DISABLE_CLERK_AUTH`; otherwise a missing publishable key shows a setup screen. Signed-out users see the landing/login experience, and signed-in users enter tenant/subscription bootstrap.

The code uses Clerk user metadata and the first organization membership role to derive admin access. `useOrganization` drives tenant bootstrap and onboarding. Netlify functions validate Clerk bearer tokens and, for sensitive paths, subscription/seat/admin state.

### 8.2 Roles

Roles are represented across:

- Clerk public/private metadata.
- Organization membership role.
- `tenant_agents`/agent slugs and active seats.
- Supabase PII functions that distinguish admin from assigned agent.
- Feature-specific server checks such as Pro-only coaching/webhook use.

The role model is functional but distributed; Clerk, tenant-agent records, and database policies must remain synchronized.

### 8.3 Multi-tenant readiness

The system has tenant IDs throughout tables, tenant settings, tenant agents, subscription rows, per-tenant scripts, and tenant-scoped CRM schema. That is a solid structural foundation.

It is not currently safe to call the deployment fully multi-tenant-ready because:

- Migration 028 permits any authenticated user to access any existing tenant and tenant settings.
- Telephony routes all calls through one configured default tenant.
- Agent identity and availability are slug/config-driven rather than organization-routed.
- Some tables/functions are remotely assumed rather than consistently migrated with tenant policies.

The current posture is best described as **single-tenant operating mode on a tenant-aware schema**.

### 8.4 Theme setup

`ThemeProvider` is currently placed correctly above authenticated app content. It defaults to dark, persists locally, and attempts to sync `user_preferences` through the Supabase Clerk JWT. Missing table/token failures are caught and logged as warnings; `useTheme` only throws if a component is genuinely mounted outside the provider. A current provider-order crash was not reproduced in static tracing or the build.

Authenticated application CSS is loaded through `AuthenticatedStyleGate`, including `styles.css`, v3 overrides, and phone styles. This preserves the site's established visual system but creates a large lazy CSS chunk and can produce a brief style-loading transition.

## 9. External integrations

### 9.1 GoHighLevel (GHL)

GHL is an outbound webhook integration, not a two-way CRM sync. After an enrolled call, the Pro-gated path can POST JSON to a tenant-configured HTTPS webhook. Payload fields cover contact identity, DOB/phone/email/state, Medicare identifiers/status, previous/new carrier, enrollment and premium data, Sunfire/effective/60-day fields, SEP, agency/AOR, assigned GHL user, and HRA context.

The test function requires Clerk auth/admin/organization context, validates HTTPS and blocks private hosts. Migration history removes the earlier GHL sync-log/contact-link layer while retaining webhook status fields/views. There is no inbound GHL webhook, REST client, OAuth connection, or bidirectional conflict handling.

### 9.2 EnrollPrime

EnrollPrime appears in U65 product guidance, RTS grouping, portal URLs, training/compliance copy, and enrollment references. No EnrollPrime API client, credential exchange, quote request, application submission, or webhook consumer exists. It is a manual external-system handoff.

### 9.3 Carrier and quoting connections

- No live MA, ACA, U65, ancillary, or annuity carrier enrollment API exists.
- Carrier profiles/quick references, portals, and local data drive guidance.
- Med Sup has a CSG URL/key client stub, but credentials/integration are not established by the repository.
- CMS/marketplace data is read from Supabase datasets or official links rather than an end-to-end enrollment API.
- `cms-plans.js` expects `zip_county` and `ma_plans`, but those tables are not created by repository migrations and differ from the `cms_plans_PY2026` dataset used elsewhere.

### 9.4 CSV contact import

The CRM CSV importer is implemented with PapaParse and supports:

- Header mapping and preview.
- Required phone validation and E.164 normalization.
- DOB, email, and state normalization.
- Duplicate detection inside the file.
- Secure database matching by phone.
- Batched writes of 100 rows.
- Fill-empty-fields behavior rather than destructive overwrite.
- Abort handling and exportable skipped/error results.

It is suitable for GHL-style exports but is a generic CSV importer, not a GHL API sync.

### 9.5 Other external data/services

- Deepgram for live and batch transcription/intelligence.
- Anthropic for Co-Pilot and compliance/assessment text generation.
- OpenAI `text-embedding-3-small` for 1,536-dimension RAG embeddings.
- Google Drive API for reference MP3 listing.
- Biblia for Daily Verse content.
- CMS/FEMA/marketplace datasets and official reference links.

## 10. Infrastructure

### 10.1 Frontend and hosting shape

- React 19 + Vite single-page client.
- Netlify functions for authenticated serverless work and scheduled jobs.
- Supabase Postgres, Storage, RLS, RPCs, and realtime publication.
- Separate Railway-compatible Node service for Twilio webhooks/WebSockets.
- Clerk authentication/organizations.
- Stripe billing.

### 10.2 Supabase table groups

**Compliance:** `compliance_intents`, `scoring_templates`, `scoring_template_items`, `call_records`, `intent_detections`, `compliance_scorecards`, `scorecard_items`, `corrective_actions`, `call_threads`, `agent_compliance_profiles`, `phi_redactions`, `calibration_runs`, `calibration_overrides`, `autoresearch_iterations`.

**Sessions and sales:** `enrolled_agents`, `sessions`, `compliance_flags`, `section_scores`, `sales_log`, `call_logs`, `training_completions`.

**Tenant and billing:** `tenants`, `tenant_agents`, `subscriptions`, `usage_records`, `user_preferences`, `script_templates`.

**Knowledge and analytics:** `knowledge_base`, `knowledge_updates`, `call_insights`, `agent_coaching`, `followup_queue`.

**SNP/routing/sales content:** `dsnp_eae_lookup`, `csnp_carrier_verification`, `snp_routing_rules`, `carrier_profiles`, `state_excess_charge_rules`, `birthday_rule_states`, `cross_sell_attempts`, `carrier_rts`.

**CRM/telephony/PII:** `contacts`, `contact_lead_intel`, `contact_notes`, `contact_activities`, `policies`, `follow_ups`, `inbound_calls`, `telephony_events`, `pii_access_log`, and `pii_vault.encryption_keys`.

### 10.3 Views and functions

Checked-in migrations define or reference reporting views including `v_enrollment_summary`, `v_agent_performance`, `v_compliance_overview`, `v_pipeline_status`, and `v_daily_activity`. The app also expects `v_call_log`, but its definition is absent.

Important RPC/function areas include tenant bootstrap/settings, PII encrypt/decrypt/write/search/audit helpers, contact phone matching, transcript similarity search, compliance scorecard retrieval/overrides, and dataset lookups. Some RPC/table contracts are documented rather than migrated, so a remote database can contain capabilities not reproducible from the migration directory.

### 10.4 pgvector RAG

RAG uses OpenAI `text-embedding-3-small` and validates 1,536-dimensional vectors. Transcript ingestion chunks text, generates embeddings through the authenticated Netlify function, and inserts chunks for similarity search. Query-time Co-Pilot retrieval generates a query embedding and calls a transcript-search RPC.

The underlying `call_transcripts`, `transcript_chunks`, `vector(1536)`, IVFFlat cosine index, and search RPC are specified in `docs/supabaseschema`, not in an executable migration. That document describes roughly 300–500-token chunks with overlap, an IVFFlat index with 100 lists, and searches limited to PHI-scrubbed content. This is an important reproducibility gap.

### 10.5 Netlify functions and scheduled jobs

Major function groups are:

- **Coaching/compliance:** `coach`, `post-call`, `score-call-background`, `compliance`.
- **Transcription/RAG:** `deepgram-token`, `transcribe`, `embeddings`, Deepgram/analytics backfills.
- **Analytics/knowledge:** nightly analytics, weekly coaching, knowledge update/trigger/backfill, bulletin sync.
- **Billing/tenant:** Stripe checkout/portal/webhook, tenant seed/settings helpers.
- **Integrations/data:** GHL test webhook, CMS plans, Google Drive, live bulletins.

Scheduled jobs in `netlify.toml` are:

- Nightly analytics at 06:00 UTC daily.
- Weekly coaching at 11:00 UTC Monday.
- Bulletin sync at 10:00 UTC daily.
- Knowledge update at 07:00 UTC Sunday.

The batch Deepgram path now enables Nova-2 smart formatting, diarization, utterances, language, sentiment, intents, topics, and summary v2, then calculates talk time, words per minute, pauses, interruptions, and confidence. Older documentation describing it as basic transcription is stale.

### 10.6 Migration/deployment reproducibility

The migration directory has duplicate numeric prefixes (`001`, `002`, `003`), no `020`, and several later scripts that assume remote-only objects. Dataset loaders create some QHP, state-based exchange, SEP, bulletin, and CMS tables manually rather than through migrations. These factors make a fresh database dependent on file-name ordering and undocumented external setup.

Other important schema gaps/assumptions include:

- `agent_availability`.
- `messages` and `message_media`.
- `message-media` storage.
- `v_call_log`.
- `agents`, `call_transcripts`, and `transcript_chunks` as documented/remote contracts.
- QHP/state-based exchange/CMS datasets.
- `zip_county` and `ma_plans` expected by the older CMS function.

### 10.7 Environment variable contract

The following groups are consumed. Values are intentionally omitted.

**Client (`VITE_`):** Supabase URL/anon key and optional CMS Supabase project; Clerk publishable key/disable flag; inbound-calls flag and telephony URL; customer-audio flag; CSG URL/key; CMS feature/RPC flags; agent/availability identifiers; optional agent API key; Biblia; ACA reference configuration.

**Netlify/server:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, Google API credentials, HUD token, Supabase URL/anon/service-role/database credentials, Clerk secret/JWT/audience/authorized-party values, Stripe secret/webhook/price IDs/application URL, backfill and knowledge-update secrets/model, and GHL test controls.

**Telephony:** port/public URL/CORS, Supabase service credentials, Twilio account/auth/API key/TwiML app/phone, Deepgram key, Clerk secret, WebSocket signing secret, vendor API settings, default tenant, and timeout values.

Any `VITE_` value is shipped to the browser. In particular, `VITE_CSG_API_KEY` and any `VITE_AGENT_API_KEY` cannot be considered confidential. Local environment files exist and should remain excluded from version control; this audit inspected variable names, not secret values.

## 11. Known issues and incomplete areas

### Critical/high priority

1. **The 152-intent claim is internally inconsistent.** The canonical code has 167 intents; UI slicing manufactures 152 and drops part of annuity plus all runtime checks.
2. **U65 Co-Pilot state is incompatible with the current scripts.** Five/4-screen UI state is fed to an engine expecting eight old gates, and product terminology also conflicts across data, prompts, and recommendation logic.
3. **Tenant isolation is disabled.** Migration 028 lets any authenticated user access any tenant/settings row. This prevents secure SaaS multi-tenancy.
4. **Fresh-schema dialer and messaging are incomplete.** `v_call_log`, message tables/storage, and migration 020 are missing; inbound SMS also violates current contact source/activity constraints.
5. **Outbound telephony is incomplete.** It lacks inbound-equivalent server media streaming, recording association, status/event lifecycle, and dual-track transcription.
6. **PII migration is unfinished.** Phase 1 explicitly retains plaintext during rollout, browser contact opening auto-decrypts data, and other records such as post-call `call_records` can still contain contact PII outside the protected contact blob.

### Medium priority

7. `agent_availability` is remote-only; migration 019 fails instead of creating it.
8. Inbound and outbound calls always enter MA cockpit; there is no product-aware routing.
9. `cms-plans.js` expects table names not represented by current migrations and inconsistent with the newer CMS dataset path.
10. The pgvector transcript schema/RPC is documentation-only, not a migration.
11. Dataset setup is split among migrations and destructive/manual upload scripts, limiting reproducibility.
12. `call_logs`, `call_records`, and the missing `v_call_log` overlap without a checked-in canonical view.
13. The browser and server can both transcribe customer audio on telephony calls, creating possible duplication/cost.
14. Telephony defaults CORS to `*` and one default tenant unless deployment overrides are correct.
15. Carrier/CSG keys configured with `VITE_` are public to authenticated browser clients.
16. Ancillary is absent from older session-flow constraints, so ancillary calls do not have the same session/compliance persistence guarantees.
17. A2P 10DLC registration and current Railway/Twilio/Netlify service health are not documented or verifiable from code.

### UI/product completeness

18. `OperationsTab` and the alternate `ContactDetail` are substantial but unreachable.
19. No live Demo tab exists; only a docs mockup exists.
20. Calibration has backend support but no dashboard.
21. Hold is simulated by mute, and complete transfer behavior is absent.
22. CSG/EnrollPrime/carrier enrollment paths are manual, reference-only, or placeholders rather than connected APIs.
23. GHL is one-way outbound webhook only, not CRM synchronization.
24. The repository README is still the generic Vite template, and `docs/CODE_REVIEW.md` contains stale conclusions.

### Build, lint, tests, and console/404 behavior

25. `npm run build` passes locally: Vite transformed 2,740 modules and produced a production bundle. The authenticated stylesheet chunk is large (about 415 kB), and the jsPDF chunk is about 390 kB.
26. `npm run lint` fails with **31 errors**. One is an unused `mix` variable in `CarrierRef.jsx`; the rest are primarily telephony Node globals (`process`, `Buffer`) not configured in the root ESLint environment.
27. `telephony` has no `test` script, and no repository-wide automated test suite was found.
28. Expected Supabase REST 404/PGRST failures include missing `v_call_log`, messaging objects, manual data tables, or transcript/RAG tables. Some SEP/CMS paths catch PGRST202/PGRST205 and fall back, but call log/messaging functionality cannot be assumed.
29. Theme preference sync can log warnings when Clerk JWT or migration 016 is missing. The current `ThemeProvider` placement itself is correct; a systemic ThemeProvider crash was not reproduced.
30. Comments and old docs sometimes describe previous schemas/flows, especially U65, GHL, and Deepgram, and should not be used as runtime truth.

## 12. Billing and SaaS layer

### 12.1 Implemented Stripe pieces

The repository contains real Stripe integration code:

- Checkout-session creation.
- Customer billing portal creation.
- Signed Stripe webhook handling.
- `subscriptions` and `usage_records` schema.
- Seat quantity passed into checkout.
- Promotion-code support.
- Handling for checkout completed, subscription update/delete, and payment-failed events.
- Tenant onboarding and admin billing UI.
- Usage logging for model calls.

The UI markets **Starter at $49** and **Pro at $99**. Checkout quantity is the number of seats, so configured Stripe Price objects determine whether those are effectively per-seat prices; the hosted Stripe catalog is not verifiable from code.

Starter is positioned around scripts, compliance, calls, and basic analytics. Pro adds Co-Pilot, transcription/advanced tooling, CRM/integration capabilities, and advanced analytics. An internal NGHS tenant is seeded with an internal active subscription and ten seats.

### 12.2 Enforcement

Server-side enforcement is meaningful:

- `coach` requires an active **Pro** subscription.
- The GHL enrolled-call webhook path is Pro-gated.
- Transcription and other server functions use subscription/plan helpers where configured.
- Compliance background scoring requires active subscription/seat state, though it is not universally Pro-only.
- Token/usage records are written for metered features.

### 12.3 Gaps and placeholders

`SubscriptionGate` is a client banner, not a full application gate. It warns about plan/subscription state but does not prevent the rest of the application from rendering. Onboarding also includes a continue-without-checkout path. Therefore the effective SaaS boundary depends on each server function being correctly gated, while client-only features remain visible.

The following cannot be established from the repository:

- Whether Stripe products/prices and webhook endpoint are configured in the current account.
- Whether all live tenants have valid Stripe customer/subscription mappings.
- Whether failed or past-due subscriptions are operationally suspended beyond individual gated endpoints.
- Whether seat quantity is reconciled automatically with Clerk organization membership.

The billing layer should be classified as **implemented backend plumbing with incomplete whole-app entitlement enforcement**.

## Recommended remediation order

1. Establish one canonical intent catalog/count and remove the accordion slice; make product applicability explicit.
2. Rebuild the U65 Co-Pilot contract around the actual five-screen individual and four-screen small-business flows, then reconcile product names/templates.
3. Restore tenant-isolated RLS and make telephony organization/tenant-aware before adding SaaS customers.
4. Add a real migration 020 (or correctly renumbered replacements) for `v_call_log`, messages, media, storage, constraints, and required policies; include `agent_availability` or document its authoritative service.
5. Bring outbound calling to lifecycle parity with inbound, including media/recording/status association and product routing.
6. Finish PII migration/removal of plaintext and review every alternate PII store/function.
7. Convert pgvector and manually created data schemas into idempotent migrations.
8. Decide whether to route or delete dormant Operations/ContactDetail/demo code and add a calibration UI if it is an intended feature.
9. Fix ESLint configuration/code errors and add unit/integration tests for compliance scoring, U65 state, webhook validation, call routing, SMS schema, and subscription gates.
10. Replace the generic README and stale review with deployment prerequisites, migration order, external account setup, and operational runbooks.

## Evidence map

The highest-value implementation sources for follow-up are:

- Application shell/navigation: `src/App.jsx`
- Global site styling: `src/styles.css`, `src/styles/v3-overrides.css`, `src/styles/phone-dropdown.css`
- Flow data/components: `src/data/`, `src/components/ScriptFlow.jsx`, `src/components/MedSupFlow.jsx`, `src/flows/aca/`, `src/flows/u65/`, `src/flows/ancillary/`
- Co-Pilot: `src/hooks/useCopilotEngine*.js`, `src/hooks/useAnnuityCopilotEngine.js`, `src/hooks/useCopilotEngineCore.js`, `netlify/functions/coach.js`
- Live compliance: `src/context/ComplianceScorer.js`, `src/context/TranscriptAnalyzer.js`, `src/workers/compliance.worker.js`, `src/components/ComplianceDashboard.jsx`
- Post-call compliance: `src/compliance/intents/`, `src/compliance/engine/`, `netlify/functions/score-call-background.js`, `netlify/functions/compliance.js`
- CRM: `src/components/contacts/`, `supabase/migrations/017_crm_contacts.sql`, migrations 021–025
- Telephony/SMS: `telephony/src/`, `src/contexts/InboundCallContext.jsx`, `src/components/phone/`
- Call log/detail: `src/components/callLog/`, `src/components/callDetail/`
- Tenant/auth/theme/billing: `src/context/`, `src/hooks/useSubscription.js`, `src/components/Onboarding.jsx`, the `SubscriptionGate` in `src/App.jsx`, migrations 007–010 and 016, and the Stripe Netlify functions
- Data/RAG: `src/lib/transcriptIngestion.js`, `src/lib/transcriptSearch.js`, `netlify/functions/embeddings.js`, `docs/supabaseschema`
- Deployment: `netlify.toml`, `telephony/Dockerfile`, `telephony/railway.toml`, `supabase/migrations/`

---

**Bottom line:** EnrollGen already has the breadth of an integrated insurance sales operating system, not merely a script reader. Its strongest paths are MA scripting/coaching, deterministic live compliance, inbound dual-track calling, post-call analytics, and the CRM/PII foundation. The key work before calling it a production-ready multi-tenant SaaS is to make the schema reproducible, repair the intent/U65 mismatches, restore tenant security, finish outbound/SMS lifecycle integration, and enforce subscriptions consistently.
