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

The supplied September CSV includes `Overall Star Rating`, `Part C Summary Star Rating`, and `Part D Summary Star Rating` columns, but all 130,307 source rows leave them blank. PY2027 ratings are therefore `NULL`; the PY2027 star rating support table has zero rows. No 2026 rating is carried forward.

The source exposes an annual **Part D** deductible. It does not contain an MA medical deductible column, so that value is unavailable from this archive.

The archive also has no old-to-new plan crosswalk or termination event file. The PY2027 plan termination support table remains empty pending that separate CMS source.

When CMS posts the files, run `node scripts/sep-data/ingest-star-ratings.js --file PATH` and `node scripts/sep-data/ingest-plan-crosswalk.js --file PATH`. Each uses the loaded 2027 county inventory for service areas. Validate first with `--dry-run`. The crosswalk ingest refuses a partial load if a terminated plan cannot be mapped to a county; in that case supply the CMS service-area file with `--service-area-file PATH` in the same command.

The MA Copilot uses the new county-scoped PY2027 vector search only after a county and state are selected. A live retrieval against Burlington, NJ returned PY2027 plan rows from that county. Its RAG block cites matched plan rows and warns that rating and MA medical deductible fields are unavailable in this source.

## Remaining `2026` references flagged by grep

- `src/components/SEPGuide2026.jsx`, `src/components/AgentTools.jsx`, and `docs/MA_SEP_Guide_2026.md` still expose a 2026 Medicare SEP reference guide. It is dated guidance, not PY2026 plan inventory.
- `src/data/medicareReference2026.js`, `src/hooks/useMedSupCopilotEngine.js`, and `src/components/medsup/HDPGComboAnalysis.jsx` use 2026 Medicare cost-sharing or Medigap deductible values. These are separate from the MA/Part D landscape and need review when 2027 figures are available.
- `src/context/CopilotCmsKnowledge.js` cites the 2026 Medicare Communications and Marketing Guidelines. This is guidance, not county plan data.
- `src/data/sepFemaDb.js` has 2026 disaster event dates; these are historical event dates.
- Retired PY2026 loader files and the new migration/verification files mention 2026 solely to reject or remove old plan rows. ACA/QHP 2026 references were left untouched as requested.
