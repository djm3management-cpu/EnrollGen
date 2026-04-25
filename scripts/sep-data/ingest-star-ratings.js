import {
  cleanText,
  createSupabaseAdminClient,
  getField,
  loadCountyLookup,
  normalizeCountyFips,
  parseArgs,
  readTabularFile,
  resolveCountyEntries,
  stateFromCountyFips,
  toNumber,
  uniqueRows,
  upsertRows,
} from "./common.js";

function contractIdFrom(row) {
  return cleanText(
    getField(row, [
      "Contract Number",
      "Contract ID",
      "contract_id",
      "Contract",
      "ContractNumber",
    ])
  );
}

function countyFipsFrom(row) {
  const direct = normalizeCountyFips(
    getField(row, [
      "County FIPS",
      "county_fips",
      "FIPS",
      "FIPS County Code",
      "SSA County",
      "County Code",
    ])
  );
  if (direct) return direct;
  const state = String(getField(row, ["State FIPS", "state_fips"])).replace(/\D/g, "");
  const county = String(getField(row, ["County Code", "county_code"])).replace(/\D/g, "");
  return state && county ? `${state.padStart(2, "0")}${county.padStart(3, "0")}` : "";
}

function serviceAreasFrom(row, countyLookup) {
  const countyFips = countyFipsFrom(row);
  if (countyFips.length === 5) {
    const state = stateFromCountyFips(countyFips);
    return [
      {
        county_fips: countyFips,
        county_name: cleanText(getField(row, ["County", "County Name", "county_name"])),
        state_code: cleanText(getField(row, ["State", "state_code"])) || state.state_code,
      },
    ];
  }

  const stateCode = cleanText(
    getField(row, [
      "State Territory Abbreviation",
      "State",
      "state_code",
      "State Abbreviation",
    ])
  );
  const countyName = cleanText(getField(row, ["County Name", "County", "county_name"]));
  return resolveCountyEntries(countyLookup, { stateCode, countyName });
}

function buildServiceAreaRows(rows, countyLookup) {
  const serviceRows = [];
  for (const row of rows) {
    const contractId = contractIdFrom(row);
    if (!contractId) continue;
    for (const area of serviceAreasFrom(row, countyLookup)) {
      serviceRows.push({ contract_id: contractId, ...area });
    }
  }
  return serviceRows;
}

async function main() {
  const args = parseArgs();
  if (!args["service-area-file"] && !args["service-area-url"]) {
    throw new Error("Provide --service-area-file or --service-area-url.");
  }

  const planYear = Number(args.year || 2026);
  const ratingsRows = await readTabularFile({
    file: args.file,
    url: args.url,
    sheet: args.sheet,
    headerIncludes: "Contract Number",
  });
  const countyLookup = await loadCountyLookup({
    file: args["county-reference-file"],
    url: args["county-reference-url"],
  });
  const serviceRows = buildServiceAreaRows(
    await readTabularFile({
      file: args["service-area-file"],
      url: args["service-area-url"],
      sheet: args["service-area-sheet"],
    }),
    countyLookup
  );

  const serviceByContract = new Map();
  for (const row of serviceRows) {
    const list = serviceByContract.get(row.contract_id) || [];
    list.push(row);
    serviceByContract.set(row.contract_id, list);
  }

  const records = [];
  for (const row of ratingsRows) {
    const contractId = contractIdFrom(row);
    const stars = toNumber(
      getField(row, [
        "Overall Star Rating",
        "Overall Rating",
        "overall_star_rating",
        "Star Rating",
        "Overall",
        "2026 Overall",
      ])
    );
    if (!contractId || stars < 5) continue;

    const serviceAreas = serviceByContract.get(contractId) || [];
    for (const area of serviceAreas) {
      records.push({
        contract_id: contractId,
        plan_name: cleanText(getField(row, ["Plan Name", "plan_name", "Contract Name"])),
        organization_name: cleanText(
          getField(row, [
            "Organization Name",
            "Organization",
            "org_name",
            "Organization Marketing Name",
            "Parent Organization",
          ])
        ),
        overall_star_rating: stars,
        county_fips: area.county_fips,
        county_name: area.county_name,
        state_code: area.state_code,
        plan_year: planYear,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const deduped = uniqueRows(
    records,
    (row) => `${row.contract_id}:${row.county_fips}:${row.plan_year}`
  );
  console.log(`Prepared ${deduped.length} star_ratings_by_county rows`);
  if (args["dry-run"]) return;
  const supabase = await createSupabaseAdminClient();
  await upsertRows({
    supabase,
    table: "star_ratings_by_county",
    rows: deduped,
    onConflict: "contract_id,county_fips,plan_year",
  });
  console.log(`star_ratings_by_county complete: ${deduped.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
