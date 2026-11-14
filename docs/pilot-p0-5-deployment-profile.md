# P0-5 deployment profile and service-managed roster

Implemented only on `pilot/release`, building on `49c211c`. No push, deployment, environment-file edit, live migration, production connection, or real provider request was performed. `styles.css` and the EnrollGen logo are unchanged. The audit governs this implementation; the existing agency is not a default deployment.

## Configuration contract

`DEPLOYMENT_PROFILE_JSON` is one **server-only JSON object**, supplied identically to Netlify/build, telephony, and the integrations worker. The parser is `telephony/src/lib/deploymentProfile.js`, inside the independently packaged telephony tree. Netlify validates at module initialization, telephony before constructing services, and the worker before starting. Vite validates before completing a build/dev startup. Errors identify a field without echoing its value. No profile value or credential should be placed in a `VITE_` variable; `VITE_DEPLOYMENT_PROFILE_JSON` is explicitly rejected.

Vite generates a literal public module instead of bundling the server parser/profile. `/api/deployment-features` also exposes that public projection alongside the unchanged P0-6 flags. The public projection contains only the rows marked **public** below; it excludes delivery destinations, allowlists, senders, recipients, integration identity, provider mappings, keys, and secrets. The public phone-service origin is included for the browser softphone. Rebuild the frontend and restart all services after changing the profile. Telephony and the worker compare their public configuration with the service-provisioned database mirror and refuse startup on a mismatch or invalid active roster.

| JSON field | Type / validation | Required | Readers / exposure |
|---|---|---|---|
| `tenantId` | UUID, explicit deployment identity | Always | All services, provisioning; public |
| `organizationId` | Nonempty Clerk `org_…` identifier | Always | All services/provisioning; public |
| `agencyName` | Nonempty single-line string, at most 500 characters | Always | Scripts, prompts, intake, documents, onboarding, billing, status; public |
| `agencyAliases` | Nonempty array of distinct nonempty strings | Always | Agency identification matchers; public |
| `agencyClosing` | Read-only derived approved closing, computed from identity/line/hours; not an arbitrary input | Generated | All scripts and coaching; public |
| `documentName` | Nonempty single-line string | Always | PDF branding; public |
| `logoUrl` | HTTPS exact-allowlisted URL | Optional | Agency branding metadata; public. Product logo remains EnrollGen |
| `primaryColor` | `#RRGGBB` | Optional | Agency branding metadata; public. Existing site styling remains authoritative |
| `agencyLine` | E.164 phone | Always | Scripts, dialer contact label, PDF, status; public |
| `agencyLineLabel` | Nonempty display label | Always | Dialer; public |
| `phoneDisplay` | `national` or `international` | Always | Shared display formatter; public. National formats North American numbers; other numbers retain E.164 |
| `textSender` | E.164 verified sender / outbound caller number | Always | Telephony only; private configuration |
| `timezone` | Valid IANA name with a region separator | Always | Calendar windows, staffed hours, UI timestamps, reports, SQL mirror; public |
| `staffedHours` | Object with exactly `mon,tue,wed,thu,fri,sat,sun`; each has boolean `enabled`, `HH:mm` `start,end`, start before end; at least one enabled day | Always | Scripts, closing, reports, vendor provisioning, UI; public |
| `allowedHosts` | Nonempty array of exact lowercase public DNS hostnames; no wildcards, ports, IP literals, local/internal/single-label names | Always | All outbound destination checks; server only |
| `appOrigin` | HTTPS allowlisted application URL | Always | Internal post-call, scoring/recovery and review dispatch; server only |
| `telephonyOrigin` | HTTPS allowlisted phone-service URL | Always | Telephony callbacks, browser phone/WebSocket clients and recording capabilities; public |
| `ghl.postCallUrl` | HTTPS allowlisted destination | `GHL_ENABLED=true` | Netlify post-call delivery/test route; server only |
| `ghl.enrollmentUrl` | HTTPS allowlisted destination | `GHL_ENABLED=true` | Durable intake-delivery worker; server only |
| `ghl.locationId` | Nonempty provider location identifier | `GHL_ENABLED=true` | Server post-call payload; server only |
| `conversely.target` | Nonempty approved provider target | `CONVERSELY_UPLOAD_ENABLED=true` | Compliance worker payload |
| `conversely.endpoint` | HTTPS allowlisted destination | Same | Compliance worker transport |
| `ix.teamName` | Nonempty approved provider team | `IX_UPLOAD_ENABLED=true` | IX registration metadata |
| `ix.environment` | Exactly `test` or `production` | Same | Claim/delivery, status and test-enrollment segregation |
| `ix.origin` | HTTPS allowlisted provider origin | Same | IX authentication, registration and finalization; no legacy `IX_ENV` default |
| `ix.reportRecipients` | Nonempty array of email addresses | IX upload, IX report and operational email all enabled | Daily IX summaries |
| `email.from` | Email address, provider-verified outside this task | `OPERATIONAL_EMAIL_ENABLED=true` | All operational mail |
| `email.replyTo` | Email address | Same | All operational mail |
| `email.recipients` | Nonempty email list | Same | Provider/quota/STT/recovery alerts |
| `email.endpoint` | HTTPS allowlisted delivery endpoint | Same | All operational mail |
| `paragon.sourceName` | Nonempty source/consumer name | `PARAGON_ENABLED=true` | Telephony/availability, worker, reports, provisioning |
| `paragon.pushUrl`, `paragon.postbackUrl` | HTTPS allowlisted destinations | Same | Worker, service-only vendor provisioning |
| `paragon.pushSecret`, `paragon.postbackSecret` | Strings of at least 32 characters | Same | Signature transport; never public |
| `paragon.pingKeyHash`, `paragon.availabilityKeyHash`, `paragon.reportTokenHash` | SHA-256 hex strings (64 lowercase hex characters) of independently provisioned credentials | Same | Service-only vendor provisioning |
| `paragon.rate` | Positive finite number | Same | Contract mirror, billing/report compatibility |
| `paragon.dailyCap` | Positive integer or explicit `null` | Same | Contract mirror |
| `paragon.capMode` | `soft` or `hard` | Same | Contract mirror |
| `paragon.states` | Nonempty two-letter state list | Same | Routing contract mirror |
| `paragon.requiredCarriers`, `paragon.criticalCarriers` | Nonempty carrier-key lists | Same | Routing contract mirror; use existing supported carrier keys |
| `paragon.planYear` | Integer at least 2027 | Same | Routing contract mirror |
| `paragon.reservationTtlSeconds` | Integer 5–120 | Same | Routing contract mirror |
| `paragon.eligibility` | Array of `{agentId,state,carriers}` | Same; empty means no approved routing | Service-only matrix provisioning; each row must match an active roster agent licensed in that state |
| `paragon.reportRecipients` | Nonempty email list | Paragon and operational email enabled | Vendor daily reports |

