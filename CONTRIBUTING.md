# Contributing

Every change must pass `npm run verify` before it is committed. Install the locked
packages with `npm ci --ignore-scripts` and `npm ci --prefix telephony --ignore-scripts`.
Use Node 22, matching both service Dockerfiles. Verify uses synthetic data, local
in-process databases and loopback test servers. The only external check is the
explicit npm vulnerability audit against registry.npmjs.org; never supply real
service credentials to tests. It reports every step and fails if any step fails.

Pilot work stays on `pilot/release`. Do not push, deploy or operate production
without a separately authorized owner action. Keep the styling in `styles.css`.

To scan tracked source: `node scripts/security/scan-secrets.mjs`.
To scan full local history without changing it:
`node scripts/security/scan-secrets.mjs --history /tmp/new-history-report.json`.
Reports contain commit IDs, paths, line numbers and secret types only. Review
false positives using exact fingerprints and explanations in
`scripts/security/secret-allowlist.mjs`; never paste a credential into an exception.
The single owner-approved production exception is `active, rotation pending`,
not revoked: verify prints its path and review-by date. Review dates are inclusive
UTC days; overdue active exceptions fail verify even if their file is absent.
A new date requires `reviewExtensionReason`; mark `rotated` only after actual
rotation. Active entries bind path, line, column, type and fingerprint. History
continues to report these exposures regardless of current exception status.

Build configuration is described in `config/deployment-profile.example.json`.
Its `browserSecurity` origins must be exact HTTPS origins in `allowedHosts` and
must match the browser's Clerk and Supabase settings. `npm run build` emits a
Netlify `_headers` file with the deployment-specific content policy. The default
is `CSP_MODE=report-only`; after browser sign-in, storage, phone, WebSocket,
noise-suppression and worker acceptance, set **`CSP_MODE=enforce`** and rebuild.
No report collector is configured; inspect browser policy violations locally.
See `SECURITY.md` for vulnerability reports.

Create a history-free reviewer copy outside the repository with:
`node scripts/clean-export.mjs /absolute/path/to/new-review-directory`.
It refuses existing destinations and removes its incomplete output on failure.
The two scans must pass before it finishes. Every shipped file is checked for
forbidden agency identity, including fixtures, references, binary and extensionless
files. No plaintext forbidden-term list ships; SHA-256 captures preserve the
complete case-insensitive substring checks, with parity tests in the repository.
All historical migrations (including 149 and lower), standalone seed/validation
and operational SQL, identity-bearing references and private documents are omitted.
The complete checksummed bootstrap is the only install definition.

`capturedFixtures` in the script maps the three original shared identity fixtures
to sanitized captures for export tests. `scripts/security/export-test-exclusions.mjs`
is the explicit, commented export-only exclusion list, with a reason per file.
The repository retains every test and historical migration. Fresh-install catalog,
security headers and all other included tests run in the export with fake transports
and in-process databases. Review the exclusion list before sharing the artifact.
