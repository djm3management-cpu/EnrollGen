# County MA penetration

Migration 088 creates public CMS reference data, intentionally readable with the anonymous CMS client. Customer/tenant data is not involved. Apply to the database configured by `VITE_SUPABASE_CMS_URL` (or the primary database when unset), then execute the reviewed data SQL there. No new browser/server env variables are required; `SUPABASE_DB_URL` is required only for an intentional live CLI load.

The latest official CMS monthly index on 2026-10-04 listed **2026-09** (no October file). Download:
https://www.cms.gov/files/zip/ma-state-county-penetration-september-2026.zip

Source index:
https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/ma-state/county-penetration

Unzip and run:

```sh
node scripts/parse_cms_penetration.js --file /tmp/cms-penetration-source/State_County_Penetration_MA_2026_09/State_County_Penetration_MA_2026_09.csv --month 2026-09 --dry-run
node scripts/parse_cms_penetration.js --file /tmp/cms-penetration-source/State_County_Penetration_MA_2026_09/State_County_Penetration_MA_2026_09.csv --month 2026-09 --sql-out /tmp/penetration-load.sql
```

Actual export: **3,186 county rows**, 2 pending county designation rows excluded, 22 suppressed enrolled counts/rates preserved as NULL. No live database load was performed. Replacement affects only this file month; earlier months are retained. The map reads the latest global month first, so omitted states do not silently show older historical months.

Definition: eligibles is CMS's Medicare eligible denominator, enrolled is its included MA organization enrollment numerator (the CMS README also includes PACE and cost plan types). The percentage is the **published CMS value**, with CMS rounding/capping preserved, rather than a locally recalculated percentage. Asterisk means enrollment of 10 or fewer; we never impute it or distribute pending enrollment. Blank rates remain unknown. CMS's September README excludes Connecticut and Alaska due to geographic-code transitions. Displayed source month makes freshness explicit. Missing counties and suppressed counts/rates show “No data.”

SHA-256 provenance:

- ZIP: `b7d66e89cebcd0c68a11ea8a931c2fa896a0f158517c08833b28081f9332862c`
- CSV: `1abf678e886d79c71068b48d55e09abb69fde9229e548bd034819ea98d5d7cdd`
- SQL: `a908325edc73d45e23acda4bfcc73fc702b9158d48bf227ec9c4dc507df12930`

## County geometry

Bundled SVG paths derive from **us-atlas 3.0.1** `counties-10m.json`, Census 2017 cartographic boundaries; this is generalized geographic geometry, not CMS enrollment. See https://github.com/topojson/us-atlas and https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json. Census geometry is public domain; us-atlas ISC notice is preserved in `docs/third-party/us-atlas-LICENSE.txt`. Input SHA-256: `145aaf5d1433352a6a1d8e86b5f149c7c653f9171baf14aaf75ee66575def1b0`.

Rebuild with `node scripts/prepare_county_map.js /tmp/counties-10m.json`. There are 3,231 paths, approximately 940 KB uncompressed total, split by state and loaded only when that state is opened. Boundaries are a historical generalized vintage; FIPS matches drive coloring and unmatched geometries show no data. County name matching is limited to the selected state with conservative punctuation/County suffix normalization. Existing plans/SEPs retain their county selectors. No runtime third-party geometry request is made.