Optional integration sections can be absent when their P0-6 feature is off. All flags retain their existing strict exact-string semantics. Test-enrollment classification, UHC-only IX eligibility, confirmation-code capture, durable leases, idempotency and the existing paid-feature fences remain in place. No SunFire quote/SSO/API contract is invented.

Service credentials remain in their existing **server** environment variables, separately from profile settings: Supabase URL/service key, Clerk secrets/verification configuration, Twilio account/API/TwiML credentials, Deepgram key, inbound-vendor key, agent WebSocket signing secret, and enabled-provider credentials such as `IX_USERNAME`, `IX_PASSWORD`, `CONVERSELY_API_KEY`, `RESEND_API_KEY`, Stripe and LLM keys. Provider credential availability is still checked by the relevant transport; it cannot enable an off feature. `TWILIO_PHONE_NUMBER`, `DEFAULT_TENANT_ID`, `GHL_ENROLLMENT_WEBHOOK_URL`, `IX_ENV`, `POST_CALL_ALERT_EMAIL`, `INTEGRATIONS_REPORT_FROM`, `COMPLIANCE_APP_ORIGIN`, `TELEPHONY_BASE_URL`, `VITE_TELEPHONY_BASE_URL` and `PUBLIC_BASE_URL` no longer supply defaults for the settings now owned by this profile. Conversely sampling/carrier filters/exceptions keep their existing explicit server environment settings; the former agency-specific exception default is gone.

The audit's Medicare form entry is the internal intake, not an external URL. Nextcloud stays undeployed and opt-in; its independently provisioned credentials, restricted export scope and processor/retention approval remain prerequisites. No CMS disclosure or legal requirement is an arbitrary profile string. Closing sentences remain code-owned and interpolate only identity/contact/hours. Canonical scoring/rubric template IDs were preserved.

