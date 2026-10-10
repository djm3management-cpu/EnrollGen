import fs from "node:fs/promises";
import path from "node:path";
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
  if (!args.file && !args.url) throw new Error("Provide --file PATH (or --url URL) for the CMS 2027 Star Ratings file.");

  const planYear = Number(args.year || 2027);
  if (planYear !== 2027) throw new Error("Only PY2027 Medicare data may be ingested");
  const ratingsRows = await readTabularFile({
    file: args.file,
    url: args.url,
    sheet: args.sheet,
    headerIncludes: ["Contract Number", "2027 Overall"],
  });
  if (!ratingsRows.length || !Object.hasOwn(ratingsRows[0], "2027 Overall")) {
    throw new Error("Expected the CMS Summary Ratings header with Contract Number and 2027 Overall.");
  }
  const lowFile = args["low-performing-file"] || (args.file && path.join(path.dirname(args.file), path.basename(args.file).replace("Summary Ratings", "Low Performing Contracts")));
  if (!lowFile || lowFile === args.file) throw new Error("Provide --low-performing-file PATH");
  const lowRows = await readTabularFile({ file: lowFile, headerIncludes: ["Contract Number", "Reason for LPI"] });
  if (!lowRows.length || !Object.hasOwn(lowRows[0], "Reason for LPI")) {
    throw new Error("Expected the CMS Low Performing Contracts header with Reason for LPI.");
  }
  const lowByContract = new Map(lowRows.filter(row => contractIdFrom(row)).map(row => [contractIdFrom(row), cleanText(row["Reason for LPI"])]));
  const supabase = await createSupabaseAdminClient();
  let serviceRows;
  if (args["landscape-file"]) {
    serviceRows = (await fs.readFile(args["landscape-file"], "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
    if (serviceRows.some(row => row.plan_year !== 2027)) throw new Error("Landscape must contain only PY2027");
  } else if (args["service-area-file"] || args["service-area-url"]) {
    const countyLookup = await loadCountyLookup({
      file: args["county-reference-file"],
      url: args["county-reference-url"],
    });
    serviceRows = buildServiceAreaRows(await readTabularFile({
      file: args["service-area-file"],
      url: args["service-area-url"],
      sheet: args["service-area-sheet"],
    }), countyLookup);
  } else {
    serviceRows = [];
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await supabase.from("cms_plans_py2027")
        .select("contract_id,county_fips,county_name,state_code")
        .eq("plan_year", 2027).order("id").range(offset, offset + 999);
      if (error) throw error;
      serviceRows.push(...data);
      if (serviceRows.length % 25000 === 0) console.log(`Read ${serviceRows.length} CY2027 landscape rows`);
      if (data.length < 1000) break;
    }
  }

  const serviceByContract = new Map();
  for (const row of serviceRows) {
    const list = serviceByContract.get(row.contract_id) || [];
    list.push(row);
    serviceByContract.set(row.contract_id, list);
  }

  const records = [];
  let ratedContracts = 0;
  let unmatchedContracts = 0;
  const unmatchedIds = [];
  for (const row of ratingsRows) {
    const contractId = contractIdFrom(row);
    const stars = toNumber(getField(row, ["2027 Overall"]));
    const hasRating = Number.isFinite(stars) && stars >= 1 && stars <= 5;
    if (!contractId || (!hasRating && !lowByContract.has(contractId))) continue;
    if (hasRating) ratedContracts += 1;

    const serviceAreas = serviceByContract.get(contractId) || [];
    if (!serviceAreas.length) {
      unmatchedContracts += 1;
      unmatchedIds.push(contractId);
    }
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
        overall_star_rating: hasRating ? stars : null,
        low_performing: lowByContract.has(contractId),
        low_performing_reason: lowByContract.get(contractId) || null,
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
  console.log(`2027 rated contracts: ${ratedContracts}; without CY2027 county coverage: ${unmatchedContracts}`);
  const fiveStarRows = deduped.filter(row => row.overall_star_rating === 5).length;
  console.log(`2027 five-star rows: ${fiveStarRows}; compared with last year's 888 five-star rows: ${fiveStarRows - 888 >= 0 ? "+" : ""}${fiveStarRows - 888}`);
  if (unmatchedIds.length) console.log(`Unmapped contracts (no counties inferred): ${unmatchedIds.join(", ")}`);
  if (!ratedContracts || !deduped.length || (unmatchedContracts && !args["skip-unmapped"])) {
    throw new Error(`Star file validation failed: ${ratedContracts} rated contracts, ${unmatchedContracts} without 2027 county coverage. Review CMS columns and service areas.`);
  }
  console.log(`Low performing: ${lowByContract.size} source contracts; ${new Set(deduped.filter(row => row.low_performing).map(row => row.contract_id)).size} mapped contracts; ${deduped.filter(row => row.low_performing).length} county rows`);
  if (args["output"]) await fs.writeFile(args.output, JSON.stringify(deduped));
  if (args["dry-run"]) return;
  await upsertRows({
    supabase,
    table: "star_ratings_by_county",
    rows: deduped,
    onConflict: "contract_id,county_fips,plan_year",
  });
  console.log(`star_ratings_by_county complete: ${deduped.length} rows`);
  const { count, error: countError } = await supabase.from("star_ratings_by_county")
    .select("id", { count: "exact", head: true }).eq("plan_year", planYear);
  if (countError) throw countError;
  if (count !== deduped.length) throw new Error(`Post-load count mismatch: expected ${deduped.length}, found ${count}`);
  for (const state of ["NJ", "PA"]) {
    const actual = [];
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await supabase.from("star_ratings_by_county")
        .select("contract_id,county_fips,county_name,state_code,overall_star_rating")
        .eq("plan_year", planYear).eq("state_code", state)
        .order("id").range(offset, offset + 999);
      if (error) throw error;
      actual.push(...data);
      if (data.length < 1000) break;
    }
    const expected = deduped.filter(row => row.state_code === state);
    const key = row => `${row.contract_id}:${row.county_fips}`;
    const expectedByKey = new Map(expected.map(row => [key(row), row]));
    if (actual.length !== expected.length || actual.some(row => {
      const source = expectedByKey.get(key(row));
      return !source || row.overall_star_rating !== source.overall_star_rating || row.county_name !== source.county_name;
    })) throw new Error(`${state} post-load verification failed`);
    console.log(`Verified ${state}: ${actual.length} rows across ${new Set(actual.map(row => row.county_fips)).size} counties; all ratings match 2027 Overall and CY2027 coverage`);
    for (const county of ["Burlington", "Camden", "Gloucester", "Philadelphia", "Bucks", "Montgomery"]) {
      const rows = actual.filter(row => row.county_name === county);
      if (rows.length) console.log(`${county}, ${state}: ${rows.length} contracts, ratings ${Math.min(...rows.map(row => row.overall_star_rating))}–${Math.max(...rows.map(row => row.overall_star_rating))}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
