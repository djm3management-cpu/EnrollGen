/**
 * Upload CMS Landscape CSV data to Supabase cms_plans_PY2026 table.
 * Run: node scripts/upload_cms_data.js /path/to/CY2026_Landscape.csv
 *
 * Requires the table to already exist (run create_cms_table.sql first).
 * Set SUPABASE_URL and either SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BATCH_SIZE = 500;
const TABLE = "cms_plans_PY2026";

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY.");
  }
}

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
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  requireSupabaseConfig();

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node upload_cms_data.js <path-to-csv>");
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());

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
      const pct = (((inserted + errors) / total) * 100).toFixed(1);
      console.log(`Progress: ${inserted} inserted, ${errors} errors (${pct}%)`);
    }
  }

  console.log(`\nDone! ${inserted} rows inserted, ${errors} errors.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
