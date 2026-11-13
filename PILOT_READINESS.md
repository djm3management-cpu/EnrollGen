# EnrollGen: readiness for a separate agency pilot

Audit date: 2026-11-12. Source baseline: `85d51d99a41636b5a73054d4dd73d23e56fa0814`. Audit branch: `audit/second-instance-pilot-readiness`.

**Decision: do not invite outside users yet.** A separate Supabase/Clerk/Twilio/Railway/Netlify deployment is the right isolation boundary, but copying today's configuration and replaying today's migration directory is unsafe. The largest blockers are permissive database authorization, legacy service-role endpoints, incomplete bootstrap SQL, and agency-specific identity and delivery defaults. This does **not** require converting the application to shared-database SaaS.

This is a source and reachable-git-history audit, not a penetration test or a certification of the running deployment. No application files were changed; no migrations, application servers, provider calls, load tests, deployments, or production queries were run. Public documentation and npm's advisory registry were queried. Environment files were inspected for **variable names only**. Credential values and capability-bearing webhook URLs are intentionally omitted. SQL status below means the state expressed by repository SQL, accounting for later replacements; it does not establish what is installed in production. Historical rollout documents are evidence of prior operations, not a current catalog snapshot.

## Ranked work and release decision

Estimates are engineering hours including focused tests/review, not elapsed vendor onboarding time. Items overlap; do not sum them as a fixed bid. “Pilot only” means implement on an isolated pilot release and apply configuration/SQL only to the new services. Pushing these changes to current `main` would automatically deploy production, so keep pilot work on a separate release branch/site until deliberately scheduled. This audit authorizes none of the proposed changes.

| Priority / ID | Finding and evidence | Concrete fix / acceptance condition | Hours | Without touching current production? |
|---|---|---|---:|---|
| **P0-1** | Production-capable auth bypass: `_clerkAuth.js:29–38`; `_tenantSettings.js:409–428` treats bypass as admin; frontend flags in `src/main.jsx:17`. | Reject auth bypass settings at deployed startup/build; remove bypass from privileged handlers. Negative tests for missing/expired/foreign-issuer tokens. Keep any development facility explicitly local. | 3–6 | Yes, pilot only. |
| **P0-2** | Any authenticated subject can satisfy `is_current_tenant`; writable roster roles feed admin/PII/telephony decisions. `028_remove_org_gating.sql:20`, `007_multi_tenant_foundation.sql:252`, `042_auth_subject_binding.sql:31`, `vendor-routing.js:22`, `rts-ingest.js:340`, `voiceToken.js:34`. RLS is also absent from the SQL for `vendor_controls`/`vendor_control_audit` (`049:3,10`); 050 restricts their RPCs but does not add table RLS. | Bind membership to active, service-managed Clerk subject mappings; revoke client writes to identity, role and organization columns; server-only admin roster/settings mutations. Replace all permissive OR policies, not just add restrictive-looking policies. Test unprovisioned, inactive, ordinary and admin subjects through REST/RPC directly. Enable RLS and revoke browser table access for vendor controls/audit; verify table and column grants, especially contacts. | 16–28 | Yes; separate DB. Current production retains the risk until separately fixed. |
| **P0-3** | Legacy API authorization gaps: `netlify/functions/compliance.js:447–1370` uses a service client with unscoped reads/writes; `transcribe.js:225,316` accepts arbitrary call ID; `stripe-portal.js:40–61` and checkout lack billing-admin checks; `compliance-review.js:19–36` returns same-tenant calls to ordinary agents without owner scope. | Remove/disable unused legacy routes on the pilot; move required operations through protected call identity/owner/admin helpers. Restrict transcription to an authorized recording and call. Scope every read/write and block ordinary users from billing/calibration/admin actions. Test route aliases and direct `/.netlify/functions/…` paths. | 12–22 | Yes, pilot only. |
| **P0-4** | Fresh migration replay is broken and contains obsolete operations. `002_post_call_pipeline.sql:34` needs absent base tables; `007:186` needs `compliance_scores`; `075:112` requires a separate scoring seed; rollout says skip 143 (`docs/compliance-overhaul/ROLLOUT.md:3`). | Produce a reviewed **fresh-install** schema/ordered manifest incorporating missing baseline objects (including messaging, availability and reference datasets), extensions, RLS/grants, required seeds and patch 074; exclude abandoned 143 and NGHS operational seeds. Validate from an empty isolated Supabase project, then diff expected catalog. Never repair this by replaying old SQL on production. | 20–36 | Yes, new project only. |
| **P0-5** | Enrollment cannot accept a new roster: `src/lib/enrollmentIntake.js:3,12,33,39`; hardcoded GHL assignments, agency, phones, vendor Target/team, production webhook seed and alert recipients. | Validated deployment profile plus service-managed roster; remove NGHS defaults from fresh seed; parameterize all items in §1. Fresh pilot must have no NGHS identity, recipient, webhook or domain fallback. Synthetic enrollment must accept all 12 pilot agents and reach only a test sink. | 12–24 | Yes. |
| **P0-6** | No complete off switches for Paragon/GHL/Stripe/Daily Verse; multiple delivery paths and schedulers. `server.js:76–82`, `integrations/worker.js:45–57`, `postCallWork.js`, `App.jsx:877`. | Server-enforced deployment feature flags, default off for optional integrations; gate enqueue, claim, delivery, schedules and UI. Blank credentials alone are insufficient. No external delivery until explicitly enabled with pilot destinations. | 8–14 | Yes. |
| **P0-7** | Idle lock is dismissible by button or URL hash, while sessions continue: `SessionLockOverlay.jsx:28–35,52`; protected data can remain in module caches. | Require verified fresh auth/reverification before unlock; remove unverified continue/hash trust; clear identity-bound caches at sign-out/user change. Configure invite-only Clerk, MFA and session duration. Test shared-browser user switching and inactive-user revocation. | 5–10 | Yes, new auth instance. |
| **P0-8** | Unreviewed PHI flows and plaintext duplicates; broad roster/row access defeats intended contact masking. `leads.js:68–74`, `022_pii_protection_phase1.sql:3–19`, `125_enrollment_intakes.sql`, `coach.js:73`, Deepgram raw audio. | Before real records: close P0-2/3, approve minimum processor destinations, retention/access and applicable contracts; stop unrestricted lead payload persistence and scrub server-bound AI inputs. Permit synthetic-only testing until approved. Inventory and restrict existing duplicate columns; plan compatible encryption cleanup. | 10–20 engineering, plus owner review | Yes for pilot; do not copy production data. |
| **P0-9** | Dependency advisories include critical/high runtime packages (see §3.9); the root manifest and locked jsPDF version were checked (§3.9). | Upgrade/pin compatible auth, HTTP, PDF and import dependencies in small PRs; replace/disable vulnerable SheetJS path where registry offers no fix. Clean `npm ci` in isolation, focused auth/upload/telephony checks, repeat audits. Assess actual advisory reachability rather than equating every advisory with exploitability. | 8–16 | Yes. |
| **P0-10** | Paid/provider and vendor routes lack consistent server rate limits; deployment quotas unverified; horizontal telephony fan-out is process-local. `coach.js:30`, `transcribe.js:209`, `leads.js:32`, `agentSocket.js:10,69`. | Add per-subject/vendor admission and paid request budgets; configure restrictive origin/JWT parties, pilot limits and alerting; start telephony with one adequately sized replica. Run the staged 12-agent/20-call acceptance plan before real calls; verify recording/transcript recovery. Keep conference disabled until its cases pass. | 10–18 plus 6–10 test execution | Yes, non-production instance. |
| **P0-11** | No complete per-user evidence access trail: signed storage URL creation has no user audit; provider download ticket lacks actor; intake decrypt bypasses contact audit. `_recordingAccess.js:133–160`, `enrollment-intakes.js:78–84`. | Durable append-only audit for evidence list/read/play/download/export and intake read/decrypt, recording actor/resource/result/time and grant ID, never PHI/token values. Ensure failed writes do not silently make access unaudited. | 6–12 | Yes. |
| **P1-1** | Transcript/telephony/event/delivery/audit tables and retained recordings grow indefinitely; few expiry deletes are not a retention policy (`084_durable_transcripts.sql`, `048_vendor_integrations.sql:376`, `telephony/src/recordings.js:135`; Appendix D). | Set approved retention by data class, object lifecycle, bounded ledger cleanup and restore drills. Preserve compliance evidence and idempotency horizons; no blanket deletes. | 8–16 | Yes. |
| **P1-2** | DB hot rows, transcript rebuilding, unbounded CRM hydration and local socket routing limit scaling (§4; `084_durable_transcripts.sql`, `src/hooks/useContacts.js`, `telephony/src/media/agentSocket.js:10,69`). | Measure first; paginate CRM/opportunities, coalesce transcript persistence and reduce scans; add distributed fan-out before multiple telephony replicas. | 12–28 | Yes. |
| **P1-3** | Configuration/timezone drift and delivery diagnostics can leak data; missing dashboard/IaC inventory. Evidence: `067_paragon_billing_hours.sql:8`, `integrations/complianceUploads.js:136`, `netlify.toml:51–73`. | Per-deployment operational dashboard, redacted structured logging, quota/queue/lease alerts, explicit timezone/DST scheduling and configuration validation. | 8–16 | Yes. |
| **P1-4** | Partial encryption leaves plaintext names, DOB and phones in contact columns, free text, intake metadata, external exports (`022_pii_protection_phase1.sql:3–19`, `125_enrollment_intakes.sql`, `leads.js:68–74`). | After access controls, migrate each plaintext duplicate behind tested compatibility APIs, field minimization and recovery/rotation procedures. | 16–32 | Yes, pilot schema; production requires separate rollout. |
| **P2-1** | Legacy providers, dead endpoint/reference code, agency-specific fixtures and branding are interspersed with runtime (`src/lib/llm/config.js:1–2,33–34`, `src/lib/enrollmentIntake.js:3–4`, Appendix A). | Remove obsolete deployment references after dependency/usage inventory; keep historical migration evidence; consolidate supported templates and provider configuration. | 8–16 | Yes. |
| **P2-2** | Infrastructure and provisioning are mostly procedural (`docs/compliance-overhaul/ROLLOUT.md`, `supabase/patches/074_media_stream_sid_fix.sql`, `seed-new-tenant.js:179`). | Reproducible versioned provisioning, secret names manifest, separate release promotion and schema drift checks. | 12–24 | Yes. |

### Smallest, safest P0 pull-request sequence

1. **Fail-closed configuration and auth** (P0-1): deployment startup/build checks, bypass rejection, foreign-token fixtures. No schema dependency.
2. **Close unused and overprivileged API paths** (P0-3): explicitly disable legacy compliance/transcribe/billing paths until replacement exists; owner/admin scope for retained handlers. Prevent regression through direct function URLs.
3. **Patch dependencies** (P0-9): separate root/auth/PDF-import and telephony HTTP dependency changes; verify manifests against lockfiles. No `audit fix --force` bundle.
4. **Correct idle verification/cache lifecycle** (P0-7), independently reviewable.
5. **Deployment profile and disabled optional integrations** (P0-5/6): safe defaults and destination validation first, then replace roster/script/vendor/email constants. Preserve `styles.css` styling.
6. **Protect identity and database access** (P0-2): service-managed identity/admin settings first; individual CRM, evidence and reference-policy groups second. Include column grants and writable-role escalation fixtures.
7. **Fresh-install manifest and bootstrap** (P0-4): depend on agreed permissions/profile; missing baseline schema and canonical seeds, explicitly omit migration 143. New DB acceptance only.
8. **Processor minimization and access audit** (P0-8/11): protected evidence routes plus durable user-access records; no transcript/body secrets in logs.
9. **Admission limits and pilot acceptance harness** (P0-10): non-production simulation and fault injection; release checklist requires recorded passing results and owner-approved processor configuration.

Each PR targets the pilot release branch first. Production changes, if desired later, need additive compatibility work and a separate release window; do not merge these blindly into the production-linked branch during AEP.

## 1. Single-agency assumptions

Paths in this report are repository-relative; line numbers refer to the baseline above. Runtime constants, historical seeds and documented-only identifiers are distinguished. Appendix A expands the source occurrence inventory so repeated script/knowledge text is not hidden by this summary.

| Setting | Evidence | Current form | Per-deployment change |
|---|---|---|---|
| Tenant identity / organization | `telephony/src/config.js:64`; `netlify/functions/_tenantSettings.js:3`; `_subscriptionGate.js:2–35`; `compliance.js:54–84`; `src/lib/postCallPipeline.js`; `007:56`, `010:206` | Telephony has `DEFAULT_TENANT_ID`; frontend/server/SQL also use a fixed default UUID and old org. Same UUID in separate DBs is not itself a cross-instance leak, but defaults hide mistakes. | One validated instance tenant identity; resolve active subject membership; require explicit ID at seed and service startup, remove name/org/default fallbacks. |
| Agency display name and document branding | `src/data/maScript2027.js:142,152,160,161,171,196,267`; `SessionSummary.jsx:474`; MedSup/ACA/U65/ancillary scripts; `BillingSettings.jsx:155`; `status-page/index.html:6,97` | Hardcoded NGHS; some `tenants.name`, `agency_display_name`, `agency_logo_url`, `agency_primary_color` already exist. EnrollGen product logo is separate. | Feed agency fields into every script, PDF, status page, onboarding and billing label; keep site styling. |
| Agency line, hours and closing | `src/lib/agencyLine.js:2–3`; `src/data/agencyClosing.js:1`; `enrollmentClosing.js:2–7` | Hardcoded main DID and weekday 10 AM–6 PM closing; telephony uses `TWILIO_PHONE_NUMBER`, `DIRECT_AGENT_NUMBERS`. | Configure main display/contact number separately from each agent DID; format from one source. Script hours must match actual staffed hours. |
| Twilio SIDs / credentials | `telephony/src/config.js:7–15,51–55`; `integrations/complianceUploads.js:55`; `netlify/functions/transcript-gaps-background.js:32` | Runtime account, key and TwiML application SIDs already env-driven; no production-format literal SID found in the searched runtime source. IDs may exist in historical evidence/fixtures, not deployment config. | New subaccount-scoped SIDs/credentials and phone numbers throughout Netlify, Railway and worker; no parent/NGHS credential copying. |
| Roster, identity aliases, licensed states and GHL assignment | `src/lib/agentIdentity.js:17–26`; `enrollmentIntake.js:3–4,33,39`; `RTSTab.jsx:63`; migrations `019`, `023:225`, `026`, `032`, `044`, `051` | Hardcoded names/aliases and NGHS identity/roster seed updates. Intake validation permits exactly three current agents. | Trusted active roster, unique Clerk subjects/slugs, approved states/NPNs and provider IDs; no human-name auth fallback. Protect role writes before relying on roster. |
| Conversely Target and endpoint | `integrations/complianceUploads.js:31,134`; `converselySelection.js:10–21` | `Target` hardcoded; fixed provider endpoint; key, enablement, exclusions and carrier selection env-driven. Samples-per-agent is constrained by current logic. | Add required target/endpoint config approved by vendor; per-instance key and exclusions; ensure weekly selection never sees NGHS roster. |
| IntelligenceX / SunFire | `integrations/ixUploads.js:15,102`; `ixClient.js:3–8`; `docs/UHC_IX_Integration_Spec.md:19` | Hardcoded `teamName` and report recipient; login uses `IX_USERNAME`, `IX_PASSWORD`; `IX_ENV` selects test/production service. Spec contains old agency login identity (not reproduced). | New team, credentials and confirmed vendor enrollment mapping; configure recipient; retain test-enrollment segregation. Credentials alone do not change team name. |
| GHL post-call and enrollment delivery | `007_multi_tenant_foundation.sql:67,94`; `_tenantSettings.js:525`; `netlify/lib/postCallWork.js`; `integrations/enrollmentWebhook.js:5,15`; `enrollmentIntake.js:39` | **Committed production capability-bearing webhook URL in seed**, tenant DB webhook setting, separate `GHL_ENROLLMENT_WEBHOOK_URL`, hardcoded GHL users. | New GHL location/users/hooks; secrets stay server-side. Seed no live URLs; off flag gates both paths. Validate destinations to prevent client-editable webhook exfiltration/SSRF. |
| Medicare intake form URL | `src/components/enrollment/EnrollmentIntake.jsx`; `src/lib/enrollmentIntake.js`; `docs/enrollment-intakes.md`; `docs/script-intake-cleanup.md:5` | Current flow is an internal modal/API, not a verified external form URL. No active external Medicare-intake form URL was established from current runtime code. Historical knowledge and rollout prose contain many unrelated reference URLs. | Use the pilot's internal intake; manually check any externally hosted legacy intake/link in actual agency scripts/GHL. Do not invent or reuse an unverified old form URL. |
| Paragon vendor configuration | migrations `048–057`, `067`, `111`, `126`, `131`; `vendor-routing.js:27`; `_paragonControls.js:4`; `paragonEligibility.js` | DB lead sources/consumers, rates, eligibility, hours and controls; fixed vendor-name and tenant assumptions; env state-routing switch is only partial. Historical cap changed by 111. | Omit Paragon records when disabled; configure vendor contract/rates/state matrix/API hashes/report credentials for pilot when needed; gate all workers/queues. |
| Timezone / staffed hours | `VendorRoutingSettings.jsx:78–79`; `067_paragon_billing_hours.sql:8`; `integrations/worker.js:31`; `124_ix_uploads.sql:60`; `127:54`; `netlify.toml:51–73` | Eastern-time literals; vendor staffed-hours JSON; 10:15–17:15 weekday defaults differ from script closing. UTC cron is not a timezone-aware scheduler. | Validated IANA timezone in deployment profile; DB/operator schedules and UI use same setting; test DST boundaries and reports. |
| Email/text templates | `ClientQuickScripts.jsx:12,64,91,123`; `ancillaryPopupData.js:120`; `paragon-daily-email.js:43`; `netlify/lib/postCallProvider.js:37–42`; `integrations/ixUploads.js:102`; `worker.js:90` | Agency script text, hardcoded operational senders/recipients; some `POST_CALL_ALERT_EMAIL`, `INTEGRATIONS_REPORT_FROM`, DB report emails. | All senders, reply-to and recipient lists configured and pilot-domain verified; no NGHS fallback. SMS uses configured Twilio number; review actual opt-in/STOP behavior. |
| Sales/compliance script IDs and wording | `supabase/seeds/002_scoring_template.sql:12`; migrations `013`, `014`, `075`, `115`, `141`, `142`, `144`; `TranscriptAnalyzer.js:271`; `originalMatchers.js:9` | Fixed template IDs are referenced by successor migrations; NGHS wording also used by deterministic matchers and AI system prompts. | Preserve canonical rubric ID dependencies in fresh bootstrap; give deployment-specific display/script names, agency aliases and versioned approved text. Do not blindly randomize rubric IDs or make legal requirements arbitrary config. |
| Nextcloud sync | `infra/office-nextcloud/docker-compose.yml`; `sync/sync.py:39–67,341–370`; README office-specific setup | Separate opt-in Docker stack, env-configured WebDAV/DB/source buckets; agency machine/container/path defaults. Uses broad service credential. | Do not deploy for pilot unless requested; dedicated server/user/volumes/token and approved exported field allowlist, pilot-only DB, encryption/backups and retention. |

### Required deployment feature switches

| Feature | Existing mechanism | Missing / pilot default |
|---|---|---|
| Paragon vendor layer | `PARAGON_STATE_ROUTING_ENABLED`, DB pause/eligibility controls | A single routing flag does not stop billing worker, report endpoints/email, residence work or UI. Add full server/queue/UI switch; **off**. |
| GHL | Empty tenant hook / missing `GHL_ENROLLMENT_WEBHOOK_URL` can suppress sends | Explicit enable flag covering post-call, intake, retries and test endpoint; **off**, no preseeded URL. |
| Nextcloud | Stack only runs when operator deploys it | Keep undeployed; document opt-in. If shipped, explicit sync enable and restricted export scope. |
| Daily Verse / Biblia | Route/UI always present; Biblia server key | Deployment navigation/preload/API switch; **off** unless agency requests it. |
| Stripe billing | Internal subscription bypass, configured Stripe keys | Explicit billing-disabled pilot entitlement, adequate seats and server route shutdown; **off** initially. Do not rely on labeling the new agency “NGHS internal.” |
| Conversely / IX | `CONVERSELY_UPLOAD_ENABLED`, `IX_UPLOAD_ENABLED`, `IX_ENV` | Already separate enable gates; default off and ensure DB enqueue/diagnostics do not create endless disabled work. |
| Conference, AI scoring, transcript repair | `CONFERENCE_CALLING_ENABLED`, `SCORING_ENABLED`, DB runtime fence, `TRANSCRIPT_GAP_FILL_ENABLED`, `TRANSCRIPT_AUTO_RECOVERY_ENABLED` | Keep off until respective synthetic acceptance passes. These are safety/cost switches, not authorization checks. |
| Customer audio, inbound calling, CSG and external references | Frontend flags; CSG key-based activation | Document supported pilot features; never put a secret in a `VITE_` variable. CSG is a dormant unsafe pattern blocked by current build secret validation. |

## 2. Standing up a second instance

### 2.1 Migration/bootstrap verdict

**No: the numbered migrations cannot be claimed to apply cleanly, in order, to an empty project. Static source proves missing prerequisites; execution was prohibited and was not attempted.** There are 145 numbered files from 000 through 149, with 083, 085, 087, 090 and 091 absent. Gaps alone are not failures, but reinforce that this is an operational history rather than a validated bootstrap.

| Problem | Evidence | Required fresh-instance treatment |
|---|---|---|
| Base transcript schema outside migrations | `002_post_call_pipeline.sql:34,302` references `call_transcripts`; `docs/supabaseschema:28,33,45,86` defines vector, `agents`, `call_transcripts`, `transcript_chunks` and transcript search routines. | Extract/reconcile a reviewed executable baseline before 002; documentation includes prose, not a file safe to run wholesale. Include both search overloads required by 063. |
| Additional absent base DDL | `007:186` alters `compliance_scores`; `038:6` alters `agent_availability`; 063/073 assume `agent_availability_log`; runtime uses `messages` and `message_media` without numbered creation SQL. | Supply authoritative table/trigger/index/grant definitions. Check old ledger/catalog exports manually. Do not infer schema merely from frontend selects. |
| CMS/reference prerequisites | `054:81,89,97` alters `snp_plans_by_county`, `star_ratings_by_county`, `plan_terminations`; its lookup functions also require `zip_county_crosswalk`/SEP schema. `scripts/sep-data/schema.sql` supplies these plus legacy `fema_disasters`; 079 alters `bulletins`. ACA uses `qhp_landscape_2026` without canonical CREATE/RLS. Scripts contain separate bulletin/SEP/CMS schema/loading work. | Import schema and approved public reference datasets separately; validate current PY2027 row counts, lookup RPCs and versions. A fresh schema without data is not a working plan finder. |
| Agency seed mixed with schema | `007:56–107`, `010:206`, `019`, `023:225`, `026`, `032`, `044`, `051`; `009` seeds NGHS text. | Split schema from per-agency seed; avoid inserting real NGHS org/subjects/hook/agents/DIDs into pilot. Merely overriding final env does not erase those rows. |
| Separate seed dependency | `075_tpmo_grading_2027.sql:112` raises if canonical MA v1 template is absent; 115/141/142/144 clone expected predecessors. | Load `001_compliance_intents.sql` and `002_scoring_template.sql` at the required point, then successor rubric sequence; evaluate 003–005 reference seeds against later replacements. Default CLI “migrations then seeds” ordering is insufficient. |
| Abandoned 143 | `docs/compliance-overhaul/ROLLOUT.md:3–9` explicitly supersedes old instructions: 132–142 completed historically, 143 rolled back/abandoned, direct route 142 → 144 → 145. | Fresh manifest must explicitly skip 143, then 144/145 and later required deltas. Headers saying UNAPPLIED are stale/conflicting, not authoritative current status. |
| Forward hotfix outside tree | `supabase/patches/074_media_stream_sid_fix.sql`; media auth rollout/hotfix docs. | Fold verified final routine signature into fresh manifest after 074; reconcile code expectations. |
| Replay differs from existing deployment | `100_cross_sell_attempts_restore.sql:3,22` creates IF NOT EXISTS and drops only `cross_sell_attempts_own`; the broad 015 policy survives a clean replay. | Explicitly replace legacy policies and reconcile columns/constraints when starting from 015. Never assume a production “restore missing table” patch is a fresh-install upgrade. |
| Historic destructive/repair SQL | `003:10` drops old GHL log; `054:75–100` removes older CMS data; contact merges/backfills and fixed-agent updates occur throughout. | Classify schema vs data migration, review before fresh bootstrap; never point a bootstrap command at linked production. |

Documented manual operations include SQL-editor instructions in `001:3`, 063/064/066/067 rollout docs and 118; recorded migration repairs for 058/059/061/062 in opportunities docs; recorded applications of 098, 099/100, 104/105, 107, 109, 113/114 and later scoring work in their rollout notes. `docs/review-2026-10.md:460` explicitly warns that deployed objects and migration ledger diverged. Those statements establish **documented history**, not a verified complete list of SQL-editor actions. Manually compare `supabase_migrations.schema_migrations`, current function definitions, policies, grants, triggers and extensions; never mark versions applied simply because a matching table exists.

### 2.2 Infrastructure objects

| Object | Required behavior / source |
|---|---|
| `call-recordings` bucket | Private; created in `018:109`; remove broad authenticated object policy via 065. Service uploads; authorized API issues 300-second links or provider tickets. Creation uses ON CONFLICT DO NOTHING, so verify privacy explicitly. |
| `message-media` bucket | Runtime requirement for inbound MMS copy and outbound GIF/MMS, `telephony/src/routes/sms.js:59–95,218–220`; outbound signed URLs last 86,400 seconds. Browser attachments directly request 3,600-second signed URLs (`src/components/contacts/MessagesThread.jsx:37–55`), falling back to provider URL. No canonical creation/policy migration found. Create private with service write and explicitly authorized browser/server read/sign; do not grant broad bucket read merely to make previews work. |
| `call-summaries`, `call-transcripts` buckets | Nextcloud's **optional defaults**, `sync.py:47–59`, not verified core app buckets. No evidence current app populates both. Create only if enabling an agreed export pipeline; private, no anonymous reads. |
| Supabase Edge Functions | Only active source deployment: `get-availability/index.ts`. `verify_jwt=false` is intentional: hashed revocable consumer key auth is inside handler/RPC. `docs/edge-functions/set-availability-v11/index.ts` is historical deployed-code snapshot, not active source; check and remove obsolete deployed functions on the new instance. Current writes use Netlify `set-availability`. |
| Extensions | `pgcrypto` (007/022), `supabase_vault` (022), `vector` (base transcript schema/054). Supabase's auth/storage schemas and roles, extension schema placement (`extensions.*`) and Vault access must exist. No repo-installed `pg_cron`/`pg_net` job was established. |
| Netlify schedules | `nightly-analytics` 06:00 UTC daily; `weekly-coaching` 11:00 UTC Monday; `sync-bulletins` 10:00 UTC daily; `sync-fema` 09:00 UTC daily; Paragon email at minutes 00/15/30 of 22 and 23 UTC with in-code eligibility. `netlify.toml:51–73`. Disable optional schedules until configured. |
| Telephony recurring work | Presence sweep 15s; recording, billing, status recovery, transcript scoring/reconciliation, Paragon residence and conference recovery workers started in `server.js:35–99`. Inspect their feature gates before startup; these are not Supabase cron jobs. |
| Integrations worker | Scheduler each second plus delivery loop; availability push/postbacks/vendor reports, GHL intake, Conversely weekly/manual selection, IX uploads and daily summaries (`worker.js:43–75,112–123`). DB queues/leases required even if some providers disabled. |
| Optional local schedule | Nextcloud sync every 5 minutes by default; separate SQLite cursor and WebDAV artifacts; no need to deploy for pilot. |
| Realtime | `carrier-rts-matrix` (`RTSTab.jsx:263`) and per-user `medsup-rts-${user.id}` (`RateComparisonPanel.jsx:148`) subscribe to `carrier_rts`; migration 029 adds the table to `supabase_realtime`. Channels are created by clients, not pre-created resources. Availability/transcripts use HTTP polling and Railway WebSockets, not Supabase Presence. |

