import {
  cleanText,
  createSupabaseAdminClient,
  getField,
  normalizeCountyFips,
  normalizeZip,
  parseArgs,
  readTabularFile,
  stateFromCountyFips,
  toNumber,
  uniqueRows,
  upsertRows,
} from "./common.js";

async function fetchHudApiRows({ token, year, quarter }) {
  const params = new URLSearchParams({
    type: "2",
    query: "All",
  });
  if (year) params.set("year", String(year));
  if (quarter) params.set("quarter", String(quarter));

  const response = await fetch(`https://www.huduser.gov/hudapi/public/usps?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`HUD USPS API failed ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const data = payload.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) {
    return data.flatMap((item) => item.results || []);
  }
  if (Array.isArray(payload.results)) return payload.results;
  throw new Error("HUD USPS API returned an unexpected response shape.");
}

function buildCountyLookup(rows) {
  const lookup = new Map();
  for (const row of rows || []) {
    const geoid = normalizeCountyFips(
      getField(row, ["GEOID", "COUNTY", "county_fips", "FIPS", "STATEFP COUNTYFP"])
    );
    const state = String(getField(row, ["STATEFP", "statefp"])).replace(/\D/g, "");
    const county = String(getField(row, ["COUNTYFP", "countyfp"])).replace(/\D/g, "");
    const fips = geoid || `${state.padStart(2, "0")}${county.padStart(3, "0")}`;
    const name = cleanText(getField(row, ["NAME", "COUNTYNAME", "county_name", "County Name"]));
    if (fips && name) lookup.set(fips, name);
  }
  return lookup;
}

async function main() {
  const args = parseArgs();
  const hudToken = args["hud-token"] || process.env.HUD_USER_TOKEN;
  const rows = hudToken
    ? await fetchHudApiRows({
        token: hudToken,
        year: args.year,
        quarter: args.quarter,
      })
    : await readTabularFile({
        file: args.file,
        url: args.url,
        sheet: args.sheet,
      });
  const countyRows = args["county-file"]
    ? await readTabularFile({ file: args["county-file"], sheet: args["county-sheet"] })
    : [];
  const countyLookup = buildCountyLookup(countyRows);

  const records = rows
    .map((row) => {
      const zip = normalizeZip(getField(row, ["ZIP", "zip", "Zip Code"]));
      const countyFips = normalizeCountyFips(
        getField(row, ["COUNTY", "county", "county_fips", "County FIPS", "geoid"])
      );
      if (zip.length !== 5 || countyFips.length !== 5) return null;
      const state = stateFromCountyFips(countyFips);
      return {
        zip,
        county_fips: countyFips,
        county_name:
          cleanText(getField(row, ["COUNTY_NAME", "county_name", "County Name"])) ||
          countyLookup.get(countyFips) ||
          null,
        state_code: cleanText(getField(row, ["STATE", "STATE_CODE", "state_code"])) || state.state_code,
        state_name: cleanText(getField(row, ["STATE_NAME", "state_name"])) || state.state_name,
        residential_ratio: toNumber(getField(row, ["RES_RATIO", "res_ratio"])) ?? 1,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  const deduped = uniqueRows(records, (row) => `${row.zip}:${row.county_fips}`);
  const supabase = await createSupabaseAdminClient();
  await upsertRows({
    supabase,
    table: "zip_county_crosswalk",
    rows: deduped,
    onConflict: "zip,county_fips",
  });
  console.log(`zip_county_crosswalk complete: ${deduped.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
