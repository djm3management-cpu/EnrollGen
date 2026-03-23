const { Client } = require("pg");
const fs = require("fs");

const CSV_PATH = process.argv[2];
const TABLE = process.argv[3];

if (!CSV_PATH || !TABLE) {
  console.error("Usage: node upload_sbe_plans.cjs <csv_path> <table_name>");
  process.exit(1);
}

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

function toColumnName(header) {
  return header
    .trim()
    .replace(/[^a-zA-Z0-9 _]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .substring(0, 63);
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

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const rawHeaders = parseCSVLine(headerLine);
  const columns = rawHeaders.map(toColumnName);
  const total = lines.length - 1;

  // Fix empty / duplicate column names
  for (let i = 0; i < columns.length; i++) {
    if (!columns[i]) columns[i] = `col_${i}`;
  }
  const seen = {};
  for (let i = 0; i < columns.length; i++) {
    const base = columns[i];
    if (seen[base] !== undefined) { seen[base]++; columns[i] = `${base}_${seen[base]}`; }
    else seen[base] = 0;
  }

  console.log(`[${TABLE}] ${columns.length} columns, ${total} rows`);

  // Drop + create
  await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
  const colDefs = columns.map((c) => `"${c}" TEXT`).join(", ");
  await client.query(`CREATE TABLE ${TABLE} (id BIGSERIAL PRIMARY KEY, ${colDefs})`);

  // Batch insert — keep under 65535 param limit
  const maxBatch = Math.floor(65535 / columns.length);
  const BATCH = Math.min(maxBatch, 500);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let inserted = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i += BATCH) {
    const end = Math.min(i + BATCH, lines.length);
    const rows = [];
    const vals = [];
    let paramIdx = 1;

    for (let j = i; j < end; j++) {
      const fields = parseCSVLine(lines[j]);
      const placeholders = [];
      for (let k = 0; k < columns.length; k++) {
        placeholders.push(`$${paramIdx++}`);
        const val = k < fields.length ? fields[k].trim() : "";
        vals.push(val || null);
      }
      rows.push(`(${placeholders.join(",")})`);
    }

    if (rows.length === 0) continue;

    try {
      await client.query(`INSERT INTO ${TABLE} (${colList}) VALUES ${rows.join(",")}`, vals);
      inserted += rows.length;
    } catch (e) {
      errors += rows.length;
      if (errors <= 3) console.error(`  Batch error:`, e.message.substring(0, 300));
    }
  }

  // RLS + policy
  await client.query(`ALTER TABLE public.${TABLE} ENABLE ROW LEVEL SECURITY`);
  await client.query(`CREATE POLICY "anon_read_${TABLE}" ON public.${TABLE} FOR SELECT USING (true)`);

  const r = await client.query(`SELECT count(*) FROM ${TABLE}`);
  console.log(`[${TABLE}] Done — ${inserted} inserted, ${errors} errors, verified: ${r.rows[0].count} rows. RLS enabled.`);

  await client.end();
})().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
