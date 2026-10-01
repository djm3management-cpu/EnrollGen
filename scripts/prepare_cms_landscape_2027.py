"""Normalize the CMS September 2026 CY2027 CSV to county-level JSONL.

Usage: python3 scripts/prepare_cms_landscape_2027.py <csv> <output.jsonl>
"""
import collections
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

CATEGORIES = {"MA", "MA-PD", "PDP", "SNP"}
REQUIRED = {
    "Contract Year", "Contract Category Type", "State Territory Abbreviation",
    "County Name", "Contract ID", "Plan ID", "Segment ID",
    "Contract Plan Segment ID", "Organization Marketing Name", "Plan Name",
    "Plan Type", "Part C Premium", "Part D Total Premium",
    "Monthly Consolidated Premium (Part C + D)",
    "Annual Part D Deductible Amount",
    "In-Network Maximum Out-of-Pocket (MOOP) Amount", "Overall Star Rating",
}


def county_key(value):
    value = re.sub(r"\s+(County|Parish|Borough|Census Area|Municipio)$", "", value.strip(), flags=re.I)
    value = unicodedata.normalize("NFKD", value)
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def money(value):
    cleaned = str(value).strip().replace("$", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def main(source, target):
    counties = collections.defaultdict(list)
    with open("scripts/sep-data/cache/national_county2020.txt", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="|"):
            name = re.sub(r"\s+(County|Parish|Borough|Census Area|Municipio)$", "", row["COUNTYNAME"], flags=re.I)
            entry = (row["STATEFP"] + row["COUNTYFP"], name)
            counties[row["STATE"], county_key(name)].append(entry)
            counties[row["STATE"], county_key("All Counties")].append(entry)

    counts = collections.Counter()
    state_counts = collections.Counter()
    missing = collections.Counter()
    sample = collections.Counter()
    seen = set()
    with open(source, encoding="utf-8-sig", newline="") as stream, open(target, "w") as out:
        reader = csv.DictReader(stream)
        absent = REQUIRED - set(reader.fieldnames or [])
        if absent:
            raise ValueError(f"Missing CMS columns: {sorted(absent)}")
        for row in reader:
            if row["Contract Year"].strip() != "2027":
                raise ValueError(f"Unexpected plan year {row['Contract Year']!r}")
            category = row["Contract Category Type"].strip()
            if category not in CATEGORIES:
                counts[f"excluded_{category}"] += 1
                continue
            state = row["State Territory Abbreviation"].strip()
            county = row["County Name"].strip()
            fips_list = counties.get((state, county_key(county)), [])
            if not fips_list:
                missing[(state, county)] += 1
                continue
            for fips, actual_county in fips_list:
                key = (fips, row["Contract Plan Segment ID"])
                if key in seen:
                    counts["duplicate_county_plan"] += 1
                    continue
                seen.add(key)
                record = {
                    "plan_year": 2027, "category": category, "state_code": state,
                    "county_name": actual_county,
                    "county_fips": fips,
                    "carrier": row["Organization Marketing Name"].strip() or row["Parent Organization Name"].strip(),
                    "contract_id": row["Contract ID"].strip(),
                    "plan_id": row["Plan ID"].strip().zfill(3),
                    "segment_id": row["Segment ID"].strip(),
                    "contract_plan_segment_id": row["Contract Plan Segment ID"].strip(),
                    "plan_name": row["Plan Name"].strip(), "plan_type": row["Plan Type"].strip(),
                    "snp_type": row["SNP Type"].strip(),
                    "dsnp_integration_status": row["Dual Eligible SNP (D-SNP) Integration Status"].strip(),
                    "dsnp_aip_identifier": row["D-SNP Applicable Integrated Plan (AIP) Identifier"].strip(),
                    "part_d_coverage": row["Part D Coverage Indicator"].strip() == "Yes",
                    "part_c_premium": money(row["Part C Premium"]),
                    "part_d_premium": money(row["Part D Total Premium"]),
                    "monthly_premium": (
                        money(row["Monthly Consolidated Premium (Part C + D)"])
                        if money(row["Monthly Consolidated Premium (Part C + D)"]) is not None
                        else money(row["Part D Total Premium"])
                        if category == "PDP" else money(row["Part C Premium"])
                    ),
                    "part_d_deductible": money(row["Annual Part D Deductible Amount"]),
                    "in_network_moop": money(row["In-Network Maximum Out-of-Pocket (MOOP) Amount"]),
                    "overall_star_rating": money(row["Overall Star Rating"]),
                    "part_c_star_rating": money(row["Part C Summary Star Rating"]),
                    "part_d_star_rating": money(row["Part D Summary Star Rating"]),
                    "source_file": Path(source).name,
                }
                out.write(json.dumps(record, separators=(",", ":")) + "\n")
                counts[category] += 1
                state_counts[state] += 1
                if (state, actual_county) in {("NJ", "Burlington"), ("NJ", "Camden"), ("PA", "Northampton")}:
                    sample[(state, actual_county, category)] += 1
    report = {"categories": dict(counts), "states": dict(sorted(state_counts.items())),
              "unmatched_counties": {f"{s}/{c}": n for (s, c), n in missing.items()},
              "spot_checks": {"/".join(k): n for k, n in sample.items()}}
    print(json.dumps(report, indent=2))
    if missing:
        raise SystemExit("Unmatched counties; fix mapping before upload")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