Appendix B lists environment-variable **names only**, their secrecy/instance classification and source. The frontend build and Netlify functions are separate configuration surfaces even though they share one site. The integrations worker uses the root Node manifest and its Dockerfile, not a third package manifest.

### 2.3 Third-party accounts and endpoint map

| Provider | Create / repoint for the new instance |
|---|---|
| Supabase | New project, region, DB credentials, publishable/secret keys, Vault PII key, backups, auth third-party trust, storage and Realtime publication. Optional CMS project must be explicitly approved; never leave CMS URL pointing at NGHS by accident. |
| Clerk | Separate production application, pilot domain and redirect URLs, invite-only organization and first admin, session JWT claims/trust integration with new Supabase, authorized parties/audience. Existing agents do not automatically exist in the new Clerk app. Supabase auth schema is not a substitute for the app's Clerk verifier. |
| Twilio | New subaccount, local/toll-free numbers, API key, TwiML app, webhook auth token, voice geographic permissions, account spend alerts and capacity. Number voice webhook → pilot Railway `/twilio/voice`, status → `/twilio/status`; TwiML app outgoing voice → `/api/voice/outbound`; number messaging → `/twilio/sms`, status → `/twilio/sms-status`. Dial/recording/conference callbacks are generated from `PUBLIC_BASE_URL`. Register brand/campaign/A2P 10DLC and associate sender, or complete toll-free verification as appropriate; verify approved use before SMS. |
| Deepgram | Dedicated approved project/key, correct region and paid plan; verify Nova-2 access, streams and intelligence limits. A secondary self-service project may have only one concurrent stream; do not assume 150. |
| OpenAI / Anthropic | Pilot project/workspace keys and billing/retention settings, model access, request/token/spend limits. Anthropic remains active in RTS ingestion/knowledge and legacy engines/shadows; do not treat it as removed. |
| GHL | Separate agency location/users and post-call/intake workflow hooks; test with synthetic sink before enabling either path. Retire the hardcoded current-agency seed endpoint from fresh provisioning. |
| Conversely | Pilot credential, approved Target, provider enrollment URL, recording-fetch authorization/retention agreement; callbacks consume pilot Railway capability URLs. |
| SunFire IX | Pilot team and separate test/production login, enrollment code namespace, registration/upload/finalize acceptance and provider receipt reconciliation. |
| Paragon/FMO | New consumer keys, report token, lead source, licensed-state/vendor routing matrix, pilot number and intake/ping/report URLs, contract rate/hours and signed outbound push/postback credentials. |
| Stripe | Optional separate account or explicitly isolated test-mode objects, products/prices/customer records; webhook → pilot `/api/stripe-webhook`; separate signing secret and return URLs. Disabled pilot must not create billing sessions. |
| Resend | Verified pilot sender domain, API key, reply-to and report/alert recipients; remove every NGHS fallback. |
| Netlify / Railway / DNS | New site and two services, pilot-only domains, secrets and release-branch bindings; Netlify build root, telephony Docker root `telephony`, integrations Docker build context repo root. No production project linkage. |
| Optional services | Giphy and Biblia keys, CSG server proxy if enabled, Nextcloud/Tailscale/WebDAV isolated deployment. Public CMS/FEMA/RSS sources need current dataset validation, not agency credential copying. |

### 2.4 Numbered zero-to-pilot runbook (future work; not executed)

1. Create a dedicated pilot release branch and record approved commit. Disconnect pilot automation from current production configuration; establish project/domain allowlist. Do not use current linked `.netlify`/Supabase state or copy `.env` files.
2. Complete P0-1/2/3/5/6/7/9 source changes. Configure integrations disabled and synthetic-only mode; prepare the reviewed fresh-install manifest from P0-4. Owner chooses agency name, timezone, main number, hours, roster/roles, supported products and processor set.
3. Create the new Supabase project and verify project ID/host independently. Enable required extensions with compatible schema placement. Install the reviewed base schema, then approved ordered deltas with the required seed checkpoints; skip 143 and incorporate the 074 patch. This step is blocked until the fresh manifest exists and passes empty-project testing.
4. Validate all expected tables, RPC signatures, grants, RLS, triggers, constraints and views. No data from NGHS. Load approved public CMS/SEP/carrier/rubric datasets and confirm counts/versioned successor templates. Confirm storage private flags and `carrier_rts` publication.
5. Create the pilot Clerk app/org, configure Supabase's Clerk trust, claims and domain settings. Create/invite only the first admin initially. Establish admin authority through verified Clerk claims and protected server-side membership; do not promote an arbitrary browser-created roster row.
6. Execute a one-time reviewed bootstrap script against the allowlisted **new** project (outline below). Fail on pre-existing unexpected agency/users or production markers. Generate new Vault and integration keys without logging values. Keep agents offline and optional integrations disabled.
7. Provision Twilio subaccount and numbers/TwiML app, A2P/verification as needed; provision Deepgram/OpenAI and any enabled other processors. Confirm quotas, billing alerts and approved data handling before introducing real data.
8. Create Railway telephony (one replica initially) and integrations-worker services with separate pilot env. Use `PUBLIC_BASE_URL`, CORS and callbacks from the new domains; verify `/healthz` and worker readiness. Start disabled optional workers only after manifest/gates are ready. Do not point outbound delivery at NGHS.
9. Create Netlify site bound to pilot release; set frontend public build vars and server-only vars separately. Set Clerk authorized parties, pilot API bases and internal job secret shared only by the new services. Disable irrelevant schedules; publish only through the new site's approved workflow. No `netlify deploy --prod` and no production-main push.
10. Deploy only required Edge Functions and register hashed, scoped availability consumers. Browser status-page key must be a dedicated non-sensitive read-only credential for the pilot; no production URL/key embedded. Repoint provider webhooks after endpoint auth checks.
11. Run anonymous/foreign-token/inactive-agent/ordinary-agent/admin REST and RPC negative tests. Attempt role escalation, another agent's call ID, playback grant, intake read, transcript overwrite, billing/admin action and forged Twilio callbacks. Verify logs contain IDs/results, not PII or tokens.
12. Add remaining 10–12 agents through the reviewed provisioning path; ensure all identity tables agree. Test licensed-state routing, both number directions, SMS opt-out, overflow, callbacks, recording replay, transcription, intake, disposition and scoring with synthetic callers.
13. Execute §4's non-production load/failure plan; record latency, memory, queue age, cost and evidence completeness. Restore a backup in a separate disposable project. Reconcile all test calls to recordings/intakes/jobs and clear test-only objects by an approved retention procedure.
14. Owner reviews actual plan limits, processor agreements, user access matrix, training and recovery instructions. Only then enable selected integrations/scoring and invite outside agents. Start with supervised pilot calls and daily quota/evidence reconciliation.

Bootstrap outline, not an executable migration:

```text
require PILOT_PROJECT_ALLOWLIST, PILOT_TENANT_ID, PILOT_CLERK_ORG_ID
require FIRST_ADMIN_CLERK_SUBJECT and agency profile supplied out of band
assert database/service domains belong to new instance; refuse production linkage
assert expected schema/rubric versions; fail if unexpected tenant or data exists
begin transaction
  insert tenant with pilot organization, agency branding, hours/timezone, empty hooks
  set pilot entitlement / seats >= 12 using explicit billing-disabled policy
  insert first admin into protected enrolled_agents with role principal (000:11)
  set signed Clerk org-admin claims; tenant_agents uses admin, a different role vocabulary
  insert matching tenant_agents roster row; protect role/subject/slug writes
  insert agent_availability row (offline), availability_agent_subjects mapping
  insert recording_agent_subjects mapping with same subject/tenant/slug
  insert licensed states/NPN and explicit verified phone mappings as configured
  clone/parameterize approved script templates and deployment agency aliases
  initialize no vendor credentials, no report recipients and no live queues by default
  assert Vault key initialized locally by schema bootstrap (never copy NGHS key)
commit
validate first admin auth claims + protected membership with read-only lookups
for each invited agent: repeat consistent mapping transaction; never match by name
print only object counts, safe IDs and validation outcomes; never keys/PII payloads
```

`seed-new-tenant.js` alone is insufficient: it does not establish all protected telephony/recording mappings, and it accepts a body organization ID when no signed org is present (`:41–43`). Lock it to verified organization admins or replace it with one-time provisioning. Mapping tables were populated by migration-time snapshots (064/073); agents added afterward need an explicit sync/provisioning transaction.

## 3. Security findings

### 3.1 Authentication and authorization

Appendix C inventories every active Netlify function and telephony route, the Supabase Edge Function and the nested compliance API. Helpers without an exported HTTP handler are not counted as routes. JWT authentication alone is not authorization. Newer evidence routes reject `dev-bypass`, bind protected membership and check ownership; do not infer that protection covers legacy routes or direct PostgREST.

The critical escalation chain is browser-writable `tenant_agents` + permissive tenant policies → editable role/subject/slug → routines/handlers that trust that roster. This affects PII access (`decrypt_pii` checks roster role), RTS commit, vendor routing and telephony token identity. Fixing tenant membership alone will still allow a legitimate ordinary agent to alter roles unless column/operation permissions are restricted.

The contacts column-lock migration revokes **column** SELECT privileges (`023:209`) but does not explicitly revoke pre-existing **table-level** SELECT. A table grant can override the intended column restriction. Actual defaults and catalog grants must be checked; this is a conditional exposure, not a claim that every running database has it. Test `has_table_privilege` and actual authenticated projections after bootstrap. PostgreSQL privileges and permissive RLS policies must both be accounted for.

`cross_sell_attempts` also needs fresh-install testing: migration 100's grants allow only SELECT/INSERT, but 015's broad policy remains in a complete replay and can OR past the new own-agent check. Later evidence/availability migrations correctly remove old policies dynamically; Appendix D accounts for those loops rather than reporting them as RLS-off.

### 3.2 Bypasses, debug endpoints, sessions and CORS

- `DISABLE_CLERK_AUTH` / `VITE_DISABLE_CLERK_AUTH` are unrestricted environment switches; `_tenantSettings.isAdminAuth` explicitly recognizes bypass as admin. Evidence identity rejects it, but many older functions do not. Frontend bypass also skips the idle lock. Values in local/deployed env were not disclosed or used to assert production activation.
- `ALLOW_INSECURE_WEBHOOK_TESTS` relaxes URL restrictions in `_tenantSettings.js:525`; it has no production-only exclusion. `test-ghl-webhook` requires admin but can send to a submitted URL. Keep disabled and enforce destination/network allowlists.
- Backfill endpoints use `BACKFILL_SECRET` or `KNOWLEDGE_UPDATE_SECRET`; background scoring uses job secrets or per-job dispatch tokens. These are privileged maintenance surfaces, not anonymous routes merely because they lack Clerk.
- `seed-new-tenant` permits first creation without an established admin check; no-org callers can supply org ID. Invitation-only auth and server-side org-admin checks are needed for pilot onboarding.
- `SessionLockContext.jsx:13` locks after one hour except active calls; the overlay's manual continue and hash watcher unlock without proving fresh credentials. It is currently a UI privacy screen, not a reliable security boundary.
- `src/hooks/useTenantConfig.js:12–17` has module-level tenant caches and a fallback to any cached tenant bundle; verify reset on account change/sign-out. `src/lib/supabase.js:18,150–175` retains token-keyed clients (bounded to five). Clerk session revocation and long-lived Twilio/agent sockets require a deliberate invalidation strategy; the voice access token TTL is 3,600 seconds (`voiceToken.js:11`).
- Telephony CORS defaults to `*`, `server.js:53`; configure exact pilot origin. Clerk Netlify authorized parties/audience are optional; telephony's verifier only supplies the secret key (`clerkAuth.js:13`). Add issuer/party/audience checks appropriate to the new Clerk application. CORS is not auth and does not stop non-browser clients.
- `app.set('trust proxy', true)` trusts proxy-derived identity broadly; validate the Railway proxy boundary before IP-based controls. Supabase availability intentionally has wildcard CORS and read-only consumer authentication, but query-string keys can enter platform logs/history.
- No Sentry integration was found in searched application source. Netlify/Railway/Supabase/Twilio/provider logging still exists outside the repo and needs manual retention/redaction review.

### 3.3 Tables, policies and service-role reach

Appendix D is the table-by-table static inventory, including assumed tables missing from migration creation SQL, dynamic policy changes and non-public rollback/key tables. It distinguishes “not established from repo” from “confirmed RLS off.” Public reference-data read policies may intentionally permit anon/authenticated; unrestricted writes to operational tables are different.

The major broad-policy families are tenant/roster/settings, contacts/notes/intel/activities/policies, inbound calls/events, analytics/coaching, scripts/knowledge and legacy call/scorecard data. Several calibration/profile/thread tables explicitly allow every authenticated user. Their exact policy names and source references are in Appendix D. Protected evidence/recording/availability/job tables do not cure the remaining legacy access paths. Migration 049 creates `vendor_controls` and `vendor_control_audit` without RLS; later 050 revokes browser EXECUTE on their service RPCs but does not establish table RLS. Default/project grants decide direct REST exposure. Explicitly enable RLS and revoke browser table access in the fresh manifest. Reference tables `csnp_carrier_verification`/`snp_routing_rules` also lack an ENABLE statement; unknown messaging/ACA baselines require catalog verification.

The modern `SUPABASE_SECRET_KEY` is equivalent in privilege significance to the legacy `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_KEY` fallback, not a restricted tenant credential. `integrations/supabase.js:4–5` and service client helpers create project-wide privileged clients. They can bypass RLS on reachable tables, invoke service-granted RPCs (including PII decryption) and read/write/sign storage objects. They are not automatically PostgreSQL superuser connections, and arbitrary schemas still depend on grants/API exposure.

Appendix E enumerates source uses. Principal trust boundaries are Netlify evidence/compliance/analytics/billing/knowledge handlers, Railway telephony/media/recording workers, integrations delivery worker, availability Edge Function and optional Nextcloud export. A compromise of any broadly credentialed service can reach other data in **that project**. Separate projects materially limit the blast radius only if their keys are not copied/shared and services never fall back to production URLs.

### 3.4 Storage, webhooks and rate limiting

- `call-recordings` is declared private, and 065 removes the old tenant-read object policy. New playback uses server ownership checks, 300-second signed storage URLs or hashed 300-second provider tickets. Possession of the issued URL is sufficient until expiry; it is not continuously bound to a Clerk session.
- Compliance-sharing recording links are separate bearer capabilities with stored creator/access metadata and a longer sharing lifecycle (`integrations/recordingComplianceGrant.js`, migration 112). Treat URLs as credentials; ensure logging strips path tokens, vendor access is limited and expiry/revocation work.
- `message-media` is not provisioned by numbered SQL. Runtime issues day-long signed GIF URLs for Twilio; the browser requests hour-long attachment links using its Supabase client (`MessagesThread.jsx:44–45`). Inbound download buffers the response (`sms.js:81`) without a visible byte/time bound, then copies to Storage, falling back to Twilio URL on failure. Add download host/size/time controls and authorized signing. Privacy/policies and eventual object cleanup must be explicitly installed, not assumed.
- **Every discovered Twilio HTTP webhook route uses signature middleware**, including outbound TwiML and all conference callbacks. The signature is validated against `PUBLIC_BASE_URL + originalUrl`, after URL-encoded body parsing (`twilioSecurity.js:7–20`). Reverse-proxy URL correctness and actual number/TwiML configuration remain live checks.
- `/media` and `/conference-media/…` are WebSocket routes using signed application stream tokens, binding checks and DB leases rather than the HTTP webhook middleware; `/agent` uses an HMAC token and active-agent lookup. Test spoofed account/call/stream IDs, duplicate starts, expired/replayed tokens and revoked subjects. Do not call these unsigned public HTTP webhooks.
- Vendor lead intake uses a timing-safe `INBOUND_VENDOR_API_KEY` comparison; ping hashes a key and calls `paragon_ping`; availability hashes scoped revocable consumer keys. No general rate limiter was found on lead intake, ping, availability, voice-token, SMS or paid AI endpoints. Paragon report auth has a DB count-based limit of 30 attempts per IP per five minutes (`055:47–58`); concurrent count/insert and IP trust need testing.
- Stripe verifies raw-body signatures (`stripe-webhook.js:141`). Integration pushes use HMAC when a signing secret is configured and delivery IDs; postbacks can be configured without one. GHL endpoints are capability-bearing URLs. Do not persist/display those values to ordinary agents.

### 3.5 Secret and git-history review

Tracked env files are examples only; `.env`, `.env.local` and `supabase/functions/.env` are local, not tracked at HEAD. This does not imply they are safe to copy. The audit enumerated names, not values.

A pattern scan examined 4,679 reachable text blobs up to 2 MB from 8,869 reachable git objects across local refs. Eight historical blobs contained nine Supabase JWT occurrences; decoded role classification was **anon**, not service_role. Paths: `scripts/upload_cms_data.js` (blob `391635ee2c45`, line 15), `src/lib/supabase.js` (blobs `24d180c28600`, `61a562e5fb96`, `01412a56d7f4`, `1db25e010108`, `d9ff5cb16155`, `6ec5b5ef6d67`), and `src/lib/supabaseTranscripts.js` (`f3d20726d35c`, line 10). No private key/provider-secret signature was detected by that scan. An anon key is intentionally public; weak RLS is the actual risk.

**Confirmed sensitive configuration in source:** the real GHL hook destination in migration 007:67 (value omitted). `status-page/index.html:114–116` embeds a production service URL and dedicated public read-only consumer key (value omitted); this is intentional public-read access, not an admin secret, but must not be reused for the pilot. Provider login identity appears in IX documentation. Generic assignment hits in tests were fixture candidates, not proof of leaked working credentials.

Limitations: this was not an entropy scan of every binary, unreachable/dangling object, remote-only ref, Git LFS object, deployment artifact, host log or external account. Large blobs and binary office/PDF/image assets were not comprehensively inspected for credentials or beneficiary data. No key was tested against a live service. Run an approved full-history secret scanner with redacted output before broader repository distribution; review the committed GHL capability with its owner. Rotating current production capabilities is outside this audit and should be scheduled separately; the pilot must receive new credentials regardless.

### 3.6 Sensitive data at rest, in transit and in logs

| Location | What can be plaintext / duplicated | Controls and remaining issue |
|---|---|---|
| `contacts` | Names, phone, email, DOB, address remain alongside `pii_encrypted`, blind indexes/initials/last-four fields. | Migration 022 explicitly retains plaintext until later phase; 023 attempts column restrictions, 042 binds decrypt RPC to subject/assignment. No phase deleting all legacy plaintext was established. Writable roster roles/assignment undermine the intended boundary. |
| Full MBI/SSN contact fields | `mbi_full`/SSN are stored via write-only encrypted RPC (`025`, `042`); MBI last four is deliberately exposed (`024`). | Do not describe all MBI as plaintext: the protected contact and intake paths encrypt it. Free text/raw vendor fields can still duplicate it. |
| Enrollment intakes | `data` contains names, phone, email, location, plan/PCP and enrollment metadata; DOB/MBI/Medicaid number separately encrypted. GHL delivery snapshot encrypted. | API decrypts three sensitive fields for authorized call access (`enrollment-intakes.js:82`). Names/phone are copied into call fields (`enrollmentIntake.js:40`). No per-read audit on this path. |
| Call records and pipeline jobs | Beneficiary/customer names/phones/state/ZIP, enrollment metadata, summaries, transcript_raw/diarized; post-call request JSON can contain original supplied payload. | Redaction is pattern-based and not comprehensive; newer MA code avoids some old enrollment columns but does not erase historical values or non-MA copies. |
| Lead intelligence and telephony/vendor tables | `contact_lead_intel.payload` stores the **whole vendor body** (`leads.js:68–74`), potentially DOB/MBI/address; inbound numbers, callback payloads, attempts, ping phone, metadata and vendor IDs are plaintext. | Encrypted contact storage does not encrypt the vendor JSON copy. Replace with explicit allowlist/minimized encrypted fields. |
| Messages, notes, activities, follow-ups, opportunities, sales | Bodies, phone numbers, notes/snippets, names and plan details can contain PII; some opportunity fields encrypted and access audited through contact decryption. | Structured validation does not prevent agents pasting identifiers into free text. Audit actual schema and protected read paths; no blanket PHI-free claim. |
| Transcript stores | `call_transcripts`, `transcript_chunks`, telephony/transcript segments, call inline text, manual gap source snapshots, detections and scorecard evidence can retain identifiable speech. Embeddings encode source meaning. | Regex redaction covers formatted identifiers, some DOB/addresses; not person names, all spoken numbers or every address/MBI variation. `phi_scrubbed=true` is not proof of de-identification. |
| Audio/media | Twilio recordings and private storage contain original speech; MMS and downloaded PDFs/text/Nextcloud copies may contain sensitive material. | Storage encryption at rest is different from field encryption/de-identification. Approve access, retention, exports and device security. |
| Runtime logs / diagnostics | Legacy `console.error(error)` paths (`transcribe.js:331,337`, `leads.js:82`, `coach.js:94`), provider error text returned to clients, vendor response body logging (`complianceUploads.js:136–137`), diagnostic DB fields and AI shadow outputs. | Many new paths use IDs/error codes and redaction; arbitrary DB/provider errors may echo submitted data. `safeIxMessage` removes URLs/secrets but is not full PII redaction. Platform request logs may capture query/path capabilities. |
| Browser state/downloads | Live notes/intake/transcripts in React state; local PDF export; cached tenant/record data; recovery/outbox paths. | No assertion that all browser storage is encrypted. Inspect IndexedDB/session/local storage and account-switch cleanup during acceptance; synthetic data only until verified. |

### 3.7 Data sent to processors

- **Twilio:** raw caller/agent speech, telephone identifiers and SMS/MMS body/media, call/recording metadata. It necessarily receives unredacted audio. Recording deletion after storage copy is optional (`DELETE_TWILIO_RECORDINGS_AFTER_COPY`), not a retention guarantee.
- **Deepgram:** raw live audio for each side of a call (`deepgramTrack.js:9–11`) and selected recordings/gap WAVs. Live URL has no provider redaction parameter. Local redaction occurs after recognition before durable segment persistence; batch paths request redaction but provider still receives raw audio. Sentiment/topics/intents/summaries are additional processing, not free privacy guarantees.
- **OpenAI:** live system/messages/static messages and supplied tools (`coach.js:71–76`), scoring/summary transcripts, transcript-import/embedding text and other prompt context. Server coach accepts messages without a universal pre-provider scrub; names/health discussion and unsupported identifier formats can pass. Embedding and scoring paths need independent review of their redaction, not reliance on frontend scrubbing.
- **Anthropic:** retained SDK/adapter, configurable live provider/shadow calls, RTS ingestion content (agent names/NPN/carrier documents) and knowledge-update material. `src/lib/llm/config.js:33–34`, `client.ts:113`, `rts-ingest.js:175–185`, `_knowledgeUpdate.js:107`. Shadows can duplicate sensitive prompts and persist outputs; unset shadow settings for pilot.
- **GHL:** intake intentionally includes full DOB/MBI/Medicaid identifiers, name, phone/email and plan fields after decrypting the queued snapshot (`enrollmentWebhook.js:14–15`, `enrollmentIntake.js:39`); post-call delivery is a separate path. Only enable after confirming agency destination and approved fields.
- **Conversely / SunFire IX:** recording audio or fetch grants plus enrollment/call/customer/agent metadata, confirmation code/team name. Provider response and presigned upload state may themselves be sensitive. Do not send test enrollments to production IX or real enrollments to test unintentionally.
- **Resend/vendor reports:** operational alerts and call disposition/reconciliation data; configured report projections include caller-phone fields (`integrations/payloads.js`). Validate recipient scope; hardcoded current-agency recipients are unacceptable for pilot.
- **Nextcloud:** selected complete call rows/artifacts and transcript fallback copied to office WebDAV; currently not an always-on hosted feature. **Giphy** receives searches/media fetches; **CSG** would receive age/ZIP/gender/tobacco quote criteria if enabled. **Clerk/Stripe** receive authentication/billing identifiers, respectively.

No Sentry/LogRocket/Bugsnag/Datadog runtime integration was found in tracked source/manifests; this does not exclude hosting logs or dashboard-installed monitoring. No AssemblyAI/Groq/Whisper/ElevenLabs/Gemini reference was found in the targeted text scan; Anthropic is still actively used and must not be removed as merely stale. `VITE_BIBLIA_API_KEY` remains a legacy public-key allowlist exception despite the server Biblia route.

No provider was contacted with application data during this audit. Actual retention, training settings, regional residency, applicable BAA/DPA terms and permitted uses cannot be established from source. The pilot owner must approve these before real beneficiary calls. This report does not determine legal compliance.

### 3.8 Per-user access logging

Contact RPCs `decrypt_pii`, `search_contacts_secure`, `update_pii_field` and `log_pii_access` insert `pii_access_log` entries bound to a Clerk subject (042). Administrative compliance decisions/version requests and some vendor retry/share actions retain actor fields. These are useful but incomplete.

Ordinary recording storage-signing returns directly without recording the user (`_recordingAccess.js:140–142`); provider download tickets store resource/hash/expiry but not the requesting subject (`:155–159`). Ordinary transcript, call-detail and intake GETs do not insert an access audit. Browser MMS signed-link requests also lack an application per-user audit (`MessagesThread.jsx:44–45`). Intake invokes the service decryption primitive rather than audited contact decryption. Compliance-sharing tickets have their own creator/access metadata, which does not cover all playback paths. Therefore **access to recordings, transcripts and enrollment records is not comprehensively logged per user**. Server request logs or a signed URL's object-access log do not establish who viewed the underlying file after sharing.

