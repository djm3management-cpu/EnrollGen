# P0-9 — spreadsheet reader replacement and bounded uploads

Local work on `pilot/release`, following `d2eb0a8` and the earlier authorization, protected membership, feature-switch, bootstrap, session-lock, evidence/minimization and admission-control commits. No checkout/merge/push to main, push to any branch, deploy, hosted database, real provider API, environment-file edit, historical migration edit or stylesheet change was performed. Only the npm registry was contacted for dependency installation and audits. `.netlify/functions-serve` is ignored build output; `git ls-files .netlify/functions-serve` returns no tracked paths.

## Replacement and compatibility

`xlsx` and its unused transitive packages are removed from the root manifest/install/lockfile. The stale Deno workspace dependency is replaced and the unused Vite vendor chunk rule removed. The **only new direct dependency** is `read-excel-file` **9.3.17**, with no version range. No third-party file or spreadsheet-writing package was added.

The installed 9.3.17 README, declarations and implementation were inspected. Its Node default export from `read-excel-file/node` accepts a Buffer and asynchronously returns all sheets as `{sheet,data}` arrays. The retired default-export/single-sheet API from older releases is not used. `netlify/functions/_spreadsheet.js` wraps that actual API in a terminable worker and adapts its matrices to the former formatted output. This preserves blank/merged headers, duplicate-header suffixes, empty-row handling, text/number/boolean values, leading zeros, date formats and worksheet names in the committed parity corpus. It also handles offset used ranges and custom worksheet relationship paths.

The adapter reads bounded style/relationship metadata with `saxen`, resolved from the reader's own dependency graph. In particular, the previous writer can emit custom number-format IDs below 164 and textual `date1904="true"`; 9.3.17 treats those differently, so the adapter uses the stored format and serial date explicitly. Nothing is evaluated as code. Formulas use only their cached values; an uncached numeric formula remains empty. External formula/relationship URLs are never fetched. This is a data reader, not a recalculation engine.

Changed read paths:

| Path | Replacement |
|---|---|
| `netlify/functions/_rtsIngestion.js` | Bounded workbook or Papa CSV/TSV parse, followed by the existing cleaning. First worksheet and multi-sheet warning behavior retained. |
| `scripts/parse_cms_dsnp.js` | Await the Node reader; keep all existing year/layout/conflict validation, transactional loader and SQL export safeguards. |
| `scripts/sep-data/common.js` | Await the reader, preserve header search/selection and array-to-object rules; replace SSF date conversion with `excelSerialIsoDate`. Existing invalid-number/date-string fallback retained. |
| `scripts/sep-data/prepare-dsnp-2027.js` | Async read/reconciliation of both workbooks, including the AIP map. Both callers (`ingest-snp-plans.js`, `verify-cms-sources-2027.js`) now await it. |
| `tests/dsnp-2027.test.js` | In-memory matrices for mapping tests; committed synthetic workbook copies for CLI tests. No runtime fixture writer dependency. |

The old package's only spreadsheet writes in tracked source were fixture creation in the D-SNP test. Those are replaced with committed fixtures created **before removal**, in commit `73d073a`. Operator tabular export is now explicitly available as **CSV through the existing `papaparse`** dependency via `--csv-out`; no spreadsheet-writing package is used. Existing SQL and JSON artifacts are retained because they are operator transactions/reconciliation artifacts, not spreadsheet output.

## Limits and failure behavior

Named upload constants are `SPREADSHEET_LIMITS`, `MAX_RTS_FILE_BYTES` and `MAX_RTS_MULTIPART_BYTES`:

| Limit | RTS upload value |
|---|---:|
| File bytes | 10 MiB |
| Complete multipart body | 10 MiB + 64 KiB framing allowance |
| Sum of declared **and actually inflated** ZIP entry sizes | 40 MiB |
| ZIP entries | 2,048 |
| Worksheets | 10 |
| Physical row/address per worksheet | 3,001, including header (existing 3,000 data-row budget) |
| Columns/addresses per worksheet | 100 |
| Actual cell tags and aggregate dense cell area | 300,100 |
| Parsing wall time | 5,000 ms, including worker startup, decompression, XML, formatting and CSV parsing |
| Worker old-generation heap | 256 MiB |

Multipart bytes are counted while streaming before form parsing. File size is checked before buffering and again against actual bytes. Every ZIP entry is checked before handing the file to the reader; inflation uses native `maxOutputLength`, so forged small size declarations cannot bypass the budget. Local/central sizes and paths, entry coverage and descriptors are checked to prevent an alternate unbounded archive view. Duplicate paths, unsupported encryption/compression/ZIP64/multi-volume data and unsafe XML DTD/entity declarations are rejected. All worksheets are inspected, including later/unselected sheets, sparse coordinates and nonstandard relationship paths. CSV row and column bounds apply before truncation. A timeout terminates and awaits the worker before returning; it is not just a Promise timeout around continuing synchronous work.

Local operator readers have a separate named `OPERATOR_SPREADSHEET_LIMITS`: 256 MiB input, 512 MiB decompressed, 2,048 entries, 64 sheets, 1,048,576 rows, 16,384 columns, five million actual/dense cells, 120 seconds and 1,024 MiB worker heap. This avoids imposing RTS's roster-size budget on public CMS imports. No operator download/database load was run.

