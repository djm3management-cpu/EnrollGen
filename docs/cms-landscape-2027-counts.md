# CMS CY2027 landscape preparation

Source: `data/landscape/2027/cy2027_landscape_202609.1.zip` (September 2026 CSV).

The archive contains a 53-column CSV, an XLSB copy, and a readme. Compared with the retired table definition, the CSV renames `ContractPlanID` and `ContractPlanSegmentID` to `Contract Plan ID` and `Contract Plan Segment ID`; renames the zero-dollar D-SNP field; removes `SNP Institutional Category`; and adds `Enrollment Capacity Limit Accepted` and `Enrollment Capacity Limit Amount`. The source has no FIPS column, so county FIPS comes from the checked-in Census crosswalk.

These counts were validated against the live Supabase PY2027 table on October 1, 2026. The `PDP` statewide “All Counties” rows were expanded to Census county FIPS. `Cost` rows were excluded.

Total county-plan rows: **158,280**.

## Category counts

| Category | Rows |
|---|---:|
| PDP | 29,594 |
| MA-PD | 57,209 |
| MA | 17,525 |
| SNP | 53,952 |
| excluded_Cost | 1,145 |

## Rows by state and territory

| State | Rows | State | Rows |
|---|---:|---|---:|
| AK | 270 | AL | 4,725 |
| AR | 4,503 | AS | 5 |
| AZ | 664 | CA | 1,858 |
| CO | 1,925 | CT | 356 |
| DC | 24 | DE | 119 |
| FL | 4,596 | GA | 12,674 |
| GU | 1 | HI | 143 |
| IA | 3,712 | ID | 913 |
| IL | 3,916 | IN | 5,817 |
| KS | 3,157 | KY | 7,828 |
| LA | 3,649 | MA | 672 |
| MD | 678 | ME | 569 |
| MI | 5,210 | MN | 1,482 |
| MO | 6,301 | MP | 4 |
| MS | 4,949 | MT | 916 |
| NC | 7,130 | ND | 730 |
| NE | 2,676 | NH | 167 |
| NJ | 1,193 | NM | 1,002 |
| NV | 452 | NY | 3,161 |
| OH | 7,009 | OK | 2,774 |
| OR | 806 | PA | 6,176 |
| PR | 3,459 | RI | 157 |
| SC | 3,183 | SD | 1,005 |
| TN | 6,501 | TX | 11,903 |
| UT | 880 | VA | 8,466 |
| VI | 3 | VT | 161 |
| WA | 1,463 | WI | 2,910 |
| WV | 2,959 | WY | 318 |

## County spot checks

| County | MA | MA-PD | PDP | SNP | Total |
|---|---:|---:|---:|---:|---:|
| Burlington, NJ | 7 | 32 | 11 | 14 | 64 |
| Camden, NJ | 7 | 34 | 11 | 13 | 65 |
| Northampton, PA | 10 | 63 | 8 | 30 | 111 |

Unmatched county names: **0**. All source rows have contract year 2027.

The live table contains 158,280 rows, and every state count above matches the live query. Burlington, Camden, and Northampton category counts also match live rows. All 158,280 plan rows have a monthly premium, and all 158,280 have a new vector embedding. On October 1, 2026, live checks found zero non-2027 rows in the landscape, vector, SNP, stars, and terminations tables, and zero rows in the legacy D-SNP lookup. The old PY2026 landscape table is absent.

The 2027 SNP support table has 53,952 rows. The archive has 34,122 D-SNP county rows across 1,052 contract/plan/segment IDs: 23,978 coordination only, 6,345 highly integrated, and 3,799 fully integrated. The AIP field has 6,220 Yes and 27,902 No rows. The archive does not contain an affiliated Medicaid MCO or exclusive aligned enrollment status. The 2026 D-SNP alignment lookup (264 rows) was removed; the routing UI requires carrier verification for those missing fields.

The 888 PY2026 star rows and 37,526 PY2026 termination/crosswalk rows were hard deleted. The 51,297 PY2026 SNP rows were hard deleted after the 2027 SNP load.

The supplied September CSV includes `Overall Star Rating`, `Part C Summary Star Rating`, and `Part D Summary Star Rating` columns, but all 130,307 source rows leave them blank. Those landscape fields remain `NULL`. On October 10, 2026, the separate PY2027 star rating support table was loaded from the October 8 Summary Ratings CSV as described below. No 2026 rating is carried forward.

### October 10, 2026 star ratings load

Source: `2027 Star Ratings Data Table - Summary Ratings (Oct 8 2026).csv`, using only `2027 Overall`. The parser locates the header below the title row and requires the 2027 column. County mappings came from the live `cms_plans_py2027` table filtered to 2027, with stable pagination.

The initial dry run prepared **38,805 numerically rated county-contract rows**. An independent comparison against `data/landscape/2027/prepared.jsonl` returned the same count. The comparable five-star count is **983**, versus last year's **888 five-star rows** (**+95**). Of 508 numerically rated contracts, 480 have coverage in the loaded landscape. The other 28 were explicitly skipped using `--skip-unmapped`; no counties were inferred. The default invocation still rejects unmapped contracts.

Unmapped contracts: H0107, H0908, H1304, H1537, H1666, H2450, H2461, H2816, H3335, H3536, H3557, H4537, H4544, H4937, H5042, H5386, H6078, H6202, H7323, H7389, H7787, H8133, H8554, H8634, H9460, H9485, H9706, R3444. All are also absent from the prepared CY2027 inventory.