## Roster and provisioning

`tenant_agents` is the operational roster, managed through `scripts/provision-deployment.js` and service-only SQL. It is not an authorization-role source. An active row requires a unique stable UUID, Clerk subject, slug, NPN, display name, explicit alias array and licensed-state array. Provider mappings (`ghl_user_id`, `sunfire_agent_id`, `ams_producer_id`) and `team` stay server-side. When GHL intake is enabled, all active writing agents need an explicit GHL mapping. Display-name selection in the intake resolves against this roster and stores the selected UUID and slug; it does not authenticate a user. Unknown/inactive writers and mismatched UUID/name pairs are rejected. There is no first-agent/default GHL assignee.

The browser obtains the active roster from the authenticated `/api/deployment-roster`; identity resolution accepts only the exact protected Clerk subject mapping. User names, usernames, unsafe/public metadata aliases, local-storage names and the former hardcoded Clerk aliases cannot establish identity. RTS normalization receives roster aliases/NPNs; commit resolves only an exact NPN or an explicit approved alias. Vendor/RTS admin decisions use signed claims, and the current-agent UI no longer derives admin authority from the roster role.

The unapplied `151_deployment_profile_roster.sql` adds the public settings mirror, roster metadata, uniqueness indexes, service-only provisioning RPCs and browser-write revocations (including column grants). The operator applies a complete reviewed roster atomically: tenant, `tenant_agents`, matching active `enrolled_agents`, offline initial availability, `availability_agent_subjects`, and `recording_agent_subjects`. Omitted agents are deactivated and their recording mappings removed. Roles in an input roster do not grant principal/admin access. Existing principals are not granted or revoked by a roster role value.

Provision Clerk subjects and obtain approved NPN/licensing/provider mappings separately on the isolated agency's accounts. Then, after P0-4 has produced and reviewed the isolated bootstrap including migration 151:

```sh
node scripts/provision-deployment.js /absolute/private/roster.json --preview
# Future authorized operation against the isolated database only:
node scripts/provision-deployment.js /absolute/private/roster.json --apply
```

No apply command was executed here. The preview uses no database/provider transport. The test fixture `tests/fixtures/deployment-roster.json` demonstrates the 12-row shape; use new independent identities and UUIDs for an actual agency. Browser onboarding/auto-bootstrap and `/api/seed-new-tenant` cannot create or edit roster identities; the legacy seed route returns 410 and points to operator provisioning. Browser roster/settings controls cannot change destinations or roster rows.

When Paragon is enabled, the operator command separately invokes `configure_deployment_vendor`: explicit contract, source/consumer/key hashes, report token, hours, rate/cap, routes and approved roster matrix. A newly created vendor control starts **paused**. Roster provisioning commits first; if vendor setup fails, the command reports that the roster was saved and vendor configuration must be corrected and retried. Empty eligibility grants no routing. Review/unpause separately after contract and synthetic acceptance. Do not enable a vendor against blindly replayed historical SQL; P0-4 must remove historical fixed-source/fixed-tenant assumptions as listed below.

Migration 151 replaces installed SQL timezone literals with the provisioned IANA timezone and replaces the installed intake routine's name-to-slug derivation with a lookup of the active writing-agent UUID. It preserves routine signatures/grants, feature guards, confirmation/test-enrollment rules, and rubric IDs. A missing or unexpected intake routine aborts installation rather than silently leaving the old behavior. DST tests cover 23/25-hour day boundaries, report dates, staffed hours and actual follow-up timestamps.

## Delivery boundary

Browser-entered webhook URLs and tenant database webhook fields do not determine any GHL fetch. Internal dispatch uses the server-held application origin; it does not trust the incoming Host/Origin as a delivery target. Vendor push/postback URLs, recipient lists, signatures and mail sender/reply-to come from the profile. Every delivery destination must use HTTPS and an exact allowlisted DNS host. Credentials in URLs, fragments, alternate ports, IP literals (including alternate numeric encodings), loopback and local/internal hostnames are rejected. JSON webhook transports additionally resolve DNS, reject nonpublic answers and pin the vetted IP, without following redirects. Other provider fetch paths reject redirects and validate the configured/presigned host before use. The IX audio upload path retains its additional provider storage-host restriction.

Only add exact hosts approved for that isolated deployment, including core app/phone origins and the exact IX storage bucket host if IX is enabled. No wildcard host permits arbitrary presigned upload destinations. No recipient, endpoint, secret, or integration section is in the browser public module.

