# Pilot owner decisions 1 — processor minimization and OpenAI-only model paths

Local work on `pilot/release`, following `1a2b0e9`. No push, deploy, hosted database, real processor call, environment secret-file change, stylesheet change, new dependency or historical migration edit. Only the explicitly requested npm vulnerability audits contacted a registry. Tests use synthetic identities, in-process PostgreSQL and fake provider transports with the existing external-network fence.

## CRM data

Both intake and legacy post-call CRM wire contracts have explicit allowlists. The independently packaged integrations worker Dockerfile also copies the shared allowlist module. DOB, Medicare number and Medicaid number are excluded. Medicaid yes/no, assignment, enrollment, PCP and every other previously transmitted field are preserved. Intake submission projects the snapshot before encryption; delivery applies the allowlist again to protect old snapshots while rollout is pending.

New migration **159_ghl_delivery_minimization.sql** adds a service-only trigger that decrypts, allowlists and re-encrypts every new or updated delivery snapshot. It applies that projection to existing delivery snapshots too, preserving all approved values, IDs, leases, status, retries and idempotency. Invalid ciphertext fails closed. An exclusive table lock covers the transaction; the existing feature fence is suspended only for this administrative cleanup and restored before commit (or automatically by rollback on error). This permits minimization even with GHL off without permitting concurrent claims, writes or delivery. Contact and intake encrypted identifiers remain unchanged. Migration 159 is included verbatim in the fresh-install bootstrap, before the seal; checksums, catalog and routine inventory were regenerated locally. It was applied only to synthetic in-process databases. A future authorized database rollout must apply it before relying on historical snapshot minimization; no hosted records were inspected or rewritten here.

## Standard reporting

Conversely always includes known `AgentEmail`, `Disposition`, `CampaignName`, `PCPName` and `CallDuration`. It reads staff email from existing call/metadata fields, campaign from call/metadata attribution, PCP from the selected intake (or existing call metadata), disposition and duration from the call. There is no staff-email column in the protected enrolled-agent roster; the code does not fabricate one or make an extra identity-provider request. Zero duration is preserved.

IX always includes known `leadSource`, `leadChannel`, `leadMedium`, `leadCampaign` and `leadCost`, including zero cost. Existing source/billing attribution and call/metadata aliases remain available. The checked-in `docs/sunfire-ix-openapi.json` InternalEnrollmentCallMetadata contract permits absent attribution properties, so unknown values are omitted rather than sent as null, empty placeholders or invented values. Conversely retains its existing omit-when-absent wire serialization for these non-gating fields; its required enrollment fields still fail closed. No new trimming flag exists for either vendor. Authenticated vendor acceptance and a separate authoritative Conversely absent-value specification were unavailable locally; no real upload was attempted.

## Models and environment

The Anthropic SDK and lockfile package, adapter, direct model fetches, hardcoded engine provider, bundling rule and shadow execution are removed. Selecting any provider other than `openai` raises an error. Existing OpenAI live/summary/scoring models and the ordinary OpenAI fallback remain unchanged. Historical database usage-type labels and billing totals retain compatibility; they cannot select or contact a provider. Jobs never fall back to that potentially more expensive general-purpose model.

Required new server settings (no defaults):

| Name | Purpose |
|---|---|
| `RTS_INGESTION_OPENAI_MODEL` | Operator-approved small, low-cost OpenAI model supporting the existing Responses API and strict structured output for RTS chunks. |
| `KNOWLEDGE_UPDATE_OPENAI_MODEL` | Independently selected small, low-cost OpenAI model with the same API/schema capabilities for knowledge proposals. |

There was no separately configured suitable small-model default in this repository, so neither setting invents a model name or silently inherits a general Co-Pilot model. Missing/blank settings fail before provider transport with a message naming the required setting. Synthetic tests explicitly select an already configured repository model; that is not a new price/capability recommendation.

Before running these features in a future authorized environment, provide `OPENAI_API_KEY`, the appropriate new model setting, the existing validated deployment profile, protected service database identity and migrations through 159. RTS keeps its protected identity/access checks. Knowledge remains off unless `KNOWLEDGE_AUTO_UPDATE_ENABLED=true`; its existing protected admin trigger or scheduler secret remains required. Remove the retired provider credential/overrides and shadow settings from actual hosting configuration in a separately authorized operation. No environment secret file was edited here.

All six engine identifiers, including Ancillary and Annuity, use the same existing OpenAI model resolver. Their actual browser guidance is deterministic in this repository; no new live model UI or HTTP engine capability was enabled. Existing engine prompts, compliance text and deterministic interventions are preserved. Scoring remains OpenAI-only with its feature switch, ledger authorization, token ceiling and single-attempt policy.

