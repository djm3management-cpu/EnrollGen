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
  toIsoDate,
  uniqueRows,
  upsertRows,
} from "./common.js";

function contractFrom(row, prefix) {
  return cleanText(
    getField(row, [
      `${prefix} Contract ID`,
      `${prefix} Contract Number`,
      `${prefix}_contract_id`,
      prefix === "Old" ? "Previous Contract ID" : "Current Contract ID",
      prefix === "Old" ? "Previous Contract Number" : "Current Contract Number",
      prefix === "Old" ? "PREVIOUS_CONTRACT_ID" : "CURRENT_CONTRACT_ID",
      `${prefix} Contract`,
      prefix === "Old" ? "Contract ID" : "New Contract ID",
    ])
  );
}

function planIdFrom(row, prefix) {
  const value = getField(row, [
    `${prefix} Plan ID`,
    `${prefix} Plan Number`,
    `${prefix}_plan_id`,
    prefix === "Old" ? "Previous Plan ID" : "Current Plan ID",
    prefix === "Old" ? "Previous Plan Number" : "Current Plan Number",
    prefix === "Old" ? "PREVIOUS_PLAN_ID" : "CURRENT_PLAN_ID",
    prefix === "Old" ? "Plan ID" : "New Plan ID",
  ]);
  const raw = String(value ?? "").replace(/\.0$/, "").trim();
  return raw ? raw.padStart(3, "0") : null;
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
    getField(row, ["State Territory Abbreviation", "State", "state_code", "State Abbreviation"])
  );
  const countyName = cleanText(
    getField(row, ["County Name", "County", "county_name", "Service Area County"])
  );
  return resolveCountyEntries(countyLookup, { stateCode, countyName });
}

function serviceContractFrom(row) {
  return (
    contractFrom(row, "Old") ||
    contractFrom(row, "Current") ||
    cleanText(getField(row, ["Contract ID", "Contract Number", "contract_id", "Contract"]))
  );
}

function servicePlanIdFrom(row) {
  return planIdFrom(row, "Old") || planIdFrom(row, "Current") || planIdFrom(row, "");
}

function buildServiceAreaMap(rows, countyLookup) {
  const map = new Map();
  for (const row of rows || []) {
    const contractId = serviceContractFrom(row);
    const planId = servicePlanIdFrom(row);
    const countyEntries = extractCountyEntries(row, countyLookup);
    if (!contractId || !countyEntries.length) continue;
    const key = `${contractId}:${planId || ""}`;
    const list = map.get(key) || [];
    list.push(...countyEntries);
    map.set(key, list);
  }
  return map;
}

function terminationType(row, newContractId, newPlanId) {
  const status = String(
    getField(row, ["Status", "Crosswalk Type", "Reason", "termination_type"])
  ).toLowerCase();
  if (status.includes("terminat") || status.includes("non-renew")) return "terminated";
  if (/\bsar\b/.test(status) || status.includes("service area reduction")) {
    return "service_area_reduction";
  }
  if (status.includes("consolidat")) return "consolidated";
  if (!newContractId && !newPlanId) return "terminated";
  return null;
}

async function main() {
  const args = parseArgs();
  if (!args["service-area-file"] && !args["service-area-url"]) {
    throw new Error("Provide --service-area-file or --service-area-url.");
  }

  const planYear = Number(args.year || 2026);
  const defaultEffectiveDate = args.effective || `${planYear}-01-01`;
  const rows = await readTabularFile({
    file: args.file,
    url: args.url,
    sheet: args.sheet,
    headerIncludes: "PREVIOUS_CONTRACT_ID",
  });
  const countyLookup = await loadCountyLookup({
    file: args["county-reference-file"],
    url: args["county-reference-url"],
  });
  const serviceMap = buildServiceAreaMap(
    await readTabularFile({
      file: args["service-area-file"],
      url: args["service-area-url"],
      sheet: args["service-area-sheet"],
    }),
    countyLookup
  );

  let skippedNoCounty = 0;
  const records = [];

  for (const row of rows) {
    const oldContractId = contractFrom(row, "Old");
    const oldPlanId = planIdFrom(row, "Old");
    const newContractId = contractFrom(row, "New");
    const newPlanId = planIdFrom(row, "New");
    const type = terminationType(row, newContractId, newPlanId);
    if (!oldContractId || !type) continue;

    const directServiceAreas = extractCountyEntries(row, countyLookup);
    const serviceAreas =
      directServiceAreas.length > 0
        ? directServiceAreas
        : serviceMap.get(`${oldContractId}:${oldPlanId || ""}`) ||
          serviceMap.get(`${oldContractId}:`) ||
          [];

    if (!serviceAreas.length) {
      skippedNoCounty += 1;
      continue;
    }

    for (const area of serviceAreas) {
      records.push({
        old_contract_id: oldContractId,
        old_plan_id: oldPlanId,
        old_plan_name: cleanText(
          getField(row, ["Old Plan Name", "Previous Plan Name", "Plan Name", "old_plan_name"])
        ),
        old_organization_name: cleanText(
          getField(row, ["Old Organization Name", "Organization Name", "old_org"])
        ),
        termination_type: type,
        new_contract_id: newContractId,
        new_plan_id: newPlanId,
        new_plan_name: cleanText(
          getField(row, ["New Plan Name", "Current Plan Name", "new_plan_name"])
        ),
        county_fips: area.county_fips,
        county_name: area.county_name,
        state_code: area.state_code,
        effective_date:
          toIsoDate(getField(row, ["Effective Date", "effective_date"])) || defaultEffectiveDate,
        plan_year: planYear,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const deduped = uniqueRows(
    records,
    (row) =>
      `${row.old_contract_id}:${row.old_plan_id || ""}:${row.county_fips || ""}:${row.plan_year}`
  );
  console.log(`Prepared ${deduped.length} plan_terminations rows`);
  if (args["dry-run"]) return;
  const supabase = await createSupabaseAdminClient();
  await upsertRows({
    supabase,
    table: "plan_terminations",
    rows: deduped,
    onConflict: "old_contract_id,old_plan_id,county_fips,plan_year",
  });
  console.log(`plan_terminations complete: ${deduped.length} rows`);
  if (skippedNoCounty) {
    console.warn(`Skipped ${skippedNoCounty} crosswalk rows without county FIPS mapping.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