### 3.9 Dependency audit

Executed `npm audit --json --package-lock-only --ignore-scripts` against the public npm registry, separately in root and telephony. No install, automatic fix or application execution. Initial sandbox DNS failure was retried with approved network access. Results are dated, dependency-level advisories, not proof of exploitability in EnrollGen.

| Scope | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Root manifest/lock (frontend, Netlify and integrations image dependency source), all dependencies | 2 | 14 | 4 | 1 | 21 |
| Telephony manifest/lock, all dependencies | 1 | 3 | 1 | 0 | 5 |
| Root production dependencies only (`--omit=dev`) | 2 | 5 | 2 | 0 | 9 |
| Telephony production dependencies only (`--omit=dev`) | 1 | 3 | 1 | 0 | 5 |

Root critical: `@clerk/shared`, `jspdf`. Root high: `@clerk/backend`, `@clerk/clerk-react`, `brace-expansion`, `browserslist`, `dompurify`, `flatted`, `js-cookie`, `js-yaml`, `nanoid`, `picomatch`, `postcss`, `source-map-js`, `vite`, `xlsx`. Moderate: `@humanfs/node`, `baseline-browser-mapping`, `fast-uri`, `fflate`; low: `@babel/core`. Telephony critical: `proxy-addr`; high: `axios`, `body-parser`, `follow-redirects`; moderate: `qs`.

