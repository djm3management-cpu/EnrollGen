/** Upload prepared county rows after applying migration 052. Requires service role. */
import fs from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
if (!file) throw new Error("Usage: node --env-file=.env.local scripts/upload_cms_landscape_2027.mjs <prepared.jsonl>");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });
let batch = [];
let total = 0;
async function flush() {
  if (!batch.length) return;
  const { error } = await db.from("cms_plans_py2027").upsert(batch, {
    onConflict: "state_code,county_fips,contract_plan_segment_id",
  });
  if (error) throw error;
  total += batch.length;
  if (total % 10000 < 500) console.log(`Uploaded ${total}`);
  batch = [];
}
for await (const line of readline.createInterface({ input: fs.createReadStream(file) })) {
  const row = JSON.parse(line);
  if (row.plan_year !== 2027) throw new Error("Rejected non-2027 plan row");
  batch.push(row);
  if (batch.length >= 500) await flush();
}
await flush();
const { count, error } = await db.from("cms_plans_py2027").select("id", { head: true, count: "exact" });
if (error) throw error;
console.log(JSON.stringify({ uploaded: total, table_count: count }));
