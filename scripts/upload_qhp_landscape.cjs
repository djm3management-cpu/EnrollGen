const { Client } = require("pg");
const fs = require("fs");

const CSV_PATH =
  process.argv[2] ||
  "C:/Users/Michael/Downloads/QHP_Landscape_PY2026_Individual_Medical.csv";
const TABLE = "qhp_landscape_2026";
// Postgres max params = 65535. With ~149 columns, max rows/batch ≈ 439.
const BATCH = 400;

function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function toColumnName(header) {
  // Sanitize header → lowercase snake_case column name
  return header
    .trim()
    .replace(/[^a-zA-Z0-9 _]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .substring(0, 63); // Postgres identifier limit
}

(async () => {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const client = new Client({
    host: "db.qzjtagnpklaxefwurorc.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected to Supabase Postgres");

  // Read file — skip metadata row(s) before the real header
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const allLines = raw.split(/\r?\n/).filter((l) => l.trim());

  // Find the header row: first line starting with "State Code"
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allLines.length); i++) {
    const clean = allLines[i].replace(/^\uFEFF/, "");
    if (clean.startsWith("State Code") || clean.startsWith('"State Code')) {
      headerIdx = i;
      break;
    }
  }
  const lines = allLines.slice(headerIdx);
  const headerLine = lines[0].replace(/^\uFEFF/, ""); // strip BOM
  const rawHeaders = parseCSVLine(headerLine);
  const columns = rawHeaders.map(toColumnName);
  const total = lines.length - 1;
  console.log(`Skipped ${headerIdx} metadata row(s)`);

  console.log(`${columns.length} columns, ${total} rows`);
  console.log(`First 5 columns: ${columns.slice(0, 5).join(", ")}`);

  // Replace empty column names and make all unique
  for (let i = 0; i < columns.length; i++) {
    if (!columns[i]) columns[i] = `col_${i}`;
  }
  const seen = {};
  for (let i = 0; i < columns.length; i++) {
    const base = columns[i];
    if (seen[base] !== undefined) {
      seen[base]++;
      columns[i] = `${base}_${seen[base]}`;
    } else {
      seen[base] = 0;
    }
  }

  // Drop + create table (all TEXT columns)
  await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
  const colDefs = columns.map((c) => `"${c}" TEXT`).join(",\n  ");
  const createSQL = `CREATE TABLE ${TABLE} (\n  id BIGSERIAL PRIMARY KEY,\n  ${colDefs}\n)`;
  await client.query(createSQL);
  console.log(`Created table ${TABLE}`);

  // Batch insert
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let inserted = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 1; i < lines.length; i += BATCH) {
    const end = Math.min(i + BATCH, lines.length);
    const rows = [];
    const vals = [];
    let paramIdx = 1;

    for (let j = i; j < end; j++) {
      const fields = parseCSVLine(lines[j]);
      // Pad or trim to match header count
      const placeholders = [];
      for (let k = 0; k < columns.length; k++) {
        placeholders.push(`$${paramIdx++}`);
        const val = k < fields.length ? fields[k].trim() : "";
        vals.push(val || null);
      }
      rows.push(`(${placeholders.join(",")})`);
    }

    if (rows.length === 0) continue;

    const sql = `INSERT INTO ${TABLE} (${colList}) VALUES ${rows.join(",")}`;
    try {
      await client.query(sql, vals);
      inserted += rows.length;
    } catch (e) {
      errors += rows.length;
      if (errors <= 3)
        console.error(`Batch error (rows ${i}-${end}):`, e.message.substring(0, 500));
      if (errors >= 2000) { console.error("Too many errors, aborting"); await client.end(); process.exit(1); }
    }

    if (inserted % 10000 < BATCH || i + BATCH >= lines.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = (((inserted + errors) / total) * 100).toFixed(1);
      console.log(
        `${inserted.toLocaleString()} inserted, ${errors} errors (${pct}%) — ${elapsed}s`
      );
    }
  }

  // Verify
  const r = await client.query(`SELECT count(*) FROM ${TABLE}`);
  console.log(`\nDone! Final row count: ${r.rows[0].count}`);

  // Show sample data
  const sample = await client.query(`SELECT * FROM ${TABLE} LIMIT 1`);
  if (sample.rows.length) {
    console.log("\nSample row (first 5 fields):");
    const keys = Object.keys(sample.rows[0]).slice(0, 6); // id + 5 cols
    keys.forEach((k) => console.log(`  ${k}: ${sample.rows[0][k]}`));
  }

  await client.end();
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
