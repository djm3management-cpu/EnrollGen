import {
  addMonths,
  cleanText,
  createSupabaseAdminClient,
  parseArgs,
  toInteger,
  toIsoDate,
  uniqueRows,
  upsertRows,
} from "./common.js";

const FEMA_BASE_URL = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";

function buildFemaUrl({ since, skip, top }) {
  const params = new URLSearchParams({
    $filter: `declarationDate ge '${since}T00:00:00.000z' and ihProgramDeclared eq true`,
    $select: [
      "disasterNumber",
      "declarationType",
      "state",
      "designatedArea",
      "fipsStateCode",
      "fipsCountyCode",
      "placeCode",
      "incidentType",
      "declarationTitle",
      "incidentBeginDate",
      "incidentEndDate",
      "declarationDate",
      "ihProgramDeclared",
    ].join(","),
    $orderby: "declarationDate desc",
    $top: String(top),
    $skip: String(skip),
  });
  return `${FEMA_BASE_URL}?${params}`;
}

async function fetchAllFemaRows({ since }) {
  const top = 1000;
  const rows = [];
  for (let skip = 0; ; skip += top) {
    const response = await fetch(buildFemaUrl({ since, skip, top }));
    if (!response.ok) throw new Error(`FEMA API failed: ${response.status}`);
    const data = await response.json();
    const page = data.DisasterDeclarationsSummaries || [];
    rows.push(...page);
    console.log(`FEMA rows fetched: ${rows.length}`);
    if (page.length < top) break;
  }
  return rows;
}

function countyFipsFrom(row) {
  const state = String(row.fipsStateCode ?? "").replace(/\D/g, "").padStart(2, "0");
  const county = String(row.fipsCountyCode ?? "").replace(/\D/g, "").padStart(3, "0");
  if (!state.trim() || !county.trim()) return "";
  return `${state}${county}`;
}

async function main() {
  const args = parseArgs();
  const since = args.since || "2024-01-01";
  const today = new Date().toISOString().slice(0, 10);
  const femaRows = await fetchAllFemaRows({ since });

  const records = femaRows
    .map((row) => {
      if (row.ihProgramDeclared !== true) return null;
      const countyFips = countyFipsFrom(row);
      if (countyFips.length !== 5) return null;
      const incidentEndDate = toIsoDate(row.incidentEndDate);
      const declarationDate = toIsoDate(row.declarationDate);
      const sepEndDate = addMonths(incidentEndDate || declarationDate, 2);
      if (!sepEndDate || sepEndDate < today) return null;

      return {
        disaster_number: toInteger(row.disasterNumber),
        declaration_type: cleanText(row.declarationType),
        state_code: cleanText(row.state),
        county_fips: countyFips,
        county_name: cleanText(row.designatedArea),
        incident_type: cleanText(row.incidentType),
        declaration_title: cleanText(row.declarationTitle),
        incident_begin_date: toIsoDate(row.incidentBeginDate),
        incident_end_date: incidentEndDate,
        declaration_date: declarationDate,
        ia_designated: true,
        sep_end_date: sepEndDate,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  const deduped = uniqueRows(
    records,
    (row) => `${row.disaster_number}:${row.county_fips}`
  );
  const supabase = await createSupabaseAdminClient();
  await upsertRows({
    supabase,
    table: "fema_disasters",
    rows: deduped,
    onConflict: "disaster_number,county_fips",
  });
  console.log(`fema_disasters complete: ${deduped.length} active IA rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