Rejected uploads return HTTP 400 with a clear parsing/limit message. They stop before the file hash, known-roster/carrier lookup, duplicate lookup, admission/model work or ingestion write. The prior authenticated protected actor/tenant resolution still runs first. Invalid uploads create no ingestion audit record. Successful commit authorization, membership/roster matching, audit RPCs, model admission budgets and prompt scrubbing are unchanged. Netlify's config explicitly packages the reader and Papa dependencies for worker resolution; a local esbuild bundle smoke test exercises the worker.

## Operator and user changes

- Upload CSV, TSV or ordinary XLSX. Legacy OLE/BIFF `.xls`, binary and macro-enabled containers are rejected with **“Save the file as .xlsx.”** Detection uses bytes and archive content types, not the suffix. Renaming a macro workbook to `.xlsx` or `.csv` does not bypass rejection. A real ordinary XLSX with a misleading legacy suffix can still be read by content.
- Limits now fail clearly instead of truncating excess columns or allowing unbounded parser work. The existing first-worksheet selection and 10 MiB file size remain.
- Preserve the current stylesheet and UI layout; only upload help/error copy changes.
- Export local normalized D-SNP rows without credentials or database access:

  ```sh
  node scripts/parse_cms_dsnp.js --file /path/to/cy2027-list.xlsx --csv-out /tmp/dsnp-2027.csv
  ```

  `--csv-out`, `--sql-out` and `--dry-run` are mutually exclusive. CSV retains the normalized plan field names and writes nulls as empty cells. Existing `--dry-run`, validated `--sql-out`, SNP `--dry-run --output` JSON and live-loader validation contracts remain. An imported `prepareDsnp2027(...)` must now be awaited.

## Dependency provenance and audits

These are **all six new lockfile package entries** compared with `d2eb0a8`. Each resolves to an HTTPS tarball on **registry.npmjs.org** and has a SHA-512 integrity hash. Existing package versions did not change. `fflate` was already present, so it is not a new package.

| Package | Exact installed version | Relationship |
|---|---|---|
| read-excel-file | 9.3.17 | Only new direct dependency |
| saxen | 11.2.0 | Reader XML dependency |
| unzipper-esm | 0.13.3 | Reader Node unzip dependency |
| worker-f | 0.1.24 | Reader dependency |
| graceful-fs | 4.2.12 | Transitive |
| node-int64 | 0.4.0 | Transitive |

Full (including dev dependencies) `npm audit --json --registry=https://registry.npmjs.org` counts for this session:

| Scope | When | Info | Low | Moderate | High | Critical | Total vulnerable packages |
|---|---|---:|---:|---:|---:|---:|---:|
| Root | Before | 0 | 0 | 0 | 1 | 0 | 1 |
| Root | After | 0 | 0 | 0 | 0 | 0 | 0 |
| Telephony | Before | 0 | 0 | 0 | 0 | 0 | 0 |
| Telephony | After | 0 | 0 | 0 | 0 | 0 | 0 |

The root's one high vulnerable package had **two high advisories**: `xlsx` prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). Both had no npm fix. No advisory remains, and no `npm audit fix` was run. The older counts in `PILOT_READINESS.md` are historical audit findings, not this session's baseline. Initial sandbox DNS failures were retried with registry-only npm access.

## Validation

- Baseline root suite: **1,265 passed**, no failures/skips.
- Baseline telephony suite: **327 passed**, no failures/skips; import-boundary check passed. Initial sandbox attempts could not bind localhost; the permitted rerun used the existing external-network fence.
- Final root `npm test -- --test-concurrency=4`: **1,298 passed**, no failures/cancellations/skips; 33 more than the baseline. Final rerun completed in 96.58 seconds.
- Final telephony suite: **327 passed**, no failures/skips; import-boundary check passed.
- Environment-free source-copy `npm run build`: **passed**, Vite completed in 30.79 seconds. Every `.env*` file excluded; only PATH and the synthetic `docs/pilot-profile.example.json` supplied, with existing local dependencies linked.
- Dedicated spreadsheet suite: **32 passed**. ESLint on all changed JavaScript/JSX and `git diff --check`: **passed**. The dependency/import scan ran after all new sources were staged.
- Focused tests cover every workbook's captured object/array output, all operator read paths and CSV/SNP CLI output, dates and serial edge cases, CSV/TSV parsing, content-based legacy/macro rejection, renamed non-spreadsheet inputs, oversized file/body, honest/forged ZIP bombs, sheet/row/column budgets, ignored/custom-path sheets, unsafe XML, formula non-evaluation, terminable CPU stalls, unchanged ingestion state on rejection, esbuild worker packaging and a tracked-source import/require scan.

No hosted parser/runtime deployment, real provider, production workbook or remote database behavior was verified. Parity evidence is the synthetic corpus plus the explicit edge cases, not an exhaustive certification of every possible Excel custom format. Earlier reports' platform/load/processor acceptance gates remain open as documented; this dependency change does not claim to close them.
