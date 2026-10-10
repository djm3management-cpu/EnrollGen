# CMS PY2027 supplemental datasets — October 10, 2026

Dry runs were reported before database writes. Dataset writes ran in order: Stars, plan crosswalk, D-SNPs. County mapping used a stable, paginated read of the live `cms_plans_py2027` table (158,280 rows). Its prepared local inventory produced identical counts.

| Dataset | Dry-run / loaded rows | Previous PY2026 rows | Difference |
|---|---:|---:|---:|
| Stars, county-contract | 38,820 | 888 | +37,932 |
| Crosswalk, transition-county plus unmapped transitions | 192,500 | 37,526 | +154,974 |
| SNP county support | 53,952 | 51,297 | +2,655 |
| D-SNP alignment, plan/state | 949 | 264 purged historical rows | +685 |

## Stars

Source: `~/Downloads/2027-star-ratings-data-tables-oct-8-2026/2027 Star Ratings Data Table - Summary Ratings (Oct 8 2026).csv`. The parser locates the header below the title and requires `Contract Number` and `2027 Overall`. Overall is the only rating field used.

The Summary has 508 numerically rated contracts, 480 of which are in the CY2027 landscape. The same 28 contracts documented in `cms-landscape-2027-counts.md` lack current county coverage and were explicitly skipped with `--skip-unmapped`.

The Low Performing Contracts CSV reports four contracts: H3814, H4982, H7389, and H9066. Three have current landscape coverage, producing 25 county rows flagged with CMS's reason. H7389 has no current landscape county coverage. H9066 has no numeric Overall rating but its 15 county rows retain the low-performing designation with a NULL Overall; this explains the increase from the earlier 38,805-row load to 38,820. Flags are never inferred from a single year's rating.

## Crosswalk

