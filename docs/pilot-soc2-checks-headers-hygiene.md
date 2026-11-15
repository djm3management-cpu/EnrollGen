# SOC 2 readiness: checks, headers and repository hygiene

Local work on `pilot/release` after `54a8d64`. No push, deploy, hosted database,
real provider call, real environment-file edit, new dependency, vendored file,
historical migration change or stylesheet change. Registry access was limited
to the requested dependency vulnerability audits. Prior pilot platform, load,
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
9. Forbidden agency terms scan, preserving P0-5's runtime scope.
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

Scan at starting HEAD: **627 commits**, **634 occurrences**, six distinct
path/line/type sites. Report location for this session:
`/tmp/enrollgen-soc2-history-active-exception.json` (not committed or included in exports).
The repeated scan still includes the active capability despite its current-tree
exception; counts remain unchanged.

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
| X-Frame-Options | `DENY` |
| Permissions-Policy | See exact value below. |
| Content-Security-Policy-Report-Only | Generated policy below. |

`Permissions-Policy`:

```text
microphone=(self), camera=(), geolocation=(), accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(), battery=(), bluetooth=(), browsing-topics=(), clipboard-read=(), clipboard-write=(), compute-pressure=(), display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), storage-access=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()
```

The policy permits the microphone for this origin only and denies the listed
other browser features. Embedding is denied immediately by X-Frame-Options;
`frame-ancestors 'none'` is also present in the Report-Only CSP. Browser support
for individual Permissions-Policy features varies; it has no universal wildcard
for all future browser capabilities. The owner must review new feature support.

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
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://auth.example https://accounts.example; script-src 'self' 'wasm-unsafe-eval' 'sha256-aiWVd1AzrIc2Ej93I3HJi0EYRErV6skcHQcinoBVP18=' 'sha256-r+WzA6fCrXHpNDdoE9yuLWfyDfwjUXRfiloLLlmDm+s=' 'sha256-E11peHo+ZHUlcJfZFbe0SXeR2hjmii5lPqFCz2Bbk8Y=' https://auth.example https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://auth.example https://img.clerk.com https://database.example https://*.giphy.com; media-src 'self' blob: https://database.example https://phone.example https://sdk.twilio.com https://*.giphy.com; worker-src 'self' blob:; frame-src 'self' https://auth.example https://accounts.example https://challenges.cloudflare.com; connect-src 'self' https://auth.example https://accounts.example https://clerk-telemetry.com https://database.example wss://database.example https://phone.example wss://phone.example https://*.twilio.com wss://*.twilio.com https://bible-api.com https://bibleengine.org https://cdn.jsdelivr.net https://www.fema.gov wss://api.deepgram.com
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
The requested deny-all framing applies to same-origin playbook iframe responses
too, and the requested other-feature denials include passkey and clipboard
permissions. These existing flows require explicit owner review before rollout;
no claim of their browser compatibility is made.

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
existing parent. It copies tracked current source, never Git metadata, dependencies
or generated output; refuses symlinks; runs both scans; removes incomplete output
on any failure. Its explicit commented exclusions include root pilot audits,
CODEX prompts, docs/pilot-* MD/JSON, internal archive, legacy operations,
current-agency example, local tools/settings/env files and scratch reports.
The agency-specific legacy migration 007 is excluded from the export only because
it carries the still-active production capability; repository/history remain unchanged and
the complete sanitized bootstrap is retained. No test consumes that original seed. Other
internal operational docs are also excluded, keeping the vendor OpenAPI contract
required by tests. Placeholder .env.example files remain. Runtime agency scanning
uses the same P0-5 roots as earlier sprint tests, plus root browser/build config;
it intentionally does not rewrite or anonymize immutable historical migrations
or negative identity fixtures. This scope is stated explicitly in CONTRIBUTING.
Outside reviewers may therefore see historical identifiers in migration/fixture
reference material; this is a source export, not an anonymized dataset.

Historical regression assertions no longer require a Git repository or private
audit reports. Their exact callbacks/data/table list and topology/style hashes
were captured into test fixtures with original commit/path SHA-256 provenance.
No assertion or test was removed; fixture extraction preserves the earlier
comparison targets. Scans use Git's tracked inventory in a checkout and a source
walk (excluding dependencies/build output) in a history-free copy.

## Local validation and remaining owner work

The owner-authorized dated exception resolves the previous verify gate without
misrepresenting revocation. The local implementation is committed on pilot/release
after the successful validation below; no push or deployment occurred.

| Check | Result |
|---|---|
| Baseline full root suite | 1,320 passed; zero failures/skips |
| Final full root suite | **1,360 passed**; zero failures/skips (+40) |
| Baseline telephony suite | 327 passed; zero failures/skips |
| Final telephony suite | **329 passed**; zero failures/skips (+2), import boundaries passed |
| Repository `npm run verify` | **PASS, 10/10 steps**; visible active-secret warning with 2026-12-15 review-by date |
| Root / telephony full audits | **Zero advisories** of every severity in both scopes |
| Full lint / language-model types | Passed; three existing React hook warnings, zero errors |
| Environment-free synthetic build / built headers | Passed |
| Separate fresh bootstrap and catalog test | 9 passed; original catalog/checksums retained |
| Forbidden agency runtime terms | Zero findings |
| History scan | 627 starting commits, 634 redacted occurrences (382 webhook-capability, 252 provider-credential) |
| Clean export | **Passed**, 1,351 source files at `/private/tmp/enrollgen-soc2-review-export-final`, outside the repository; no Git history |
| Export scans | Both passed, zero findings |
| Exact active-capability absence | Confirmed across 34,868 regular export files, including installed dependencies: neither the migration file's value nor any other occurrence is present; raw, JSON/URL-encoded forms and long capability path components checked without printing values |
| Export fresh installs | Root 380 and telephony 128 locked packages; `npm ci --ignore-scripts --no-audit --no-fund`, no manifest/lock changes |
| Export `npm run verify` | **PASS, 10/10 steps**: 1,360 root and 329 telephony tests, lint, types, environment-free build/headers, zero-advisory audits, bootstrap/catalog and both scans |
| Export/current included source comparison | Byte-identical |
| Archive preservation / Git diff checks | Passed; all seven moved documents preserve every byte |

The first export attempt correctly refused the migration match and removed its
output. The final export succeeded only after the explicit export-only exclusion
for that legacy deployment seed. The owner subsequently authorized the dated
active exception for the repository; the export still omits the seed. Export
validation uses actual fresh installed dependencies, not repository symlinks.
The checked-in bootstrap remains complete and authoritative for fresh installs.

Local validation used available Node **25.9.0**; Node 22 is specified in CI to
match the existing deployment images, but a Node 22 binary was unavailable here.
No action hash was invented. Initial sandboxed baseline attempts could not bind
loopback; successful baseline and validation reruns allowed localhost while the
existing external-network fence remained active. The final report is based on
those successful complete suites, not the denied-listener attempts.

The production capability remains active pending its owner-scheduled rotation;
the dated exception allows verify with a warning, never a false revocation claim. The reviewer export omits the legacy deployment-specific seed in its
explicit exclusion list and retains the complete sanitized bootstrap. No live browser, GitHub Actions run, deployed
header response, hosted database, real authentication/provider account, secret
revocation, private runtime-profile update or production behavior was verified.
Before rollout, the owner must fill in the SECURITY contact, resolve the secret
findings privately, add browserSecurity origins to each private deployment profile,
verify action hashes, run Node 22 CI and complete the real-browser Report-Only
acceptance. All earlier pilot reports' manual release gates remain in force.
