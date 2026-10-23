# Supabase API key migration audit and rollout

Prepared locally only. No push, deployment, key creation/revocation, secret update,
JWT signing-key change or production database mutation was performed. No database
migration is required for these code changes: PostgreSQL `anon` and `service_role`
roles and existing RLS grants keep their names and behavior.

## Key selection and authentication

| Runtime | Preferred key | Transition fallback |
|---|---|---|
| Netlify functions, integrations-worker, Node admin scripts | `SUPABASE_SECRET_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, then the existing scripts alias `SUPABASE_SERVICE_KEY` |
| Railway telephony and its backfill script | `SUPABASE_SECRET_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
| Browser primary project | `VITE_SUPABASE_PUBLISHABLE_KEY` | `VITE_SUPABASE_ANON_KEY` |
| Browser separate CMS project | `VITE_SUPABASE_CMS_PUBLISHABLE_KEY` | `VITE_SUPABASE_CMS_ANON_KEY`, then primary public key when no CMS key is configured |
| Netlify `cms-plans` public-data client | `SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_ANON_KEY` |
| Edge `get-availability` | `SUPABASE_SECRET_KEY` if runtime-provided, then `ENROLLGEN_SUPABASE_SECRET_KEY`, then `SUPABASE_SECRET_KEYS.default` | auto-injected `SUPABASE_SERVICE_ROLE_KEY` |
| Office Nextcloud sync | `SUPABASE_SECRET_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, then `SUPABASE_SERVICE_KEY` |

Selection trims whitespace and prefers a nonblank new value. An invalid new key
does not silently fall back to the compromised old key after an HTTP failure.
Privileged Node functions no longer fall back to an anonymous key when no admin
credential is configured. CMS public reads retain their lower-privilege client.

The server SDK factory is in `integrations/supabase.js`, inside the files copied
by `integrations/Dockerfile`. Telephony has its own small factory under
`telephony/src/lib/supabaseKeys.js` to respect its independent Docker build root.
Edge and browser helpers also stay inside their own deployment boundaries.

New keys travel through `apikey`. The SDK transport wrappers remove an opaque
API key from `Authorization: Bearer` when it equals the selected application key;
real user JWTs, legacy-key headers, request bodies and timeout transports are
preserved. This covers REST, Storage, and any future SDK Edge invocation using
these clients. Secret keys are rejected by browser key selection; the build guard
also rejects `sb_secret_` values and legacy service-role JWTs in any `VITE_` field.

## Complete repository consumer inventory

### Netlify direct client factories

All these factories now resolve the new secret key through the shared Node
factory, except `cms-plans`, which resolves the public key:

- `_evidenceAccess.js`, `_knowledgeUpdate.js`, `_tenantSettings.js`
- `backfill-deepgram-intelligence.js`, `backfill-followups.js`
- `coach.js`, `compliance.js`, `copilot-skip-counter.js`, `deepgram-token.js`
- `nightly-analytics.js`, `weekly-coaching.js`
- `paragon-daily-email.js`, `paragon-vendor-report.js`, `rts-ingest.js`
- `stripe-checkout.js`, `stripe-portal.js`, `stripe-webhook.js`
- `sync-bulletins.js`, `sync-fema.js`, `transcribe.js`
- `cms-plans.js` (public reads)

The central factories also migrate these consumers without duplicating key reads:
`call-disposition`, `call-log`, `call-record-details`, `embeddings`,
`evidence-session`, `paragon-zip-confirm`, `post-call`, `post-call-background`,
`recordings`, `score-call-background`, `set-availability`, `transcript-import`,
`seed-new-tenant`, `test-ghl-webhook`, `vendor-pause`, `vendor-routing`,
`backfill-knowledge-updates`, `trigger-knowledge-update`, and `update-knowledge`.
Keep their existing Clerk, tenant, subscription and job authorization checks.

### Railway and scripts

- Telephony: `src/config.js`, `src/supabase.js`, including
  `createRecordingServiceClient`; `scripts/backfillLastConnected.js` also uses
  the new resolver. Startup accepts a new key with no legacy variable present.
- `integrations/worker.js`; admin commands through `scripts/integrations/common.js`:
  `create-consumer.js`, `create-lead-source.js`, `resend-postback.js`.
- Direct admin scripts: `scripts/embed_cms_landscape_2027.mjs`,
  `upload_cms_landscape_2027.mjs`, `rescore-calls.js`,
  `reaggregate-saved-calls.js`, `seed_carrier_rts.js`.
- `scripts/sep-data/common.js` migrates `ingest-fema-disasters.js`,
  `ingest-plan-crosswalk.js`, `ingest-snp-plans.js`, `ingest-star-ratings.js`,
  `ingest-zip-crosswalk.js`, `landscape-2027.js`, `verify-cms-sources-2027.js`,
  `verify-supplemental-2027.js`, and the three `scripts/post-call/` recovery commands.
- The two `verify-*-2027.js` public/browser visibility checks now select the new
  browser publishable key as well.
- SQL loaders using `SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD`, including
  `apply_cms_landscape_2027.mjs`, `verify_cms_landscape_2027.mjs`,
  `parse_cms_dsnp.js`, `parse_cms_penetration.js`, `upload_sbe_plans.cjs`, and
  `upload_qhp_landscape.cjs`, use database credentials, not API keys. They are not
  affected by API-key deactivation. External HUD/API tokens are also unrelated.

### Browser, Edge, Storage and raw HTTP

- `src/lib/supabase.js`: public, CMS, cached Clerk and pinned-user client factories.
- `src/lib/evidenceSupabase.js`: authenticated evidence client and its public API key.
- `src/lib/clerkFetch.js`: explicitly refuses opaque API keys as user JWTs.
- `supabase/functions/get-availability/index.ts`: the only active Edge function
  in the checked-in deployment tree; now uses the new Edge resolver and transport.
- `supabase/config.toml`: keeps `verify_jwt=false`. Its hashed, revocable
  consumer-specific `x-api-key` authorization in `handler.js` remains enforced.
- `status-page/index.html` and external vendor feed consumers send their own
  availability `x-api-key`, not a Supabase API key. Do not replace these feed
  credentials with the secret or publishable key.
- `infra/office-nextcloud/sync/sync.py` was a raw REST/Storage client sending the
  old service key in both `apikey` and Bearer headers. It now omits Bearer for
  `sb_secret_` keys. Docker Compose passes the new variable and both old aliases.
- No checked-in Supabase-key-based `.functions.invoke` callers, `pg_net` jobs or
  Database Webhook definitions were found. Stored production configuration and
  external consumers still need the independent checks described below.
- No hardcoded JWT credential was found in the audited runtime source. Historical
  docs and examples may still name legacy variables; they are not key resolvers.

### Archived Edge writer: keep retired

`docs/edge-functions/set-availability-v11/index.ts` still contains its historical
auto-injected legacy key read. It is an exact, hash-recorded review archive of a
vulnerable writer and must not be edited into a deployment candidate or redeployed.
Read-only dashboard inventory during this audit showed just **get-availability**;
the old writer is not deployed. The live get-availability settings also showed
**Verify JWT with legacy secret: OFF**. No setting was changed.

## Clerk and remaining JWT-secret dependency

API keys identify the application; Clerk JWTs identify signed-in users. Switching
the public key does not replace a user's JWT with `sb_publishable_...`.

The current browser integration is still the legacy Clerk Supabase JWT template:

- `src/hooks/useTenantConfig.js` requests `getToken({template:'supabase'})` and
  registers the token getter; its default-Clerk-token fallback is rejected by
  the current HS256 gate in `src/lib/supabase.js`.
- `src/lib/evidenceSupabase.js`, `src/context/ThemeContext.jsx`, and
  `src/components/copilot/CrossSellTrigger.jsx` also request that template.
- `src/lib/supabase.js` explicitly expects HS256 tokens signed using the project's
  legacy JWT signing secret. It now returns no user token on mint/algorithm
  failure instead of pretending the application key is an authenticated JWT.
- The actual Realtime consumers are `src/components/RTSTab.jsx` and
  `src/components/medsup/RateComparisonPanel.jsx`. Authenticated clients provide
  the Clerk JWT to Realtime via `accessToken`; public clients with new keys use
  only their public `apikey` connection parameter. There are no backend channel
  subscriptions using a secret key. Verify refresh/reconnect with real sessions.
- Storage uses the same SDK factories, including authenticated evidence access,
  recording uploads and signed URL creation. Test upload and download separately.
- Netlify `_clerkAuth.js` uses `CLERK_SECRET_KEY` / `CLERK_JWT_KEY`; telephony's
  `clerkAuth.js` uses Clerk's backend verifier. Those are separate credentials
  and must not be replaced with a Supabase secret key.

**Disabling legacy API keys is separate from rotating the JWT signing secret.**
Leave the current JWT signing configuration and Clerk template intact during this
API-key cutover. Migrating Clerk to native Supabase third-party auth/JWKS requires
dashboard configuration plus replacing template minting and the HS256-only gate.
That independent auth migration is flagged, not silently enabled in this patch.
Do not rotate/remove the shared JWT signing secret until it has been completed
and all authenticated REST, Realtime and Storage paths pass real-session tests.
No RLS policy rewrite or `auth.jwt()` change is necessary just to replace API keys.

## Every environment/configuration location

| Location | New settings | Scope / notes |
|---|---|---|
| Railway **EnrollGen / telephony**, production | `SUPABASE_SECRET_KEY` | Existing `SUPABASE_URL`; retain the old variable during deployment, then remove it. Railway redeploys from main. |
| Railway **integrations-worker**, production | `SUPABASE_SECRET_KEY` | Set on this service too; telephony variables are not inherited unless explicitly shared. |
| Railway staging/preview/cloned environments, if any | Same backend variable per service | Use the corresponding project's key. Do not assume production variables propagate. |
| Netlify **production**, Functions scope | `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Admin factories and `cms-plans` public client, respectively. |
| Netlify **production**, Builds scope | `VITE_SUPABASE_PUBLISHABLE_KEY` | Built into JavaScript; requires a fresh build and manual publish while publishing is locked. |
| Netlify separate CMS project, Builds scope | `VITE_SUPABASE_CMS_PUBLISHABLE_KEY` | Required if `VITE_SUPABASE_CMS_URL` points to another project; use that project's key. |
| Netlify **deploy-preview**, **branch-deploy**, `dev`, and any branch overrides | The same relevant Functions/Builds variables | Configure each context that executes this code; inspect shared/team variables and context/branch precedence. Never put an admin secret in `VITE_`. |
| Supabase Edge Functions Secrets, primary project | `ENROLLGEN_SUPABASE_SECRET_KEY`, or injected `SUPABASE_SECRET_KEYS.default` | `SUPABASE_` is reserved for hosted custom secrets. New maps must be present before relying on them. Do not attempt `supabase secrets set SUPABASE_SECRET_KEY=...`. |
| Root local `.env.local` / `.env` and separately scheduled script hosts | `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional CMS public key | Choose values matching each configured URL. Only placeholder examples were edited. |
| `telephony/.env` / service launch environment | `SUPABASE_SECRET_KEY` | See `telephony/.env.example`. |
| Integrations worker's local/process environment | `SUPABASE_SECRET_KEY` | See `integrations/.env.example`. |
| `supabase/functions/.env` or an explicitly supplied local Edge env file | `ENROLLGEN_SUPABASE_SECRET_KEY` | See `supabase/functions/.env.example`. Local Deno can also receive `SUPABASE_SECRET_KEY`; hosted names are reserved. |
| Office PC `infra/office-nextcloud/.env` and sync container | `SUPABASE_SECRET_KEY` | Recreate the sync container after setting it; see the added placeholder template. |
| External cron/CI systems, Database Webhooks, Vault and downstream consumers | Inventory and replace their old credential with the appropriate new key | No GitHub workflow is checked in; repository search cannot prove external configuration is migrated. |

Prefer distinct backend secret keys per component so a future Railway incident
does not force rotation of unrelated Netlify/Edge/script credentials. All secret
keys still have admin privileges: a distinct key improves revocation isolation,
not row-level privilege separation. Do not copy secret values into logs or docs.
Netlify CLI masks secret values; its displayed string cannot be used for probes.

## Rollout order (not executed)

1. Create the new publishable key(s) and backend secret key(s) for each configured
   Supabase project. Keep legacy API keys enabled during the transition. Review
   current production variables without exposing their values; this patch neither
   creates keys nor changes live configuration.
2. Set the new Railway variables on **both** services, Netlify Functions and Builds
   variables in each active context, the Edge secret/map, local/script hosts and
   the office sync environment. New variables can be added while old code runs;
   it continues using the old settings until the code update arrives.
3. Recheck the existing app's Clerk template/signing configuration. Do not rotate
   the shared JWT secret or switch authentication providers as part of key setup.
4. After approval, deploy the updated get-availability Edge function with its
   existing `verify_jwt=false` and consumer auth. Test valid/invalid feed keys and
   Paragon/status-page consumers. No database migration must precede this release.
5. Push main **once**, only after the new variables are present. Railway services
   auto-deploy and Netlify builds. Verify telephony health, a call lifecycle,
   transcript persistence/scoring, recording copy/playback, and worker deliveries.
   The fallbacks allow the services to overlap safely during rollout.
6. Confirm the Netlify build used the new public keys, then have the user publish
   that completed build manually. Do not unlock publishing or run a production
   deploy command. Test signed-in tenant reads/writes, availability, compliance,
   CMS primary/separate-project reads, Realtime reconnect and private Storage.
7. Update/recreate the office sync container and all scheduled/manual script
   environments. Test REST polling plus private Storage downloads there.
8. Remove legacy variables from each independently deployed runtime/context;
   remove a separate old CMS override too. Rebuild/publish if any public fallback
   value changed. Reload existing browser tabs so an old bundle is not left in
   use. Test new-key-only configurations: fallback support alone is not proof
   that legacy-key deactivation is safe.
   Rebuild any still-supported preview/branch deploys too; changing variables
   alone does not replace their saved code or browser bundles. Supabase's built-in
   legacy Edge variables may remain injected: verify the new key takes precedence
   rather than trying to delete reserved platform variables.
9. Run the read-only `supabase/validation/legacy_api_key_dependencies.sql` and
   securely review any flagged stored function/webhook/cron configuration, Vault
   references, CI and external clients. Send new keys in `apikey`, and preserve
   user JWTs only in Authorization. The file returns names and flags, not secrets.
10. Only after every deployed consumer has passed, disable **legacy anon and
    service_role API keys** in Supabase's API Keys dashboard. Keep the separate
    JWT signing secret/Clerk integration intact. Verify old API keys are rejected,
    new keys and real Clerk sessions still work, and no worker/cron errors appear.
    Do not reactivate the exposed service-role key as a routine rollback; roll
    back compatible code using the new settings or rotate a new component key.

Publishing Netlify is intentionally a user action. Nothing in this change pushes
main, invokes a deployment, alters live secrets or disables any existing key.

## Validation and source references

The tests use fixture keys/transports, not real secret keys or production writes.
They exercise preference/fallback, new-key-only telephony startup, Node SDK REST
and Storage headers/timeouts, Edge explicit/named-map keys, browser public/CMS
selection, privileged-key build rejection, Clerk JWT preservation, Realtime token
selection, missing-session rejection and Nextcloud raw HTTP headers.

Verification passed: 507 app tests, 217 telephony tests, the production Vite build,
LLM typecheck, telephony import-boundary check, focused ESLint and whitespace
checks. Edge, Netlify helper/CMS, and integration-worker entry points also bundle
successfully. The telephony suite was rerun with local socket permission after
the sandbox prevented its test servers from binding `127.0.0.1`.

- [Supabase API key migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Supabase Edge environment variables and reserved names](https://supabase.com/docs/guides/functions/secrets)
- [Clerk integration and deprecated JWT templates](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Supabase API key authentication headers](https://supabase.com/docs/guides/functions/auth-headers)