After loading the separate Low Performing Contracts CSV, the live PY2027 count is **38,820**. CMS flags H3814, H4982, H7389, and H9066; three covered contracts produce 25 flagged county rows. H7389 has no current county coverage. H9066 contributes 15 rows with a NULL Overall rating. Every NJ and PA row was checked against the CSV rating, Low Performing designation, and loaded landscape mapping:

| State | County-contract rows | Counties |
|---|---:|---:|
| NJ | 352 | 21 |
| PA | 1,786 | 67 |

Spot checks: Burlington, NJ has 20 rated contracts (2.5–5 stars); Camden, NJ has 21 (2.5–5); Northampton, PA has 32 (3–5).

Reproduce with `node scripts/sep-data/ingest-star-ratings.js --file PATH --skip-unmapped --dry-run`, then omit `--dry-run` to upsert and run the count/NJ/PA verification.

The source exposes an annual **Part D** deductible. It does not contain an MA medical deductible column, so that value is unavailable from this archive.

The separate October crosswalk has now been loaded: **192,500 transition/county rows** representing all **9,144 source associations**. Successor counties do not prove displaced-member eligibility; affected historical county evidence remains unavailable. See [the supplemental load report](cms-py2027-supplemental-load.md).

## Supplemental CMS files

| File | Ingest command | Current state |
|---|---|---|
| 2027 Star Ratings | `node scripts/sep-data/ingest-star-ratings.js --file PATH --skip-unmapped` | Loaded and verified: 38,820 rows, including 983 five-star rows |
| 2027 Part C&D Plan Crosswalk | `node scripts/sep-data/ingest-plan-crosswalk.js --file PATH` | Loaded and verified: 192,500 rows |
| CY2027 Integrated D-SNPs List | `node scripts/sep-data/ingest-snp-plans.js --integration-file PATH --status-file PATH` | Loaded and verified: 949 plan/state records and 53,952 SNP county rows |

Each command accepts `--dry-run` for validation. Star and crosswalk ingests use the loaded 2027 county inventory for service areas. Crosswalk records retain exact CMS status and distinguish current successor coverage from unknown historical coverage; the SEP RPC requires affected-service-area evidence. Apply migrations 081 and 089/092–095 before the corresponding loads. The D-SNP parser recognizes the CY2027 data sheet after its Overview sheet and keeps missing EAE and affiliated Medicaid MCO values unknown.

The MA Copilot uses the new county-scoped PY2027 vector search only after a county and state are selected. A live retrieval against Burlington, NJ returned PY2027 plan rows from that county. Its RAG block cites matched plan rows and warns that rating and MA medical deductible fields are unavailable in this source.

## Remaining `2026` references flagged by grep

- `src/components/SEPGuide2026.jsx`, `src/components/AgentTools.jsx`, and `docs/MA_SEP_Guide_2026.md` still expose a 2026 Medicare SEP reference guide. It is dated guidance, not PY2026 plan inventory.
- `src/data/medicareReference2026.js`, `src/hooks/useMedSupCopilotEngine.js`, and `src/components/medsup/HDPGComboAnalysis.jsx` use 2026 Medicare cost-sharing or Medigap deductible values. These are separate from the MA/Part D landscape and need review when 2027 figures are available.
- `src/context/CopilotCmsKnowledge.js` cites the 2026 Medicare Communications and Marketing Guidelines. This is guidance, not county plan data.
- `src/data/sepFemaDb.js` has 2026 disaster event dates; these are historical event dates.
- Retired PY2026 loader files and the new migration/verification files mention 2026 solely to reject or remove old plan rows. ACA/QHP 2026 references were left untouched as requested.

### CY2027 D-SNP rollout

CMS has published the [CY2027 Integrated D-SNPs List](https://www.cms.gov/files/document/cy-2027-integrated-d-snps-list.xlsx) on its [D-SNP integration page](https://www.cms.gov/medicare/medicaid-coordination/about/dsnps). The official workbook was downloaded for local dry-run validation only; no live data was loaded. Its 945 plan/state rows use sheet `CY 2027 Data`, have no county field, and report neither EAE nor affiliated Medicaid MCO. Legal entity names are retained as source labels, not inferred marketing names. Integration/AIP evidence does not establish member eligibility.

1. Deploy this feature code on top of current main, retaining F35 and F34. Until 081/data are present, absent tables/columns, errors, and an empty alignment table show `2027 D-SNP integration status pending CMS list`. County plan inventory and F35 landscape-based FIDE/HIDE/AIP evidence remain available; full-benefit status, monthly use and aligned MCO enrollment still require verification.
2. Apply `supabase/migrations/081_dsnp_alignment_2027.sql` after migrations through 080 (including 054, 068 and 078). The historical `055_paragon_vendor_report.sql` stays unchanged; the new D-SNP migration is 081. If undated alignment rows remain, 081 aborts transactionally for inspection instead of silently relabeling them as 2027.
3. Download the linked CMS workbook. Validate with `node scripts/parse_cms_dsnp.js --file /path/to/cy-2027-integrated-d-snps-list.xlsx --dry-run`.
4. With `SUPABASE_DB_URL` or `SUPABASE_DB_PASSWORD` configured locally, the single load command is:

   ```sh
   node scripts/parse_cms_dsnp.js --file /path/to/cy-2027-integrated-d-snps-list.xlsx
   ```

   This atomically replaces only the 2027 alignment rows. Malformed rows, conflicting duplicates, changed integration values, and mismatched years abort before replacement. Database insert failures roll back the replacement.
5. Reload the SEP and SNP screens and verify county plan availability, plan/state matching, and member-specific alignment with the carrier. Missing per-plan alignment evidence remains pending even when other list rows exist. No telephony, call routing, billing, recording, FEMA RPC, or F35 wording changes are part of this rollout.
