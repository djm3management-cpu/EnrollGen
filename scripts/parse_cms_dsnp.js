/** Validate and load the CMS CY2027 Integrated D-SNPs List. Never infer EAE/MCO. */
import path from "node:path";
import { pathToFileURL } from "node:url";
import XLSX from "xlsx";
import pg from "pg";
import { loadLocalEnv, parseArgs } from "./sep-data/common.js";

const clean = (value) => String(value ?? "").trim();
const required = ["Contract ID", "Plan ID", "Legal Entity Name", "State", "Applicable Integrated Plan"];

export function parseDsnpWorkbook(workbook, { year = 2027, sheet, live = false, fileName = "" } = {}) {
  year = Number(year);
  if (!Number.isInteger(year) || (live && (year !== 2027 || !/2027/.test(fileName)))) {
    throw new Error("Live D-SNP alignment ingest requires PY2027 and a filename containing 2027.");
  }
  const sheetName = sheet || workbook.SheetNames[0];
  if (!workbook.Sheets[sheetName]) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const integrationHeader = headers.includes("D-SNP Integration Status") ? "D-SNP Integration Status" : "Integration Status";
  const missing = [...required, integrationHeader].filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CMS Integrated D-SNP layout changed. Missing: ${missing.join(", ")}. Found: ${headers.join(", ")}`);
  const sheetYear = sheetName.match(/\b20\d{2}\b/)?.[0];
  if (sheetYear && Number(sheetYear) !== year) throw new Error(`Sheet year ${sheetYear}; expected ${year}.`);
  const mapped = new Map();
  for (const [index, row] of rows.entries()) {
    if (Object.values(row).every((value) => !clean(value))) continue;
    const state = clean(row.State).toUpperCase();
    const contractId = clean(row["Contract ID"]).toUpperCase();
    const rawPlanId = clean(row["Plan ID"]).replace(/\.0$/, "");
    const legalName = clean(row["Legal Entity Name"]);
    if (!/^[A-Z]{2}$/.test(state) || !/^[A-Z]\d{4}$/.test(contractId) || !/^\d{1,3}$/.test(rawPlanId) || !legalName) {
      throw new Error(`Invalid state, contract, plan ID or legal entity in row ${index + 2}; refusing a partial replacement.`);
    }
    const rowYears = [row["Contract Year"], row["Plan Year"]].map(clean).filter(Boolean);
    if (rowYears.some((value) => Number(value) !== year)) throw new Error(`Workbook includes another plan year in row ${index + 2}; expected ${year}.`);
    if (live && !sheetYear && !rowYears.length) throw new Error("Cannot verify PY2027 from the sheet name or each row's year; refusing a live load.");
    const integrationLevel = clean(row[integrationHeader]).toUpperCase();
    const aip = clean(row["Applicable Integrated Plan"]).toUpperCase();
    if (!["CO", "CO-P", "HIDE", "FIDE", "AIP"].includes(integrationLevel) || !["YES", "NO"].includes(aip)) {
      throw new Error(`Unrecognized integration/AIP value in row ${index + 2}.`);
    }
    const eae = clean(row["Exclusive Aligned Enrollment"] || row["EAE Status"]);
    if (eae && !/^(yes|y|true|1|no|n|false|0)$/i.test(eae)) throw new Error(`Unrecognized EAE value in row ${index + 2}.`);
    const plan = {
      state, county: clean(row.County) || null, carrier: legalName,
      planName: clean(row["Plan Name"]) || legalName, contractId, planId: rawPlanId.padStart(3, "0"),
      // Preserve affirmative AIP evidence, including coordination-only AIPs.
      integrationLevel: aip === "YES" && !["HIDE", "FIDE"].includes(integrationLevel) ? "AIP" : integrationLevel,
      eaeStatus: eae ? /^(yes|y|true|1)$/i.test(eae) : null,
      affiliatedMco: clean(row["Affiliated Medicaid Managed Care Organization"]) || null,
    };
    const key = JSON.stringify([state, plan.county, contractId, plan.planId]);
    if (mapped.has(key) && JSON.stringify(mapped.get(key)) !== JSON.stringify(plan)) throw new Error(`Conflicting duplicate plan in row ${index + 2}.`);
    mapped.set(key, plan);
  }
  const plans = [...mapped.values()];
  if (!plans.length) throw new Error("No D-SNP plans parsed; refusing an empty replacement.");
  return { plans, sheetName };
}

export async function loadDsnpPlans(client, plans) {
  try {
    await client.query("BEGIN");
    // Schema changes belong to migration 081; never silently relabel historical data.
    await client.query("SELECT plan_year FROM public.dsnp_eae_lookup LIMIT 0");
    await client.query("DELETE FROM public.dsnp_eae_lookup WHERE plan_year = 2027");
    for (const plan of plans) {
      await client.query(`INSERT INTO public.dsnp_eae_lookup
        (plan_year,state,county,carrier,plan_name,contract_id,plan_id,integration_level,eae_status,affiliated_medicaid_mco)
        VALUES (2027,$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [plan.state, plan.county, plan.carrier, plan.planName, plan.contractId, plan.planId, plan.integrationLevel, plan.eaeStatus, plan.affiliatedMco]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const args = parseArgs();
  if (!args.file) throw new Error("Usage: node scripts/parse_cms_dsnp.js --file PATH [--dry-run]");
  const fileName = path.basename(args.file);
  const { plans, sheetName } = parseDsnpWorkbook(XLSX.readFile(args.file), {
    year: args.year || 2027, sheet: args.sheet, live: !args["dry-run"], fileName,
  });
  console.log(`Parsed ${plans.length} plans from ${fileName} / ${sheetName}. EAE explicitly reported for ${plans.filter((plan) => plan.eaeStatus !== null).length}; affiliated MCO reported for ${plans.filter((plan) => plan.affiliatedMco).length}.`);
  if (args["dry-run"]) return;
  await loadLocalEnv();
  const connectionString = process.env.SUPABASE_DB_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!connectionString && !password) throw new Error("Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD locally. Apply migration 081 before loading.");
  const client = new pg.Client(connectionString
    ? { connectionString, ssl: { rejectUnauthorized: false } }
    : { host: "db.qzjtagnpklaxefwurorc.supabase.co", port: 5432, database: "postgres", user: "postgres", password, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await loadDsnpPlans(client, plans);
    console.log(`Loaded ${plans.length} PY2027 D-SNP integration rows.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