## Local environment needed after this commit

The **new required variable is `DEPLOYMENT_PROFILE_JSON`**. Add it to the server environment and the environment of `npm run dev` / `npm run build`, not to a `VITE_` variable. For a build-only local example, `docs/pilot-profile.example.json` is a complete synthetic core profile with all optional features off. Its `.example` origins are intentionally nonlive and must be replaced before running services. A shell-only example, with no environment-file edit, is:

```sh
export DEPLOYMENT_PROFILE_JSON="$(cat docs/pilot-profile.example.json)"
npm run build
```

For the real isolated local deployment, replace these exact core fields: `tenantId`, `organizationId`, `agencyName`, `agencyAliases`, `documentName`, `agencyLine`, `agencyLineLabel`, `phoneDisplay`, `textSender`, `timezone`, all seven `staffedHours` entries, `allowedHosts`, `appOrigin`, and `telephonyOrigin`. Optional `logoUrl`/`primaryColor` are metadata; the site keeps its established CSS and EnrollGen logo. Use your isolated tenant/Clerk/phone resources, not identifiers copied from historical seeds. No secret belongs in the browser Supabase publishable key or Clerk publishable key settings.

Keep existing valid isolated service credentials. Telephony still requires `SUPABASE_URL`, a supported server Supabase key, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `DEEPGRAM_API_KEY`, `INBOUND_VENDOR_API_KEY`, `CLERK_SECRET_KEY`, and `AGENT_WS_SIGNING_SECRET`; profile origins replace its prior `PUBLIC_BASE_URL` requirement. Root frontend/auth still uses the existing public Clerk/Supabase settings. No new dependency is required.

All 13 P0-6 flags may remain unset/false for the bounded pilot. If an existing local environment enables a feature, either deliberately set that flag to `false` or supply **every corresponding required profile row** above and independently provision that provider. Keep `IX_REPORT_ENABLED` off unless IX uploads and mail are also intended. Session/auth safety restrictions from earlier sprint work still apply. A profile alone does not create a database or a Clerk membership: migration/bootstrap, reviewed provisioning and the later authorization work must be completed before real users can run the app.

`docs/current-agency-profile.example.json` records the repository's compatibility identity, public main line, script hours, agency aliases and timezone, with placeholders for every URL, recipient, secret and account identity. These are source-evidenced settings, **not a verified snapshot of today's live deployment**: production inspection was forbidden. The audit explicitly notes different historical vendor hours; a later authorized operator must reconcile those and inventory actual enabled flags before any rollout. No such rollout is authorized by this commit.

## P0-4 migration exclusions and replacement requirements

Do **not** blindly replay the historical agency identity/roster/webhook DML. The following literal occurrence inventory includes seed inserts/updates, installed defaults and identity/template selectors. It is conservative: split/replace agency-specific DML/defaults while retaining needed schema, security changes and canonical rubric IDs. Omitting whole files indiscriminately would break dependencies. Historical files were not edited here.

- `supabase/migrations/007_multi_tenant_foundation.sql`
- `supabase/migrations/008_stripe_billing.sql`
- `supabase/migrations/009_knowledge_base.sql`
- `supabase/migrations/010_tenant_settings_onboarding.sql`
- `supabase/migrations/013_script_templates.sql`
- `supabase/migrations/014_update_u65_script_template.sql`
- `supabase/migrations/015_sales_forum_2026.sql`
- `supabase/migrations/017_crm_contacts.sql`
- `supabase/migrations/018_inbound_calls.sql`
- `supabase/migrations/019_agent_availability_roster.sql`
- `supabase/migrations/022_pii_protection_phase1.sql`
- `supabase/migrations/023_pii_protection_phase2_rls.sql`
- `supabase/migrations/026_add_mike_shiomos_agent.sql`
- `supabase/migrations/028_remove_org_gating.sql`
- `supabase/migrations/030_rts_ai_ingestion.sql`
- `supabase/migrations/031_rts_shared_agent_edit.sql`
- `supabase/migrations/047_availability_feed.sql`
- `supabase/migrations/049_paragon_pay_per_call.sql`
- `supabase/migrations/051_paragon_vendor_matrix.sql`
- `supabase/migrations/067_paragon_billing_hours.sql`
- `supabase/migrations/075_tpmo_grading_2027.sql`
- `supabase/migrations/096_availability_before_staffed_hours.sql`
- `supabase/migrations/097_availability_status_labels.sql`
- `supabase/migrations/106_disable_wrap_up_routing_holds.sql`
- `supabase/migrations/111_remove_paragon_daily_cap.sql`
- `supabase/migrations/115_ma_cy2027_taxonomy.sql`
- `supabase/migrations/141_approved_cy2027_retirements.sql`
- `supabase/migrations/142_script_stage_applicability.sql`
- `supabase/migrations/143_cms_only_rubric.sql`
- `supabase/migrations/144_restore_full_compliance_rubric.sql`

