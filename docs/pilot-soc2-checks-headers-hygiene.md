# SOC 2 readiness: checks, headers and repository hygiene

Local work on `pilot/release`; correction pass on `0a89288`. No push, deploy, hosted database,
real provider call, real environment-file edit, new dependency, vendored file,
historical migration change or stylesheet change. Installs for the correction pass use the offline npm cache with lifecycle scripts disabled.
The owner explicitly authorized registry.npmjs.org for npm audit only; all other third-party API access remains prohibited. Prior pilot platform, load,
processor, restore and browser acceptance gates remain open.

## Verify and CI

`npm run verify` runs these ten steps, prints a PASS/FAIL line per step, continues
to report other failures and exits nonzero if any step fails:

1. Full root tests, four concurrent test files, synthetic deployment fixture and external-network fence.
2. Full telephony tests and independent import-boundary check, same fence.
3. Full repository ESLint.
4. Language-model TypeScript check.
5. Build in a temporary source copy with every `.env*` file and the legacy
   capability-bearing migration 007 excluded (it is not a Vite build input), a minimal
   process environment, linked installed dependencies and only
   `config/deployment-profile.example.json` as the synthetic profile. Check the
   actual built `_headers`, all static header values, absence of forbidden agency
   identifiers and hashes for every built inline HTML script. Remove the copy.
6. Root `npm audit --audit-level=info`, including development packages.
7. Telephony `npm audit --audit-level=info`, including development packages.
8. Fresh-install bootstrap and catalog regression: two independent empty
   in-process PostgreSQL builds, original checksums and catalog comparison.
9. Forbidden agency terms scan: P0-5 runtime scope in the repository; every shipped file in an export.
10. Tracked-file secret scan, including immutable historical migrations.

The runner strips inherited credentials, flags and hosted-environment markers.
Tests use the existing local-only fence, fake provider transports and PGlite;
localhost test listeners are required. `npm audit` contacts only registry.npmjs.org.
No audit fix, install hook, application server startup or deployment is performed.
`CONTRIBUTING.md` requires verify before every commit. Nine pre-existing lint
errors were fixed by removing unused bindings and adding an explicit Node
process import; existing React hook warnings remain warnings.

`.github/workflows/pilot-verify.yml` runs only pushes and pull requests targeting
`pilot/release`, with a job-level branch guard, `contents: read`, no persisted
checkout credentials, no secrets and no deploy step. Only official checkout and
Node setup actions are used. Node **22** matches both existing service Dockerfiles.
The exact tags **actions/checkout@v4.2.2** and **actions/setup-node@v4.4.0** are the
explicitly permitted fallback: full commit hashes could not be independently
verified under this session's local-only constraint. The owner must independently
resolve those tags and replace them with full commit hashes before treating them
as immutable supply-chain pins. GitHub-hosted execution was not run here.

## Secret scanner and exceptions

Run `node scripts/security/scan-secrets.mjs` for tracked working-tree files.
A history-free directory can be checked with `--directory /absolute/path`.
New source must be staged before the tracked-file scan. All tracked files are
read, without extension or binary-file exemptions. Errors fail closed.

Rules detect OpenAI key prefixes, Clerk/Stripe secret prefixes (test keys are
also sensitive), Stripe webhook signing secrets, Supabase secret keys and
legacy JWTs with `role=service_role`, Resend and GitHub tokens, PEM/OpenSSH
private-key block markers, password-bearing connection URLs, known Slack/GHL/
Discord capability paths and token-bearing URL query strings. Contextual literal
assignments cover Twilio, Deepgram, vendor/API tokens, passwords, service keys,
Nextcloud credentials and signing secrets. Public/anon/publishable key names,
whole documentation placeholders and short obvious fake values are excluded;
provider-shaped test keys do not get a blanket exemption.

`scripts/security/secret-allowlist.mjs` contains 19 explicitly reviewed synthetic
fingerprint exceptions, plus one owner-authorized active exception described below.
Each synthetic exception binds exact path, rule type, SHA-256 of the match
and a reason; it never contains a credential value. They cover the fake-only
local-load harness, synthetic deployment profiles, signature tests, negative
connection-URL tests and Supabase key-migration fixtures. There is no entire-file
or directory suppression. Changing a fixture value or copying it to a different
path fails. Tests plant every supported secret category, verify placeholder and
exact allowlist handling, and assert no planted value appears in CLI output or
the history report. The scanner is heuristic, not proof that no secret exists.