Examples requiring review: [Clerk authorization checks](https://github.com/advisories/GHSA-w24r-5266-9c3c), [Clerk middleware protection](https://github.com/advisories/GHSA-vqx2-fgx2-5wq9), [jsPDF object injection](https://github.com/advisories/GHSA-7x6v-j9x4-qf24), [SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [proxy-addr IP spoofing](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). npm reports fixes for all listed packages except `xlsx`; no blind forced upgrades. Middleware-specific Clerk advisories are not automatically exploitable through this code's direct `verifyToken` usage. Vite/build-tool issues differ from deployed runtime routes.

The integrations image installs root production dependencies (`integrations/Dockerfile:4–5`), so it inherits that dependency graph even when some packages are unused. The Supabase function uses Deno imports/`deno.lock` and has no independent npm manifest; npm audit is **not applicable** to that runtime and does not cover the Deno dependency graph. Nextcloud/Python/container images likewise need their own future image/dependency scan. Root manifest requests jsPDF `^4.2.0` and the lock resolves `4.2.0`; the audit still reports advisories. Verify the clean locked install after upgrades.

## 4. Capacity for 12 concurrent agents

### 4.1 Routing and contention walkthrough

1. Twelve browser agents obtain Clerk-verified Twilio/agent socket tokens. Phone-ready WebSocket state renews DB presence every 15 seconds; leases are 45 seconds (`phonePresence.js:4,24`; 039:22). Presence sweep runs every 15 seconds. Twelve agents imply roughly 48 lease renewals/minute before UI polling/reconnects; extra browser tabs add sessions.
2. Inbound voice is signature-checked and idempotent routing middleware runs before work. Routing resolves caller/contact/vendor/direct number, then claims an agent atomically before ringing (`twilioVoice.js:178–195`). Current customer/callback routing uses call-SID advisory lock plus row locks/`SKIP LOCKED` (`109:22–32`); it does not simply read an availability boolean. Twelve simultaneous eligible calls should claim twelve distinct available agents if licenses/presence permit.
3. The thirteenth ordinary call, or any call with no eligible agent, goes to voicemail rather than a waiting queue (`twilioVoice.js:262`; voicemail maximum 120 seconds at `:35`). Matched Paragon traffic can fast-reject based on vendor/ping rules rather than voicemail (`:203–219`). With 20 incoming calls and only 12 agents, expect at least eight voicemail/reject outcomes, not 20 agent conversations. State/license constraints can produce overflow sooner.
4. Dial-result callbacks retry other eligible agents with tried-agent exclusions; completed/late callbacks release only the matching call reservation. Verify parent end vs late answer, duplicate callback, double-tab dialing, direct-DID return calls, callbacks-only status and inbound/outbound collision. `release_call_agent` binds to CallSid (`availability.js:40–46`); attribution guards and routing replay are important safeguards, not proof all interleavings pass.
5. Callbacks have two meanings: Twilio status/dial/recording callbacks and human follow-up/callback tasks. The latter are DB tasks/UI polling; no general guaranteed automatic callback dialer was established. Ensure overflow voicemail creates visible actionable work and has an owner/SLA; do not infer the greeting's promise is implemented automation.
6. Standard media uses one both-tracks Twilio stream split into two single-channel Deepgram connections. Twelve calls require about **24 STT streams**, twenty connected calls about **40**, plus conferences/reconnect/fallback headroom. Voicemail/Paragon reject need not consume the full two-sided STT capacity. Use 20 connected-call media simulations separately from the 12-agent routing test.
7. Conference operations have per-call 90-second token locks and 20-second media leases (121:85,146), unique participant/SID constraints, ownership transfer and recovery. At 12 busy agents, an internal transfer needs another eligible agent or fails/voicemails according to flow; adding an external participant consumes an additional call leg/STT stream. Test simultaneous hold/add/remove/transfer/hangup and lock expiry after process failure before enabling.
8. **Do not horizontally scale telephony without new fan-out.** `agentSocket.js:10,69` holds per-agent sockets in a process-local Map. A Twilio media connection and the agent browser on different replicas will not automatically exchange live transcripts; DB leases prevent duplicate work but do not route messages. Use one replica initially; distributed pub/sub or provable affinity is needed before scaling out.

Contention and growth risks:

- Presence sweep locks all availability rows in order (`109:73`); at 12 rows likely modest, but slow transaction/network work can make `SKIP LOCKED` route around temporarily locked otherwise-eligible agents. Measure false overflow and lock time under simultaneous heartbeat/claims.
- Transcript persistence locks a call row and repeatedly aggregates its accumulated segments (`121:200–224` and earlier durable transcript routines). Work grows with call length, segment count and concurrent streams; a 20-minute call is not equivalent to a two-minute smoke test.
- Global scoring UTC budget row/lock (`133:138–149`), recovery advisory lock (`147:59`) and vendor-control/weekly-slot serialization can queue work. Job leases, idempotency and `SKIP LOCKED` are present; killing a worker mid-provider request still needs reconciliation of ambiguous results.
- Stream buffering is bounded at 2 MiB per Deepgram track (`deepgramTrack.js:12`): 24 tracks alone can reserve ~48 MiB, 40 ~80 MiB, before JS objects, transcription, websocket, recordings and concurrent downloads. Recording helpers impose limits but provider/gap/PDF work can dominate memory. Railway CPU/memory allocations are not pinned in `railway.json`.
- CRM loads and refreshes contacts every 20 seconds and opportunities in repeated pages (`useContacts.js`, `useOpportunities.js`); multiple panels can duplicate hydration. This is table-size dependent, not just seat-count dependent.
- Presence/media leases have deletes; that does not clean durable `telephony_events`, `telephony_call_attempts`, routing replay, transcript segments/copies, usage, post-call jobs/requests, scoring ledgers, integration delivery attempts, report access, enrollment revisions, audit tables or retained recordings. Expiry predicates are not deletion. Define approved retention before volume accumulates.

### 4.2 Quotas and service limits

| Service | Assessment for this workload / manual gate |
|---|---|
| Twilio | Default outbound REST call creation is 1 CPS per account/subaccount; this is not “one concurrent call,” and inbound/TwiML paths differ. Budget at least 24 active legs for 12 customer/browser conversations, plus voicemail, dial attempts and conference/transfer headroom. Verify paid account concurrent call/participant/API limits, CPS burst behavior, queue delay and carrier/geographic permissions. New/trial accounts may have other restrictions. [Call resource](https://www.twilio.com/docs/voice/api/call-resource), [concurrency error](https://www.twilio.com/docs/api/errors/10004). |
| Deepgram | Published PAYG Nova-2 limits show up to 150 streaming/50 prerecorded requests, but secondary self-service projects can be restricted to one stream. Combined intelligence calls use the lower applicable limit. Obtain at least 40 streams plus tested headroom; do not bypass limits by splitting projects. [Official limits](https://developers.deepgram.com/reference/api-rate-limits). |
| OpenAI | Model access, RPM, TPM, organization/project spend and shared-family limits are account-specific. Twenty simultaneous summaries/scorers can burst even at low daily average. Verify `gpt-5.6-luna` availability and configured fallback/shadow models. [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits). |
| Local scoring budget | Hard maximum 2,000,000 input+output tokens/day (`scoringConfig.js:2,14–16`; 133). At 12 × 40 = 480 calls/day this allows only **4,167 reserved tokens per call if every call is scored**. Output reservation can be 4,096 before transcript/prompt input. With a 14,096-token reservation example, only ~141 daily calls fit. Sales-only scoring may lower count, but acceptance must measure sales fraction/prompt size; do not silently increase the cap. |
| Supabase | Pro published Realtime included peak is 500, with message/join limits also relevant; 12 agents are comfortably below connection count in a normal client setup, but repeated clients/tabs and polling matter. Micro compute has finite direct/pooler DB connections; most app requests use PostgREST rather than one direct connection per agent. Check actual API pool, RPC latency/locks, storage/egress and compute tier. [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [pricing](https://supabase.com/pricing). |
| Railway | No source-verified RAM/CPU/replica allocation; healthcheck only proves the process responds. Begin with measured headroom for ~40 streams and concurrent media copy, one telephony replica, independent worker; alert on RSS, CPU/event-loop delay, restarts and queue age. [Usage pricing](https://railway.com/pricing). |
| Netlify | Background/scheduled execution, function concurrency, duration, payload and credit limits depend on plan. Verify worker completion during bursts, not just HTTP 202. Disable irrelevant scheduled work. [Credit-plan limits/pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/). |

### 4.3 Monthly cost estimate

Planning assumptions: **22 working days/month**, 40 calls/day/agent, 20 minutes/call = **880 calls and 17,600 conversation minutes per agent/month**; for 12 agents, **10,560 calls and 211,200 minutes**. This is 13h20m talk time/day/agent, excluding breaks/wrap-up; it cannot fit a normal 8-hour shift. For 30 days multiply variable costs by 30/22. Costs below are USD list-price estimates before tax, discounts, SMS, lead acquisition or compliance-contract premiums; actual account bills and enablement choices control the answer.

| Vendor / component | Formula per agent/month | Estimate |
|---|---|---:|
| Twilio local inbound PSTN + browser leg | 17,600 × (0.0085 + 0.0040) | $220.00 |
| Twilio local outbound alternative | 17,600 × (0.0140 + 0.0040), instead of inbound row | $316.80 |
| Twilio media streaming | 17,600 × 0.0044; assumes one both-tracks stream | $77.44 |
| Twilio recording | 17,600 × 0.0025 | $44.00 |
| Twilio retained recording storage | One month's retained minutes × 0.0005/month | $8.80 initially; grows with retained months |
| Twilio number allocation | Shared main DID 1.15/12, or one DID per agent | $0.10–$1.15 |
| **Twilio subtotal, no conference** | Inbound vs outbound, recording+streaming+one-month storage+shared DID | **$350.34–$447.14** |
| Deepgram live Nova-2 | 17,600 × 2 channels × (0.35/60) | **$205.33** |
| Deepgram optional full-call batch | 35,200 channel-minutes × repository planning rate 0.0043 | +$151.36 if every call reprocessed; verify current contracted rate/add-ons |
| OpenAI live planning example | 40 requests/call × 880 × (2,000 uncached input × $0.20/M + 150 output × $1.20/M) | $20.42 |
| OpenAI summary + scoring example | 880 × (10,000 input × $0.20/M + 1,000 output × $1.20/M) | $2.82, **only if workload fits the local daily cap** |
| OpenAI embeddings | 880 × 4,000 tokens × chosen embedding rate | Small relative to voice; verify `text-embedding-3-small` rate and actual chunks |
| Supabase | Planning $25/month base / 12, plus additional compute/storage/egress | $2.08 base allocation; budget $3–$10/agent pending measurements |
| Railway, both services | Example aggregate 2 GiB RAM + 1 vCPU sustained ≈ $40/month before egress; 2 services are usage-billed | Budget $4–$10/agent, measured headroom required |
| Netlify | Pilot site's credit plan, function compute/requests/egress; not agent seats | Budget $2–$8/agent; verify chosen plan |
| Clerk | 12 users within published free user allowance; paid security features may add plan cost | Budget $0–$3/agent; confirm MFA/security plan |
| Resend | Low-volume operational mail, plan dependent | Budget $0–$2/agent |
| Anthropic, Conversely, IX, GHL, Paragon, CSG, Nextcloud | Off baseline; price by actual contract/use/storage. Paragon lead rate can dwarf infrastructure. | **Not included; obtain quotes** |
| Stripe | Off baseline; processing fees apply to money collected, not calls | $0 while disabled |

**Working baseline budget: roughly $590–$710 per agent/month, or $7.1k–$8.5k for 12**, using live two-channel STT, no routine full-call batch, no conferences and modest AI assumptions. This is a scenario, not a forecast from production usage. Full-call batch adds roughly $151/agent at the repo's unverified batch rate. Twilio storage retained for 12 equal-volume months adds up to $105.60/agent/month at the simple rate before volume adjustments; do not assume storage stays at the month-one charge.

Conference costs are additive participant-minutes (starting $0.0018/participant/minute), extra PSTN/browser legs and participant streams/recordings. Actual topology determines whether existing stream/recording costs are replaced or duplicated. Model a transfer/conference fraction separately rather than multiplying all base costs by three.

Rates checked against [Twilio US voice pricing](https://www.twilio.com/en-us/voice/pricing/us), [Deepgram pricing](https://deepgram.com/pricing), [GPT-5.6 Luna pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Supabase pricing](https://supabase.com/pricing), [Railway pricing](https://railway.com/pricing), [Netlify pricing](https://www.netlify.com/pricing/) and [Clerk pricing](https://clerk.com/pricing). Luna example uses $0.20/M input and $1.20/M output; cached input, cache writes, retries, tools, shadows and differing models change cost. Infrastructure ranges are explicit planning allowances, not vendor quotes. No current account spend/limits were accessed.

### 4.4 Non-production load plan and script outline — DO NOT RUN as part of this audit

The test has two layers: (A) deterministic local/pilot protocol simulation with fake providers, and (B) a small separately authorized paid pilot Twilio/Deepgram canary. Fake signed callbacks alone do not validate real PSTN audio, browser device readiness, provider quotas or actual recordings.

1. Require an explicit allowlist of the disposable Supabase, Clerk, Railway and Netlify hosts; fail if any host/project/account matches the current agency or if allowlist is absent. Use generated synthetic personas and prerecorded non-personal speech, no production data, phone numbers, keys or recording URLs.
2. Seed 12 distinct active test subjects and matching enrolled/roster/availability/recording mappings with realistic state-license variations. Disable GHL/IX/Conversely/Paragon mail/Nextcloud; outbound destinations are stubs/owned test numbers only. Set a hard call/time/spend ceiling.
3. Open 12 authenticated browser sessions and agent sockets; obtain voice tokens; explicitly exercise phone-ready and 15-second pong/lease renewals. Verify unavailable/offline/callbacks-only states and multiple tabs.
4. Burst 20 signed inbound calls. Assert 12 or fewer unique reservations, eight or more defined overflow outcomes, no agent assigned two different active CallSids. Then run a separate 20-connected-call media simulation to test 40 STT tracks without pretending 12 agents can answer all 20.
5. Maintain 20-minute audio sessions; verify partial/final transcript arrival, durable transcript continuity, recording callbacks/storage, disposition/intake requirements and post-call processing. Burst end-of-call work to reveal scoring/rate/queue limits. Run 60-minute churn and a longer bounded soak separately.
6. Faults: duplicate/reordered status/recording callbacks; lost response after DB commit; parent hangup during routing; stale agent release; browser sleep/disconnect; expired token/foreign account SID; slow DB; Deepgram 429/timeout/disconnect; repeated gaps; provider 5xx; worker kill/restart mid-lease and mid-upload. Assert bounded retry, one billed job/grant where intended and no silent data loss.
7. Conference cohort: simultaneous hold/add/transfer/remove, no spare-agent transfer, customer early hangup, duplicate callbacks, process restart with active conference and flag-off drain. Only enable conference after evidence/ownership/recording checks pass.
8. Collect request p50/p95/p99, routing time, false-overflow rate, reservation/lease conflicts, STT lag/coverage, connection/track counts, CPU/RSS/event-loop lag, DB lock/query latency, queue age, retries, provider cost and all user access audits. Use safe test IDs, never request bodies/tokens.
9. Proposed gates: zero unauthorized successes, double assignments or cross-agent evidence leaks; zero missing terminal call/recording linkage; no duplicate upload/billed request under retries; presence removal within lease+sweep tolerance (~60s); normal routing p95 <2s and webhook acknowledgments below provider deadline; live transcript p95 <3s under normal network; post-call eligible completion p95 <2 minutes when quota available; stable memory/no backlog growth after soak; operator-visible failure for every exhausted job. Targets must be agreed before test, not retroactively declared passed.

```javascript
// Outline only. Future harness must implement these adapters and guards.
assertExplicitPilotAllowlist(config); // refuses production and unknown hosts
assertSyntheticDataAndBudget(config);
const providers = await startFakeTwilioDeepgramAndWebhookSinks();
const agents = await provisionSyntheticAgents(12); // disposable pilot only
const sessions = await Promise.all(agents.map(openAuthenticatedPhoneSession));
await assertReadyLeases(sessions);
const arrivals = makeSyntheticCalls(20, { durationSeconds: 1200 });
await burst(arrivals.map(call => signedPilotWebhook('/twilio/voice', call)));
await assertUniqueReservationsAndOverflow({ agents: 12, calls: 20 });
await simulateMediaTracks(40, { realtimePacing: true, syntheticAudio: true });
await exerciseCallbackPermutationsAndConferenceFaults();
await assertOwnershipAndAdminNegativeCases();
await drainWithinBoundedDeadline();
await reconcileCallsRecordingsTranscriptsIntakesJobsAndCosts();
await collectRedactedMetrics();
// Cleanup is a separately reviewed test-data operation; preserve evidence first.
```

No load script was created or run; only this outline is delivered, as requested.

## 5. What must be checked by hand

1. Current hosted schema/ledger drift and final routines/policies/grants, including missing base tables, 074 patch, abandoned 143, 144–149 status, exposed schemas/views and PII column privileges. This audit did not read production.
2. Current Clerk sign-up/invitation restrictions, signed org/admin claims, Supabase trust, MFA/session settings, disabled-agent behavior and actual env-flag names configured on each service. Never paste values into review logs.
3. Actual API/deployment inventory: old Supabase functions such as historical set-availability, Netlify schedule direct-invocation behavior, existing public status sites, obsolete deploys and aliases. Source cannot inventory hosted orphan endpoints.
4. Pilot provider credentials/destinations/account ownership, Twilio sender/A2P/number/TwiML configuration, signature proxy behavior, recording access settings and emergency/geographic permissions.
5. Deepgram stream entitlement for the specific new project; OpenAI/Anthropic model and spend limits; Railway replica/CPU/RAM; Supabase compute/connections/backups/Realtime/storage/egress; Netlify function/credit plan. Obtain actual limits before acceptance.
6. Every bucket's privacy, object policies and lifecycle, restore/PITR capability, encrypted-key recovery, storage download audit and any manual DB scheduled jobs not in the repository.
7. Approved processor/retention/contract posture for actual beneficiary data, real outbound webhook payloads/recipients, office exports, error/platform logs and source/binary artifacts containing real data. No legal-compliance conclusion is made here.
8. Actual call volume, working days, mean and tail call length, inbound/outbound/conference mix, sales-only scoring fraction, AI requests/token counts, retranscription fraction and retained recordings. Replace the budget scenario with observed pilot meters.
9. Existing external Medicare intake URL/form, GHL workflow mapping, IX login/team and Conversely Target contract. Current internal intake code does not establish external portal configuration.
10. Fresh-project build/install, schema bootstrap, negative authorization suite and full 12-agent/20-call acceptance results. None were run during this read-only audit. No claim of passing load tests or clean migration replay is made.


## Appendix A. Agency/configuration occurrence index

This supplements §1 with every matched tracked runtime/config/SQL file in the targeted name, phone, identity, vendor, hours and office-sync search. References deliberately omit values, including capability URLs and login identities. Each category states the treatment; `process.env`/`import.meta.env` names are resolved individually in Appendix B. Seed/migration occurrences are historical/bootstrap defaults, not proof of current database values. Pattern matches in general-purpose phone formatting or public carrier numbers require context; they are indexed rather than silently discarded. Binary documents, externally hosted forms and actual tenant rows still require the manual checks in §5.


### Agency name, alias or organization marker

Hardcoded text/default unless explicitly reading tenant fields. Use deployment agency display/aliases; remove NGHS operational seed. Product EnrollGen brand may remain.

| File | Matching lines |
|---|---|
| `integrations/complianceUploads.js` | 31 |
| `integrations/ixUploads.js` | 15, 102 |
| `integrations/worker.js` | 90 |
| `netlify/functions/_evidenceAccess.js` | 57 |
| `netlify/functions/_tenantSettings.js` | 483 |
| `netlify/functions/backfill-analytics.js` | 43, 66 |
| `netlify/functions/paragon-daily-email.js` | 43 |
| `netlify/lib/postCallProvider.js` | 37, 42 |
| `scripts/availability/register-app-consumers.sql` | 5 |
| `src/compliance/rules/originalMatchers.js` | 9 |
| `src/components/BillingSettings.jsx` | 155 |
| `src/components/CarrierRef.jsx` | 474, 553, 881, 1075, 1086, 1231 |
| `src/components/ClientQuickScripts.jsx` | 12, 64, 91, 123 |
| `src/components/LandingPage.jsx` | 61 |
| `src/components/SessionSummary.jsx` | 474 |
| `src/components/ancillary/ancillaryPopupData.js` | 120 |
| `src/context/MedSupScript.js` | 10 |
| `src/context/SEPScript.js` | 2, 9 |
| `src/context/TranscriptAnalyzer.js` | 271, 272, 273, 274, 276, 277 |
| `src/data/acaComplianceKnowledge.js` | 12, 24, 259 |
| `src/data/agencyClosing.js` | 1 |
| `src/data/carrierReference.js` | 29 |
| `src/data/complianceKnowledge.js` | 11, 19 |
| `src/data/enrollmentClosing.js` | 2 |
| `src/data/maScript2027.js` | 142, 152, 160, 161, 171, 196, 267 |
| `src/data/medSupComplianceKnowledge.js` | 11, 15, 217 |
| `src/data/sepCarriers.js` | 5 |
| `src/flows/aca/ACAData.js` | 12, 19, 178, 204 |
| `src/flows/aca/StateACAData.js` | 8 |
| `src/flows/ancillary/ancillarySteps.js` | 116, 119, 164 |
| `src/flows/u65/U65Data.js` | 96, 101, 401, 423 |
| `src/hooks/useAcaCopilotEngine.js` | 256 |
| `src/hooks/useCopilotEngine.js` | 470 |
| `src/hooks/useMedSupCopilotEngine.js` | 219 |
| `src/lib/agencyLine.js` | 2 |
| `src/lib/agentIdentity.js` | 25 |
| `src/lib/enrollmentIntake.js` | 12, 39 |
| `status-page/index.html` | 6, 97, 115 |
| `supabase/migrations/007_multi_tenant_foundation.sql` | 55, 66, 90 |
| `supabase/migrations/009_knowledge_base.sql` | 162, 170, 200, 773, 794, 821, 1121, 1165, 1169, 1173, 1192, 1353, 1363, 1378, 1382, 1387, 1420, 1759, 1785, 1806, 3704, 4139, 4142, 4209, 4213 |
| `supabase/migrations/010_tenant_settings_onboarding.sql` | 207, 230 |
| `supabase/migrations/013_script_templates.sql` | 64, 75, 97, 103, 118, 125, 130, 131, 146, 153 |
| `supabase/migrations/014_update_u65_script_template.sql` | 23, 147, 156 |
| `supabase/migrations/028_remove_org_gating.sql` | 7, 9, 14 |
| `supabase/migrations/047_availability_feed.sql` | 161 |
| `supabase/migrations/075_tpmo_grading_2027.sql` | 113, 121 |
| `supabase/migrations/115_ma_cy2027_taxonomy.sql` | 215 |
| `supabase/migrations/141_approved_cy2027_retirements.sql` | 14 |
| `supabase/migrations/142_script_stage_applicability.sql` | 30 |
| `supabase/migrations/143_cms_only_rubric.sql` | 30 |
| `supabase/migrations/144_restore_full_compliance_rubric.sql` | 31 |
| `supabase/seeds/002_scoring_template.sql` | 2, 12 |
| `telephony/src/config.js` | 62 |

### Fixed telephone/agency-line reference

Literals are hardcoded; named env references are already configurable. Use deployment display/DID config; exclude public regulator/carrier support numbers from agency replacement after review.

| File | Matching lines |
|---|---|
| `src/compliance/intents/enrollment-closing.js` | 277, 278, 279, 280, 309, 310, 311, 312 |
| `src/components/ancillary/carrierReferencePopupData.js` | 446 |
| `src/components/phone/ConferenceControls.jsx` | 20 |
| `src/components/phone/DialerPanel.jsx` | 23, 192 |
| `src/context/SEPScript.js` | 204 |
| `src/data/agencyClosing.js` | 1 |
| `src/data/carrierReference.js` | 33, 52, 72, 92, 112, 132 |
| `src/data/complianceKnowledge.js` | 579, 599, 615 |
| `src/data/enrollmentClosing.js` | 2, 7 |
| `src/data/maScript2027.js` | 191 |
| `src/data/stateSepData.js` | 75, 91, 240, 319, 324, 451, 482 |
| `src/lib/agencyLine.js` | 2, 3, 4 |
| `supabase/migrations/009_knowledge_base.sql` | 712, 732, 748, 769, 3481, 3487, 3563, 3636, 3642, 3681, 3757, 3814, 3896, 4063, 4097, 4123, 4124, 4125, 4126, 4127, 4128, 4213, 4237, 4265, 4286, 4309, 4329 |
| `supabase/seeds/001_compliance_intents.sql` | 2763, 2786 |
| `supabase/seeds/005_sales_forum_2026_seed.sql` | 272 |
| `telephony/src/conferenceCalling.js` | 164 |
| `telephony/src/config.js` | 56, 57 |
| `telephony/src/directRouting.js` | 8, 13 |
| `telephony/src/routes/leads.js` | 28 |
| `telephony/src/routes/sms.js` | 184 |
| `telephony/src/routes/voiceOutbound.js` | 130 |

### Agency identity, enrollment assignee or script identifier

Mixed hardcoded identity/defaults and existing tenant DB settings. Bind protected pilot roster/org/tenant; parameterize agency display. Do not copy Clerk IDs.

| File | Matching lines |
|---|---|
| `integrations/complianceUploads.js` | 129, 130 |
| `integrations/converselySelection.js` | 29 |
| `netlify/functions/_clerkAuth.js` | 78 |
| `netlify/functions/_copilotSkipCounter.js` | 12 |
| `netlify/functions/_evidenceAccess.js` | 43, 44, 52, 59, 62, 64, 75, 87, 88, 102 |
| `netlify/functions/_knowledgeUpdate.js` | 282 |
| `netlify/functions/_recordingAccess.js` | 14 |
| `netlify/functions/_rtsIngestion.js` | 69 |
| `netlify/functions/_subscriptionGate.js` | 2, 21, 31, 35 |
| `netlify/functions/_telephonyLink.js` | 12 |
| `netlify/functions/_tenantSettings.js` | 3, 401, 402, 414, 438, 487 |
| `netlify/functions/backfill-analytics.js` | 7, 8, 28, 31, 36, 43 |
| `netlify/functions/call-disposition.js` | 14 |
| `netlify/functions/coach.js` | 70 |
| `netlify/functions/compliance-review.js` | 23, 24 |
| `netlify/functions/compliance-uploads.js` | 10, 11, 13, 15, 18, 19 |
| `netlify/functions/compliance.js` | 54, 72, 81, 84 |
| `netlify/functions/deepgram-token.js` | 83 |
| `netlify/functions/embeddings.js` | 30, 35 |
| `netlify/functions/evidence-session.js` | 22 |
| `netlify/functions/paragon-residence.js` | 19 |
| `netlify/functions/paragon-zip-confirm.js` | 3, 14, 15, 18, 28, 35, 40, 46, 67 |
| `netlify/functions/post-call-background.js` | 20 |
| `netlify/functions/post-call.js` | 68 |
| `netlify/functions/rts-ingest.js` | 57, 59, 69, 70, 99, 128, 377, 451 |
| `netlify/functions/seed-new-tenant.js` | 23, 24, 42, 48, 51, 53, 66, 71, 154 |
| `netlify/functions/set-availability.js` | 11, 22, 25, 27, 28, 38 |
| `netlify/functions/stripe-checkout.js` | 88, 95 |
| `netlify/functions/stt-reconnect.js` | 10 |
| `netlify/functions/stt-usage.js` | 27 |
| `netlify/functions/test-ghl-webhook.js` | 26, 27 |
| `netlify/functions/transcript-import.js` | 46, 87 |
| `netlify/functions/vendor-pause.js` | 2, 12, 15 |
| `netlify/functions/vendor-routing.js` | 3, 18, 22, 27, 40, 64, 96, 98, 99 |
| `netlify/lib/postCallWork.js` | 67, 74, 87, 92, 200, 218, 282, 434, 495, 499, 579, 803 |
| `release/release-slim.sql` | 47, 83, 111 |
| `scripts/integrations/create-lead-source.js` | 5 |
| `scripts/repair-transcription-schema.sql` | 47, 48, 49, 56, 58, 62, 63, 64, 65, 75, 76, 77, 87, 88, 89, 92, 93, 96, 97, 98, 99, 123, 124, 128, 132 |
| `scripts/seed_carrier_rts.js` | 18, 19, 69, 106, 115, 122 |
| `scripts/sep-data/ingest-snp-plans.js` | 157 |
| `scripts/sep-data/ingest-star-ratings.js` | 165 |
| `scripts/sep-data/ingest-zip-crosswalk.js` | 57 |
| `src/App.jsx` | 1200, 1201, 1222, 1225 |
| `src/compliance/engine/IntentClassifier.js` | 131 |
| `src/compliance/intents/call-opening.js` | 294 |
| `src/compliance/rules/cmsBasis.js` | 33 |
| `src/compliance/rules/eventDeductions.js` | 4, 27 |
| `src/compliance/rules/originalRubric.js` | 291 |
| `src/components/Onboarding.jsx` | 15, 23, 26, 36, 39, 63, 64, 139, 140, 155, 156, 218 |
| `src/components/RTSTab.jsx` | 224 |
| `src/components/TenantSettings.jsx` | 269, 274, 294, 308, 368, 392, 399, 493, 527, 528, 588, 620, 621 |
| `src/components/enrollment/EnrollmentIntake.jsx` | 8, 96 |
| `src/components/medsup/RateComparisonPanel.jsx` | 143 |
| `src/context/ThemeContext.jsx` | 102, 105, 108, 155, 157 |
| `src/context/TranscriptAnalyzer.js` | 480, 1890 |
| `src/hooks/useAdminReviewAccess.js` | 9 |
| `src/hooks/useContacts.js` | 462 |
| `src/hooks/useDashboardData.js` | 23, 31, 32, 66, 90 |
| `src/hooks/useTenantConfig.js` | 50, 122, 190 |
| `src/lib/agentIdentity.js` | 74 |
| `src/lib/dashboardScope.js` | 6, 11 |
| `src/lib/enrollmentIntake.js` | 3, 4, 12, 33, 39 |
| `src/lib/postCallPipeline.js` | 114, 119, 134, 142, 154, 163, 165, 175, 180, 447, 451 |
| `supabase/migrations/000_session_tracking.sql` | 7, 68, 75, 84, 92, 102, 110, 119, 127 |
| `supabase/migrations/002_post_call_pipeline.sql` | 116, 122, 132, 152, 162, 183, 193, 213, 223, 243, 253, 403, 414 |
| `supabase/migrations/007_multi_tenant_foundation.sql` | 10, 15, 25, 26, 36, 37, 62, 97, 100, 106, 182, 225, 227 |
| `supabase/migrations/009_knowledge_base.sql` | 60, 66, 73, 74, 89, 93, 124, 135 |
| `supabase/migrations/010_tenant_settings_onboarding.sql` | 25, 46, 47, 48, 55, 57, 206, 207 |
| `supabase/migrations/013_script_templates.sql` | 58, 60 |
| `supabase/migrations/014_update_u65_script_template.sql` | 12, 14 |
| `supabase/migrations/016_user_preferences.sql` | 5, 6, 13, 14, 15, 19, 21, 22, 23, 24, 25, 27, 28, 29 |
| `supabase/migrations/020_sales_log.sql` | 9, 19, 28, 35, 44, 55, 66 |
| `supabase/migrations/022_pii_protection_phase1.sql` | 313, 316, 341, 355, 383, 393, 412, 413, 441, 451, 461, 462 |
| `supabase/migrations/023_pii_protection_phase2_rls.sql` | 108, 122, 131, 135, 136, 175, 184, 228 |
| `supabase/migrations/025_full_mbi_field.sql` | 43, 52, 81, 82 |
| `supabase/migrations/026_add_mike_shiomos_agent.sql` | 2, 14 |
| `supabase/migrations/028_remove_org_gating.sql` | 4, 5, 36 |
| `supabase/migrations/029_create_carrier_rts.sql` | 10, 31, 34 |
| `supabase/migrations/030_rts_ai_ingestion.sql` | 158, 179, 198, 214, 255, 260, 269, 274 |
| `supabase/migrations/031_rts_shared_agent_edit.sql` | 36, 39, 43, 54, 57, 61 |
| `supabase/migrations/035_llm_silence_counters.sql` | 13, 22 |
| `supabase/migrations/037_ensure_call_logs.sql` | 23, 24, 28, 32 |
| `supabase/migrations/040_session_preferences_compatibility.sql` | 45, 46, 47, 54, 56, 60, 61, 62, 63, 73, 74, 75, 85, 86, 87, 90, 91, 94, 95, 96, 97 |
| `supabase/migrations/042_auth_subject_binding.sql` | 10, 31, 37, 53, 54, 71, 77, 84, 85, 102, 111, 117, 120, 121, 136, 142, 171, 175, 196, 197 |
| `supabase/migrations/043_contacts_phone_identity.sql` | 109, 124, 125 |
| `supabase/migrations/044_agent_contact_details.sql` | 9, 30, 36, 49, 50, 67, 73, 80, 81, 108, 112, 132, 133, 146 |
| `supabase/migrations/047_availability_feed.sql` | 131 |
| `supabase/migrations/048_vendor_integrations.sql` | 146, 154, 187, 363 |
| `supabase/migrations/058_opportunities_board.sql` | 94, 124, 252 |
| `supabase/migrations/059_opportunity_contact_tags.sql` | 30, 54, 69 |
| `supabase/migrations/060_call_logs.sql` | 30, 36, 45, 55 |
| `supabase/migrations/062_opportunity_soft_delete.sql` | 127 |
| `supabase/migrations/063_evidence_access.sql` | 57, 69 |
| `supabase/migrations/064_recording_ingestion.sql` | 10, 11, 13, 14, 15, 16, 18 |
| `supabase/migrations/066_outbound_call_log.sql` | 16 |
| `supabase/migrations/070_outbound_dnc.sql` | 13 |
| `supabase/migrations/073_availability_auth.sql` | 13, 14, 16, 18, 19, 22, 24, 27 |
| `supabase/migrations/084_durable_transcripts.sql` | 29, 74 |
| `supabase/migrations/086_follow_ups_workspace.sql` | 46, 82, 110 |
| `supabase/migrations/099_post_call_background_jobs.sql` | 7, 32, 37, 39, 40, 42 |
| `supabase/migrations/100_cross_sell_attempts_restore.sql` | 25, 28 |
| `supabase/migrations/101_post_call_provider_failures.sql` | 11, 12 |
| `supabase/migrations/104_call_session_identity.sql` | 18, 58 |
| `supabase/migrations/105_mandatory_call_wrap_up.sql` | 78 |
| `supabase/migrations/107_dialer_disposition_save.sql` | 11 |
| `supabase/migrations/108_disposition_only_wrap_up.sql` | 16 |
| `supabase/migrations/110_sale_disposition_compliance.sql` | 154 |
| `supabase/migrations/118_combine_calls.sql` | 12, 111, 113, 169 |
| `supabase/migrations/119_ma_disposition_opportunities.sql` | 62, 67 |
| `supabase/migrations/121_conference_calling.sql` | 126, 194, 214, 215, 216, 237 |
| `supabase/migrations/123_compliance_uploads.sql` | 56, 60, 66 |
| `supabase/migrations/125_enrollment_intakes.sql` | 125, 129, 135 |
| `supabase/migrations/131_paragon_residence_capture.sql` | 42 |
| `supabase/migrations/132_ix_test_enrollment_safeguards.sql` | 99, 103, 109 |
| `supabase/migrations/138_call_display_names.sql` | 9 |
| `supabase/migrations/142_script_stage_applicability.sql` | 43 |
| `supabase/migrations/144_restore_full_compliance_rubric.sql` | 42 |
| `supabase/seeds/001_compliance_intents.sql` | 256 |
| `supabase/validation/dylan_missing_post_call_output.sql` | 5 |
| `telephony/scripts/backfillLastConnected.js` | 9, 11, 12, 17 |
| `telephony/src/availability.js` | 12, 13 |
| `telephony/src/conferenceCalling.js` | 131, 134 |
| `telephony/src/config.js` | 65 |
| `telephony/src/media/agentSocket.js` | 43 |
| `telephony/src/routes/conferenceCalling.js` | 31, 32, 33, 34, 35 |
| `telephony/src/routes/sms.js` | 207 |
| `telephony/src/routes/voiceEvents.js` | 23 |
| `telephony/src/routes/voiceOutbound.js` | 27 |
| `telephony/src/routes/voiceToken.js` | 37 |

### Vendor/team, login and delivery target

Mixed hardcoded provider target/team/webhook defaults and env names. Use pilot-specific target/team/recipient/credentials; omit live URL seeds; gate integration. Provider base hosts may be shared.

| File | Matching lines |
|---|---|
| `integrations/complianceUploads.js` | 12, 17, 23, 26, 28, 31, 68, 70, 73, 74, 76, 87, 89, 93, 95, 100, 107, 108, 109, 125, 132, 135, 136, 137, 138, 139, 144, 146, 153, 157 |
| `integrations/converselyRuns.js` | 4, 11, 22, 24, 26, 33, 37 |
| `integrations/converselySelection.js` | 11, 12, 13, 15, 18, 19, 21, 22 |
| `integrations/enrollmentWebhook.js` | 5, 15 |
| `integrations/ixClient.js` | 6, 8 |
| `integrations/ixUploads.js` | 15 |
| `netlify/functions/compliance-uploads.js` | 48, 49, 52, 57, 59, 60, 63, 64, 68, 71, 73, 84 |
| `netlify/functions/seed-new-tenant.js` | 27, 59, 74 |
| `netlify/functions/test-ghl-webhook.js` | 14, 15 |
| `netlify/lib/postCallWork.js` | 63, 508, 517 |
| `src/components/AgentTools.jsx` | 114 |
| `src/components/Onboarding.jsx` | 27, 67, 233, 234, 235 |
| `src/components/TenantSettings.jsx` | 270, 309, 369, 424, 551, 552, 553 |
| `src/components/ancillary/AncillaryPopupManager.jsx` | 23 |
| `src/components/callLog/ComplianceUploads.jsx` | 24 |
| `src/data/stateCarrierData.js` | 394 |
| `src/lib/postCallPipeline.js` | 115, 134, 467 |
| `supabase/migrations/007_multi_tenant_foundation.sql` | 11, 59, 67, 94 |
| `supabase/migrations/010_tenant_settings_onboarding.sql` | 21 |
| `supabase/migrations/089_star_rating_sep_exact.sql` | 6 |
| `supabase/migrations/093_crosswalk_2027_statuses.sql` | 18 |
| `supabase/migrations/123_compliance_uploads.sql` | 3, 18, 21, 32, 40, 41, 42, 43, 44, 47, 48, 52, 55, 63, 78, 79, 84, 85, 90, 94, 99, 102, 109, 111 |
| `supabase/migrations/124_ix_uploads.sql` | 2 |
| `supabase/migrations/125_enrollment_intakes.sql` | 11, 99, 102, 116, 124, 132 |
| `supabase/migrations/127_conversely_manual_runs.sql` | 2, 3, 4, 8, 15, 17, 18, 20, 23, 24, 26, 30, 32, 34, 36, 37, 41, 42, 45, 47, 50, 55, 58, 61, 64, 66, 68, 71, 73, 75, 78, 82, 84, 86, 91, 93, 95, 96, 106, 114, 116, 117, 118, 121, 123, 125, 126, 131, 132, 136, 138, 141, 144, 146, 147, 148, 151, 158, 160, 164, 170 |
| `supabase/migrations/128_sunfire_ix_api.sql` | 28, 35 |
| `supabase/migrations/132_ix_test_enrollment_safeguards.sql` | 76, 83, 98, 106 |
| `supabase/migrations/149_conversely_run_events.sql` | 2, 3, 5, 11, 12, 13, 14, 15 |
| `telephony/src/recordingCompliance.js` | 46 |

### Timezone, staffed hours, senders and recipients

Mixed literals, env and DB hours. Use profile timezone/hours and verified sender/recipients. Numeric matches in scoring/data are not automatically hours.

| File | Matching lines |
|---|---|
| `integrations/converselySelection.js` | 34 |
| `integrations/diagnostics.js` | 32 |
| `integrations/ixUploads.js` | 95, 96, 102 |
| `integrations/worker.js` | 26, 29, 31 |
| `netlify/functions/_paragonControls.js` | 4, 5, 24 |
| `netlify/functions/nightly-analytics.js` | 6 |
| `netlify/functions/paragon-daily-email.js` | 7, 43 |
| `netlify/functions/paragon-vendor-report.js` | 22, 23, 27 |
| `netlify/lib/postCallProvider.js` | 37, 42 |
| `release/penetration-load.sql` | 19, 799, 1135, 1149, 1235, 1271, 1273, 1275, 1277, 1279, 1557, 1899, 1931, 2125, 2679, 3081, 3215, 3253, 4361, 5223, 5585, 6375 |
| `src/compliance/intents/pecl.js` | 421 |
| `src/components/VendorRoutingSettings.jsx` | 78, 79, 82, 83, 88 |
| `src/components/callLog/ComplianceUploads.jsx` | 8, 9 |
| `src/data/countyMaps/AL.json` | 1 |
| `src/data/countyMaps/IL.json` | 1 |
| `src/data/countyMaps/KY.json` | 1 |
| `src/data/countyMaps/NE.json` | 1 |
| `src/data/countyMaps/OR.json` | 1 |
| `src/data/countyMaps/VA.json` | 1 |
| `supabase/migrations/048_vendor_integrations.sql` | 277, 287, 288 |
| `supabase/migrations/049_paragon_pay_per_call.sql` | 6, 28, 29 |
| `supabase/migrations/052_paragon_ping_and_claim.sql` | 23, 24, 25, 33, 96, 97, 98 |
| `supabase/migrations/067_paragon_billing_hours.sql` | 8, 22, 23, 160, 169, 178, 188, 192, 454, 457, 483, 484 |
| `supabase/migrations/076_duplicate_callers.sql` | 83, 88 |
| `supabase/migrations/123_compliance_uploads.sql` | 68, 69, 82 |
| `supabase/migrations/124_ix_uploads.sql` | 60 |
| `supabase/migrations/125_enrollment_intakes.sql` | 39, 42, 137, 138, 157 |
| `supabase/migrations/127_conversely_manual_runs.sql` | 54, 111, 112, 129 |
| `supabase/migrations/128_sunfire_ix_api.sql` | 87 |
| `supabase/migrations/132_ix_test_enrollment_safeguards.sql` | 33, 36, 111, 112, 131, 222, 227, 269, 279, 280 |
| `supabase/migrations/146_script_enrollment_intake.sql` | 69, 72 |
| `supabase/seeds/001_compliance_intents.sql` | 2540 |
| `telephony/src/paragonEligibility.js` | 35 |

### Nextcloud deployment and sync

Optional stack with env config and office-specific defaults; omit or provision isolated pilot export stack.

| File | Matching lines |
|---|---|
| `infra/office-nextcloud/docker-compose.yml` | 30, 31, 32, 50, 51, 52, 53, 54, 58 |
| `infra/office-nextcloud/sync/sync.py` | 18, 19, 20, 35, 36, 37, 43, 47, 48, 263, 266, 273, 274, 293, 306, 410 |

### Historical/reference material

The following tracked documentation/seeds outside runtime source also contain agency markers or integration/login/domain history. They must not be treated as pilot configuration or copied into an onboarding runbook unchanged. References only; no credentials reproduced.

| File | Matching lines |
|---|---|
| `docs/DESIGN_SYSTEM.md` | 14, 617 |
| `docs/F17-tpmo-grading-handoff.md` | 165, 173 |
| `docs/LLM_MIGRATION.md` | 261, 264, 379, 384, 493, 498, 617, 622, 714, 718, 823, 828, 919, 923, 1036, 1041 |
| `docs/MA_SEP_Guide_2026.md` | 3 |
| `docs/UHC_IX_Integration_Spec.md` | 7 |
| `docs/cleanup-oct-handoff.md` | 16 |
| `docs/compliance-overhaul/script-backed-rules.md` | 15, 16, 17, 18, 19, 26, 27, 28, 29, 30, 31, 89 |
| `docs/compliance-reaggregation-2026-10-19.md` | 40 |
| `docs/compliance-uploads.md` | 19 |
| `docs/conference-calling.md` | 28 |
| `docs/conversely-uploads.md` | 50 |
| `docs/f18-integrations-worker.md` | 73, 74 |
| `docs/f57-u65-step2-handoff.md` | 28 |
| `docs/paragon-billing-hours-rollout.md` | 7 |
| `docs/paragon-out-of-state-tasks.md` | 5, 9 |
| `docs/paragon-vendor-report.md` | 19, 21, 23, 25 |
| `docs/review-2026-10.md` | 82, 125, 165, 438 |
| `docs/script-intake-cleanup.md` | 7 |
| `docs/supabase-api-key-migration.md` | 225, 226 |
| `docs/u65-aca-spec.md` | 3, 119, 123, 289, 321, 413, 682, 792 |
| `docs/vendor-integration-operations.md` | 43 |

## Appendix B. Environment variables by service (names only)

`S` = server secret or secret-bearing endpoint; `P` = intentionally public client/verification key or identifier; `N` = non-secret configuration. `D` = must be independently provisioned/repointed/verified for the pilot (public verification material and provider-neutral URLs may be identical only by deliberate choice); `C` = policy/capacity setting chosen per deployment, not intrinsically unique. Public/anon Supabase keys are not service keys. Never place an `S` value in `VITE_*`. Local env-file values were not used to populate this inventory. Platform flags and sample-only legacy variables are included where tracked configuration references them.

Shared-import rule: Netlify functions import `integrations/supabase.js`, enrollment/provider helpers and server-used `src/lib` modules, so deploy the **union of the relevant shared-module names** below. Frontend source entries without `VITE_` are server-used library configuration, not permission to expose those secrets to Vite. Worker imports use the root manifest. An env name appearing in an example alone does not prove a live consumer.


### Frontend build and browser source

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | S | D | `src/lib/llm/anthropic.ts:41` |
| `DEV` | N | C | `src/components/PostCallStatusAlert.jsx:13`, `src/hooks/useSessionTracker.js:72`, `src/main.jsx:143`, `src/stores/callStore.js:25` |
| `ENROLLGEN_DEBUG_LOGS` | N | C | `src/lib/llm/client.ts:26` |
| `LLM_FALLBACK_MODEL` | N | C | `src/lib/llm/client.ts:51` |
| `LLM_PROVIDER` | N | C | `src/lib/llm/config.js:34` |
| `NODE_ENV` | N | C | `src/lib/llm/client.ts:26` |
| `OPENAI_API_KEY` | S | D | `src/lib/llm/openai.ts:115` |
| `SCORING_DAILY_TOKEN_CAP` | S | D | `src/compliance/shared/scoringConfig.js:14` |
| `SCORING_ENABLED` | N | C | `src/lib/llm/client.ts:61` |
| `VITE_AGENT_AVAILABILITY_AGENT_ID` | N | D | `src/lib/agentIdentity.js:10` |
| `VITE_CLERK_PUBLISHABLE_KEY` | P | D | `src/main.jsx:16` |
| `VITE_CSG_API_KEY` | S | D | `src/services/rateQuoteService.js:6`, `src/services/rateQuoteService.js:42` |
| `VITE_CSG_API_URL` | N | D | `src/services/rateQuoteService.js:39` |
| `VITE_DISABLE_CLERK_AUTH` | N | C | `src/App.jsx:95`, `src/components/ScriptEditor.jsx:18`, `src/context/AuthContext.jsx:11`, `src/hooks/useSessionTracker.js:7`; 6 references total |
| `VITE_ENABLE_CMS_SUPABASE` | N | C | `src/lib/sepCms.js:15` |
| `VITE_ENABLE_CUSTOMER_AUDIO` | N | C | `src/components/ScriptPrompter.jsx:54` |
| `VITE_INBOUND_CALLS_ENABLED` | N | C | `src/context/InboundCallContext.jsx:40` |
| `VITE_SHOW_ACA_REFERENCE_DETAILS` | N | C | `src/flows/aca/ACAFlow.jsx:18` |
| `VITE_SUPABASE_ANON_KEY` | P | D | `src/lib/supabaseKeys.js:2` |
| `VITE_SUPABASE_CMS_ANON_KEY` | P | D | `src/lib/supabaseKeys.js:9` |
| `VITE_SUPABASE_CMS_PUBLISHABLE_KEY` | P | D | `src/lib/supabaseKeys.js:9` |
| `VITE_SUPABASE_CMS_URL` | N | D | `src/lib/supabase.js:16` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | P | D | `src/lib/supabaseKeys.js:2` |
| `VITE_SUPABASE_URL` | N | D | `src/lib/evidenceSupabase.js:21` |
| `VITE_TELEPHONY_BASE_URL` | N | D | `src/components/contacts/ComposePickers.jsx:13`, `src/context/InboundCallContext.jsx:41`, `src/hooks/useConferenceCall.js:5`, `src/hooks/useMessages.js:8`; 5 references total |

### Integrations worker/shared server modules

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `CONVERSELY_AGENT_EXCLUSIONS` | N | D | `integrations/.env.example:19`, `integrations/converselySelection.js:18` |
| `CONVERSELY_API_KEY` | S | D | `integrations/.env.example:12`, `integrations/complianceUploads.js:132`, `integrations/complianceUploads.js:135`, `integrations/complianceUploads.js:137` |
| `CONVERSELY_CARRIERS` | N | D | `integrations/.env.example:17`, `integrations/converselySelection.js:13` |
| `CONVERSELY_SAMPLES_PER_AGENT` | N | C | `integrations/.env.example:16`, `integrations/converselySelection.js:11` |
| `CONVERSELY_UPLOAD_ENABLED` | N | C | `integrations/.env.example:11`, `integrations/complianceUploads.js:68`, `integrations/complianceUploads.js:87`, `integrations/converselyRuns.js:24` |
| `GHL_ENROLLMENT_WEBHOOK_URL` | S | D | `integrations/.env.example:31`, `integrations/enrollmentWebhook.js:5`, `integrations/enrollmentWebhook.js:15` |
| `INTEGRATIONS_REPORT_FROM` | N | D | `integrations/.env.example:8`, `integrations/ixUploads.js:95`, `integrations/ixUploads.js:102`, `integrations/worker.js:26`; 5 references total |
| `IX_ENV` | N | D | `integrations/.env.example:26`, `integrations/complianceUploads.js:119`, `integrations/ixClient.js:4` |
| `IX_PASSWORD` | S | D | `integrations/.env.example:28`, `integrations/ixClient.js:8` |
| `IX_UPLOAD_ENABLED` | N | C | `integrations/.env.example:24` |
| `IX_USERNAME` | N | D | `integrations/.env.example:27`, `integrations/ixClient.js:8` |
| `RESEND_API_KEY` | S | D | `integrations/.env.example:7`, `integrations/ixUploads.js:95`, `integrations/ixUploads.js:104`, `integrations/worker.js:26`; 5 references total |
| `SUPABASE_ANON_KEY` | P | D | `integrations/supabase.js:9` |
| `SUPABASE_PUBLISHABLE_KEY` | P | D | `integrations/supabase.js:9` |
| `SUPABASE_SECRET_KEY` | S | D | `integrations/.env.example:3`, `integrations/supabase.js:5`, `integrations/supabase.js:14` |
| `SUPABASE_SERVICE_KEY` | S | D | `integrations/supabase.js:5`, `integrations/supabase.js:16` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | D | `integrations/.env.example:5`, `integrations/supabase.js:5`, `integrations/supabase.js:15` |
| `SUPABASE_URL` | N | D | `integrations/.env.example:2`, `integrations/worker.js:112` |
| `TELEPHONY_BASE_URL` | N | D | `integrations/.env.example:13`, `integrations/recordingComplianceGrant.js:25` |
| `TWILIO_ACCOUNT_SID` | N | D | `integrations/.env.example:20`, `integrations/complianceUploads.js:55`, `integrations/complianceUploads.js:56`, `integrations/complianceUploads.js:60`; 5 references total |
| `TWILIO_AUTH_TOKEN` | S | D | `integrations/.env.example:21`, `integrations/complianceUploads.js:55`, `integrations/complianceUploads.js:60`, `integrations/ixUploads.js:37` |
| `VITE_TELEPHONY_BASE_URL` | N | D | `integrations/recordingComplianceGrant.js:25` |

### Netlify/server shared imports

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `ALLOW_INSECURE_WEBHOOK_TESTS` | N | C | `netlify/functions/_tenantSettings.js:525` |
| `ANTHROPIC_API_KEY` | S | D | `netlify/functions/_knowledgeUpdate.js:107`, `netlify/functions/rts-ingest.js:165` |
| `BACKFILL_SECRET` | S | D | `netlify/functions/backfill-analytics.js:15`, `netlify/functions/backfill-deepgram-intelligence.js:23`, `netlify/functions/backfill-followups.js:18`, `netlify/functions/backfill-knowledge-updates.js:12` |
| `BIBLIA_API_KEY` | S | D | `netlify/functions/biblia.js:9` |
| `CLERK_AUDIENCE` | N | D | `netlify/functions/_clerkAuth.js:67` |
| `CLERK_AUTHORIZED_PARTIES` | N | D | `netlify/functions/_clerkAuth.js:66` |
| `CLERK_JWT_KEY` | P | D | `netlify/functions/_clerkAuth.js:42` |
| `CLERK_SECRET_KEY` | S | D | `netlify/functions/_clerkAuth.js:41` |
| `COMPLIANCE_APP_ORIGIN` | N | D | `netlify/functions/compliance-review.js:73`, `netlify/functions/compliance-review.js:87` |
| `COMPLIANCE_RULES_VERSION` | N | C | `netlify/functions/compliance-review-background.js:19`, `netlify/functions/compliance-review.js:48`, `netlify/functions/compliance-review.js:80`, `netlify/functions/score-call-background.js:64` |
| `DEEPGRAM_API_KEY` | S | D | `netlify/functions/backfill-deepgram-intelligence.js:226`, `netlify/functions/deepgram-token.js:46`, `netlify/functions/transcribe.js:215`, `netlify/functions/transcript-gaps-background.js:42` |
| `DISABLE_CLERK_AUTH` | N | C | `netlify/functions/_clerkAuth.js:31` |
| `ENROLLGEN_APP_URL` | N | D | `netlify/functions/stripe-checkout.js:28`, `netlify/functions/stripe-portal.js:28` |
| `KNOWLEDGE_AUTO_UPDATE_ENABLED` | N | C | `netlify/functions/_knowledgeUpdate.js:219`, `netlify/functions/_knowledgeUpdate.js:252`, `netlify/functions/trigger-knowledge-update.js:18`, `netlify/functions/update-knowledge.js:23` |
| `KNOWLEDGE_UPDATE_MODEL` | N | C | `netlify/functions/_knowledgeUpdate.js:121` |
| `KNOWLEDGE_UPDATE_SECRET` | S | D | `netlify/functions/backfill-analytics.js:15`, `netlify/functions/backfill-deepgram-intelligence.js:23`, `netlify/functions/backfill-followups.js:18`, `netlify/functions/backfill-knowledge-updates.js:12`; 5 references total |
| `OPENAI_API_KEY` | S | D | `netlify/functions/embeddings.js:61`, `netlify/functions/embeddings.js:70`, `netlify/functions/transcript-import.js:10` |
| `POST_CALL_ALERT_EMAIL` | N | D | `netlify/lib/postCallProvider.js:37` |
| `RESEND_API_KEY` | S | D | `netlify/functions/paragon-daily-email.js:37`, `netlify/functions/paragon-daily-email.js:41`, `netlify/lib/postCallProvider.js:38`, `netlify/lib/postCallProvider.js:41` |
| `RTS_INGESTION_MODEL` | N | C | `netlify/functions/rts-ingest.js:179` |
| `SCORE_CALL_JOB_SECRET` | S | D | `netlify/functions/compliance-review-background.js:11`, `netlify/functions/compliance-review.js:74`, `netlify/functions/compliance-review.js:90`, `netlify/functions/score-call-background.js:30`; 7 references total |
| `SCORING_ENABLED` | N | C | `netlify/functions/compliance-review-background.js:19`, `netlify/functions/compliance-review.js:80`, `netlify/functions/score-call-background.js:64` |
| `SITE_URL` | N | D | `netlify/functions/stripe-checkout.js:29`, `netlify/functions/stripe-portal.js:29` |
| `STRIPE_PRO_PRICE_ID` | N | D | `netlify/functions/stripe-checkout.js:37`, `netlify/functions/stripe-webhook.js:37` |
| `STRIPE_SECRET_KEY` | S | D | `netlify/functions/stripe-checkout.js:20`, `netlify/functions/stripe-checkout.js:23`, `netlify/functions/stripe-portal.js:20`, `netlify/functions/stripe-portal.js:23`; 6 references total |
| `STRIPE_STARTER_PRICE_ID` | N | D | `netlify/functions/stripe-checkout.js:36`, `netlify/functions/stripe-webhook.js:38` |
| `STRIPE_WEBHOOK_SECRET` | S | D | `netlify/functions/stripe-webhook.js:130` |
| `SUPABASE_URL` | N | D | `netlify/functions/_evidenceAccess.js:11`, `netlify/functions/_evidenceAccess.js:14`, `netlify/functions/_knowledgeUpdate.js:7`, `netlify/functions/_tenantSettings.js:312`; 23 references total |
| `TELEPHONY_BASE_URL` | N | D | `netlify/functions/_recordingAccess.js:148`, `netlify/lib/postCallGuard.js:19` |
| `TRANSCRIPT_AUTO_RECOVERY_ENABLED` | N | C | `netlify/functions/transcript-gaps-background.js:18`, `netlify/lib/transcriptRecovery.js:63` |
| `TRANSCRIPT_GAP_FILL_ENABLED` | N | C | `netlify/functions/compliance-review.js:54`, `netlify/functions/transcript-gaps-background.js:18` |
| `TWILIO_ACCOUNT_SID` | N | D | `netlify/functions/transcript-gaps-background.js:32`, `netlify/functions/transcript-gaps-background.js:33`, `netlify/functions/transcript-gaps-background.js:36` |
| `TWILIO_AUTH_TOKEN` | S | D | `netlify/functions/transcript-gaps-background.js:33` |
| `URL` | N | D | `netlify/functions/stripe-checkout.js:30`, `netlify/functions/stripe-portal.js:30` |
| `VITE_DISABLE_CLERK_AUTH` | N | C | `netlify/functions/_clerkAuth.js:32` |
| `VITE_SUPABASE_URL` | N | D | `netlify/functions/paragon-daily-email.js:10`, `netlify/functions/paragon-vendor-report.js:51` |
| `VITE_TELEPHONY_BASE_URL` | N | D | `netlify/functions/_recordingAccess.js:148`, `netlify/lib/postCallGuard.js:19` |

### Operator scripts (not deployed app services)

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `DEFAULT_TENANT_ID` | N | D | `scripts/integrations/create-lead-source.js:5` |
| `HUD_USER_TOKEN` | S | D | `scripts/sep-data/ingest-zip-crosswalk.js:57` |
| `OPENAI_API_KEY` | S | D | `scripts/rescore-calls.js:77` |
| `SUPABASE_DB_PASSWORD` | S | D | `scripts/parse_cms_dsnp.js:118` |
| `SUPABASE_DB_URL` | N | D | `scripts/parse_cms_dsnp.js:117`, `scripts/parse_cms_penetration.js:85`, `scripts/parse_cms_penetration.js:86` |
| `SUPABASE_URL` | N | D | `scripts/integrations/common.js:8`, `scripts/reaggregate-saved-calls.js:16`, `scripts/rescore-calls.js:64`, `scripts/sep-data/common.js:109`; 5 references total |
| `VITE_SUPABASE_URL` | N | D | `scripts/integrations/common.js:8`, `scripts/reaggregate-saved-calls.js:16`, `scripts/rescore-calls.js:64`, `scripts/sep-data/common.js:109`; 6 references total |

### Optional Nextcloud stack

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `ADVANCE_ON_MISSING_ARTIFACTS` | N | C | `infra/office-nextcloud/docker-compose.yml:64`, `infra/office-nextcloud/sync/sync.py:45` |
| `DB_PASSWORD` | S | D | `infra/office-nextcloud/.env.example:10`, `infra/office-nextcloud/docker-compose.yml:10`, `infra/office-nextcloud/docker-compose.yml:11`, `infra/office-nextcloud/docker-compose.yml:29` |
| `INITIAL_SYNC_SINCE` | N | C | `infra/office-nextcloud/docker-compose.yml:63`, `infra/office-nextcloud/sync/sync.py:44` |
| `LOG_FILE` | N | C | `infra/office-nextcloud/sync/sync.py:67` |
| `NEXTCLOUD_APP_TOKEN` | S | D | `infra/office-nextcloud/.env.example:7`, `infra/office-nextcloud/docker-compose.yml:31`, `infra/office-nextcloud/docker-compose.yml:52`, `infra/office-nextcloud/sync/sync.py:37` |
| `NEXTCLOUD_TRUSTED_DOMAINS` | N | C | `infra/office-nextcloud/.env.example:9`, `infra/office-nextcloud/docker-compose.yml:32` |
| `NEXTCLOUD_URL` | N | D | `infra/office-nextcloud/.env.example:8`, `infra/office-nextcloud/docker-compose.yml:50`, `infra/office-nextcloud/sync/sync.py:35` |
| `NEXTCLOUD_USER` | N | C | `infra/office-nextcloud/.env.example:6`, `infra/office-nextcloud/docker-compose.yml:30`, `infra/office-nextcloud/docker-compose.yml:51`, `infra/office-nextcloud/sync/sync.py:36` |
| `RUN_ONCE` | N | C | `infra/office-nextcloud/sync/sync.py:402` |
| `STATE_DB` | N | C | `infra/office-nextcloud/sync/sync.py:66` |
| `SUPABASE_CALLS_TABLE` | N | C | `infra/office-nextcloud/docker-compose.yml:60`, `infra/office-nextcloud/sync/sync.py:39` |
| `SUPABASE_CALL_SELECT` | N | C | `infra/office-nextcloud/docker-compose.yml:61`, `infra/office-nextcloud/sync/sync.py:40` |
| `SUPABASE_PAGE_SIZE` | N | C | `infra/office-nextcloud/docker-compose.yml:62`, `infra/office-nextcloud/sync/sync.py:42` |
| `SUPABASE_SECRET_KEY` | S | D | `infra/office-nextcloud/.env.example:3`, `infra/office-nextcloud/docker-compose.yml:47`, `infra/office-nextcloud/sync/sync.py:34` |
| `SUPABASE_SERVICE_KEY` | S | D | `infra/office-nextcloud/.env.example:5`, `infra/office-nextcloud/docker-compose.yml:49`, `infra/office-nextcloud/sync/sync.py:34` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | D | `infra/office-nextcloud/.env.example:4`, `infra/office-nextcloud/docker-compose.yml:48`, `infra/office-nextcloud/sync/sync.py:34` |
| `SUPABASE_SUMMARY_BUCKET` | N | C | `infra/office-nextcloud/.env.example:11`, `infra/office-nextcloud/docker-compose.yml:53`, `infra/office-nextcloud/sync/sync.py:47` |
| `SUPABASE_SUMMARY_PATH_FIELDS` | N | C | `infra/office-nextcloud/.env.example:13`, `infra/office-nextcloud/docker-compose.yml:55` |
| `SUPABASE_TRANSCRIPT_BUCKET` | N | C | `infra/office-nextcloud/.env.example:12`, `infra/office-nextcloud/docker-compose.yml:54`, `infra/office-nextcloud/sync/sync.py:48` |
| `SUPABASE_TRANSCRIPT_PATH_FIELDS` | N | C | `infra/office-nextcloud/.env.example:14`, `infra/office-nextcloud/docker-compose.yml:56` |
| `SUPABASE_TRANSCRIPT_TEXT_FIELDS` | N | C | `infra/office-nextcloud/.env.example:15`, `infra/office-nextcloud/docker-compose.yml:57` |
| `SUPABASE_URL` | N | D | `infra/office-nextcloud/.env.example:2`, `infra/office-nextcloud/docker-compose.yml:46`, `infra/office-nextcloud/sync/sync.py:33` |
| `SYNC_INTERVAL_SECONDS` | N | C | `infra/office-nextcloud/docker-compose.yml:58`, `infra/office-nextcloud/sync/sync.py:43` |
| `SYNC_TIME_COLUMN` | N | C | `infra/office-nextcloud/docker-compose.yml:59`, `infra/office-nextcloud/sync/sync.py:41` |

### Railway telephony

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `AGENT_WS_SIGNING_SECRET` | S | D | `telephony/.env.example:49`, `telephony/src/config.js:61` |
| `CLERK_SECRET_KEY` | S | D | `telephony/.env.example:46`, `telephony/src/config.js:60` |
| `CONFERENCE_CALLING_ENABLED` | N | C | `telephony/.env.example:30`, `telephony/src/config.js:68` |
| `CORS_ALLOW_ORIGIN` | N | D | `telephony/.env.example:10`, `telephony/src/server.js:53` |
| `DEEPGRAM_API_KEY` | S | D | `telephony/.env.example:40`, `telephony/src/config.js:58` |
| `DEFAULT_TENANT_ID` | N | D | `telephony/.env.example:52`, `telephony/src/config.js:65` |
| `DELETE_TWILIO_RECORDINGS_AFTER_COPY` | N | C | `telephony/.env.example:64`, `telephony/src/config.js:46`, `telephony/tests/mediaStream.test.js:589`, `telephony/tests/mediaStream.test.js:590` |
| `DIAL_TIMEOUT_SECONDS` | N | C | `telephony/.env.example:55`, `telephony/src/config.js:66` |
| `DIRECT_AGENT_NUMBERS` | N | D | `telephony/src/config.js:57` |
| `GIPHY_API_KEY` | S | D | `telephony/.env.example:58`, `telephony/src/giphy.js:20`, `telephony/src/giphy.js:22` |
| `INBOUND_VENDOR_API_KEY` | S | D | `telephony/.env.example:43`, `telephony/src/config.js:59` |
| `MIN_CONNECTED_SECONDS` | N | C | `telephony/src/config.js:29` |
| `PARAGON_PING_FIELD_MAP` | N | D | `telephony/.env.example:37`, `telephony/src/config.js:71` |
| `PARAGON_STATE_ROUTING_ENABLED` | N | C | `telephony/.env.example:34`, `telephony/src/config.js:70` |
| `PORT` | N | C | `telephony/.env.example:5`, `telephony/src/config.js:47` |
| `PUBLIC_BASE_URL` | N | D | `telephony/.env.example:8`, `telephony/src/config.js:48` |
| `RECORDING_MAX_BYTES` | N | C | `telephony/src/config.js:36` |
| `RECORDING_STORAGE_MAX_BYTES` | N | C | `telephony/src/config.js:34` |
| `RECORDING_TIMEOUT_MS` | N | C | `telephony/src/config.js:37` |
| `SCORE_CALL_JOB_SECRET` | S | D | `telephony/src/media/sttAlert.js:3`, `telephony/src/media/sttAlert.js:6`, `telephony/src/server.js:82` |
| `SCORING_ENABLED` | N | C | `telephony/src/transcripts.js:42` |
| `STICKY_LOOKBACK_DAYS` | N | C | `telephony/src/config.js:73`, `telephony/tests/stickyRouting.test.js:8` |
| `STICKY_ROUTING_ENABLED` | N | C | `telephony/src/config.js:69`, `telephony/tests/stickyRouting.test.js:7` |
| `STT_WAIT_FOR_ANSWER` | N | C | `telephony/.env.example:61`, `telephony/src/config.js:45`, `telephony/tests/mediaStream.test.js:589`, `telephony/tests/mediaStream.test.js:590` |
| `SUPABASE_SECRET_KEY` | S | D | `telephony/.env.example:14`, `telephony/src/lib/supabaseKeys.js:5`, `telephony/src/lib/supabaseKeys.js:10` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | D | `telephony/.env.example:16`, `telephony/src/lib/supabaseKeys.js:5`, `telephony/src/lib/supabaseKeys.js:11` |
| `SUPABASE_URL` | N | D | `telephony/.env.example:13`, `telephony/src/config.js:49` |
| `TRANSCRIPT_SCORING_URL` | N | D | `telephony/src/media/sttAlert.js:3`, `telephony/src/media/sttAlert.js:4`, `telephony/src/server.js:82` |
| `TWILIO_ACCOUNT_SID` | N | D | `telephony/.env.example:19`, `telephony/src/config.js:51`, `telephony/tests/mediaStream.test.js:16` |
| `TWILIO_API_KEY_SECRET` | S | D | `telephony/.env.example:23`, `telephony/src/config.js:54` |
| `TWILIO_API_KEY_SID` | P | D | `telephony/.env.example:22`, `telephony/src/config.js:53` |
| `TWILIO_AUTH_TOKEN` | S | D | `telephony/.env.example:20`, `telephony/src/config.js:52` |
| `TWILIO_PHONE_NUMBER` | N | D | `telephony/.env.example:27`, `telephony/src/config.js:56`, `telephony/src/config.js:57` |
| `TWILIO_TWIML_APP_SID` | N | D | `telephony/.env.example:25`, `telephony/src/config.js:55` |

### Root build/config/example files

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | S | D | `.env.example:3` |
| `GHL_ENROLLMENT_WEBHOOK_URL` | S | D | `.env.example:42` |
| `KNOWLEDGE_AUTO_UPDATE_ENABLED` | N | C | `.env.example:48` |
| `LLM_FALLBACK_MODEL` | N | C | `.env.example:12` |
| `LLM_PROVIDER` | N | C | `.env.example:5` |
| `LLM_PROVIDER_ACA` | N | C | `.env.example:9` |
| `LLM_PROVIDER_MA` | N | C | `.env.example:7` |
| `LLM_PROVIDER_MEDSUP` | N | C | `.env.example:8` |
| `LLM_PROVIDER_U65` | N | C | `.env.example:10` |
| `LLM_SHADOW_ACA` | N | C | `.env.example:16` |
| `LLM_SHADOW_MA` | N | C | `.env.example:14` |
| `LLM_SHADOW_MEDSUP` | N | C | `.env.example:15` |
| `LLM_SHADOW_U65` | N | C | `.env.example:17` |
| `OPENAI_API_KEY` | S | D | `.env.example:2` |
| `PARAGON_PING_FIELD_MAP` | N | D | `.env.example:27` |
| `PARAGON_STATE_ROUTING_ENABLED` | N | C | `.env.example:26` |
| `SCORE_CALL_JOB_SECRET` | S | D | `.env.example:39` |
| `SUPABASE_ANON_KEY` | P | D | `.env.example:30` |
| `SUPABASE_DB_PASSWORD` | S | D | `.claude/settings.local.json:34`, `.claude/settings.local.json:36`, `.claude/settings.local.json:37`, `.claude/settings.local.json:38`; 5 references total |
| `SUPABASE_DB_URL` | N | D | `.env.example:24` |
| `SUPABASE_PUBLISHABLE_KEY` | P | D | `.env.example:29` |
| `SUPABASE_SECRET_KEY` | S | D | `.env.example:20` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | D | `.env.example:22` |
| `SUPABASE_URL` | N | D | `.env.example:19` |
| `TRANSCRIPT_AUTO_RECOVERY_ENABLED` | N | C | `.env.example:51` |
| `VITE_ENABLE_CUSTOMER_AUDIO` | N | C | `.env.example:45` |
| `VITE_SUPABASE_ANON_KEY` | P | D | `.env.example:34` |
| `VITE_SUPABASE_CMS_ANON_KEY` | P | D | `.env.example:38` |
| `VITE_SUPABASE_CMS_PUBLISHABLE_KEY` | P | D | `.env.example:37` |
| `VITE_SUPABASE_CMS_URL` | N | D | `.env.example:36` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | P | D | `.env.example:33` |
| `VITE_SUPABASE_URL` | N | D | `.env.example:32` |

### Supabase Edge Functions

| Name | Class | Pilot | Source reference(s) |
|---|---|---|---|
| `ENROLLGEN_SUPABASE_SECRET_KEY` | S | D | `supabase/functions/.env.example:3`, `supabase/functions/_shared/supabaseKeys.js:4` |
| `PARAGON_PING_FIELD_MAP` | N | D | `supabase/functions/.env.example:8`, `supabase/functions/get-availability/index.ts:17` |
| `PARAGON_STATE_ROUTING_ENABLED` | N | C | `supabase/functions/.env.example:7`, `supabase/functions/get-availability/index.ts:16` |
| `SUPABASE_SECRET_KEY` | S | D | `supabase/functions/_shared/supabaseKeys.js:4` |
| `SUPABASE_SECRET_KEYS` | S | D | `supabase/functions/_shared/supabaseKeys.js:6` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | D | `supabase/functions/_shared/supabaseKeys.js:13` |
| `SUPABASE_URL` | N | D | `supabase/functions/get-availability/index.ts:8` |

Dynamic env keys: `src/lib/llm/config.js:34` and `src/lib/llm/client.ts:113` constructs `LLM_PROVIDER_${engine}` and `LLM_SHADOW_${engine}`; configure the engine-specific overrides only for engines actually used. Explicit names (all N/C): `LLM_PROVIDER_MA`, `LLM_PROVIDER_MEDSUP`, `LLM_PROVIDER_ACA`, `LLM_PROVIDER_U65`, `LLM_PROVIDER_ANCILLARY`, `LLM_PROVIDER_ANNUITY`, `LLM_SHADOW_MA`, `LLM_SHADOW_MEDSUP`, `LLM_SHADOW_ACA`, `LLM_SHADOW_U65`, `LLM_SHADOW_ANCILLARY`, `LLM_SHADOW_ANNUITY`. ANCILLARY/ANNUITY provider selection is hardwired to Anthropic before reading overrides; scoring bypasses provider overrides and uses OpenAI. `NODE_ENV` / Vite `DEV` are runtime/build markers, not application secrets. `VITE_DISABLE_CLERK_AUTH` and `DISABLE_CLERK_AUTH` must be rejected in deployed pilot builds/services. `VITE_CSG_API_KEY` is a browser credential reference, but `assertNoPublicApiKeys` currently rejects that name at build; this is an inconsistent legacy configuration path, not evidence a secret is presently shipped. Move CSG access behind an authorized server proxy if enabled. `CLERK_JWT_KEY` is public signature-verification material, not a Clerk signing secret.


### Additional build/container environment names

| Service | Name | Class / pilot | Evidence / use |
|---|---|---|---|
| Frontend | `VITE_DEBUG_LOGS` | N / C | `src/lib/debugLog.js:4`; optional-chaining access, only honored when Vite `DEV` is true. Not a production auth bypass. |
| Optional Nextcloud/MariaDB | `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_HOST` | N / D | `infra/office-nextcloud/docker-compose.yml:8–9,26–28`; container-internal env names supplied by Compose. |
| Optional Nextcloud/MariaDB | `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | S / D | `infra/office-nextcloud/docker-compose.yml:10–11,29`; fresh isolated database credentials. |
| Optional Nextcloud | `NEXTCLOUD_ADMIN_USER` | N / D | `infra/office-nextcloud/docker-compose.yml:30`; new office instance administrator identity. |
| Optional Nextcloud | `NEXTCLOUD_ADMIN_PASSWORD` | S / D | `infra/office-nextcloud/docker-compose.yml:31`; new credential, never copied from NGHS. |

## Appendix C. Complete HTTP/Edge/WebSocket authentication matrix

`JWT` means verified Clerk token via `_clerkAuth.js`; its **default** accepts the deployed bypass flags. `Strict JWT` explicitly passes `allowBypass:false`. Protected identity helpers additionally reject `dev-bypass` even where the default verifier is called. Signed claims, protected database mappings and mutable `tenant_agents` roles are intentionally distinguished. Authenticated browser UI tabs do not protect direct URLs or PostgREST/RPC. OPTIONS/405 responses are not data access.

### Netlify entry points

Each name is the file basename under `netlify/functions` and is reachable through its function URL and configured `/api/*` rewrite/explicit path. Method restrictions remain in the handler; test both URL forms. Scheduled functions have no application-level credential check; their exposure depends on Netlify scheduled-function deployment behavior and should be checked on the isolated site, not assumed to be a public exploit.

| Function and auth evidence line | Server authentication | Authorization / finding |
|---|---|---|
| `netlify/functions/agent-status-log.js:14` | Strict JWT + protected availability/recording identity | Own events; verified admin scope for wider access. |
| `netlify/functions/backfill-analytics.js:14` | Shared backfill/knowledge secret | No browser role; broad maintenance operation. Keep disabled/unconfigured on pilot. |
| `netlify/functions/backfill-deepgram-intelligence.js:22` | Shared backfill/knowledge secret | No browser role; broad paid maintenance operation. |
| `netlify/functions/backfill-followups.js:17` | Shared backfill/knowledge secret | No browser role; broad maintenance writes. |
| `netlify/functions/backfill-knowledge-updates.js:11` | Shared backfill/knowledge secret | No browser role; broad maintenance writes. |
| `netlify/functions/biblia.js:5` | Strict JWT | Reference lookup; no admin action. No per-user rate limiter found. |
| `netlify/functions/call-disposition.js:7` | Strict JWT + protected evidence identity | Binds agent/call and ownership; not UI-only. |
| `netlify/functions/call-log.js:71` | JWT + recordingIdentity (rejects bypass) | Owner/admin scope; verified admin claims. |
| `netlify/functions/call-record-details.js:4` | Strict JWT + protected call identity | scopeCallToIdentity enforces owner/admin. |
| `netlify/functions/cms-plans.js:26` | JWT (default bypass-capable helper) | Reference reads; no admin operation; paid/config gate is not membership. |
| `netlify/functions/coach.js:30` | JWT + subscription/pro gate | No active protected agent requirement or per-subject rate budget; arbitrary submitted model context. |
| `netlify/functions/combine-calls.js:5` | JWT + recordingIdentity | Authorizes both recording targets and tenant; DB merge RPC; no UI-only authorization. |
| `netlify/functions/compliance-review-background.js:11` | SCORE_CALL_JOB_SECRET + reserved pass claim | Server job, not browser admin; request must match reserved work. |
| `netlify/functions/compliance-review.js:11` | Strict JWT + protected call identity | POST verified admin; GET checks tenant but does not apply per-call owner scope: P0-3. |
| `netlify/functions/compliance-uploads.js:23` | JWT + recordingIdentity | All methods require verified admin; target checks for edits/retries. |
| `netlify/functions/compliance.js:447` | JWT + subscription/seats | Legacy nested API lacks owner/admin checks in multiple branches; details below. |
| `netlify/functions/copilot-skip-counter.js:7` | JWT + subscription/pro gate | Telemetry write bound to JWT user, but not protected active membership; input client-reported. |
| `netlify/functions/deepgram-token.js:28` | JWT + subscription/pro gate | Issues paid transcription token; no protected active member/per-user issuance limit found. |
| `netlify/functions/embeddings.js:26` | Strict JWT OR scoped post-call dispatch credential | Interactive request resolves evidence identity and owned session; recovery validates job token/state and exact input. |
| `netlify/functions/enrollment-intakes.js:5` | Strict JWT + protected call identity | Call-scoped owner/admin read/write; encryption/decryption service-side; access audit gap remains. |
| `netlify/functions/evidence-session.js:12` | JWT + protected evidence identity | Rejects bypass, owned session checks; provisioning controlled through helper. |
| `netlify/functions/live-bulletins.js:147` | None, public | Public news feed; no tenant evidence/admin write. |
| `netlify/functions/nightly-analytics.js:357` | No in-handler credential; scheduled function | Platform scheduler trust only; verify deployed non-public invocation behavior. Service-wide analytics writes. |
| `netlify/functions/paragon-daily-email.js:65` | No in-handler credential; scheduled function | Platform scheduler trust only; disable schedule with feature; outbound reports. |
| `netlify/functions/paragon-residence.js:4` | Strict JWT + protected call identity | GET admin; contact edit checks tenant/assigned agent (unassigned contact allowed); live SEP lookup is call-bound. |
| `netlify/functions/paragon-vendor-report.js:95` | Hashed revocable report token | Scoped report capability, no Clerk admin; 30 attempts per 5 minutes/IP DB limiter; query token exposure risk. |
| `netlify/functions/paragon-zip-confirm.js:6` | JWT + active tenant_agents subject | Own callback rows only; fixed agency ID; no verified admin operation; mutable roster trust problem. |
| `netlify/functions/post-call-admin.js:6` | Strict JWT + protected call identity | GET owned/admin call; POST admin-only recovery/operations. |
| `netlify/functions/post-call-background.js:68` | Per-job dispatch token + worker claim | Timing-safe credential check and bound DB job; not browser/UI auth. |
| `netlify/functions/post-call.js:20` | Strict JWT + protected evidence identity | Owned session, bound request and idempotent queue. |
| `netlify/functions/recordings.js:38` | JWT + recordingIdentity | Owner/admin targets; provider sharing requires admin; signed URLs remain bearer credentials after issuance. |
| `netlify/functions/rts-ingest.js:519` | JWT + active tenant_agents subject | Preview ordinary agent; commit requires roster role admin or verified claims. Mutable roster makes admin check escalatable. |
| `netlify/functions/score-call-background.js:30` | SCORE_CALL_JOB_SECRET + scoring gate/claim | Internal job only; global credential, no human identity. |
| `netlify/functions/seed-new-tenant.js:179` | JWT | Existing tenant update/admin roster logic checks admin; first create accepts body org fallback; insufficient protected mappings. |
| `netlify/functions/set-availability.js:44` | Strict JWT + protected availability subject mapping | Own slug; wider/global changes require signed admin claims; body user identity not trusted. |
| `netlify/functions/stripe-checkout.js:41` | JWT + tenant resolution | No billing-admin check: ordinary authenticated user can reach checkout creation. |
| `netlify/functions/stripe-portal.js:35` | JWT + tenant resolution | No billing-admin check before customer portal session: P0-3. |
| `netlify/functions/stripe-webhook.js:125` | Stripe signature on raw request body | Server provider auth, no Clerk role; webhook secret must differ. |
| `netlify/functions/stt-alert.js:5` | SCORE_CALL_JOB_SECRET | Internal alert endpoint, not browser role. |
| `netlify/functions/stt-reconnect.js:4` | Strict JWT + protected evidence identity | Own session and reconnect budget. |
| `netlify/functions/stt-usage.js:12` | JWT + tenant resolution | Client-reported usage; no protected active roster check. JWT subject added server-side. |
| `netlify/functions/sync-bulletins.js:521` | No in-handler credential; scheduled function | Platform scheduler trust only; public reference-data writes. |
| `netlify/functions/sync-fema.js:17` | No in-handler credential; scheduled function | Platform scheduler trust only; public reference-data writes. |
| `netlify/functions/test-ghl-webhook.js:34` | JWT + isAdminAuth | Server admin check exists, but dev-bypass qualifies; user-supplied destination needs production restrictions. |
| `netlify/functions/transcribe.js:209` | JWT | No call ownership/admin check before arbitrary audio URL transcription and supplied callId write: P0-3. |
| `netlify/functions/transcript-gaps-background.js:15` | SCORE_CALL_JOB_SECRET + feature flag | Internal job claims and bounded recovery; provider spend. |
| `netlify/functions/transcript-import.js:26` | JWT + protected evidence identity | Own imports; importing for another agent requires admin; controlled transcript writes. |
| `netlify/functions/trigger-knowledge-update.js:14` | Strict JWT + admin role helper | Server admin requirement, not UI-only. |
| `netlify/functions/update-knowledge.js:15` | KNOWLEDGE_UPDATE_SECRET | Internal knowledge updater; no browser role. |
| `netlify/functions/vendor-pause.js:4` | JWT + isAdminAuth | Server admin check, bypass-capable; fixed agency. |
| `netlify/functions/vendor-routing.js:11` | JWT + signed admin OR roster admin | Fallback checks mutable tenant_agents.role; fixed agency; P0-2. |
| `netlify/functions/weekly-coaching.js:237` | No in-handler credential; scheduled function | Platform scheduler trust only; agency-wide model reads/writes. |

Inventory: **52 deployed-source Netlify entry files**. Underscore-prefixed helpers and `netlify/lib` are imported code, not additional HTTP handlers.

### Nested legacy compliance API

All routes below inherit only JWT + subscription/seat checks in `compliance.js:447–460`. Paths are relative to the compliance function; `parsePath` accepts the function/API prefix. No independent server-admin middleware is present.

| Method/path | Evidence | Additional scope / risk |
|---|---|---|
| `POST /calls` | `netlify/functions/compliance.js:462` | Accepts body tenant_id and arbitrary call payload; no protected ownership. |
| `POST /calls/:id/score` | `netlify/functions/compliance.js:474` | 202 instruction only; actual background route separately requires job secret. |
| `GET /calls/:id/scorecard` | `netlify/functions/compliance.js:479` | Call ID lookup without protected caller ownership. |
| `GET /calls/:id/detections` | `netlify/functions/compliance.js:492` | Call ID lookup without owner/tenant scope. |
| `POST /calls/:id/override` | `netlify/functions/compliance.js:500` | Current full-rubric version rejects 409; legacy path has no admin check if re-enabled. |
| `GET /scorecards` | `netlify/functions/compliance.js:538` | User-supplied filters; no protected owner scope. |
| `GET /scorecards/:id` | `netlify/functions/compliance.js:560` | Unscoped ID access includes transcript/recording metadata. |
| `GET /templates` | `netlify/functions/compliance.js:574` | Public-style reference read behind JWT. |
| `GET /dashboard/overview` | `netlify/functions/compliance.js:580` | Agency-wide aggregation without verified admin requirement. |
| `GET /corrective-actions` | `netlify/functions/compliance.js:629` | No protected owner/admin scope. |
| `PATCH /corrective-actions/:id` | `netlify/functions/compliance.js:642` | Admin-like modification by ID without server role check. |
| `GET /calibration/runs` | `netlify/functions/compliance.js:666` | No server admin check. |
| `POST /calibration/start` | `netlify/functions/compliance.js:675` | Creates calibration run without server admin check. |
| `GET /calibration/:id` | `netlify/functions/compliance.js:691` | Run and call-review data without server admin check. |
| `POST /calibration/:id/override` | `netlify/functions/compliance.js:804` | Inserts body fields, increments run; no server admin check. |
| `POST /recalculate` | `netlify/functions/compliance.js:819` | Current full-rubric version rejects 409; old code must remain unreachable. |
| `GET /agents` | `netlify/functions/compliance.js:1312` | Cross-agent scorecard aggregation; no server admin requirement. |

### Railway telephony routes

All `requireTwilioSignature` routes validate the request against the configured subaccount token and reconstructed public URL. Verify reverse-proxy URL configuration with actual signed callbacks; signatures alone do not enforce browser ownership. Conference signed helper applies the same middleware.

| Method/path | Evidence | Server authentication and authorization |
|---|---|---|
| `GET /healthz` | `telephony/src/server.js:63` | Public health only. |
| `POST /internal/post-call-status` | `telephony/src/server.js:65` | Atomic consume of hashed, expiring call-bound DB ticket; account/SID verified on Twilio response (`postCallStatus.js:4–20`). |
| `GET /api/voice/conference-capabilities` | `telephony/src/routes/conferenceCalling.js:69` | Verified Clerk + protected agent mappings; capability read. |
| `POST /api/voice/conference-status` | `telephony/src/routes/conferenceCalling.js:76` | Verified Clerk + protected identity and owned conference. |
| `POST /api/voice/conference-action` | `telephony/src/routes/conferenceCalling.js:82` | Verified Clerk + protected identity and owned call/conference; locks/role constraints for participants; feature flag. |
| `POST /twilio/conference/join` | `telephony/src/routes/conferenceCalling.js:114` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/status` | `telephony/src/routes/conferenceCalling.js:132` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/exit` | `telephony/src/routes/conferenceCalling.js:135` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/events` | `telephony/src/routes/conferenceCalling.js:142` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/stream-status` | `telephony/src/routes/conferenceCalling.js:159` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/recording` | `telephony/src/routes/conferenceCalling.js:174` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /twilio/conference/hold` | `telephony/src/routes/conferenceCalling.js:181` | Twilio signature via signed helper (or direct signature middleware for hold); conference/SID binding and event-specific processing. |
| `POST /api/leads/incoming` | `telephony/src/routes/leads.js:32` | Timing-safe shared x-api-key; no per-vendor rate limiter found; full payload persists. |
| `GET /api/recordings/media/:token` | `telephony/src/routes/recordingMedia.js:9` | Hashed expiring download-ticket capability; no Clerk at redemption; underlying ticket created by authorized API. |
| `ALL /api/recordings/conversly/:token` | `telephony/src/routes/recordingMedia.js:10` | Hashed provider recording capability; service-side status/expiry/account checks; path spelling is intentional in code. |
| `POST /twilio/sms` | `telephony/src/routes/sms.js:101` | Twilio signature; inbound message/contact writes. |
| `POST /twilio/sms-status` | `telephony/src/routes/sms.js:150` | Twilio signature; message delivery writes. |
| `GET /api/sms/gifs` | `telephony/src/routes/sms.js:162` | Verified Clerk only; external search; no per-user rate limiter. |
| `POST /api/sms/send` | `telephony/src/routes/sms.js:172` | Verified Clerk; contact tenant membership and DNC check; no active-agent predicate at membership lookup; no admin required. |
| `POST /twilio/status` | `telephony/src/routes/twilioStatus.js:27` | Twilio signature + parent/conference guard. |
| `POST /twilio/agent-status` | `telephony/src/routes/twilioStatus.js:67` | Twilio signature + child/conference guard. |
| `POST /twilio/recording` | `telephony/src/routes/twilioStatus.js:84` | Twilio signature + recording/attempt attribution. |
| `POST /twilio/voice` | `telephony/src/routes/twilioVoice.js:123` | Twilio signature + durable routing replay + DB reservation. |
| `POST /twilio/dial-result` | `telephony/src/routes/twilioVoice.js:285` | Twilio signature + dial attribution + replay. |
| `POST /api/leads/ping` | `telephony/src/routes/vendorPing.js:8` | Hashed consumer x-api-key through paragon_ping; no explicit edge/app rate limit found. |
| `POST /api/voice/events` | `telephony/src/routes/voiceEvents.js:18` | Verified Clerk; diagnostics payload validated; no admin operation. |
| `POST /api/voice/outbound-check` | `telephony/src/routes/voiceOutbound.js:32` | Verified Clerk + active roster subject; policy checks. |
| `POST /api/voice/outbound-status` | `telephony/src/routes/voiceOutbound.js:40` | Verified Clerk + active roster subject; owned attempt identity. |
| `POST /api/voice/outbound` | `telephony/src/routes/voiceOutbound.js:86` | Twilio signature + outbound gate + routing replay; server-resolved agent identity. |
| `POST /api/voice/outbound-result` | `telephony/src/routes/voiceOutbound.js:143` | Twilio signature + conference/dial attribution guards. |
| `GET /api/voice/token` | `telephony/src/routes/voiceToken.js:15` | GET returns 405. POST verifies Clerk and active subject-bound tenant_agents; Twilio Voice grant + HMAC agent WS token. Mutable roster still a risk. |
| `POST /api/voice/token` | `telephony/src/routes/voiceToken.js:22` | GET returns 405. POST verifies Clerk and active subject-bound tenant_agents; Twilio Voice grant + HMAC agent WS token. Mutable roster still a risk. |

### Supabase Edge and WebSocket surfaces

| Surface | Evidence | Authentication / scope |
|---|---|---|
| `GET/HEAD /functions/v1/get-availability` | `supabase/functions/get-availability/handler.js:15–55`; `index.ts:6–18`; `supabase/config.toml` | JWT verification disabled by platform config; hashed revocable key in header or query checked by `get_availability_feed`; consumer-specific Paragon ping. Returns limited availability/agent names/state list. No explicit request rate limiter found. OPTIONS public; other methods 405. |
| Historical set-availability Edge snapshot | `docs/edge-functions/set-availability-v11/index.ts` | Not an active `supabase/functions` deployment directory. Inspect deployed function inventory manually; do not deploy/copy old code as pilot baseline. |
| WS `/agent` | `telephony/src/server.js:105`; `telephony/src/media/agentSocket.js` | HMAC bearer token from authorized voice-token route; active agent validation. Local process socket map. |
| WS `/media`, `/media/*` | `telephony/src/server.js:104`; `mediaStream.js`; `streamToken.js` | Signed call-bound stream credential, attribution and DB lease; this is not an unsigned HTTP webhook or a Clerk browser route. |
| WS `/conference-media/*` | `telephony/src/server.js:103`; `conferenceMedia.js` | Signed conference/call binding and media lease; fail-closed checks require load/reconnect verification. |

**UI-only/insufficient-role paths:** legacy compliance calibration/corrective-actions/agency-wide views, billing checkout/portal and legacy transcription have no adequate server owner/admin restriction even if the UI hides them. Direct tenant/roster and other RLS mutations are independent of all HTTP middleware. RTS/vendor admin fallbacks do check roles server-side, but rely on client-writable role rows. Modern protected evidence/recording endpoints do enforce server-side checks.


## Appendix D. Table-by-table RLS and policy inventory

This is a **static final-intent model**, not a claim that the migration chain can execute. It replays explicit CREATE/DROP POLICY statements plus the dynamic reset/service-only loops in 048, 058, 063, 064, 073, 086, 121, 123, 124, 127, 133, 137 and 147. Fresh-install errors in §2 must be repaired before this state is attainable. Numbered migrations do not form a complete catalog; external bootstrap scripts and unknown baseline tables are marked. Supabase-managed `auth`/`storage` internals must be inspected in the new project; application storage policies are separately listed.

Policy legend: **broad existing-tenant predicate** = `is_current_tenant` after 028 checks only that a tenant row exists; it does not prove caller membership. Any authenticated subject satisfying table grants can use it. Policy names containing “own”/“tenant” do not change this. PostgreSQL permissive policies OR together; SELECT/INSERT/etc also require SQL grants. `service_role` bypasses RLS regardless of browser policies. `Enabled; no browser policy` means default deny to browsers **if RLS and grants match the intended schema**, not proof SECURITY DEFINER RPCs are safe. No app table is established as FORCE RLS from this source review.

Additional helper caveats: `opportunities_is_tenant` and `follow_up_access` check real JWT subjects but trust mutable `tenant_agents`; fix P0-2. Protected `evidence_*` functions bind service-managed enrolled agents. Contacts column-level revocation in 023 is not enough if a table-level SELECT grant remains; inspect effective grants. Cross-sell 100 does not remove 015 tenant policy, so its new own policy does not narrow SELECT/INSERT on a complete replay.

| Table | RLS evidence / bootstrap | Effective policy allowance / caveat |
|---|---|---|
| `oct_slim_086_rollback.backfills` | No RLS statement; isolated schema/grants instead | Browser schema/table privileges revoked; service rollback archive. Not PostgREST public schema. |
| `oct_slim_086_rollback.policies` | No RLS statement; isolated schema/grants instead | Browser schema/table privileges revoked; service rollback archive. Not PostgREST public schema. |
| `oct_slim_086_rollback.state` | No RLS statement; isolated schema/grants instead | Browser schema/table privileges revoked; service rollback archive. Not PostgREST public schema. |
| `oct_slim_088_rollback.state` | No RLS statement; isolated schema/grants instead | Browser schema/table privileges revoked; service rollback archive. Not PostgREST public schema. |
| `pii_vault.encryption_keys` | No RLS statement; isolated schema/grants instead | Non-public key schema; REVOKE browser access and restricted SECURITY DEFINER encryption/decryption functions. RLS is not the key protection mechanism. Verify owner/function ACLs. |
| `agent_availability` | Enabled; `supabase/migrations/073_availability_auth.sql:32` | `availability_service_only`: service_role ALL; all browser grants/policies revoked (`supabase/migrations/073_availability_auth.sql:44`).; All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; All old policies removed supabase/migrations/073_availability_auth.sql:32; Browser grants revoked supabase/migrations/073_availability_auth.sql:32; No canonical baseline CREATE found; 063/073 reset to service-only. |
| `agent_availability_log` | Enabled; `supabase/migrations/073_availability_auth.sql:32` | `availability_service_only`: service_role ALL; all browser grants/policies revoked (`supabase/migrations/073_availability_auth.sql:44`).; All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; All old policies removed supabase/migrations/073_availability_auth.sql:32; Browser grants revoked supabase/migrations/073_availability_auth.sql:32; No canonical baseline CREATE found; 063/073 reset to service-only. |
| `agent_coaching` | Enabled; `supabase/migrations/012_analytics_engine.sql:59` | `agent_coaching_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/012_analytics_engine.sql:75`); `agent_coaching_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/012_analytics_engine.sql:81`) |
| `agent_compliance_profiles` | Enabled; `supabase/migrations/001_compliance_engine.sql:355` | `Authenticated users full access agent_compliance_profiles`: authenticated ALL; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:389`) |
| `agent_phone_sessions` | Enabled; `supabase/migrations/039_agent_phone_presence.sql:9` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `agents` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_agent_name_read`: authenticated SELECT; parent transcript visible through owner RLS (`supabase/migrations/063_evidence_access.sql:136`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; Baseline CREATE only in docs/supabaseschema:33; later 063 RLS rules below.; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `autoresearch_iterations` | Enabled; `supabase/migrations/001_compliance_engine.sql:359` | `Authenticated users full access autoresearch_iterations`: authenticated ALL; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:401`) |
| `availability_agent_subjects` | Enabled; `supabase/migrations/073_availability_auth.sql:32` | `availability_service_only`: service_role ALL; all browser grants/policies revoked (`supabase/migrations/073_availability_auth.sql:44`).; All old policies removed supabase/migrations/073_availability_auth.sql:32; Browser grants revoked supabase/migrations/073_availability_auth.sql:32 |
| `availability_consumers` | Enabled; `supabase/migrations/047_availability_feed.sql:110` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `birthday_rule_states` | Enabled; `supabase/migrations/015_sales_forum_2026.sql:118` | `birthday_rule_states_read`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/015_sales_forum_2026.sql:121`); `birthday_rule_states_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/015_sales_forum_2026.sql:126`) |
| `bulletin_feed_status` | Enabled; `supabase/migrations/079_bulletins_sync.sql:49` | `bulletin_feed_status_read`: anon, authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/079_bulletins_sync.sql:50`) |
| `bulletins` | Enabled; `scripts/create_bulletins_table.sql:21`; external CREATE `scripts/create_bulletins_table.sql:2` | `Allow public read`: PUBLIC (default) SELECT; **all rows / no row identity check** (`scripts/create_bulletins_table.sql:23`); `Allow service-role insert/update`: PUBLIC (default) ALL; FOR ALL USING (auth.role() = 'service_role') (`scripts/create_bulletins_table.sql:26`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `bulletins_duplicate_archive` | Enabled; `supabase/migrations/079_bulletins_sync.sql:13` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `calibration_overrides` | Enabled; `supabase/migrations/001_compliance_engine.sql:358` | `Authenticated users full access calibration_overrides`: authenticated ALL; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:398`) |
| `calibration_runs` | Enabled; `supabase/migrations/001_compliance_engine.sql:357` | `Authenticated users full access calibration_runs`: authenticated ALL; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:395`) |
| `call_conferences` | Enabled; `supabase/migrations/121_conference_calling.sql:52` | `conference_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/121_conference_calling.sql:52`); Browser grants revoked supabase/migrations/121_conference_calling.sql:52 |
| `call_disposition_opportunity_log` | Enabled; `supabase/migrations/119_ma_disposition_opportunities.sql:38` | `disposition_opportunity_log_tenant`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/119_ma_disposition_opportunities.sql:44`); `disposition_opportunity_log_service`: service_role ALL; unrestricted service path (`supabase/migrations/119_ma_disposition_opportunities.sql:46`) |
| `call_insights` | Enabled; `supabase/migrations/012_analytics_engine.sql:58` | `call_insights_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/012_analytics_engine.sql:63`); `call_insights_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/012_analytics_engine.sql:69`) |
| `call_logs` | Enabled; `supabase/migrations/060_call_logs.sql:23` | `call_logs_own`: PUBLIC (default) ALL; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/060_call_logs.sql:25`); `call_logs_principal_read`: PUBLIC (default) SELECT; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/060_call_logs.sql:40`); `call_logs_principal_insert`: PUBLIC (default) INSERT; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/060_call_logs.sql:50`) |
| `call_participants` | Enabled; `supabase/migrations/121_conference_calling.sql:52` | `conference_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/121_conference_calling.sql:52`); Browser grants revoked supabase/migrations/121_conference_calling.sql:52 |
| `call_records` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:266` | `call_records_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:271`); `call_records_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/007_multi_tenant_foundation.sql:276`) |
| `call_threads` | Enabled; `supabase/migrations/001_compliance_engine.sql:354` | `Authenticated users full access call_threads`: authenticated ALL; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:386`) |
| `call_transcripts` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_transcript_own_read`: authenticated SELECT; protected evidence membership/ownership helper (`supabase/migrations/063_evidence_access.sql:116`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; Baseline CREATE only in docs/supabaseschema:45; referenced by 002 FK; later 063 RLS below.; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `call_wrap_up_policy` | Enabled; `supabase/migrations/106_disable_wrap_up_routing_holds.sql:12` | `call_wrap_up_policy_service`: service_role ALL; unrestricted service path (`supabase/migrations/106_disable_wrap_up_routing_holds.sql:15`) |
| `call_wrap_ups` | Enabled; `supabase/migrations/105_mandatory_call_wrap_up.sql:27` | `call_wrap_ups_service`: service_role ALL; unrestricted service path (`supabase/migrations/105_mandatory_call_wrap_up.sql:30`) |
| `carrier_profiles` | Enabled; `supabase/migrations/015_sales_forum_2026.sql:60` | `carrier_profiles_read`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/015_sales_forum_2026.sql:63`); `carrier_profiles_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/015_sales_forum_2026.sql:68`) |
| `carrier_rts` | Enabled; `supabase/migrations/030_rts_ai_ingestion.sql:239` | `carrier_rts_tenant_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/030_rts_ai_ingestion.sql:245`); `carrier_rts_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/030_rts_ai_ingestion.sql:282`); `carrier_rts_agent_update`: authenticated UPDATE; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/033_rts_agency_shared_edit.sql:4`) |
| `cms_county_penetration` | Enabled; `supabase/migrations/088_county_penetration.sql:32` | `cms_county_penetration_public_read`: anon, authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/088_county_penetration.sql:34`) |
| `cms_plan_embeddings_py2027` | Enabled; `supabase/migrations/054_cms_landscape_2027.sql:68` | `cms_plan_embeddings_py2027_read`: anon, authenticated SELECT; published plan_year = 2027 reference rows (`supabase/migrations/054_cms_landscape_2027.sql:70`) |
| `cms_plans_py2026` | Dropped by later SQL; historical object | Not required in final schema; old policies not applicable. |
| `cms_plans_py2027` | Enabled; `supabase/migrations/054_cms_landscape_2027.sql:35` | `cms_plans_py2027_read`: anon, authenticated SELECT; published plan_year = 2027 reference rows (`supabase/migrations/054_cms_landscape_2027.sql:37`) |
| `compliance_daily_budget` | Enabled; `supabase/migrations/133_compliance_overhaul_safety.sql:165` | `service_only`: service_role ALL; unrestricted service path (`supabase/migrations/133_compliance_overhaul_safety.sql:165`); Browser grants revoked supabase/migrations/133_compliance_overhaul_safety.sql:165 |
| `compliance_daily_summaries` | Enabled; `supabase/migrations/124_ix_uploads.sql:70` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/124_ix_uploads.sql:70 |
| `compliance_flags` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_flag_own_read`: authenticated SELECT; parent session visible through owner RLS (`supabase/migrations/063_evidence_access.sql:124`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `compliance_intents` | Enabled; `supabase/migrations/001_compliance_engine.sql:346` | `Authenticated users can read compliance_intents`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:362`); `Service role full access compliance_intents`: service_role ALL; unrestricted service path (`supabase/migrations/001_compliance_engine.sql:405`) |
| `compliance_llm_passes` | Enabled; `supabase/migrations/133_compliance_overhaul_safety.sql:165` | `service_only`: service_role ALL; unrestricted service path (`supabase/migrations/133_compliance_overhaul_safety.sql:165`); Browser grants revoked supabase/migrations/133_compliance_overhaul_safety.sql:165 |
| `compliance_llm_requests` | Enabled; `supabase/migrations/133_compliance_overhaul_safety.sql:165` | `service_only`: service_role ALL; unrestricted service path (`supabase/migrations/133_compliance_overhaul_safety.sql:165`); Browser grants revoked supabase/migrations/133_compliance_overhaul_safety.sql:165 |
| `compliance_review_decisions` | Enabled; `supabase/migrations/133_compliance_overhaul_safety.sql:165` | `service_only`: service_role ALL; unrestricted service path (`supabase/migrations/133_compliance_overhaul_safety.sql:165`); Browser grants revoked supabase/migrations/133_compliance_overhaul_safety.sql:165 |
| `compliance_runtime_control` | Enabled; `supabase/migrations/133_compliance_overhaul_safety.sql:7` | `runtime_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/133_compliance_overhaul_safety.sql:10`) |
| `compliance_scorecards` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:320` | `scorecards_tenant_select`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:325`); `scorecards_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/007_multi_tenant_foundation.sql:329`) |
| `compliance_scores` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:336` | `compliance_scores_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:338`); No canonical CREATE found; 007 policies/ALTER assume pre-existing table. |
| `compliance_version_requests` | Enabled; `supabase/migrations/135_compliance_admin_versions.sql:11` | `version_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/135_compliance_admin_versions.sql:14`) |
| `conference_media_leases` | Enabled; `supabase/migrations/121_conference_calling.sql:52` | `conference_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/121_conference_calling.sql:52`); Browser grants revoked supabase/migrations/121_conference_calling.sql:52 |
| `contact_activities` | Enabled; `supabase/migrations/017_crm_contacts.sql:239` | `contact_activities_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/017_crm_contacts.sql:280`); `contact_activities_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:286`) |
| `contact_lead_intel` | Enabled; `supabase/migrations/017_crm_contacts.sql:237` | `contact_lead_intel_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/017_crm_contacts.sql:256`); `contact_lead_intel_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:262`) |
| `contact_merge_archive` | Enabled; `supabase/migrations/043_contacts_phone_identity.sql:27` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `contact_notes` | Enabled; `supabase/migrations/017_crm_contacts.sql:238` | `contact_notes_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/017_crm_contacts.sql:268`); `contact_notes_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:274`) |
| `contact_tags` | Enabled; `supabase/migrations/059_opportunity_contact_tags.sql:13` | `contact_tags_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/059_opportunity_contact_tags.sql:14`); `contact_tags_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/059_opportunity_contact_tags.sql:16`) |
| `contacts` | Enabled; `supabase/migrations/017_crm_contacts.sql:236` | `contacts_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/017_crm_contacts.sql:244`); `contacts_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:250`) |
| `conversely_run_agents` | Enabled; `supabase/migrations/127_conversely_manual_runs.sql:164` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/127_conversely_manual_runs.sql:164 |
| `conversely_run_events` | Enabled; `supabase/migrations/149_conversely_run_events.sql:12` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `conversely_runs` | Enabled; `supabase/migrations/127_conversely_manual_runs.sql:164` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/127_conversely_manual_runs.sql:164 |
| `conversely_submissions` | Enabled; `supabase/migrations/123_compliance_uploads.sql:40` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `conversely_week_slots` | Enabled; `supabase/migrations/127_conversely_manual_runs.sql:164` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/127_conversely_manual_runs.sql:164 |
| `conversely_weekly_audit` | Enabled; `supabase/migrations/123_compliance_uploads.sql:102` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/123_compliance_uploads.sql:102 |
| `conversely_weekly_runs` | Enabled; `supabase/migrations/123_compliance_uploads.sql:102` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/123_compliance_uploads.sql:102 |
| `conversely_worker_status` | Enabled; `supabase/migrations/127_conversely_manual_runs.sql:164` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/127_conversely_manual_runs.sql:164 |
| `corrective_actions` | Enabled; `supabase/migrations/001_compliance_engine.sql:353` | `corrective_actions_own`: authenticated SELECT; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/002_post_call_pipeline.sql:236`); `corrective_actions_principal_read`: authenticated SELECT; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/002_post_call_pipeline.sql:248`); `corrective_actions_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/002_post_call_pipeline.sql:259`) |
| `cross_sell_attempts` | Enabled; `supabase/migrations/100_cross_sell_attempts_restore.sql:18` | `cross_sell_attempts_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/015_sales_forum_2026.sql:162`); `cross_sell_attempts_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/015_sales_forum_2026.sql:168`); `cross_sell_attempts_own`: authenticated ALL; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/100_cross_sell_attempts_restore.sql:23`) |
| `csnp_carrier_verification` | **No ENABLE RLS found after CREATE**; `supabase/migrations/004_snp_routing_tables.sql:21` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `dsnp_eae_lookup` | Enabled; `supabase/migrations/095_dsnp_public_cms_read.sql:4` | `Read published PY2027 CMS alignment`: anon, authenticated SELECT; published plan_year = 2027 reference rows (`supabase/migrations/095_dsnp_public_cms_read.sql:10`) |
| `enrolled_agents` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_enrolled_tenant_read`: authenticated SELECT; protected evidence membership/ownership helper (`supabase/migrations/063_evidence_access.sql:108`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `enrollment_intakes` | Enabled; `supabase/migrations/125_enrollment_intakes.sql:17` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `fema_disasters` | Enabled; `scripts/sep-data/schema.sql:73`; external CREATE `scripts/sep-data/schema.sql:51` | `Allow read for authenticated`: authenticated SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:76`); `Allow read for anon`: anon SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:78`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `fema_feed_snapshot` | Enabled; `supabase/migrations/078_fema_county.sql:11` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `follow_ups` | Enabled; `supabase/migrations/017_crm_contacts.sql:241` | `follow_ups_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:310`); `follow_ups_agent_access`: authenticated ALL; active JWT subject owner/admin via mutable tenant_agents; contact/assignee consistency checks (`supabase/migrations/086_follow_ups_workspace.sql:66`); Browser policy reset supabase/migrations/086_follow_ups_workspace.sql:59 |
| `followup_queue` | Enabled; `supabase/migrations/012_analytics_engine.sql:60` | `followup_queue_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/012_analytics_engine.sql:87`); `followup_queue_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/012_analytics_engine.sql:93`) |
| `ghl_enrollment_deliveries` | Enabled; `supabase/migrations/125_enrollment_intakes.sql:18` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `ghl_sync_log` | Dropped by later SQL; historical object | Not required in final schema; old policies not applicable. |
| `inbound_calls` | Enabled; `supabase/migrations/018_inbound_calls.sql:77` | `inbound_calls_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/018_inbound_calls.sql:81`); `inbound_calls_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/018_inbound_calls.sql:87`) |
| `integration_deliveries` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `integration_delivery_attempts` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `integration_link_issues` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `integration_push_state` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `integration_report_log` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `intent_detections` | Enabled; `supabase/migrations/001_compliance_engine.sql:350` | `intent_detections_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/002_post_call_pipeline.sql:229`); `detection_parent_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); parent-card existence, no caller-owner predicate (`supabase/migrations/133_compliance_overhaul_safety.sql:185`); Browser policy reset supabase/migrations/133_compliance_overhaul_safety.sql:177 |
| `ix_upload_retries` | Enabled; `supabase/migrations/132_ix_test_enrollment_safeguards.sql:12` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `ix_uploads` | Enabled; `supabase/migrations/124_ix_uploads.sql:70` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/124_ix_uploads.sql:70 |
| `knowledge_base` | Enabled; `supabase/migrations/009_knowledge_base.sql:76` | `knowledge_base_select_shared_or_own`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); shared rows readable / shared mutation checks is_org_admin (`supabase/migrations/009_knowledge_base.sql:80`); `knowledge_base_mutate_own`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding); shared rows readable / shared mutation checks is_org_admin (`supabase/migrations/009_knowledge_base.sql:85`); `knowledge_base_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/009_knowledge_base.sql:97`) |
| `knowledge_updates` | Enabled; `supabase/migrations/009_knowledge_base.sql:77` | `knowledge_updates_select_related`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); linked knowledge row; shared-row admin restriction for writes (`supabase/migrations/009_knowledge_base.sql:103`); `knowledge_updates_mutate_related_own`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding); linked knowledge row; shared-row admin restriction for writes (`supabase/migrations/009_knowledge_base.sql:115`); `knowledge_updates_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/009_knowledge_base.sql:141`) |
| `lead_source_pings` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `lead_sources` | Enabled; `supabase/migrations/048_vendor_integrations.sql:376` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/048_vendor_integrations.sql:376 |
| `manual_transcript_gap_fills` | Enabled; `supabase/migrations/137_manual_transcript_gaps.sql:19` | `gap_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/137_manual_transcript_gaps.sql:19`); Browser grants revoked supabase/migrations/137_manual_transcript_gaps.sql:19 |
| `manual_transcript_gap_requests` | Enabled; `supabase/migrations/137_manual_transcript_gaps.sql:19` | `gap_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/137_manual_transcript_gaps.sql:19`); Browser grants revoked supabase/migrations/137_manual_transcript_gaps.sql:19 |
| `media_stream_leases` | Enabled; `supabase/migrations/074_media_stream_auth.sql:14` | `media_stream_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/074_media_stream_auth.sql:17`) |
| `message_media` | **Unknown baseline RLS**; CREATE missing | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; No canonical CREATE/RLS found; src/hooks/useMessages.js:38; telephony/src/routes/sms.js:95,258. |
| `messages` | **Unknown baseline RLS**; CREATE missing | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; No canonical CREATE/RLS found; src/hooks/useMessages.js:26,77,142 and telephony/src/routes/sms.js:112,233. Browser + service writes require explicit review. |
| `opportunities` | Enabled; `supabase/migrations/058_opportunities_board.sql:101` | `opportunities_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/058_opportunities_board.sql:101`); `opportunities_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/058_opportunities_board.sql:101`) |
| `opportunity_events` | Enabled; `supabase/migrations/058_opportunities_board.sql:101` | `opportunity_events_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/058_opportunities_board.sql:101`); `opportunity_events_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/058_opportunities_board.sql:101`) |
| `opportunity_stage_history` | Enabled; `supabase/migrations/058_opportunities_board.sql:101` | `opportunity_stage_history_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/058_opportunities_board.sql:101`); `opportunity_stage_history_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/058_opportunities_board.sql:101`) |
| `paragon_agent_reservations` | Enabled; `supabase/migrations/051_paragon_vendor_matrix.sql:100` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_billing_events` | Enabled; `supabase/migrations/067_paragon_billing_hours.sql:521` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_call_billing` | Enabled; `supabase/migrations/067_paragon_billing_hours.sql:522` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_callback_tasks` | Enabled; `supabase/migrations/053_paragon_zip_and_reports.sql:12` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_contact_zip_origin` | Enabled; `supabase/migrations/131_paragon_residence_capture.sql:24` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_control_changes` | Enabled; `supabase/migrations/067_paragon_billing_hours.sql:520` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_ping_decisions` | Enabled; `supabase/migrations/051_paragon_vendor_matrix.sql:99` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_report_access` | Enabled; `supabase/migrations/055_paragon_vendor_report.sql:34` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_report_email_days` | Enabled; `supabase/migrations/055_paragon_vendor_report.sql:36` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_report_email_log` | Enabled; `supabase/migrations/055_paragon_vendor_report.sql:37` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_report_tokens` | Enabled; `supabase/migrations/055_paragon_vendor_report.sql:35` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_residence_jobs` | Enabled; `supabase/migrations/131_paragon_residence_capture.sql:25` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_residence_sep_inputs` | Enabled; `supabase/migrations/131_paragon_residence_capture.sql:26` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `paragon_residence_settings` | Enabled; `supabase/migrations/131_paragon_residence_capture.sql:23` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `phi_redactions` | Enabled; `supabase/migrations/001_compliance_engine.sql:356` | `redaction_parent_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); parent-card existence, no caller-owner predicate (`supabase/migrations/133_compliance_overhaul_safety.sql:187`); Browser policy reset supabase/migrations/133_compliance_overhaul_safety.sql:177 |
| `pii_access_log` | Enabled; `supabase/migrations/022_pii_protection_phase1.sql:324` | `pii_access_log_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/022_pii_protection_phase1.sql:327`); `pii_access_log_admin_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/022_pii_protection_phase1.sql:336`) |
| `pipeline_stages` | Enabled; `supabase/migrations/058_opportunities_board.sql:101` | `pipeline_stages_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/058_opportunities_board.sql:101`); `pipeline_stages_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/058_opportunities_board.sql:101`) |
| `pipelines` | Enabled; `supabase/migrations/058_opportunities_board.sql:101` | `pipelines_tenant_access`: authenticated SELECT; active subject roster membership via opportunities_is_tenant (mutable identity dependency) (`supabase/migrations/058_opportunities_board.sql:101`); `pipelines_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/058_opportunities_board.sql:101`) |
| `plan_terminations` | Enabled; `scripts/sep-data/schema.sql:132`; external CREATE `scripts/sep-data/schema.sql:110` | `Allow read for authenticated`: authenticated SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:135`); `Allow read for anon`: anon SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:137`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `policies` | Enabled; `supabase/migrations/017_crm_contacts.sql:240` | `policies_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/017_crm_contacts.sql:292`); `policies_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/017_crm_contacts.sql:298`) |
| `post_call_jobs` | Enabled; `supabase/migrations/099_post_call_background_jobs.sql:25` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `post_call_requests` | Enabled; `supabase/migrations/099_post_call_background_jobs.sql:26` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `post_call_status_tickets` | Enabled; `supabase/migrations/130_post_call_lifecycle_safety.sql:8` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `post_call_webhook_claims` | Enabled; `supabase/migrations/130_post_call_lifecycle_safety.sql:18` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `provider_alert_throttle` | Enabled; `supabase/migrations/102_provider_quota_alert_throttle.sql:7` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `qhp_landscape_2026` | **Unknown baseline RLS**; CREATE missing | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; ACA reference table used in src/lib/acaPlanLookup.js:88; scripts/upload_qhp_landscape.cjs:7 uploads, but CREATE/RLS not found. May be separate CMS project. |
| `recording_agent_subjects` | Enabled; `supabase/migrations/064_recording_ingestion.sql:354` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/064_recording_ingestion.sql:354 |
| `recording_call_scopes` | Enabled; `supabase/migrations/064_recording_ingestion.sql:354` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/064_recording_ingestion.sql:354 |
| `recording_compliance_tickets` | Enabled; `supabase/migrations/112_recording_compliance_tickets.sql:25` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `recording_download_tickets` | Enabled; `supabase/migrations/064_recording_ingestion.sql:354` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/064_recording_ingestion.sql:354 |
| `recording_ingestion` | Enabled; `supabase/migrations/064_recording_ingestion.sql:354` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/064_recording_ingestion.sql:354 |
| `recording_reconciliation` | Enabled; `supabase/migrations/064_recording_ingestion.sql:354` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure.; Browser grants revoked supabase/migrations/064_recording_ingestion.sql:354 |
| `rts_ingestion_log` | Enabled; `supabase/migrations/030_rts_ai_ingestion.sql:240` | `rts_ingestion_log_tenant_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/030_rts_ai_ingestion.sql:288`); `rts_ingestion_log_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/030_rts_ai_ingestion.sql:293`) |
| `sales_log` | Enabled; `supabase/migrations/020_sales_log.sql:22` | `Agents read own sales`: PUBLIC (default) SELECT; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/020_sales_log.sql:25`); `Agents insert own sales`: PUBLIC (default) INSERT; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/020_sales_log.sql:32`); `Principals read all sales`: PUBLIC (default) SELECT; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/020_sales_log.sql:39`); `Principals insert any sales`: PUBLIC (default) INSERT; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/020_sales_log.sql:50`); `Principals manage all sales`: PUBLIC (default) ALL; protected enrolled-agent principal role (not all authenticated) (`supabase/migrations/020_sales_log.sql:61`) |
| `scorecard_items` | Enabled; `supabase/migrations/001_compliance_engine.sql:352` | `scorecard_items_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/002_post_call_pipeline.sql:199`); `scorecard_item_parent_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); parent-card existence, no caller-owner predicate (`supabase/migrations/133_compliance_overhaul_safety.sql:183`); Browser policy reset supabase/migrations/133_compliance_overhaul_safety.sql:177 |
| `scoring_jobs` | Enabled; `supabase/migrations/072_scoring_integrity.sql:19` | `scoring_jobs_service`: service_role ALL; unrestricted service path (`supabase/migrations/072_scoring_integrity.sql:22`) |
| `scoring_manual_retries` | Enabled; `supabase/migrations/114_manual_scoring_retry.sql:14` | `scoring_manual_retries_service`: service_role ALL; unrestricted service path (`supabase/migrations/114_manual_scoring_retry.sql:17`) |
| `scoring_segment_progress` | Enabled; `supabase/migrations/103_resumable_scoring_jobs.sql:13` | `scoring_segment_progress_service`: service_role ALL; unrestricted service path (`supabase/migrations/103_resumable_scoring_jobs.sql:16`) |
| `scoring_template_items` | Enabled; `supabase/migrations/001_compliance_engine.sql:348` | `Authenticated users can read scoring_template_items`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:368`); `Service role full access scoring_template_items`: service_role ALL; unrestricted service path (`supabase/migrations/001_compliance_engine.sql:411`) |
| `scoring_templates` | Enabled; `supabase/migrations/001_compliance_engine.sql:347` | `Authenticated users can read scoring_templates`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/001_compliance_engine.sql:365`); `Service role full access scoring_templates`: service_role ALL; unrestricted service path (`supabase/migrations/001_compliance_engine.sql:408`) |
| `script_templates` | Enabled; `supabase/migrations/013_script_templates.sql:28` | `script_templates_tenant_access`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding); shared rows readable / shared mutation checks is_org_admin (`supabase/migrations/013_script_templates.sql:31`); `script_templates_tenant_write`: authenticated INSERT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/013_script_templates.sql:36`); `script_templates_tenant_update`: authenticated UPDATE; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/013_script_templates.sql:41`); `script_templates_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/013_script_templates.sql:47`) |
| `section_scores` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_section_score_own_read`: authenticated SELECT; parent session visible through owner RLS (`supabase/migrations/063_evidence_access.sql:130`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `sessions` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_session_own_read`: authenticated SELECT; protected evidence membership/ownership helper (`supabase/migrations/063_evidence_access.sql:112`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `snp_plans_by_county` | Enabled; `scripts/sep-data/schema.sql:102`; external CREATE `scripts/sep-data/schema.sql:81` | `Allow read for authenticated`: authenticated SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:105`); `Allow read for anon`: anon SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:107`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `snp_routing_rules` | **No ENABLE RLS found after CREATE**; `supabase/migrations/004_snp_routing_tables.sql:34` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `star_ratings_by_county` | Enabled; `scripts/sep-data/schema.sql:43`; external CREATE `scripts/sep-data/schema.sql:25` | `Allow read for authenticated`: authenticated SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:46`); `Allow read for anon`: anon SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:48`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `state_excess_charge_rules` | Enabled; `supabase/migrations/015_sales_forum_2026.sql:88` | `excess_charge_rules_read`: authenticated SELECT; **all rows / no row identity check** (`supabase/migrations/015_sales_forum_2026.sql:91`); `excess_charge_rules_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/015_sales_forum_2026.sql:96`) |
| `stt_call_reconnects` | Enabled; `supabase/migrations/140_stt_reconnect_budget.sql:9` | `stt_budget_service`: service_role ALL; unrestricted service path (`supabase/migrations/140_stt_reconnect_budget.sql:12`) |
| `subscriptions` | Enabled; `supabase/migrations/008_stripe_billing.sql:67` | `subscriptions_tenant_select`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/008_stripe_billing.sql:71`); `subscriptions_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/008_stripe_billing.sql:76`) |
| `telephony_call_attempts` | Enabled; `supabase/migrations/045_telephony_answer_attribution.sql:36` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `telephony_events` | Enabled; `supabase/migrations/018_inbound_calls.sql:78` | `telephony_events_tenant_read`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/018_inbound_calls.sql:93`); `telephony_events_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/018_inbound_calls.sql:98`) |
| `telephony_presence_policy` | Enabled; `supabase/migrations/047_availability_feed.sql:11` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `telephony_routing_responses` | Enabled; `supabase/migrations/038_call_owned_agent_reservations.sql:75` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `telephony_transcript_segments` | Enabled; `supabase/migrations/084_durable_transcripts.sql:15` | `transcript_segments_service`: service_role ALL; unrestricted service path (`supabase/migrations/084_durable_transcripts.sql:19`) |
| `tenant_agents` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:238` | `tenant_agents_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:252`); `tenant_agents_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/007_multi_tenant_foundation.sql:258`) |
| `tenants` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:237` | `tenants_select_own`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:241`); `tenants_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/007_multi_tenant_foundation.sql:246`); `tenants_update_own`: authenticated UPDATE; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/028_remove_org_gating.sql:38`) |
| `training_completions` | Enabled; `supabase/migrations/007_multi_tenant_foundation.sql:345` | `training_completions_tenant_access`: authenticated ALL; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/007_multi_tenant_foundation.sql:349`) |
| `transcript_chunks` | Enabled; `supabase/migrations/063_evidence_access.sql:19` | `evidence_chunk_own_read`: authenticated SELECT; protected evidence membership/ownership helper (`supabase/migrations/063_evidence_access.sql:120`); All old policies removed supabase/migrations/063_evidence_access.sql:19; Browser grants revoked supabase/migrations/063_evidence_access.sql:19; Baseline CREATE only in docs/supabaseschema:86; later 063 RLS below.; `evidence_service_all`: service_role ALL (`supabase/migrations/063_evidence_access.sql:41`) |
| `transcript_recovery_alerts` | Enabled; `supabase/migrations/147_bounded_transcript_recovery.sql:16` | `recovery_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/147_bounded_transcript_recovery.sql:16`); Browser grants revoked supabase/migrations/147_bounded_transcript_recovery.sql:16 |
| `transcript_score_dispatch` | Enabled; `supabase/migrations/084_durable_transcripts.sql:16` | `transcript_dispatch_service`: service_role ALL; unrestricted service path (`supabase/migrations/084_durable_transcripts.sql:20`) |
| `transcription_incidents` | Enabled; `supabase/migrations/147_bounded_transcript_recovery.sql:16` | `recovery_service_only`: service_role ALL; unrestricted service path (`supabase/migrations/147_bounded_transcript_recovery.sql:16`); Browser grants revoked supabase/migrations/147_bounded_transcript_recovery.sql:16 |
| `usage_records` | Enabled; `supabase/migrations/008_stripe_billing.sql:68` | `usage_records_tenant_select`: authenticated SELECT; **broad existing-tenant predicate** (028 removes subject/org binding) (`supabase/migrations/008_stripe_billing.sql:82`); `usage_records_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/008_stripe_billing.sql:87`) |
| `user_preferences` | Enabled; `supabase/migrations/016_user_preferences.sql:19` | `user_preferences_own`: authenticated ALL; JWT subject in enrolled/user row; related session/call checks where specified (`supabase/migrations/016_user_preferences.sql:22`); `user_preferences_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/016_user_preferences.sql:28`) |
| `vendor_agent_state_eligibility` | Enabled; `supabase/migrations/051_paragon_vendor_matrix.sql:98` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `vendor_control_audit` | **No ENABLE RLS found after CREATE**; `supabase/migrations/049_paragon_pay_per_call.sql:10` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `vendor_controls` | **No ENABLE RLS found after CREATE**; `supabase/migrations/049_paragon_pay_per_call.sql:3` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `vendor_routing_config` | Enabled; `supabase/migrations/051_paragon_vendor_matrix.sql:97` | No remaining explicit policies found. Service path only where grants are revoked; otherwise inspect effective grants before exposure. |
| `zip_county_crosswalk` | Enabled; `scripts/sep-data/schema.sql:17`; external CREATE `scripts/sep-data/schema.sql:1` | `Allow read for authenticated`: authenticated SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:20`); `Allow read for anon`: anon SELECT; **all rows / no row identity check** (`scripts/sep-data/schema.sql:22`); CREATE/RLS outside numbered migrations; bootstrap must include approved script explicitly. |
| `storage.objects` | Supabase-managed RLS; verify platform catalog | `call_recordings_service_role`: service_role ALL; unrestricted service path (`supabase/migrations/018_inbound_calls.sql:122`) |

**Missing/unenforced RLS requiring explicit resolution:** `csnp_carrier_verification`, `message_media`, `messages`, `qhp_landscape_2026`, `snp_routing_rules`, `vendor_control_audit`, `vendor_controls`. Missing baseline is not proof a running project has RLS disabled. `csnp_carrier_verification` and `snp_routing_rules` have CREATE statements without a corresponding ENABLE in the numbered migration model; choose public read/server write explicitly. Non-public rollback/key schemas are separately grant-restricted.

**Tables with broad authenticated/PUBLIC read or mutation predicates (reference reads included):** `agent_coaching`, `agent_compliance_profiles`, `autoresearch_iterations`, `birthday_rule_states`, `bulletin_feed_status`, `bulletins`, `calibration_overrides`, `calibration_runs`, `call_insights`, `call_records`, `call_threads`, `carrier_profiles`, `carrier_rts`, `cms_county_penetration`, `compliance_intents`, `compliance_scorecards`, `compliance_scores`, `contact_activities`, `contact_lead_intel`, `contact_notes`, `contacts`, `cross_sell_attempts`, `fema_disasters`, `followup_queue`, `inbound_calls`, `intent_detections`, `knowledge_base`, `knowledge_updates`, `phi_redactions`, `pii_access_log`, `plan_terminations`, `policies`, `rts_ingestion_log`, `scorecard_items`, `scoring_template_items`, `scoring_templates`, `script_templates`, `snp_plans_by_county`, `star_ratings_by_county`, `state_excess_charge_rules`, `subscriptions`, `telephony_events`, `tenant_agents`, `tenants`, `training_completions`, `usage_records`, `zip_county_crosswalk`. Use the row above to distinguish read-only reference tables from dangerous operational writes.

### Views, RPCs and catalog checks

Views have no independent table RLS flag. Check owner/security-invoker behavior and EXECUTE/SELECT grants, not just base policies. `v_call_log_entries` is the renamed view from 118, not a missing table; 118 revokes browser access to call-log/combine views. SECURITY DEFINER contact/PII/opportunity/availability/routing functions can bypass base RLS by design and therefore require their own subject/admin checks. A fresh-project acceptance query should enumerate `pg_class.relrowsecurity/relforcerowsecurity`, `pg_policies` commands/roles/qual/with_check, `information_schema.role_table_grants`, column privileges, schema USAGE, function owner/prosecdef/proacl/search_path and view options for **all** public and exposed schemas. Review anon/authenticated EXECUTE defaults; compare against an approved allowlist. Do not infer deploy state from this static report.


## Appendix E. Every server-side privileged-client use and observed reach

**Maximum authority is project-wide, not the following table list.** `SUPABASE_SECRET_KEY` (new opaque server key), `SUPABASE_SERVICE_ROLE_KEY` (legacy role JWT) and `SUPABASE_SERVICE_KEY` (supported alias where present) create privileged Supabase clients. They can bypass application-table RLS, invoke privileged RPCs, decrypt through granted PII functions and access Storage using the project service role. They do not automatically grant access to a different Supabase project, Twilio account or Clerk app, or equal unrestricted PostgreSQL superuser credentials. Their actual scope depends on database/storage/function grants; no per-service restricted role is established here.

The inventory includes constructors, direct consumers and injected/shared-client modules so a helper import does not hide a use. Relations/RPCs are statically named operations in each file, not a claim all are called on every request or a least-privilege boundary. Helpers can access additional dynamic tables. All script entries are audit inventory, **not scripts to run against production**.

Key resolution: `integrations/supabase.js:4–5` prefers secret → service-role → service-key alias; `telephony/src/lib/supabaseKeys.js` has its own resolver; `telephony/src/supabase.js:6–17` creates ordinary/recording service clients; `_evidenceAccess.js:10–15` creates a privileged client per helper use. Edge resolver accepts explicit secret aliases, named platform secret map and legacy service role. Nextcloud uses the same broad server credential in REST headers. Browser `src/lib/supabaseKeys.js:1–6` rejects opaque secret/service-role JWT keys; `src/lib/llm/config.js:10–19` blocks public secret names/value signatures. These are useful build checks, not authorization for server routes.


### Optional Nextcloud export

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `infra/office-nextcloud/sync/sync.py` | 34, 84, 85, 124, 125, 126 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |

### Railway integrations worker

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `integrations/complianceUploads.js` | 70, 73, 81 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `conversely_run_agents`, `conversely_run_events`, `conversely_week_slots`, `conversely_weekly_runs`, `conversely_worker_status`, `enrolled_agents`, `enrollment_intakes`, `recording_ingestion`; RPCs: `reserve_conversely_week` |
| `integrations/converselyRuns.js` | 4, 11, 22 | Shared/injected privileged DB client. Relations/buckets: `conversely_run_events`; RPCs: `claim_conversely_run`, `conversely_week_candidates`, `fail_conversely_run`, `reserve_conversely_run` |
| `integrations/enrollmentWebhook.js` | 7, 11, 12 | Shared/injected privileged DB client. Relations/buckets: `enrollment_intakes`, `ghl_enrollment_deliveries`; RPCs: `claim_compliance_upload`, `decrypt_pii_value`, `finish_compliance_upload` |
| `integrations/ixUploads.js` | 27, 29, 30 | Shared/injected privileged DB client. Relations/buckets: `compliance_daily_summaries`, `compliance_reconciliation`, `inbound_calls`, `ix_uploads`, `lead_sources`, `paragon_billing_facts`, `recording_ingestion`; RPCs: `claim_ix_upload`, `enqueue_compliance_uploads`, `finish_ix_upload` |
| `integrations/recordingComplianceGrant.js` | 32 | Shared/injected privileged DB client. Relations/buckets: `recording_compliance_tickets` |
| `integrations/supabase.js` | 4, 5, 13, 14, 15, 16 | Key selection/client creation. Relations/buckets: `availability_consumers` |
| `integrations/worker.js` | 2, 112 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |

### Netlify handlers and server libraries

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `netlify/functions/_conferencePlayback.js` | 8, 13, 15 | Shared/injected privileged DB client. Relations/buckets: `call_conferences`, `call_participants`, `call_records` |
| `netlify/functions/_copilotSkipCounter.js` | 11 | Shared/injected privileged DB client. RPCs: `record_llm_skipped_ticks` |
| `netlify/functions/_evidenceAccess.js` | 1, 10, 11, 14 | Key selection/client creation. Relations/buckets: `call_records`, `call_transcripts`, `contacts`, `enrolled_agents`, `sessions`, `tenants` |
| `netlify/functions/_knowledgeUpdate.js` | 1, 6, 8, 199 | Key selection/client creation. Relations/buckets: `knowledge_base`, `knowledge_updates` |
| `netlify/functions/_llmTelemetry.js` | 13, 22, 26 | Shared/injected privileged DB client. Relations/buckets: `compliance_llm_requests`, `usage_records`; RPCs: `reserve_compliance_request` |
| `netlify/functions/_paragonControls.js` | 18 | Shared/injected privileged DB client. RPCs: `paragon_report_totals` |
| `netlify/functions/_recordingAccess.js` | 13, 28, 37 | Shared/injected privileged DB client. Relations/buckets: `call-recordings`, `call_records`, `inbound_calls`, `recording_agent_subjects`, `recording_call_scopes`, `recording_download_tickets`, `recording_ingestion`, `telephony_call_attempts` |
| `netlify/functions/_rtsIngestion.js` | 216 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `netlify/functions/_subscriptionGate.js` | 19, 29, 46 | Shared/injected privileged DB client. Relations/buckets: `subscriptions`, `tenant_agents`, `tenants`, `usage_records` |
| `netlify/functions/_telephonyLink.js` | 7, 11 | Shared/injected privileged DB client. Relations/buckets: `integration_link_issues`; RPCs: `link_telephony_call_record` |
| `netlify/functions/_tenantSettings.js` | 1, 311, 313 | Key selection/client creation. Relations/buckets: `script_templates`, `tenants` |
| `netlify/functions/agent-status-log.js` | 2, 15 | Key selection/client creation. Relations/buckets: `agent_availability`, `agent_availability_log`, `availability_agent_subjects` |
| `netlify/functions/backfill-analytics.js` | 60 | Shared/injected privileged DB client. Relations/buckets: `tenants` |
| `netlify/functions/backfill-deepgram-intelligence.js` | 1, 15, 17, 322 | Key selection/client creation. Relations/buckets: `call_records` |
| `netlify/functions/backfill-followups.js` | 1, 10, 12, 100 | Key selection/client creation. Relations/buckets: `call_records`, `followup_queue` |
| `netlify/functions/call-disposition.js` | 2, 7 | Key selection/client creation. Relations/buckets: `agent_availability`, `availability_agent_subjects`, `call_records`, `call_wrap_up_policy`, `enrollment_intakes`, `sessions`, `telephony_call_attempts`, `telephony_events`; RPCs: `save_agent_call_disposition` |
| `netlify/functions/call-log.js` | 2, 71 | Key selection/client creation. Relations/buckets: `call_records`, `compliance_scorecards`, `telephony_call_attempts`, `v_call_log` |
| `netlify/functions/call-record-details.js` | 2, 4 | Key selection/client creation. Relations/buckets: `call_records` |
| `netlify/functions/cms-plans.js` | 4, 16, 41 | Shared/injected privileged DB client. Relations/buckets: `cms_plans_py2027`, `zip_county_crosswalk` |
| `netlify/functions/coach.js` | 6, 23, 25, 40 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `netlify/functions/combine-calls.js` | 2, 5 | Key selection/client creation. Relations/buckets: `call_records`, `v_call_combine_facts`, `v_call_log`, `v_call_log_entries`; RPCs: `combine_call_records` |
| `netlify/functions/compliance-review-background.js` | 3, 9 | Key selection/client creation. Relations/buckets: `call_records`, `compliance_llm_passes`, `compliance_llm_requests` |
| `netlify/functions/compliance-review.js` | 8, 11 | Key selection/client creation. Relations/buckets: `availability_agent_subjects`, `call_records`, `compliance_llm_passes`, `compliance_scorecards`, `contacts`, `enrolled_agents`, `manual_transcript_gap_fills`, `scorecard_items`; RPCs: `claim_compliance_pass`, `decrypt_pii_value` |
| `netlify/functions/compliance-uploads.js` | 4, 23 | Key selection/client creation. Relations/buckets: `call_records`, `compliance_missing_codes`, `compliance_reconciliation`, `conversely_run_events`, `conversely_runs`, `conversely_submissions`, `conversely_weekly_audit`, `conversely_worker_status`, `enrolled_agents`, `ix_upload_admin_rows`, `tenant_agents`; RPCs: `conversely_run_results`, `request_conversely_run`, `retry_ix_upload` |
| `netlify/functions/compliance.js` | 26, 60, 62, 455 | Key selection/client creation. Relations/buckets: `calibration_overrides`, `calibration_runs`, `call_records`, `compliance_intents`, `compliance_scorecards`, `corrective_actions`, `intent_detections`, `scorecard_items`, `scoring_templates`, `tenants`; RPCs: `increment_calibration_overrides` |
| `netlify/functions/copilot-skip-counter.js` | 1, 15 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `netlify/functions/deepgram-token.js` | 2, 21, 23, 38 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `netlify/functions/embeddings.js` | 3, 38 | Key selection/client creation. Relations/buckets: `post_call_jobs`, `post_call_requests` |
| `netlify/functions/enrollment-intakes.js` | 2, 5 | Key selection/client creation. Relations/buckets: `call_records`, `cms_plans_py2027`, `contacts`, `enrolled_agents`, `enrollment_intakes`, `ghl_enrollment_deliveries`; RPCs: `decrypt_pii_value`, `save_enrollment_intake` |
| `netlify/functions/evidence-session.js` | 4, 12 | Key selection/client creation. Relations/buckets: `call_wrap_ups`, `compliance_flags`, `section_scores`, `sessions`; RPCs: `start_telephony_session` |
| `netlify/functions/nightly-analytics.js` | 1, 17, 19, 359 | Key selection/client creation. Relations/buckets: `call_records`, `compliance_scorecards`, `tenants` |
| `netlify/functions/paragon-daily-email.js` | 2, 11 | Key selection/client creation. Relations/buckets: `lead_sources`; RPCs: `claim_paragon_report_email`, `finish_paragon_report_email`, `paragon_vendor_report` |
| `netlify/functions/paragon-residence.js` | 2, 4 | Key selection/client creation. Relations/buckets: `contacts`, `tenant_agents`, `v_paragon_residence_review`; RPCs: `enqueue_paragon_sep_residence`, `save_paragon_contact_zip` |
| `netlify/functions/paragon-vendor-report.js` | 3, 52 | Key selection/client creation. RPCs: `authorize_paragon_report`, `paragon_vendor_report` |
| `netlify/functions/paragon-zip-confirm.js` | 3 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `contacts`, `inbound_calls`, `paragon_callback_tasks`, `tenant_agents`, `tenants`; RPCs: `decrypt_pii_value` |
| `netlify/functions/post-call-admin.js` | 3, 6 | Key selection/client creation. Relations/buckets: `call_records`, `post_call_jobs`; RPCs: `retry_failed_scoring`, `retry_post_call_transcript` |
| `netlify/functions/post-call-background.js` | 4, 9 | Key selection/client creation. Relations/buckets: `post_call_jobs`; RPCs: `claim_post_call_worker`, `finish_post_call_request`, `next_post_call_request` |
| `netlify/functions/post-call.js` | 3, 20 | Key selection/client creation. Relations/buckets: `call_records`, `post_call_jobs`, `post_call_requests`; RPCs: `enqueue_post_call_request`, `expire_post_call_worker`, `start_telephony_session` |
| `netlify/functions/recordings.js` | 2, 38 | Key selection/client creation. Relations/buckets: `calls_missing_recordings`, `recording_ingestion`, `v_call_log` |
| `netlify/functions/rts-ingest.js` | 1, 26, 28, 525 | Key selection/client creation. Relations/buckets: `carrier_rts`, `rts_ingestion_log`, `tenant_agents`, `tenants`; RPCs: `commit_rts_ingestion` |
| `netlify/functions/score-call-background.js` | 20, 44 | Key selection/client creation. Relations/buckets: `call_records`, `transcript_score_dispatch`; RPCs: `mark_compliance_not_applicable` |
| `netlify/functions/seed-new-tenant.js` | 203 | Shared/injected privileged DB client. Relations/buckets: `tenant_agents`, `tenants` |
| `netlify/functions/set-availability.js` | 2, 45 | Key selection/client creation. Relations/buckets: `agent_availability`, `availability_agent_subjects`, `enrolled_agents` |
| `netlify/functions/stripe-checkout.js` | 1, 12, 14, 68 | Key selection/client creation. Relations/buckets: `subscriptions` |
| `netlify/functions/stripe-portal.js` | 1, 12, 14, 44 | Key selection/client creation. Relations/buckets: `subscriptions` |
| `netlify/functions/stripe-webhook.js` | 1, 10, 12, 148 | Key selection/client creation. Relations/buckets: `subscriptions` |
| `netlify/functions/stt-alert.js` | 1, 3 | Key selection/client creation. Relations/buckets: `call_records`, `telephony_call_attempts`, `transcript_recovery_alerts` |
| `netlify/functions/stt-reconnect.js` | 2, 4 | Key selection/client creation. Relations/buckets: `availability_agent_subjects`, `call_conferences`, `call_records`, `media_stream_leases`, `telephony_call_attempts` |
| `netlify/functions/stt-usage.js` | 2, 13 | Key selection/client creation. Relations/buckets: `usage_records` |
| `netlify/functions/sync-bulletins.js` | 7, 522, 523, 526, 537 | Key selection/client creation. Relations/buckets: `bulletin_feed_status`, `bulletins` |
| `netlify/functions/sync-fema.js` | 1, 19 | Key selection/client creation. Relations/buckets: `fema_feed_snapshot` |
| `netlify/functions/test-ghl-webhook.js` | 64 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `netlify/functions/transcribe.js` | 13, 25, 27, 318 | Key selection/client creation. Relations/buckets: `call_records` |
| `netlify/functions/transcript-gaps-background.js` | 2, 13 | Key selection/client creation. Relations/buckets: `call-recordings`, `manual_transcript_gap_fills`, `recording_ingestion` |
| `netlify/functions/transcript-import.js` | 6, 26 | Key selection/client creation. Relations/buckets: `agents`, `enrolled_agents`, `sessions`, `transcript_chunks` |
| `netlify/functions/vendor-pause.js` | 2, 8 | Shared/injected privileged DB client. Relations/buckets: `vendor_controls`; RPCs: `set_vendor_pause` |
| `netlify/functions/vendor-routing.js` | 3, 15 | Shared/injected privileged DB client. Relations/buckets: `lead_sources`, `paragon_report_tokens`, `tenant_agents`, `vendor_agent_state_eligibility`, `vendor_controls`, `vendor_routing_config`; RPCs: `paragon_daily_status`, `set_paragon_controls` |
| `netlify/functions/weekly-coaching.js` | 3, 13, 15, 239 | Key selection/client creation. Relations/buckets: `agent_coaching`, `call_insights`, `call_records`, `compliance_scorecards`, `tenants` |
| `netlify/lib/complianceVersions.js` | 4, 5, 6 | Shared/injected privileged DB client. Relations/buckets: `compliance_intents`, `compliance_scorecards`, `intent_detections`, `scorecard_items`, `scoring_template_items`, `scoring_templates`; RPCs: `save_compliance_version` |
| `netlify/lib/manualTranscriptGaps.js` | 17, 22, 23 | Shared/injected privileged DB client. Relations/buckets: `manual_transcript_gap_requests`, `usage_records`; RPCs: `persist_manual_gap_result` |
| `netlify/lib/postCallGuard.js` | 7, 9, 16 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `post_call_status_tickets`, `sessions` |
| `netlify/lib/postCallProvider.js` | 12, 34 | Shared/injected privileged DB client. RPCs: `claim_provider_quota_alert`, `set_post_call_provider_status` |
| `netlify/lib/postCallWork.js` | 12, 735 | Key selection/client creation. Relations/buckets: `agents`, `call_records`, `call_transcripts`, `contact_activities`, `sessions`, `telephony_call_attempts`, `tenant_agents`; RPCs: `claim_post_call_webhook`, `ensure_inbound_transcript_record` |
| `netlify/lib/transcriptRecovery.js` | 22, 23, 24 | Shared/injected privileged DB client. Relations/buckets: `call_conferences`, `call_records`, `recording_ingestion`, `telephony_call_attempts`, `transcript_recovery_alerts`; RPCs: `claim_automatic_transcript_recovery`, `finish_automatic_transcript_recovery`, `mark_transcript_recovery_blocked` |

### Operator scripts (not run)

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `scripts/compliance-overhaul/read-only-audit.mjs` | 4 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `scripts/embed_cms_landscape_2027.mjs` | 5, 8 | Key selection/client creation. Relations/buckets: `cms_plan_embeddings_py2027`, `cms_plans_py2027` |
| `scripts/integrations/common.js` | 1, 9, 10 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `scripts/integrations/create-consumer.js` | 5, 8, 12 | Shared/injected privileged DB client. Relations/buckets: `availability_consumers` |
| `scripts/integrations/create-lead-source.js` | 6, 9, 19 | Shared/injected privileged DB client. Relations/buckets: `lead_sources` |
| `scripts/integrations/resend-postback.js` | 4, 5, 8 | Shared/injected privileged DB client. Relations/buckets: `integration_deliveries`, `integration_link_issues`; RPCs: `resend_disposition` |
| `scripts/post-call/recover-mark-second-call.mjs` | 15, 19, 20 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `call_transcripts`, `post_call_jobs`, `post_call_requests`, `sessions`, `telephony_call_attempts`, `telephony_transcript_segments`; RPCs: `enqueue_post_call_request`, `start_telephony_session` |
| `scripts/post-call/repair-tpmo-timing.mjs` | 62, 63, 69 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `compliance_scorecards`, `intent_detections`, `scorecard_items`, `scoring_template_items`, `scoring_templates`; RPCs: `persist_tpmo_timing_repair` |
| `scripts/post-call/reprocess.mjs` | 6 | Shared/injected privileged DB client. Relations/buckets: `call_records` |
| `scripts/post-call/rerun-dylan-sessions.mjs` | 19, 20, 21 | Shared/injected privileged DB client. Relations/buckets: `call_records`, `call_transcripts`, `enrolled_agents`, `post_call_requests`, `sessions`, `tenant_agents`, `tenants`; RPCs: `enqueue_post_call_request`, `retry_post_call_recovery` |
| `scripts/post-call/retry-failed-scoring.mjs` | 34 | Shared/injected privileged DB client. RPCs: `retry_failed_scoring` |
| `scripts/reaggregate-saved-calls.js` | 9, 16 | Key selection/client creation. Relations/buckets: `call_records`, `compliance_scorecards`, `corrective_actions`, `intent_detections`, `scorecard_items`, `scoring_jobs`, `scoring_segment_progress`, `scoring_template_items`, `scoring_templates`; RPCs: `begin_scoring_job`, `fail_scoring_job`, `persist_scoring_result` |
| `scripts/rescore-calls.js` | 3, 65, 68 | Key selection/client creation. Relations/buckets: `compliance_scorecards`, `intent_detections`, `scoring_template_items`, `scoring_templates` |
| `scripts/seed_carrier_rts.js` | 5, 100 | Key selection/client creation. Relations/buckets: `carrier_rts`, `tenant_agents` |
| `scripts/sep-data/common.js` | 3, 110, 114 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `scripts/sep-data/ingest-plan-crosswalk.js` | 76 | Shared/injected privileged DB client. Relations/buckets: `plan_terminations` |
| `scripts/sep-data/ingest-snp-plans.js` | 100 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `scripts/sep-data/ingest-star-ratings.js` | 124, 204, 211 | Shared/injected privileged DB client. Relations/buckets: `cms_plans_py2027`, `star_ratings_by_county` |
| `scripts/sep-data/landscape-2027.js` | 13 | Shared/injected privileged DB client. Relations/buckets: `cms_plans_py2027` |
| `scripts/sep-data/verify-cms-sources-2027.js` | 4 | Shared/injected privileged DB client. Relations/buckets: `dsnp_eae_lookup`; RPCs: `get_available_seps` |
| `scripts/sep-data/verify-supplemental-2027.js` | 4 | Shared/injected privileged DB client. Relations/buckets: `dsnp_eae_lookup`; RPCs: `get_available_seps` |
| `scripts/upload_cms_landscape_2027.mjs` | 4, 9, 10 | Key selection/client creation. Relations/buckets: `cms_plans_py2027` |

### Supabase Edge Function

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `supabase/functions/_shared/supabaseKeys.js` | 3, 4, 6, 10, 13 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `supabase/functions/get-availability/handler.js` | 12 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `supabase/functions/get-availability/index.ts` | 3, 6 | Key selection/client creation. RPCs: `get_availability_feed`, `paragon_ping` |

### Railway telephony and background/media workers

| File | Credential/helper/operation lines | Observed use (full project authority remains) |
|---|---|---|
| `telephony/scripts/backfillLastConnected.js` | 1, 10, 12 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/answerAttribution.js` | 3 | Shared/injected privileged DB client. Relations/buckets: `telephony_call_attempts`; RPCs: `finish_inbound_call`, `record_telephony_evidence` |
| `telephony/src/availability.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `agent_availability`, `tenant_agents`; RPCs: `release_call_agent` |
| `telephony/src/backfillConnections.js` | 31, 40, 60 | Shared/injected privileged DB client. Relations/buckets: `contacts`, `inbound_calls`, `telephony_events`; RPCs: `advance_contact_connection` |
| `telephony/src/callStatusRecovery.js` | 14, 25, 54 | Shared/injected privileged DB client. Relations/buckets: `agent_availability`; RPCs: `release_call_agent`, `release_verified_stale_call_agent` |
| `telephony/src/conferenceCalling.js` | 3 | Shared/injected privileged DB client. Relations/buckets: `availability_agent_subjects`, `conference_media_leases`, `enrolled_agents`; RPCs: `enqueue_conference_recording`, `outbound_dnc_status`, `prepare_call_conference`, `start_telephony_session` |
| `telephony/src/conferenceGuard.js` | 4 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/conferenceStore.js` | 12, 13, 14 | Shared/injected privileged DB client. Relations/buckets: `agent_phone_sessions`, `call_conferences`, `call_participants`; RPCs: `complete_conference_agent_transfer`, `conference_event`, `finish_call_conference`, `lock_call_conference`, `release_call_agent`, `reserve_conference_agent`, `unlock_call_conference` |
| `telephony/src/config.js` | 1, 19, 50 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/contacts.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `contact_activities`, `contact_lead_intel`, `contacts` |
| `telephony/src/giphy.js` | 39 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/lib/supabaseKeys.js` | 4, 5, 9, 10, 11 | Key selection/client creation. Relations/buckets: `availability_consumers` |
| `telephony/src/media/conferenceMedia.js` | 4 | Shared/injected privileged DB client. Relations/buckets: `call_conferences` |
| `telephony/src/media/mediaStream.js` | 5 | Shared/injected privileged DB client. Relations/buckets: `call_conferences` |
| `telephony/src/media/streamLease.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `telephony_call_attempts` |
| `telephony/src/media/streamToken.js` | 14, 23, 25 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/media/sttReconnectBudget.js` | 1 | Shared/injected privileged DB client. RPCs: `register_stt_stream`, `reserve_stt_reconnect` |
| `telephony/src/outboundPolicy.js` | 1 | Shared/injected privileged DB client. RPCs: `outbound_dnc_status` |
| `telephony/src/paragonBilling.js` | 15, 20, 21 | Shared/injected privileged DB client. Relations/buckets: `paragon_billing_events`, `paragon_call_billing`; RPCs: `claim_paragon_billing_jobs`, `claim_paragon_call`, `claim_paragon_call_at`, `enqueue_paragon_billing_event`, `record_paragon_billing_snapshot`, `resolve_recent_paragon_ping`, `resolve_recent_paragon_ping_at` |
| `telephony/src/paragonResidenceWorker.js` | 6, 28, 31 | Shared/injected privileged DB client. Relations/buckets: `zip_county_crosswalk`; RPCs: `claim_paragon_residence_jobs`, `fail_paragon_residence_job`, `finish_paragon_residence_job` |
| `telephony/src/phonePresence.js` | 2 | Shared/injected privileged DB client. RPCs: `expire_agent_phone_sessions` |
| `telephony/src/postCallStatus.js` | 8 | Shared/injected privileged DB client. Relations/buckets: `post_call_status_tickets` |
| `telephony/src/recordingCompliance.js` | 24, 65 | Shared/injected privileged DB client. Relations/buckets: `call-recordings`, `recording_compliance_tickets` |
| `telephony/src/recordingMedia.js` | 17 | Shared/injected privileged DB client. Relations/buckets: `recording_download_tickets` |
| `telephony/src/recordings.js` | 21, 50, 135 | Shared/injected privileged DB client. Relations/buckets: `call-recordings`, `recording_compliance_tickets`, `recording_download_tickets`, `recording_ingestion`, `recording_reconciliation`; RPCs: `claim_recording_ingestion`, `claim_recording_reconciliation`, `enqueue_recording`, `reconcile_recording_links`, `seed_recording_reconciliation` |
| `telephony/src/routes/conferenceCalling.js` | 31, 35, 49 | Shared/injected privileged DB client. Relations/buckets: `availability_agent_subjects`, `call_participants`, `conference_media_leases`, `contacts`, `enrolled_agents`, `telephony_call_attempts`; RPCs: `enqueue_conference_recording` |
| `telephony/src/routes/leads.js` | 4 | Shared/injected privileged DB client. Relations/buckets: `contact_lead_intel`, `contacts` |
| `telephony/src/routes/recordingMedia.js` | 3 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/routes/sms.js` | 8 | Shared/injected privileged DB client. Relations/buckets: `contacts`, `message-media`, `message_media`, `messages`, `tenant_agents` |
| `telephony/src/routes/twilioStatus.js` | 7 | Shared/injected privileged DB client. Relations/buckets: `inbound_calls`, `telephony_events`; RPCs: `finalize_telephony_transcript` |
| `telephony/src/routes/twilioVoice.js` | 6 | Shared/injected privileged DB client. Relations/buckets: `contacts`, `inbound_calls`, `lead_sources`, `telephony_events` |
| `telephony/src/routes/vendorPing.js` | 3 | Shared/injected privileged DB client. RPCs: `paragon_ping` |
| `telephony/src/routes/voiceEvents.js` | 3 | Shared/injected privileged DB client. Relations/buckets: `telephony_call_attempts`, `telephony_events`, `tenant_agents` |
| `telephony/src/routes/voiceOutbound.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `telephony_call_attempts`, `tenant_agents` |
| `telephony/src/routes/voiceToken.js` | 7 | Shared/injected privileged DB client. Relations/buckets: `tenant_agents` |
| `telephony/src/routingReplay.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `telephony_routing_responses` |
| `telephony/src/server.js` | 8, 76, 77, 78, 79, 81 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/sttUsage.js` | 1 | Shared/injected privileged DB client. Relations/buckets: `usage_records` |
| `telephony/src/supabase.js` | 8, 16, 17 | Key selection/client creation. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |
| `telephony/src/terminalRouting.js` | 5 | Shared/injected privileged DB client. Relations/buckets: `telephony_events` |
| `telephony/src/transcripts.js` | 11, 16, 30 | Shared/injected privileged DB client. Relations/buckets: `transcript_recovery_alerts`, `transcript_score_dispatch`; RPCs: `append_transcription_gap`, `get_sale_compliance_dispatch`, `reconcile_telephony_transcripts`, `record_transcription_incident` |
| `telephony/src/wsToken.js` | 17, 34, 35 | Shared/injected privileged DB client. Passes/configures privileged client or uses dynamic relation names; scope inherited by downstream operations. |

### Required privilege boundary changes

Keep each service credential server-only and unique to the pilot project; never log it or distribute it to browser/consumer feeds. Enforce authorization before creating evidence grants or invoking decrypt/service RPCs. Consider narrower database roles or tightly scoped server RPCs for availability/export/delivery services after the pilot baseline, with compatibility tests for Supabase key types. Separate projects contain a compromised service to its own agency only if URLs/keys and external delivery destinations are all isolated.