The committed GHL capability-bearing seed is in **007**; do not copy or reproduce its URL. **010** carries the default agency/organization settings; **019, 023, 026, 051** include roster/NPN updates; **047** includes a default status consumer. **007/009/013/014/075/115/141–144** contain agency wording or template selectors: preserve the canonical rubric IDs and approved legal text while rebuilding those statements. **008** contains the old internal billing treatment. **049/067/111** include vendor defaults/updates.

Also review/replace these derived roster and vendor backfills or fixed-source routines, even where they do not literally embed the agency name/UUID: `032_backfill_rts_agent_links.sql` (name/NPN ownership backfill), `044_agent_contact_details.sql` (roster-role-dependent access), `048_vendor_integrations.sql`, `052_paragon_ping_and_claim.sql`, `053_paragon_zip_and_reports.sql`, `055_paragon_vendor_report.sql`, `056_resolve_recent_paragon_ping.sql`, `057_paragon_vendor_report_proof.sql`, `064_recording_ingestion.sql` (copied subject bindings), `073_availability_auth.sql` (copied subject bindings), `126_paragon_out_of_state_tasks.sql`, and `131_paragon_residence_capture.sql`. Use reviewed service provisioning rather than copying any pre-existing agency roster. Migration 151 replaces installed provider-name selectors with a private service-managed setting; it does not certify a complete fresh migration replay. Historical schema/default identity assumptions must be removed by the P0-4 manifest. The `supabase/seeds` scoring template display name is now generic and its ID is unchanged. Reference/application URL fields in seeds 003 and 005 are NULL, so fresh seeds contain no live URLs; an operator can add independently approved reference/application links later.

## P0-2 handoff

This change does not claim to repair all database authorization. P0-2 must bind tenant membership to protected active subjects, replace permissive tenant/roster/contacts/RTS policies, protect tenant organization/identity columns and all role-authority paths, audit SECURITY DEFINER RPCs and table/column grants, and add RLS/revocations for `vendor_controls` and `vendor_control_audit`. In particular, historical contact/PII/RTS SQL still reads roster roles or uses broad tenant predicates. The new direct roster-write revocations must survive that work and the bootstrap. Do not grant principal/admin authorization from `tenant_agents.role` or from a provisioning payload. Verify exact cross-table subject/slug bindings, inactive and unprovisioned denials, ordinary/admin scope, duplicate subject handling and stale sessions directly through REST/RPC. Protected `enrolled_agents` roles are separate from the operational roster; this operator inserts ordinary agents and preserves existing protected roles.

Legacy tenant settings can still update nonprofile application settings under the existing database rules; P0-2 owns those rules. Browser destination/roster edits are no longer delivery/configuration authority. Passing the tests here is not approval for outside real-data access while P0-2/P0-4 remain open.

## Changed files

The following is the exact implementation/test/document manifest. Removed one-off current-agency repair/report generators were archived as non-executable text under `docs/legacy-operations`, with endpoint/recipient text redacted. CMS operator tools now require an explicit database URL instead of a current-instance fallback; they were not executed. The legacy name-derived RTS seed and prehashed status-consumer seed were retired. New tests preload synthetic profiles; they never read a developer environment file. No npm dependency or lockfile changed.

