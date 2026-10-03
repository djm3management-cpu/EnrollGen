# October cleanup handoff

Branch: `chore/cleanup-oct`. Base: `999911f7265a7b163a931ec42aca978e1b39c89e`.
Isolated clone: `/private/tmp/EnrollGen-cleanup-oct`.
The original Desktop repository and its existing uncommitted changes were not modified.
No merge, push, deployment, production mutation, or email send was performed.

## Changes by requested item

1. Former-upline references: 42 source occurrences removed, listed below. Generic Medigap wording is preserved. Scripts, carrier popups, and Co-Pilot source were scanned and had no matching references. A service-role, SELECT-only scan of all 113 live `knowledge_base` rows (including nested metadata and source URLs) found zero matches. A SELECT-only carrier scan found 114 rows with the obsolete channel label; migration 080 renames those channels to `SMS` during rollout.
2. CallStore: removed the legacy database insert and its default Clerk-token request. End-call timer metadata/reset and billable flag calculation are preserved. The existing canonical post-call pipeline owns persistence.
3. Opportunity editor: existing opportunities hide the contact-mode switcher, contact search, picker and contact creation controls. New opportunities retain them. Existing saves cannot enter the new-contact creation path.
4. RTS: removed all three fabricated roster entries, including swapped NPNs. Empty rosters show loading/unavailable and disable agent selection. Real roster names/NPNs are used when available.
5. Hours and billing: a scoped `styles.css` rule fixes all seven day checkboxes at 16 × 16 px with no shrink. No hours, rate, cap, or billing calculation changes.
6. Script AGENT dot: inbound calls use server agent-track health. Actual agent transcript messages establish/recover that track even before a health event. Agent failures stay offline despite local microphone activity; customer health remains independent. Outbound/manual microphone behavior is preserved.
7. Integrations worker: explicit manual mode sends one synthetic CSV to `mike@newgenhealthsolutions.com` only through the existing report transport. Strict arguments disallow custom recipients. This mode bypasses database creation, job claiming, scheduling, retries and vendor source lookup. Normal worker/Paragon delivery logic is unchanged.

## Each source removal

| Location | Reference removed | Result |
| --- | --- | --- |
| `src/components/RTSTab.jsx`, channel ordering | Former-upline suffix | `SMS` |
| `docs/CODE_REVIEW.md`, original line 199 | Former-upline transfer-routing bullet | Deleted obsolete bullet |
| `docs/DESIGN_SYSTEM.md`, line 14 | Former-upline demo audience name | Retained Alliant/SMS audience |
| `ENROLLGEN_FULL_AUDIT.md`, line 595 | Former-upline suffix in RTS description | `SMS` |
| CSV line 2 | Aetna - Silverscript | Channel renamed to `SMS` |
| CSV line 3 | Anthem/Elevance (Wellpoint) | Channel renamed to `SMS` |
| CSV line 4 | BCBS of TX (HCSC) | Channel renamed to `SMS` |
| CSV line 5 | Centene | Channel renamed to `SMS` |
| CSV line 6 | Devoted Health | Channel renamed to `SMS` |
| CSV line 7 | HealthSpring HCSC (Cigna) | Channel renamed to `SMS` |
| CSV line 8 | Humana | Channel renamed to `SMS` |
| CSV line 9 | United Healthcare | Channel renamed to `SMS` |
| CSV line 10 | WellCare | Channel renamed to `SMS` |
| CSV line 11 | Zing Health | Channel renamed to `SMS` |
| CSV line 12 | AHIP | Channel renamed to `SMS` |
| CSV line 13 | Aetna (AHLIC/AHIC/Accendo/American Continental) | Channel renamed to `SMS` |
| CSV line 14 | Continental Life | Channel renamed to `SMS` |
| CSV line 15 | GPM Health and Life | Channel renamed to `SMS` |
| CSV line 16 | Mutual of Omaha | Channel renamed to `SMS` |
| CSV line 17 | Nassau | Channel renamed to `SMS` |
| CSV line 18 | Omaha Insurance Company | Channel renamed to `SMS` |
| CSV line 19 | United of Omaha | Channel renamed to `SMS` |
| CSV line 20 | United World | Channel renamed to `SMS` |
| CSV line 21 | OSIC (Omaha Supplemental) | Channel renamed to `SMS` |
| CSV line 22 | Principal Life | Channel renamed to `SMS` |
| CSV line 23 | Corebridge Financial | Channel renamed to `SMS` |
| CSV line 24 | Liberty Bankers (Supplemental Health) | Channel renamed to `SMS` |
| CSV line 25 | Ameritas | Channel renamed to `SMS` |
| CSV line 26 | UOO (Legacy Safeguard) | Channel renamed to `SMS` |
| CSV line 27 | Aetna (ACA) | Channel renamed to `SMS` |
| CSV line 28 | Ambetter | Channel renamed to `SMS` |
| CSV line 29 | AmeriHealth Caritas (ACA) | Channel renamed to `SMS` |
| CSV line 30 | BCBS (ACA - AZ/TN/TX/IL/MT/OK) | Channel renamed to `SMS` |
| CSV line 31 | CareSource (ACA) | Channel renamed to `SMS` |
| CSV line 32 | Cigna (ACA) | Channel renamed to `SMS` |
| CSV line 33 | Highmark (ACA - DE/WV) | Channel renamed to `SMS` |
| CSV line 34 | Molina (ACA) | Channel renamed to `SMS` |
| CSV line 35 | Oscar (ACA) | Channel renamed to `SMS` |
| CSV line 36 | UHC (ACA) | Channel renamed to `SMS` |
| CSV line 37 | UHOne | Channel renamed to `SMS` |
| CSV line 38 | Anthem (ACA - GA) | Channel renamed to `SMS` |
| CSV line 39 | Wellpoint (ACA - FL/MD/TX) | Channel renamed to `SMS` |

