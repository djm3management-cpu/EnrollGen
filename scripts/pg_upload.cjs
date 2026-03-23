const { Client } = require("pg");
const fs = require("fs");
// Multi-row INSERT approach

const CSV_PATH = process.argv[2] || "/tmp/CY2026_Landscape/CY2026_Landscape_202603/CY2026_Landscape_202603.csv";
const BATCH = 500;

function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

(async () => {
  const client = new Client({
    host: "db.qzjtagnpklaxefwurorc.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVLine(headerLine);
  const total = lines.length - 1;
  console.log(`${headers.length} columns, ${total} rows to insert`);

  // Build parameterized insert
  const colList = headers.map(h => `"${h}"`).join(", ");
  let inserted = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i += BATCH) {
    const end = Math.min(i + BATCH, lines.length);
    const rows = [];
    const vals = [];
    let paramIdx = 1;

    for (let j = i; j < end; j++) {
      const fields = parseCSVLine(lines[j]);
      if (fields.length < headers.length) continue;
      const placeholders = [];
      for (let k = 0; k < headers.length; k++) {
        placeholders.push(`$${paramIdx++}`);
        vals.push(fields[k] || "");
      }
      rows.push(`(${placeholders.join(",")})`);
    }

    if (rows.length === 0) continue;

    const sql = `INSERT INTO cms_plans_PY2026 (${colList}) VALUES ${rows.join(",")}`;
    try {
      await client.query(sql, vals);
      inserted += rows.length;
    } catch (e) {
      errors += rows.length;
      if (errors <= 3) console.error("Batch error:", e.message.substring(0, 200));
    }

    if (inserted % 10000 < BATCH || i + BATCH >= lines.length) {
      const pct = ((inserted + errors) / total * 100).toFixed(1);
      console.log(`${inserted} inserted, ${errors} errors (${pct}%)`);
    }
  }

  // Verify
  const r = await client.query("SELECT count(*) FROM cms_plans_PY2026");
  console.log(`\nDone! Final row count: ${r.rows[0].count}`);

  // Show state coverage
  const states = await client.query('SELECT DISTINCT "State Territory Abbreviation" FROM cms_plans_PY2026 ORDER BY 1');
  console.log(`States: ${states.rows.map(r => r["State Territory Abbreviation"]).join(", ")}`);

  await client.end();
})().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