- `docs/current-agency-profile.example.json`
- `docs/legacy-operations/cms-only-report.mjs.txt`
- `docs/legacy-operations/event-fixes-report.mjs.txt`
- `docs/legacy-operations/full-rubric-report.mjs.txt`
- `docs/legacy-operations/recover-mark-second-call.mjs.txt`
- `docs/legacy-operations/rerun-dylan-sessions.mjs.txt`
- `docs/legacy-operations/stage-gates-report.mjs.txt`
- `docs/pilot-p0-5-deployment-profile.md`
- `docs/pilot-profile.example.json`
- `integrations/Dockerfile`
- `integrations/complianceUploads.js`
- `integrations/converselySelection.js`
- `integrations/diagnostics.js`
- `integrations/enrollmentWebhook.js`
- `integrations/ixClient.js`
- `integrations/ixUploads.js`
- `integrations/recordingComplianceGrant.js`
- `integrations/supabase.js`
- `integrations/transport.js`
- `integrations/worker.js`
- `netlify.toml`
- `netlify/functions/_clerkAuth.js`
- `netlify/functions/_evidenceAccess.js`
- `netlify/functions/_paragonControls.js`
- `netlify/functions/_recordingAccess.js`
- `netlify/functions/_rtsIngestion.js`
- `netlify/functions/_subscriptionGate.js`
- `netlify/functions/_tenantSettings.js`
- `netlify/functions/backfill-analytics.js`
- `netlify/functions/compliance-review.js`
- `netlify/functions/compliance-uploads.js`
- `netlify/functions/compliance.js`
- `netlify/functions/deployment-features.js`
- `netlify/functions/deployment-roster.js`
- `netlify/functions/deployment-status.js`
- `netlify/functions/enrollment-intakes.js`
- `netlify/functions/nightly-analytics.js`
- `netlify/functions/paragon-daily-email.js`
- `netlify/functions/paragon-vendor-report.js`
- `netlify/functions/paragon-zip-confirm.js`
- `netlify/functions/post-call-background.js`
- `netlify/functions/post-call.js`
- `netlify/functions/rts-ingest.js`
- `netlify/functions/seed-new-tenant.js`
- `netlify/functions/test-ghl-webhook.js`
- `netlify/functions/vendor-pause.js`
- `netlify/functions/vendor-routing.js`
- `netlify/functions/weekly-coaching.js`
- `netlify/lib/postCallGuard.js`
- `netlify/lib/postCallProvider.js`
- `netlify/lib/postCallWork.js`
- `package.json`
- `scripts/apply_cms_landscape_2027.mjs`
- `scripts/availability/register-app-consumers.sql`
- `scripts/compliance-overhaul/cms-only-report.mjs`
- `scripts/compliance-overhaul/event-fixes-report.mjs`
- `scripts/compliance-overhaul/full-rubric-report.mjs`
- `scripts/compliance-overhaul/stage-gates-report.mjs`
- `scripts/integrations/create-lead-source.js`
- `scripts/parse_cms_dsnp.js`
- `scripts/post-call/recover-mark-second-call.mjs`
- `scripts/post-call/reprocess.mjs`
- `scripts/post-call/rerun-dylan-sessions.mjs`
- `scripts/provision-deployment.js`
- `scripts/seed_carrier_rts.js`
- `scripts/upload_qhp_landscape.cjs`
- `scripts/upload_sbe_plans.cjs`
- `scripts/verify_cms_landscape_2027.mjs`
- `src/App.jsx`
- `src/compliance/rules/originalMatchers.js`
- `src/compliance/shared/approvedClosing.js`
- `src/components/AgentAudioSettings.jsx`
- `src/components/AgentDashboard.jsx`
- `src/components/AgentStatusLog.jsx`
- `src/components/AgentTools.jsx`
- `src/components/AvailabilityStrip.jsx`
- `src/components/BillingSettings.jsx`
- `src/components/CallHistory.jsx`
- `src/components/CarrierRef.jsx`
- `src/components/ClientQuickScripts.jsx`
- `src/components/LandingPage.jsx`
- `src/components/Onboarding.jsx`
- `src/components/RTSTab.jsx`
- `src/components/SessionSummary.jsx`
- `src/components/TenantSettings.jsx`
- `src/components/VendorRoutingSettings.jsx`
- `src/components/ancillary/AncillaryPopupManager.jsx`
- `src/components/ancillary/ancillaryPopupData.js`
- `src/components/callLog/ComplianceUploads.jsx`
- `src/components/callLog/ParagonResidenceReview.jsx`
- `src/components/contacts/ComposePickers.jsx`
- `src/components/contacts/FollowUpsView.jsx`
- `src/components/contacts/MessagesThread.jsx`
- `src/components/enrollment/EnrollmentIntake.jsx`
- `src/components/medsup/MedSupSalesForumPanel.jsx`
- `src/components/opportunities/OpportunityDrawer.jsx`
- `src/components/opportunities/OpportunityEditor.jsx`
- `src/components/phone/DialerPanel.jsx`
- `src/components/sep/FemaFeed.jsx`
- `src/context/CopilotTranscriptLog.jsx`
- `src/context/InboundCallContext.jsx`
- `src/context/MedSupScript.js`
- `src/context/SEPScript.js`
- `src/context/TranscriptAnalyzer.js`
- `src/context/scriptReducer.js`
- `src/data/acaComplianceKnowledge.js`
- `src/data/agencyClosing.js`
- `src/data/carrierReference.js`
- `src/data/complianceKnowledge.js`
- `src/data/dailyVerseSelections.js`
- `src/data/enrollmentClosing.js`
- `src/data/maScript2027.js`
- `src/data/medSupComplianceKnowledge.js`
- `src/data/sepCarriers.js`
- `src/flows/aca/ACAData.js`
- `src/flows/aca/StateACAData.js`
- `src/flows/ancillary/ancillarySteps.js`
- `src/flows/u65/U65Data.js`
- `src/hooks/useAcaCopilotEngine.js`
- `src/hooks/useConferenceCall.js`
- `src/hooks/useCopilotEngine.js`
- `src/hooks/useCopilotEngineCore.js`
- `src/hooks/useCurrentAgent.js`
- `src/hooks/useDashboardData.js`
- `src/hooks/useMedSupCopilotEngine.js`
- `src/hooks/useMessages.js`
- `src/hooks/useSpeechRecognition.js`
- `src/hooks/useTenantConfig.js`
- `src/hooks/useU65CopilotEngine.js`
- `src/lib/agencyLine.js`
- `src/lib/agentIdentity.js`
- `src/lib/callPresentation.js`
- `src/lib/dashboardMetrics.js`
- `src/lib/dashboardScope.js`
- `src/lib/deploymentPublic.js`
- `src/lib/enrollmentIntake.js`
- `src/lib/followUps.js`
- `src/lib/outboundApi.js`
- `src/lib/postCallPipeline.js`
- `src/lib/transcriptSearch.js`
- `status-page/index.html`
- `supabase/functions/get-availability/handler.js`
- `supabase/migrations/151_deployment_profile_roster.sql`
- `supabase/seeds/002_scoring_template.sql`
- `supabase/seeds/003_snp_routing_seed.sql`
- `supabase/seeds/005_sales_forum_2026_seed.sql`
- `telephony/package.json`
- `telephony/src/config.js`
- `telephony/src/lib/deploymentCalendar.js`
- `telephony/src/lib/deploymentProfile.js`
- `telephony/src/lib/deploymentProvisioning.js`
- `telephony/src/lib/deploymentRoster.js`
- `telephony/src/lib/deploymentSchedule.js`
- `telephony/src/media/sttAlert.js`
- `telephony/src/paragonEligibility.js`
- `telephony/src/routes/twilioVoice.js`
- `telephony/src/routes/voiceOutbound.js`
- `telephony/src/routes/voiceToken.js`
- `telephony/src/server.js`
- `telephony/src/transcripts.js`
- `telephony/tests/attributionRoutes.test.js`
- `telephony/tests/availabilityFeed.test.js`
- `telephony/tests/deploymentFeatures.test.js`
- `telephony/tests/fixtures/deployment-env.js`
- `telephony/tests/fixtures/deployment-profile.json`
- `telephony/tests/mediaStream.test.js`
- `telephony/tests/paragonStateRouting.test.js`
- `telephony/tests/vendorIntegrations.test.js`
- `telephony/tests/wsToken.test.js`
- `tests/admin-review-requests.test.js`
- `tests/agency-closing.test.js`
- `tests/auth-safety.test.js`
- `tests/call-access-authorization.test.js`
- `tests/call-back.test.js`
- `tests/cleanup-oct.test.js`
- `tests/combine-calls-ui.test.js`
- `tests/compliance-review-api.test.js`
- `tests/conversely-manual-runs.test.js`
- `tests/conversely-panel.test.js`
- `tests/conversely-payload.test.js`
- `tests/conversely-uploads.test.js`
- `tests/county-penetration.test.js`
- `tests/crm-panel-boundary.test.js`
- `tests/crm-workspace.test.js`
- `tests/dashboard-failure.test.js`
- `tests/dashboardQuery.test.js`
- `tests/dashboardScope.test.js`
- `tests/deployment-branding.test.js`
- `tests/deployment-features.test.js`
- `tests/deployment-profile.test.js`
- `tests/deployment-roster-sql.test.js`
- `tests/dsnp-2027.test.js`
- `tests/enrollment-intake-ui.test.js`
- `tests/enrollment-intakes.test.js`
- `tests/evidence-access.test.js`
- `tests/fixtures/deployment-env.js`
- `tests/fixtures/deployment-profile.json`
- `tests/fixtures/deployment-roster.json`
- `tests/fixtures/forbidden-deployment-terms.json`
- `tests/fixtures/profile-helpers.js`
- `tests/helpers/copilotCoreHarness.js`
- `tests/helpers/copilotPrompts.js`
- `tests/integrations-diagnostics.test.js`
- `tests/ix-uploads.test.js`
- `tests/legacy-api-authorization.test.js`
- `tests/outbound-call-log.test.js`
- `tests/outbound-dnc-ui.test.js`
- `tests/outbound-identity-recovery.test.js`
- `tests/paragon-billing-hours.test.js`
- `tests/paragon-callback-ui.test.js`
- `tests/paragon-daily-email.test.js`
- `tests/paragon-residence.test.js`
- `tests/paragon-serviceability.test.js`
- `tests/phone-stabilization.test.js`
- `tests/post-call-auth-date-embeddings.test.js`
- `tests/post-call-lifecycle-safety.test.js`
- `tests/post-call-provider-failures.test.js`
- `tests/preloadRecovery.test.js`
- `tests/recordings.test.js`
- `tests/scoring-provider-guard.test.js`
- `tests/script-intake-cleanup.test.js`
- `tests/stt-conference-handoff.test.js`
- `tests/supabase-api-keys.test.js`
- `tests/top-bar-controls.test.js`
- `tests/transcript-recovery.test.js`
- `vite.config.js`

