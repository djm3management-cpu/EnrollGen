/**
 * Upload CMS Landscape CSV data to Supabase cms_plans_PY2026 table.
 * Run: node scripts/upload_cms_data.js /path/to/CY2026_Landscape.csv
 *
 * Requires the table to already exist (run create_cms_table.sql first).
 * Uses the anon key by default — set SUPABASE_SERVICE_KEY env var for service role.
 */

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://qzjtagnpklaxefwurorc.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6anRhZ25wa2xheGVmd3Vyb3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODY1NDQsImV4cCI6MjA4ODI2MjU0NH0.HLYREWlaqsMdhGqaoP2T2SP3SgAoxumKGG4aQuBzx4Q";

const BATCH_SIZE = 500;
const TABLE = "cms_plans_PY2026";

function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node upload_cms_data.js <path-to-csv>");
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());

  // Strip BOM from header
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVLine(headerLine);
  console.log(`Columns: ${headers.length}`);
  console.log(`Data rows: ${lines.length - 1}`);

  let inserted = 0;
  let errors = 0;
  const total = lines.length - 1;

  for (let i = 1; i < lines.length; i += BATCH_SIZE) {
    const batch = [];
    const end = Math.min(i + BATCH_SIZE, lines.length);
    for (let j = i; j < end; j++) {
      const vals = parseCSVLine(lines[j]);
      if (vals.length < headers.length) continue;
      const row = {};
      for (let k = 0; k < headers.length; k++) {
        row[headers[k]] = vals[k] || "";
      }
      batch.push(row);
    }

    const { error } = await sb.from(TABLE).insert(batch);
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }

    if ((i - 1) % 5000 === 0 || i + BATCH_SIZE >= lines.length) {
      const pct = ((inserted + errors) / total * 100).toFixed(1);
      console.log(`Progress: ${inserted} inserted, ${errors} errors (${pct}%)`);
    }
  }

  console.log(`\nDone! ${inserted} rows inserted, ${errors} errors.`);
}

main().catch(console.error);
