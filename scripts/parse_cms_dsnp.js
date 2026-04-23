import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const NGHS_STATES = new Set([
  "NJ",
  "AL",
  "AR",
  "AZ",
  "DE",
  "FL",
  "GA",
  "IN",
  "KS",
  "KY",
  "MI",
  "MO",
  "MS",
  "NC",
  "NY",
  "OH",
  "PA",
  "SC",
  "TN",
  "TX",
  "VA",
]);

const SOURCE_CANDIDATES = [
  "src/data/cms_2026_integrated_dsnps.xlsx",
  "src/data/cy-2026-integrated-d-snps-list-3.xlsx",
];

const OUTPUT_PATH = "supabase/seeds/004_dsnp_eae_seed.sql";

function resolveSourceFile() {
  for (const relPath of SOURCE_CANDIDATES) {
    const absPath = path.resolve(relPath);
    if (fs.existsSync(absPath)) {
      return absPath;
    }
  }

  console.error("Unable to find the CMS CY 2026 Integrated D-SNP workbook.");
  console.error("Checked:");
  for (const relPath of SOURCE_CANDIDATES) {
    console.error(`- ${path.resolve(relPath)}`);
  }
  process.exit(1);
}

function sqlValue(value) {
  if (value == null || value === "") {
    return "NULL";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function boolValue(value) {
  return value ? "true" : "false";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function mapIntegrationLevel(status, applicableIntegratedPlan) {
  const normalizedStatus = normalizeText(status).toUpperCase();
  const normalizedAip = normalizeText(applicableIntegratedPlan).toUpperCase();

  if (normalizedStatus === "FIDE") {
    return "FIDE";
  }

  if (normalizedStatus === "HIDE") {
    return "HIDE";
  }

  if (normalizedStatus === "CO" && normalizedAip === "YES") {
    return "AIP";
  }

  if (normalizedStatus === "CO") {
    return "CO";
  }

  if (normalizedAip === "YES") {
    return "AIP";
  }

  return normalizedStatus || "CO";
}

function deriveEaeStatus(integrationLevel) {
  return integrationLevel === "FIDE" || integrationLevel === "HIDE";
}

function requireHeaders(headers, requiredHeaders) {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length === 0) {
    return;
  }

  console.error("CMS workbook headers did not match the required mapping.");
  console.error("Missing required headers:");
  for (const header of missing) {
    console.error(`- ${header}`);
  }
  console.error("Found headers:");
  for (const header of headers) {
    console.error(`- ${header}`);
  }
  process.exit(1);
}

function main() {
  const sourceFile = resolveSourceFile();
  const workbook = xlsx.readFile(sourceFile);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];

  console.log(`Source file: ${sourceFile}`);
  console.log(`Sheet: ${firstSheetName}`);
  console.log("Headers:");
  for (const header of headers) {
    console.log(`- ${header}`);
  }

  requireHeaders(headers, [
    "Contract ID",
    "Plan ID",
    "Legal Entity Name",
    "State",
    "Integration Status",
    "Applicable Integrated Plan",
  ]);

  const absentSourceFields = [];
  if (!headers.includes("County")) {
    absentSourceFields.push("County");
  }
  if (!headers.includes("Plan Name")) {
    absentSourceFields.push("Plan Name");
  }
  if (!headers.includes("Affiliated Medicaid Managed Care Organization")) {
    absentSourceFields.push("Affiliated Medicaid Managed Care Organization");
  }

  if (absentSourceFields.length > 0) {
    console.log("Source fields not present in this CMS workbook:");
    for (const field of absentSourceFields) {
      console.log(`- ${field}`);
    }
    console.log(
      "The generated seed will leave county and affiliated_medicaid_mco NULL and will use Legal Entity Name for carrier/plan_name because the workbook does not expose plan marketing names."
    );
  }

  const filteredRows = [];
  const seen = new Set();
  const integrationCounts = {};
  const stateCounts = {};

  for (const row of rows) {
    const state = normalizeText(row["State"]).toUpperCase();
    if (!NGHS_STATES.has(state)) {
      continue;
    }

    const contractId = normalizeText(row["Contract ID"]);
    const planId = normalizeText(row["Plan ID"]);
    const legalEntityName = normalizeText(row["Legal Entity Name"]);
    const integrationLevel = mapIntegrationLevel(
      row["Integration Status"],
      row["Applicable Integrated Plan"]
    );
    const eaeStatus = deriveEaeStatus(integrationLevel);
    const dedupeKey = [state, contractId, planId, integrationLevel].join("|");

    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    filteredRows.push({
      state,
      county: null,
      carrier: legalEntityName,
      plan_name: legalEntityName,
      contract_id: contractId,
      plan_id: planId,
      integration_level: integrationLevel,
      eae_status: eaeStatus,
      affiliated_medicaid_mco: null,
    });

    integrationCounts[integrationLevel] = (integrationCounts[integrationLevel] || 0) + 1;
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }

  const lines = [
    "-- Generated by scripts/parse_cms_dsnp.js from the CMS CY 2026 Integrated D-SNPs workbook.",
    "-- County and affiliated Medicaid MCO are NULL because the source workbook does not expose those columns.",
    "DELETE FROM dsnp_eae_lookup;",
    "",
  ];

  for (const row of filteredRows) {
    lines.push(
      "INSERT INTO dsnp_eae_lookup (" +
        "state, county, carrier, plan_name, contract_id, plan_id, integration_level, eae_status, affiliated_medicaid_mco" +
        ") VALUES (" +
        [
          sqlValue(row.state),
          sqlValue(row.county),
          sqlValue(row.carrier),
          sqlValue(row.plan_name),
          sqlValue(row.contract_id),
          sqlValue(row.plan_id),
          sqlValue(row.integration_level),
          boolValue(row.eae_status),
          sqlValue(row.affiliated_medicaid_mco),
        ].join(", ") +
        ");"
    );
  }

  fs.writeFileSync(path.resolve(OUTPUT_PATH), `${lines.join("\n")}\n`, "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Total rows parsed: ${rows.length}`);
  console.log(`Rows after state filter: ${filteredRows.length}`);
  console.log("Count by integration level:");
  for (const key of Object.keys(integrationCounts).sort()) {
    console.log(`- ${key}: ${integrationCounts[key]}`);
  }
  console.log("Count by state:");
  for (const key of Object.keys(stateCounts).sort()) {
    console.log(`- ${key}: ${stateCounts[key]}`);
  }
}

main();
