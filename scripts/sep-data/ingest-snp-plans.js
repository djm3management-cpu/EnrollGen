import {
  cleanText,
  createSupabaseAdminClient,
  getField,
  loadCountyLookup,
  normalizeCountyFips,
  parseArgs,
  readTabularFile,
  resolveCountyEntries,
  splitList,
  stateFromCountyFips,
  toInteger,
  uniqueRows,
  upsertRows,
} from "./common.js";

function contractIdFrom(row) {
  return cleanText(
    getField(row, ["Contract Number", "Contract ID", "contract_id", "Contract"])
  );
}

function planIdFrom(row) {
  const value = getField(row, ["Plan ID", "Plan Number", "plan_id", "Plan"]);
  const raw = String(value ?? "").replace(/\.0$/, "").trim();
  return raw ? raw.padStart(3, "0") : null;
}

function normalizeSnpType(value) {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("C-SNP") || text.includes("CHRONIC")) return "C-SNP";
  if (text.includes("D-SNP") || text.includes("DUAL")) return "D-SNP";
  if (text.includes("I-SNP") || text.includes("INSTITUTION")) return "I-SNP";
  return cleanText(text);
}

function extractCountyEntries(row, countyLookup) {
  const direct = normalizeCountyFips(
    getField(row, ["County FIPS", "county_fips", "FIPS", "FIPS County Code", "County Code"])
  );
  if (direct) {
    return [
      {
        county_fips: direct,
        county_name: cleanText(getField(row, ["County", "County Name", "county_name"])),
        state_code:
          cleanText(getField(row, ["State", "state_code"])) ||
          stateFromCountyFips(direct).state_code,
      },
    ];
  }

  const stateCode = cleanText(
    getField(row, [
      "State Territory Abbreviation",
      "State",
      "State(s)",
      "States",
      "state_code",
    ])
  );
  const countyName = cleanText(
    getField(row, ["County Name", "County", "county_name", "Service Area County"])
  );
  return resolveCountyEntries(countyLookup, { stateCode, countyName });
}

function buildServiceAreaMap(rows, countyLookup) {
  const map = new Map();
  for (const row of rows || []) {
    const contractId = contractIdFrom(row);
    const planId = planIdFrom(row);
    const countyEntries = extractCountyEntries(row, countyLookup);
    if (!contractId || !countyEntries.length) continue;
    const key = `${contractId}:${planId || ""}`;
    const list = map.get(key) || [];
    list.push(...countyEntries);
    map.set(key, list);
  }
  return map;
}

async function main() {
  const args = parseArgs();
  const planYear = Number(args.year || 2026);
  const rows = await readTabularFile({
    file: args.file,
    url: args.url,
    sheet: args.sheet || "SNP_REPORT_PART_17",
    headerIncludes: "Contract Number",
  });
  const countyLookup = await loadCountyLookup({
    file: args["county-reference-file"],
    url: args["county-reference-url"],
  });
  const serviceMap =
    args["service-area-file"] || args["service-area-url"]
      ? buildServiceAreaMap(
          await readTabularFile({
            file: args["service-area-file"],
            url: args["service-area-url"],
            sheet: args["service-area-sheet"],
          }),
          countyLookup
        )
      : new Map();

  let skippedNoCounty = 0;
  const records = [];

  for (const row of rows) {
    const contractId = contractIdFrom(row);
    const planId = planIdFrom(row);
    const snpType = normalizeSnpType(
      getField(row, ["SNP Type", "Special Needs Plan Type", "snp_type", "Type"])
    );
    if (!contractId || !["C-SNP", "D-SNP", "I-SNP"].includes(snpType)) continue;

    const directServiceAreas = extractCountyEntries(row, countyLookup);
    const serviceAreas =
      directServiceAreas.length > 0
        ? directServiceAreas
        : serviceMap.get(`${contractId}:${planId || ""}`) || serviceMap.get(`${contractId}:`) || [];

    if (!serviceAreas.length) {
      skippedNoCounty += 1;
      continue;
    }

    for (const area of serviceAreas) {
      records.push({
        contract_id: contractId,
        plan_id: planId,
        plan_name: cleanText(getField(row, ["Plan Name", "plan_name"])),
        organization_name: cleanText(
          getField(row, ["Organization Name", "Organization", "org_name", "Contract Name"])
        ),
        snp_type: snpType,
        chronic_conditions:
          snpType === "C-SNP"
            ? splitList(
                getField(row, [
                  "Conditions",
                  "Chronic Conditions",
                  "condition",
                  "Specialty Diseases",
                  "Chronic or Disabling Condition SNP (C-SNP) Condition Type",
                ])
              )
            : [],
        county_fips: area.county_fips,
        county_name: area.county_name,
        state_code: area.state_code,
        plan_year: planYear,
        enrollment_count: toInteger(getField(row, ["Enrollment", "enrollment_count"])),
        updated_at: new Date().toISOString(),
      });
    }
  }

  const deduped = uniqueRows(
    records,
    (row) =>
      `${row.contract_id}:${row.plan_id || ""}:${row.snp_type}:${row.county_fips}:${row.plan_year}`
  );
  console.log(`Prepared ${deduped.length} snp_plans_by_county rows`);
  if (args["dry-run"]) return;
  const supabase = await createSupabaseAdminClient();
  await upsertRows({
    supabase,
    table: "snp_plans_by_county",
    rows: deduped,
    onConflict: "contract_id,plan_id,snp_type,county_fips,plan_year",
  });
  console.log(`snp_plans_by_county complete: ${deduped.length} rows`);
  if (skippedNoCounty) {
    console.warn(`Skipped ${skippedNoCounty} SNP source rows without county FIPS mapping.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