### Active production exception and review deadline

The owner confirmed that the webhook capability is **still active in production**.
It is **not revoked**. Rotation is scheduled for **after December 7, 2026**.
The exact allowlist entry is confined to
`supabase/migrations/007_multi_tenant_foundation.sql:67` and its matched column,
rule type and SHA-256 fingerprint. It is not a path-wide or pattern exception.

- Status: **`active, rotation pending`**.
- Reason: **`historical migration cannot be edited; live production webhook`**.
- Review-by: **2026-12-15**, inclusive through 23:59:59.999 UTC.

While this status exists, the secret scan (and therefore verify) prints:

```text
WARNING ACTIVE SECRET EXCEPTION: supabase/migrations/007_multi_tenant_foundation.sql:67; review-by 2026-12-15; status: active, rotation pending
```

It passes before/on that date and fails from **2026-12-16 00:00:00 UTC**, even
if the file is absent, until the owner marks the exact entry `rotated` or extends
`reviewBy` with a nonempty `reviewExtensionReason`. `initialReviewBy` preserves
the original date. Invalid statuses/dates or missing occurrence scope fail closed.
There is no environment flag or CI clock override. Tests inject a clock directly.
Marking the entry `rotated` permits that same old occurrence without an active
warning, including after the old deadline; it must reflect actual completed
rotation, not merely the scheduled date. Nothing was marked rotated here.

Five additional tests establish warning/pass through the date boundary,
overdue failure (including an absent file), clean pass after a synthetic entry is
marked rotated, documented extensions and exact occurrence confinement. Copies
to another path, line or column, changed fingerprints and same-line duplicates
remain findings. CLI messages and test output contain no credential value.
The history scanner continues reporting lifecycle-managed exposures regardless
of their current exception status; an exception does not erase audit evidence.

### History inventory and owner rotation list

`node scripts/security/scan-secrets.mjs --history /tmp/new-history-report.json`
reads all commits reachable from local refs with Git plumbing and writes only a
new report (0600, refuses overwrite). It never checks out a branch, changes a
ref, rewrites history, removes credentials or calls a provider. The report has
commit IDs, paths, line numbers and types, with no values or match fingerprints.
History findings are reported for every containing commit snapshot, so totals
are occurrences across commits, not counts of distinct credentials.

Original hygiene-pass inventory, retained as historical evidence: **627 commits**, **634 occurrences**, six distinct
path/line/type sites. Report location for this session:
`/tmp/enrollgen-soc2-history-active-exception.json` (not committed or included in exports).
That pass's repeated scan included the active capability despite its current-tree
exception; the correction pass does not rescan or rewrite history.

| Secret type | Occurrences |
|---|---:|
| webhook-capability | 382 |
| provider-credential | 252 |
| All other implemented types | 0 |

| Path | Occurrences |
|---|---:|
| `supabase/migrations/007_multi_tenant_foundation.sql` | 373 |
| `status-page/index.html` | 223 |
| `tests/llm.test.js` | 2 |
| `src/lib/postCallPipeline.js` | 9 |
| `scripts/pg_upload.cjs` | 27 |

Owner action, without exposing values:

- **Priority 1 — `supabase/migrations/007_multi_tenant_foundation.sql:67`: webhook-capability. Active in production; status `active, rotation pending`; rotation scheduled after December 7, 2026; review-by December 15, 2026. Owner must complete rotation, then mark the exact entry rotated.**
- `src/lib/postCallPipeline.js:7` in history: webhook-capability.
- `status-page/index.html:116` in history: provider-credential.
- `scripts/pg_upload.cjs:34` in history: provider-credential.
- `tests/llm.test.js:242` and `:244` in history: provider-credential.

For the other findings, privately establish whether they were synthetic, public
or revoked. Rotate anything that can still authenticate, invalidate existing
shares where applicable, update private runtime configuration and review access
logs. The priority item above is confirmed active and must not be described as
revoked. Removing source or allowing a fingerprint does not perform rotation.
History and historical migrations remain unchanged. The export explicitly omits
the legacy agency-specific seed, retaining the complete sanitized bootstrap, and
still fails closed on any remaining secret match.