RTS and knowledge model work now passes through the existing server client, recursive prompt scrub, OpenAI SDK mapping, strict AJV validation, bounded retries within the original total job deadlines (RTS 90 seconds; knowledge 60 seconds) and tenant-scoped usage telemetry. Summary admission remains before each chunk/entry, with its subject/deployment daily paid-request budgets. Job usage telemetry is awaited. Global knowledge entries attribute usage to the protected deployment tenant. Those request budgets are not a new dollar ledger; the unchanged scoring token ledger applies to scoring. No dollar limit was invented or raised.

## Prompt and format adaptations

1. RTS normalization instructions are byte-for-byte unchanged. A strict OpenAI response schema encodes the existing JSON shape. The dynamic `detected_columns` object is closed over uploaded headers with nullable unknown mappings, preserving its object shape and permitting OpenAI strict schemas. Existing enum/date/state normalization still runs after schema validation. The unused fence-tolerant JSON helper is renamed to provider-neutral terminology. The old RTS `temperature:0` parameter is omitted by the existing Responses adapter, which sends no sampling fields; the 12,000/5,000 job output-token limits remain unchanged.
2. Knowledge retains its Medicare editor role, comparison criteria, source/entry text and truncation limits. Its output instructions replace the text sentinels `NO_CHANGES`, `CHANGES_DETECTED`, `Summary:`, `Confidence:` and `Updated content:` with JSON fields `changed`, `summary`, `confidence` and `updatedContent`. No-change uses false and empty text; changed proposals require nonempty summary/content and bounded confidence. Malformed/refused/truncated output fails and is reported through the existing error/draft path; valid changes remain pending review and cannot publish live knowledge.
3. Neither old job defined callable tools, so no tool was added. Existing shared tool definitions still map to OpenAI function tools and function-call outputs. Consumer envelopes and streaming event shapes remain compatible, with provider-neutral helper names. No Co-Pilot prompt wording changed.

## Template exception

The tracked `.env.example` still contains retired provider credential/shadow examples. The hard rule prohibiting all `.env` edits was retained; a template-only exception was requested but had not been granted. Actual `.env` and `.env.local` files were neither changed nor loaded by validation. The supported settings above supersede those stale template lines. Executable provider configuration and the current operator environment-name inventory have been cleaned; historical audit reports retain their historical observations.

## Validation

| Check | Result |
|---|---|
| Baseline root suite at unchanged HEAD | **1,298 passed**, zero failures/skips. The source-copy fixture includes only the committed placeholder `.env.example`, with no actual environment file. |
| Final root `npm test -- --test-concurrency=4` | **1,320 passed**, zero failures/cancellations/skips; 22 more tests than baseline; 103.18 seconds. |
| Baseline/final telephony `npm test --prefix telephony -- --test-concurrency=4` | **327 passed** both times, zero failures/skips; independent import-boundary check passed. |
| Environment-free source-copy `npm run build` | **Passed** on final source (Vite: 24.87 seconds) with only PATH and the synthetic `docs/pilot-profile.example.json`, existing local dependencies linked and every `.env*` file excluded. |
| `npm run typecheck:llm`, changed JS/JSX ESLint, `git diff --check` | **Passed**. |
| Local esbuild smoke for both model-job server bundles | **Passed**; no hosted function execution or deployment. |
| Integrations Dockerfile source-layout import | **Passed** with exactly the copied source paths, fake-only network fence and synthetic profile; no image build or worker startup. |
| Fresh-install/migration regression | **Passed** in the full root suite; ciphertext round-trip, all allowed values, canonical protected identifiers, lease/idempotency/status preservation, ACLs and feature-off cleanup checked. Migration 159's bootstrap copy/checksum match, and catalog comparisons pass. |

Full `npm audit --json --registry=https://registry.npmjs.org` (including development dependencies):

| Scope | Info | Low | Moderate | High | Critical | Total |
|---|---:|---:|---:|---:|---:|---:|
| Root | 0 | 0 | 0 | 0 | 0 | 0 |
| Telephony | 0 | 0 | 0 | 0 | 0 | 0 |

The lockfile adds **zero** package entries, removes only the retired SDK entry, and changes no remaining installed-package version/integrity. No install or audit fix was run. Initial sandbox DNS/listener failures were rerun with only the needed registry/localhost permission; fake tests retained the external-network fence. One baseline-copy attempt lacked its committed placeholder fixture and was rerun unchanged after restoring that fixture.

The focused fake-SDK paths cover normalization of the existing synthetic carrier CSV shape, valid/no-change knowledge proposals, malformed/refused schema behavior, scrubbing, verified admission and daily budgets, usage telemetry, bounded retries without a general fallback and failure of telemetry storage. Ancillary/Annuity canonical client interventions validate against the unchanged coaching schema; their browser guidance remains deterministic. Tests guard tracked application source/configuration against the removed API host, SDK and model family. Neither provider intelligence nor vendor receipt behavior is established by fake outputs.

All earlier sprint acceptance gates remain as documented; no production, hosted identity/storage/Vault, real carrier parsing intelligence, model availability/pricing or vendor receipt was verified. The authoritative Conversely absent-value contract and the template exception above remain unresolved.