Only migration matching literals and regression fixtures intentionally contain the old name after cleanup.

## SQL

Only `supabase/migrations/080_cleanup_former_upline.sql` is new. It is transactional and rerunnable:

- Rename exact obsolete `carrier_rts.channel` values to `SMS`.
- Remove the full former name from knowledge title/content/key/category and nested JSON keys/values; drop source URLs containing that name. Preserve generic Medigap and all unmatched data.
- No table drops, telephony routing, billing math, recordings, or Paragon schema/function changes.

Migration is **not applied live**. Knowledge preflight found zero matching rows; the carrier preflight found 114 matching labels. Migration regression coverage executes it twice against local PostgreSQL (PGlite), preserving generic wording and unrelated channels.

## Manual report command

Inside the deployed integrations-worker container, with its own `RESEND_API_KEY` and `INTEGRATIONS_REPORT_FROM` configured:

```sh
node integrations/worker.js --test-report --test-id cleanup-oct-03
```

Use a fresh ID for an intentional new sample. Keep the same ID for an uncertain retry within Resend's idempotency window. The process sends once and exits; it returns nonzero on configuration/provider/transport failure and prints a sanitized result. HTTP success means provider acceptance; confirm delivery in Mike's inbox/Resend. No actual send was attempted here: this session has no worker Resend credentials or Railway CLI access.

## Rollout order

1. Import the bundle into a review checkout and inspect the commit; do not run a full schema push.
2. Back up/preflight affected knowledge/carrier rows, then apply **080 only** through the normal migration process. Verify the former name has zero matches and generic Medigap remains.
3. Deploy the frontend commit; check existing/new opportunity controls, all day checkboxes, empty RTS roster, and live inbound agent health. End a call and confirm no legacy browser call-log insert/token request.
4. Deploy the integrations-worker commit with its current production secrets. Run the manual command inside that worker container and confirm Mike receives the sample. Do not replay vendor jobs or change any Paragon destination.

## Validation

- `npm run build`: passed (Vite production build).
- `node --test --test-concurrency=1 tests/*.test.js`: **279 passed, 0 failed**.
- `node --test --test-concurrency=1 telephony/tests/*.test.js`: **188 passed, 0 failed**.
- Seven new cleanup regression tests cover the worker recipient/argument guard, timer lifecycle, opportunity controls, empty RTS roster, agent-track recovery/failure/dot behavior, and migration reruns.
- Manual CLI with absent worker mail settings: exited 1 with the expected sanitized missing-env diagnostic; no network send or scheduler started.
- `node --check integrations/worker.js`: passed.
- `git -c core.whitespace=cr-at-eol diff --check`: passed; original CSV CRLF line endings are preserved.
- Final source scan: no matching former-upline references outside migration matching literals and regression fixtures.
- The original Desktop git status still has exactly the same existing modified/untracked paths. Protected telephony, billing-math, recordings and Paragon logic files have no diff.

Initial validation failures were test setup only: missing telephony dependencies in the fresh clone and two incomplete JSX harness fixtures. Dependencies were installed only in the clone; the corrected full suites above passed.