## Browser headers and content policy

The static headers are in `netlify.toml` for `/*` and mirrored in generated
`dist/_headers`. Existing SPA redirects and asset/cache rules are preserved.

| Header | Value |
|---|---|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| X-Frame-Options | `SAMEORIGIN` |
| Permissions-Policy | See exact value below. |
| Content-Security-Policy-Report-Only | Generated policy below. |

`Permissions-Policy`:

```text
microphone=(self), camera=(), geolocation=(), accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(self), battery=(), bluetooth=(), browsing-topics=(), clipboard-read=(), clipboard-write=(self), compute-pressure=(), display-capture=(self), encrypted-media=(), fullscreen=(), gamepad=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), speaker-selection=(self), storage-access=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()
```

Every allowed feature is restricted to `(self)`; all other listed features remain
denied. Permissions Policy does not replace a browser's user consent or autoplay
gesture rules. The installed packages were read locally; no SDK or provider was fetched.

| Allowed feature | Product / installed SDK source requiring it |
|---|---|
| `microphone` | `src/lib/audio/AgentAudioProcessor.js` (`requestAgentMicrophone`, `getUserMedia`); `src/hooks/useSpeechRecognition.js`; injected into Twilio in `src/context/InboundCallContext.jsx`; installed `node_modules/@twilio/voice-sdk/lib/twilio/rtc/getusermedia.ts` |
| `autoplay` | `src/context/InboundCallContext.jsx` sets remote audio autoplay and calls play; `src/hooks/useCustomerAudio.js` keepalive playback; installed Twilio `lib/twilio/device.ts`, `sound.js`, `rtc/peerconnection.ts` play incoming/outgoing ringing and remote call audio |
| `display-capture` | `src/hooks/useCustomerAudio.js` → `requestCustomerAudioStream` uses `getDisplayMedia({video:true,audio:…})` for the optional shared-tab customer transcription fallback. |
| `speaker-selection` | Installed Twilio `lib/twilio/audiohelper.ts`, `outputdevicecollection.ts`, `rtc/peerconnection.ts`, `audioplayer/audioplayer.ts`: output collections and `setSinkId` for sound/call routing, including the SDK's default output path. No separate application output-picker UI was found. |
| `publickey-credentials-create` | `src/main.jsx` mounts `ClerkProvider`, `src/App.jsx` mounts Clerk `SignIn`; installed `@clerk/shared/dist/types/index.d.ts` exposes `createPasskey`; `@clerk/shared/dist/runtime/webauthn.mjs` checks `PublicKeyCredential`. Creation is retained for the product's supported Clerk passkey flow. |
| `publickey-credentials-get` | `src/lib/sessionLock.js` calls `session.verifyWithPasskey`; `src/components/SessionLockOverlay.jsx` offers passkey factors; `src/App.jsx` uses Clerk sign-in. Installed Clerk types expose `verifyWithPasskey` and `authenticateWithPasskey`; React SDK gates the passkey flow in `@clerk/clerk-react/dist/index.mjs`. |
| `clipboard-write` | `src/components/SharedUI.jsx`, `SessionSummary.jsx`, `SEPGuide2026.jsx`, `callDetail/RecordingPanel.jsx` copy text; `DailyVerse.jsx` writes text and image clipboard items. |

Unused checks: no clipboard read, fullscreen request or screen wake lock consumer
was found in application code or the active SDK paths. They remain denied. The
noise package's optional LiteRT/Emscripten assets contain generic canvas fullscreen
helpers; the selected `dist/deepfilternet.js` and DeepFilterNet worklet use WebAssembly,
AudioWorklet and same-origin model fetches, with no DOM/fullscreen caller. Reading
those unused helpers does not establish a product use. No camera,
geolocation or other denied-feature consumer was found. AudioContext resume and
WASM/AudioWorklets require no additional Permissions Policy grants here.