[CMS source page](https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/plan-crosswalks/2027-part-cd-plan-crosswalk) links the [2027 ZIP](https://www.cms.gov/files/zip/plan-crosswalk-2027.zip), downloaded and extracted to `~/Downloads/crosswalk-2027/`. Source: `PlanCrosswalk2027_10012026.txt`; the XLSX has the same layout.

All 9,144 source associations are retained. They cover 7,588 distinct prior contract-plan IDs and 1,096 new-plan/initial-contract source rows. CMS lists 217 prior plans under multiple classifications; each transition and successor is preserved.

| Exact CMS source status | Source rows | Stored category |
|---|---:|---|
| Renewal Plan | 4,899 | renewal |
| Renewal Plan with SAE | 546 | renewal |
| Renewal Plan with SAR | 789 | service_area_reduction |
| Consolidated Renewal Plan | 808 | consolidated_renewal |
| Terminated/Non-renewed Contract | 1,006 | terminated |
| New Plan | 928 | new_plan |
| Initial Contract | 168 | new_plan |

The `source_status` field preserves CMS wording. A transition key distinguishes successor plans and the `NEW` placeholder, avoiding the old key's collisions.

189,356 rows have current county coverage. The remaining 3,144 source transitions are retained with NULL counties and `county_mapping_status='unavailable'`; all 1,006 terminated associations are among them. The CY2027 landscape cannot establish a terminated plan's former counties or counties removed by SAR. Current successor coverage is explicitly marked `current_service_area`. Migration 093 preserves the deployed FEMA wrapper and filters termination SEP eligibility to `terminated`/`service_area_reduction` records with `affected_service_area` evidence. Thus stored renewals and current SAR coverage do not falsely establish county termination eligibility. Historical county service-area evidence is still needed to locate displaced members.

| Stored category | Rows |
|---|---:|
| renewal | 111,473 |
| consolidated_renewal | 38,278 |
| service_area_reduction | 24,124 |
| terminated | 1,006 |
| new_plan | 17,619 |

Counts differ in scope from last year's termination-oriented table; the new table retains every CMS status and expands surviving plans to current service areas.

## Integrated D-SNPs

Downloaded to `~/Downloads/dsnp-2027/`:

- [Integrated D-SNPs List](https://www.cms.gov/files/document/cy-2027-integrated-d-snps-list.xlsx): 945 plan/state records.
- [Integration status workbook](https://www.cms.gov/files/document/integration-status-contract-year-2027-dsnps.xlsx): 949 records on `CY 2027 Data`, after an Overview sheet.

The detailed workbook agrees with all 945 shared records and adds H1889-026 (FL, HIDE), H5216-480 (FL, HIDE), H7284-013 (FL, HIDE), and H3794-010 (WI, FIDE). All 949 match the CY2027 D-SNP landscape; there are zero unmatched source or landscape plans.

`~/Downloads/cy2027-dsnp.xlsx` is an exact duplicate of the 945-row Integrated List (SHA-256 `3409a6ba9583806fff53b01d4001838816ebd24da5a7ad2e6568ca7405f08735`). The detailed workbook SHA-256 is `19b9328fb7da68f94bc721c595701c9b8bdbad35bb761c4be3636e1e77f181fc`.

| Integration | Plan/state alignment rows | D-SNP county rows |
|---|---:|---:|
| FIDE | 101 | 3,799 |
| HIDE | 204 | 6,344 |
| AIP (coordination-only AIP) | 38 | 90 |
| CO | 402 | 16,114 |
| CO-P | 204 | 7,775 |
| Total | 949 | 34,122 |

CO and CO-P both mean coordination-only; CMS's more detailed code is retained. AIP is independently retained as a boolean, including FIDE/HIDE plans: 234 plan/state records report Yes. No EAE or affiliated Medicaid MCO values are invented. The alignment table retains plan/state evidence; county availability comes from its join to the SNP landscape. C-SNP and I-SNP rows retain their existing data while the county support table gains the integration columns.

## Reproduction

Apply migrations 092, 093, and 094 after the existing PY2027 migrations, including 081. `--landscape-file` accepts a PY2027 prepared JSONL; omit it to read the live landscape. Add `--dry-run` before every load and `--output PATH` to save the prepared JSON for verification.

```sh
node scripts/sep-data/ingest-star-ratings.js --file SUMMARY_CSV --skip-unmapped --dry-run --output stars.json
node scripts/sep-data/ingest-plan-crosswalk.js --file CROSSWALK_TXT --dry-run --output crosswalk.json
node scripts/sep-data/ingest-snp-plans.js --integration-file INTEGRATED_XLSX --status-file STATUS_XLSX --dry-run --output dsnp.json
node scripts/sep-data/verify-supplemental-2027.js --stars stars.json --crosswalk crosswalk.json --dsnp dsnp.json
```

Omit `--dry-run` for the corresponding writes. Bounded retries replay only idempotent upsert batches after network, rate-limit, or server failures; validation errors abort. The verify command checks counts, zero PY2026/non-PY2027 rows, all five crosswalk status totals, all low-performing rows, all alignment rows, complete source-to-database equality in the six requested counties, and their SEP RPC results.

## Live verification

The audit returned zero PY2026, zero non-PY2027, and zero NULL plan-year rows in all four tables. Every loaded alignment record and every low-performing county record matched the source preparation. All crosswalk status totals matched the dry run.

| County | Star contracts | Crosswalk rows | SNP rows | D-SNP rows | Five-star contracts via SEP RPC |
|---|---:|---:|---:|---:|---:|
| Camden, NJ | 21 | 67 | 13 | 5 | 3 |
| Burlington, NJ | 20 | 66 | 14 | 5 | 3 |
| Gloucester, NJ | 20 | 65 | 13 | 5 | 3 |
| Philadelphia, PA | 31 | 110 | 35 | 20 | 2 |
| Bucks, PA | 33 | 116 | 36 | 21 | 3 |
| Montgomery, PA | 30 | 106 | 36 | 21 | 1 |

All county fields, ratings, flags, transition statuses, successor identities, and D-SNP integration values were compared against the dry-run records. The SEP RPC returned no county termination events in these checks because the input sources lack affected historical county evidence.

Validation on the isolated release checkout: `npm run lint` passed; `npm run build` passed; 34 relevant crosswalk, migration, D-SNP, dual/LIS, and FEMA tests passed. Site styling was preserved.

Production smoke testing found that the public browser client could not see `dsnp_eae_lookup`: the table had RLS enabled with no SELECT policies. Migration 095 adds a SELECT-only policy for published PY2027 CMS plan reference rows. An anonymous-role count now returns all 949 records. A database test confirms that the policy excludes PY2026 rows and does not permit writes. The verification command also checks browser visibility of all alignment rows. Apply migration 095 with the other supplemental migrations.

## Production smoke tests

Netlify published commit `131de11014be1ca05346894d099365c69339f0e6` on October 10, 2026 at 18:30:49 UTC. After refreshing the authenticated production browser:

- Intelligence ZIP 08102 returned three five-star contracts. Selecting Camden loaded 65 current county plans.
- Intelligence ZIP 19103 returned two five-star contracts. Clicking Philadelphia directly on the county map loaded 106 current county plans.
- Script workspace SEP Finder ZIP 08016 returned three five-star contracts and five integrated D-SNP plans. The D-SNP pending message disappeared after migration 095.
- The final repeat of the data audit passed with `publicAlignmentCount: 949`; all four tables still had zero PY2026 and non-PY2027 rows.

The follow-up commit contains only the public CMS SELECT policy, its test, the visibility check, and these notes. The deployed frontend and site styling are unchanged by that follow-up.