## Offline validation and limits

The synthetic acceptance tests exercise all 12 writing agents, rejection of an unknown 13th/inactive/mismatched binding, a durable enrollment delivered to exactly one injected test sink, a repository scan built from Appendix A identifiers/domains/NPNs, strict missing/invalid profile rejection, optional-off sections, destination rejection, actual jsPDF document text, and script branding across MA/Med Supp/ACA/U65/ancillary. Isolated PGlite executes migration 151, the installed intake routine, roster provisioning/revocation, local follow-up timestamps, vendor provisioning and unlicensed matrix rejection. Existing P0-1/P0-3/session-lock/P0-6 regressions remain in the full suites.

The build is run from a tracked-source copy with every `.env*` file excluded and an otherwise empty environment plus PATH and a synthetic server profile. A missing profile build exits nonzero; the valid profile build completes. Generated browser assets are checked for private profile sentinels, destinations and recipients. Loopback-listening test suites require sandbox escalation for local listeners; their provider transports are mocked.

No deployed configuration, live Clerk invitations, actual local secrets, live database/catalog, full fresh bootstrap, hosted function routing, vendor acceptance, email-domain verification, or provider DNS/storage hosts was verified. The status page is a Vite build entry at `dist/status-page/index.html`. It uses the existing Clerk provider and public publishable key to sign in and refresh bearer tokens for a same-origin authenticated service endpoint. It has no embedded consumer key and must be hosted with the isolated app's functions/auth configuration. Real delivery/provider acceptance requires a later authorized isolated staging exercise. No rollout or migration against a live system was attempted.

Final local results:

- `npm test -- --test-concurrency=4`: **1,149 passed**, zero failed/skipped (baseline 1,139 plus 10 acceptance tests).
- `npm test --prefix telephony -- --test-concurrency=4`: **322 passed**, zero failed/skipped; independent import-boundary check passed.
- `npm run build` in the environment-free source copy: passed with the valid synthetic profile; passed with optional sections absent and their flags off. Missing and invalid required profiles each rejected with exit 1.
- Generated browser-bundle private-profile checks passed; the authenticated status build entry compiled.
- Worker source-layout import smoke passed using exactly the Dockerfile's copied sources; no image build/deploy or database startup was attempted.
- `git diff --check`: passed. Historical migrations, environment files, CSS, product-logo files and lockfiles were not modified.

No push or deployment is part of this commit.