Framing is same-origin only: `X-Frame-Options: SAMEORIGIN` and
`frame-ancestors 'self'` in both Report-Only and enforcement CSP modes. The existing
`src/components/PrivatePlanPanel.jsx` → `PlaybookModal.jsx` iframe receives
`/private-plan-playbook.html` from `src/data/privatePlans.js`. Other origins remain
blocked by X-Frame-Options immediately and by frame-ancestors when CSP is enforced.
Tests assert the entire permissions value independently, every grant's source
consumer, both framing values in both CSP modes, and the same-origin playbook path.
Browser support for individual feature directives varies; review new features.

The validated deployment profile's new `browserSecurity` section provides
`clerkOrigin`, `clerkAccountsOrigin`, `databaseOrigin` and optional
`cmsDatabaseOrigin`. Each must be an exact HTTPS origin in `allowedHosts`.
Build checks compare these to configured Clerk publishable-key and Supabase
browser origins; mismatches fail without printing values. Phone HTTPS/WSS and
optional logo origins derive from existing profile fields. Private delivery
hosts are never copied wholesale from allowedHosts into CSP. A new synthetic
source example is in `config/deployment-profile.example.json`; the old pilot
document remains historical.

Exact generated policy for that example (inline hashes are calculated at build
time from all shipped HTML pages, not hardcoded):

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://auth.example https://accounts.example; script-src 'self' 'wasm-unsafe-eval' 'sha256-aiWVd1AzrIc2Ej93I3HJi0EYRErV6skcHQcinoBVP18=' 'sha256-r+WzA6fCrXHpNDdoE9yuLWfyDfwjUXRfiloLLlmDm+s=' 'sha256-E11peHo+ZHUlcJfZFbe0SXeR2hjmii5lPqFCz2Bbk8Y=' https://auth.example https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://auth.example https://img.clerk.com https://database.example https://*.giphy.com; media-src 'self' blob: https://database.example https://phone.example https://sdk.twilio.com https://*.giphy.com; worker-src 'self' blob:; frame-src 'self' https://auth.example https://accounts.example https://challenges.cloudflare.com; connect-src 'self' https://auth.example https://accounts.example https://clerk-telemetry.com https://database.example wss://database.example https://phone.example wss://phone.example https://*.twilio.com wss://*.twilio.com https://bible-api.com https://bibleengine.org https://cdn.jsdelivr.net https://www.fema.gov wss://api.deepgram.com
```

Source inventory: Clerk React/FAPI and its installed SDK telemetry origin, Cloudflare challenge scripts/frames, Supabase REST/storage/Realtime, softphone
HTTPS/WSS, bundled Twilio SDK with Twilio signaling/event hosts and SDK sound
assets, same-origin noise-suppression WASM/AudioWorklets and blob workers,
Google Fonts, Clerk images and challenge frames, GIF media, optional Deepgram
customer STT, FEMA and Daily Verse public fetches. External reference links
opened as top-level navigation do not need connect-src entries. Server-only
OpenAI, payments and vendor sinks do not belong in browser connect-src.

Inline scripts use SHA-256 hashes; script unsafe-inline and broad unsafe-eval
are absent. `wasm-unsafe-eval` enables noise suppression without general JS eval.
Style unsafe-inline preserves the existing React/style layout; no stylesheet was
changed. Report-Only is the default and no external report collector is added.

**Single enforcement setting: `CSP_MODE=enforce`; rebuild.** Only the header name
changes to Content-Security-Policy. Invalid modes fail the build. Do not enforce
before separately authorized browser sign-in, MFA/passkey, storage/media, calling,
WSS, workers and noise-suppression acceptance. This session cannot establish
browser/vendor compatibility or hosting header precedence over a live response.
The corrected policy preserves the known passkey, clipboard, ringing/call audio
and same-origin playbook flows at the header level. Live browser/provider acceptance
remains a separately authorized release gate.

## Telephony response headers

`installSecurityHeaders(app)` runs before CORS, parsing and routing:

| Header/behavior | Value |
|---|---|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| Cache-Control | `no-store` on every response (existing recording capabilities retain stricter `private, no-store`) |
| Pragma | `no-cache` |
| X-Powered-By | Disabled/absent |

Tests assert values for localhost success, token, denial, preflight, missing route
and parser errors; the real fake-authenticated voice-token route also checks
these headers. No production server was started. HSTS is interpreted by browsers
only on HTTPS; the local response tests validate emitted values.

## Repository hygiene and clean export

Stopped tracking, leaving files on disk: `.claude/settings.local.json`,
`.codesandbox/template.json`, `.codesandbox/icon.png`, `calls_500.jsonl`,
`eval_report.json`. Added ignore rules for local assistant settings and those
scratch outputs. Existing node_modules, dist and .netlify ignore rules remain;
Git already tracked no dist or .netlify build outputs.

Moved, preserving every byte, into `docs/internal-archive`: `ENROLLGEN_FULL_AUDIT.md`,
`CODEX_PROMPT_EnrollGen_Compliance_Engine.md`, `THEME_AUDIT.md`,
`P0-1_IMPLEMENTATION.md`, `PILOT_FIT.md`, `PILOT_READINESS.md`, `CLAUDE.md`.
`.env.example` now groups current names by service, retains all feature switches,
adds the profile pointer and both job-specific OpenAI models, and removes retired
provider credentials/options/comments. Private env files were not read or changed
by builds. SECURITY.md has one clearly marked owner contact placeholder.

Run:

```sh
node scripts/clean-export.mjs /absolute/path/to/new-review-directory
```

The destination must be new, absolute, outside the real repository path, with an
existing parent. It copies tracked current source without Git history, dependencies
or generated output, refuses symlinks and removes incomplete output on scan failure.
Both scans cover **every exported file** before installation, including fixture,
reference, binary, extensionless and nested generated-looking paths. No runtime-root,
extension or fixture exemption applies to the export agency scan. Repository runtime
checks retain P0-5's boundary and all historical files remain unchanged.

The export omits all `supabase/migrations/` (including every migration numbered 149
and lower), standalone `supabase/seeds/`, `supabase/validation/` and `scripts/**/*.sql`.
The complete checksummed `supabase/bootstrap/` stays as the sole install definition,
including the original catalog snapshot and security migration equivalents. No
historical migration or bootstrap checksum/catalog was edited.

Identity-bearing docs, operational references, service environment examples and
negative fixtures are excluded. Root `.env.example` remains. The plaintext terms
list never ships. `scripts/security/agency-fingerprints.json` captures only lengths,
rolling prefilters and SHA-256 digests; every candidate is confirmed by SHA-256.
Repository parity tests check every original term, case-insensitivity, substrings,
repetitions and binary text. Both scanners report paths/types, never matched values.
The active production exception is unchanged and is not marked rotated.

`capturedFixtures` in `scripts/clean-export.mjs` replaces the original shared root
profile, telephony profile and roster with three sanitized captured fixtures from
`tests/fixtures/clean-export/`. Valid UUIDs, the 12-row roster, binding relationships
and profile structure are preserved; signing placeholders carry no credential.
No original identity-bearing fixture is copied. The original fixtures and every
repository test remain. All other included files are copied byte-for-byte.

`tests/fresh-install.test.js` retains all nine tests and both independent empty
PGlite builds, full catalog comparison, provisioning, RLS, encryption and fake-sink
checks. Captured normalized-statement SHA-256 digests replace the need to ship
second copies of migrations 150–156 and 159; repository runs additionally compare
the immutable originals statement-for-statement. Shared security helpers read
original migrations in the repository and their checksummed bootstrap equivalents
in the export. No test is skipped or conditionally removed from repository verify.

`scripts/security/export-test-exclusions.mjs` is the explicit, commented export-only
list. It records each excluded test/helper/fixture and its reason. The exact test
file omissions are listed below; supporting excluded fixtures/helpers are also
recorded in that module. Exclusions do not delete or disable repository tests.

## Correction-pass validation

Baseline: **1,360 root tests and 329 telephony tests, all passing**. The first
sandboxed telephony attempt could not bind loopback; the complete network-fenced
rerun passed. The correction pass uses local PGlite databases and synthetic/fake
provider transports only. No hosted database, real provider, server deployment,
push, environment-file change, new dependency, vendored file, history rewrite or
stylesheet change occurred. `PILOT_READINESS.md` and `PILOT_FIT.md` remain in
`docs/internal-archive` and are excluded from exports.

| Check | Correction result |
|---|---|
| Root suite | **1,373 passed**, zero failures/skips; baseline 1,360 (+13) |
| Telephony suite and import boundaries | **329 passed**, zero failures/skips; baseline 329 |
| Lint / language-model types | Passed; three existing React hook warnings, zero errors |
| Environment-free synthetic build / exact built headers | Passed, including the final display-capture correction in repository and export |
| Fresh bootstrap / complete catalog | All nine tests retained and passing in repository and export |
| Repository runtime agency scan / tracked secret scan | Passed, zero findings; active exception warning unchanged |
| Clean export | **1,101 shipped files**, `/private/tmp/enrollgen-correction-review-final`; no Git metadata |
| Strict export scans before installation | Both passed across every one of the 1,101 shipped files, no extension/fixture/binary exemptions |
| Export installs | Root 380 and telephony 128 locked packages, `npm ci --offline --ignore-scripts --no-audit --no-fund`; no network, scripts or manifest changes |
| Export root / telephony suites | **702 / 83 passed**, zero failures/skips |
| Export lint / types / environment-free build | Passed |
| Exact included source comparison | Byte-identical except the three documented sanitized shared-fixture substitutions |
| Export omissions | **671 root cases in 62 test files; 246 telephony cases in 19 test files**. Five supporting fixture/helper files also explicitly omitted. Every original test remains in repository verify. |
| Current root / telephony advisories | **Zero advisories of every severity**, in repository and export |
| Repository / export `npm run verify` | **PASS, 10/10 steps in both**; active-secret warning and review deadline unchanged |

The owner explicitly authorized registry.npmjs.org for **npm audit only** before
the final verify runs. Earlier online install and audit requests were rejected by
automatic approval review under the original local-only rule; installs succeeded
using the offline cache. No dependency downloads, application/provider APIs or
hosted databases are authorized by that exception. The final advisory results
come from the requested audits, rather than the previous report or offline results.
Both complete verify runs passed before the correction commit; there was no push
or deployment.

The active production capability remains **active, rotation pending**, with the
same December 15 review deadline and owner-scheduled rotation after December 7.
No revocation or change to its exception was performed. Existing manual rollout
gates, live browser acceptance, action-pin review, owner contact and Node 22 CI
requirements remain open. Local validation uses Node 25.9.0.

### Exact export-only test omissions

| Test file | Reason |
|---|---|
| `telephony/tests/agentContactDetails.test.js` | Historical migration dependency |
| `telephony/tests/answerAttribution.test.js` | Historical agency identity |
| `telephony/tests/attributionRoutes.test.js` | Historical agency identity |
| `telephony/tests/availability.test.js` | Historical migration dependency |
| `telephony/tests/availabilityFeed.test.js` | Historical migration dependency |
| `telephony/tests/callStatusRecovery.test.js` | Historical migration dependency |
| `telephony/tests/callbacksOnly.test.js` | Historical migration dependency |
| `telephony/tests/conferenceCalling.test.js` | Depends on telephony/tests/helpers/conferenceHarness.js |
| `telephony/tests/contactIdentity.test.js` | Historical migration dependency |
| `telephony/tests/mediaStream.test.js` | Historical agency identity |
| `telephony/tests/paragonRouting.test.js` | Historical agency identity |
| `telephony/tests/paragonStateRouting.test.js` | Historical agency identity |
| `telephony/tests/phonePresence.test.js` | Historical agency identity |
| `telephony/tests/presenceRecovery.test.js` | Historical migration dependency |
| `telephony/tests/recordingCompliance.test.js` | Historical agency identity |
| `telephony/tests/recordingMedia.test.js` | Historical agency identity |
| `telephony/tests/stickyClaims.test.js` | Historical migration dependency |
| `telephony/tests/transcriptionSchema.test.js` | Historical agency identity |
| `telephony/tests/vendorIntegrations.test.js` | Historical agency identity |
| `tests/agent-status-log.test.js` | Historical agency identity |
| `tests/availability-auth.test.js` | Historical agency identity |
| `tests/bulletins-sync.test.js` | Historical migration dependency |
| `tests/call-access-authorization.test.js` | Historical agency identity |
| `tests/call-session-lifecycle.test.js` | Historical agency identity |
| `tests/clean-export.test.js` | Private forbidden-term fixture and repository export inventory |
| `tests/cleanup-oct.test.js` | Historical agency identity |
| `tests/cms-supplemental-migrations.test.js` | Historical migration dependency |
| `tests/combine-calls.test.js` | Historical migration dependency |
| `tests/compliance-full-rubric.test.js` | Historical agency identity |
| `tests/compliance-migration-direct.test.js` | Historical migration dependency assembled from a split path |
| `tests/compliance-review-api.test.js` | Historical agency identity |
| `tests/contacts-pii-null.test.js` | Historical migration dependency |
| `tests/conversely-manual-runs.test.js` | Historical migration dependency |
| `tests/conversely-uploads.test.js` | Historical migration dependency |
| `tests/county-penetration.test.js` | Historical migration dependency |
| `tests/cross-sell-restoration.test.js` | Historical agency identity |
| `tests/dashboardScope.test.js` | Historical agency identity |
| `tests/database-access-handlers.test.js` | Depends on tests/helpers/databaseAccessSchema.js |
| `tests/database-access-sql.test.js` | Depends on tests/helpers/databaseAccessSchema.js |
| `tests/deployment-features.test.js` | Historical agency identity |
| `tests/deployment-profile.test.js` | Standalone seed inventory; export has only bootstrap seeds and full-file identity scanning |
| `tests/deployment-roster-sql.test.js` | Historical migration dependency |
| `tests/dsnp-2027.test.js` | Historical migration dependency |
| `tests/duplicate-callers.test.js` | Historical agency identity |
| `tests/durable-transcripts.test.js` | Historical migration dependency |
| `tests/enrollment-intakes.test.js` | Historical agency identity |
| `tests/evidence-access.test.js` | Historical agency identity |
| `tests/evidence-audit.test.js` | Depends on tests/helpers/databaseAccessSchema.js |
| `tests/follow-ups.test.js` | Historical agency identity |
| `tests/initial-compliance-version.test.js` | Historical migration dependency |
| `tests/ix-reporting-safeguards.test.js` | Historical migration dependency |
| `tests/ix-uploads.test.js` | Historical agency identity |
| `tests/llm.test.js` | Depends on tests/helpers/complianceFixture.js |
| `tests/ma-cy2027-taxonomy.test.js` | Depends on tests/helpers/complianceFixture.js |
| `tests/medsup-nj.test.js` | Historical migration dependency |
| `tests/merged-recording.test.js` | Depends on telephony/tests/helpers/conferenceHarness.js |
| `tests/opportunities.test.js` | Historical agency identity |
| `tests/outbound-call-log.test.js` | Historical migration dependency |
| `tests/outbound-dnc-sql.test.js` | Historical migration dependency |
| `tests/paragon-billing-hours.test.js` | Historical agency identity |
| `tests/paragon-callback-ui.test.js` | Historical agency identity |
| `tests/paragon-residence.test.js` | Historical agency identity |
| `tests/paragon-serviceability.test.js` | Historical agency identity |
| `tests/paragon-vendor-report.test.js` | Historical migration dependency |
| `tests/pilot-limits.test.js` | Historical agency identity |
| `tests/post-call-background.test.js` | Historical agency identity |
| `tests/post-call-checkpoint-recovery.test.js` | Historical agency identity |
| `tests/post-call-lifecycle-safety.test.js` | Depends on tests/helpers/complianceFixture.js |
| `tests/post-call-provider-failures.test.js` | Historical agency identity |
| `tests/recordings.test.js` | Historical agency identity |
| `tests/sale-compliance.test.js` | Historical migration dependency |
| `tests/scoring-integrity.test.js` | Historical migration dependency |
| `tests/security-agency-fingerprints.test.js` | Parity check requires the private forbidden-term fixture |
| `tests/sep-dual-lis.test.js` | Historical agency identity |
| `tests/sep-fema.test.js` | Historical migration dependency |
| `tests/session-lock-events.test.js` | Historical agency identity |
| `tests/star-ratings.test.js` | Historical migration dependency |
| `tests/tpmo-grading.test.js` | Historical migration dependency |
| `tests/tpmo-repair.test.js` | Historical migration dependency |
| `tests/transcript-recovery-migration.test.js` | Historical agency identity |
| `tests/u65-guidance.test.js` | Historical agency identity |
