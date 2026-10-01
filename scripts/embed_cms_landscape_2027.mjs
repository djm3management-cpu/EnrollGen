/** Embed all PY2027 county plan rows after uploading them.
 * Usage: node --env-file=.env.local scripts/embed_cms_landscape_2027.mjs
 */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.OPENAI_API_KEY) throw new Error("Supabase service role and OpenAI keys required");
const db = createClient(url, key, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pageSize = 200;
let lastId = Number(process.argv[2] || 0);
const endId = Number(process.argv[3] || 0);
let embedded = 0;

function content(row) {
  return [
    `PY2027 ${row.category} plan ${row.contract_plan_segment_id}: ${row.plan_name}`,
    `Carrier: ${row.carrier}. Type: ${row.plan_type}. SNP: ${row.snp_type || "none"}. D-SNP integration: ${row.dsnp_integration_status || "unavailable"}.`,
    `County: ${row.county_name}, ${row.state_code}; FIPS ${row.county_fips}.`,
    `Monthly premium: ${row.monthly_premium ?? "unavailable"}; Part C premium: ${row.part_c_premium ?? "unavailable"}; Part D premium: ${row.part_d_premium ?? "unavailable"}.`,
    `Part D deductible: ${row.part_d_deductible ?? "unavailable"}; in-network MOOP: ${row.in_network_moop ?? "unavailable"}; overall stars: ${row.overall_star_rating ?? "unrated"}.`,
  ].join(" ");
}

for (;;) {
  let query = db.from("cms_plans_py2027")
    .select("id,plan_year,category,state_code,county_name,county_fips,carrier,contract_plan_segment_id,plan_name,plan_type,snp_type,dsnp_integration_status,monthly_premium,part_c_premium,part_d_premium,part_d_deductible,in_network_moop,overall_star_rating")
    .eq("plan_year", 2027).gt("id", lastId).order("id").limit(pageSize);
  if (endId) query = query.lte("id", endId);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows?.length) break;
  const texts = rows.map(content);
  const result = await openai.embeddings.create({ model: "text-embedding-3-small", input: texts });
  if (result.data.length !== rows.length) throw new Error("Embedding count mismatch");
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map((row, j) => ({
      plan_id: row.id, plan_year: 2027, content: texts[i + j],
      embedding: JSON.stringify(result.data[i + j].embedding),
    }));
    const { error: upsertError } = await db.from("cms_plan_embeddings_py2027").upsert(batch);
    if (upsertError) throw upsertError;
  }
  lastId = rows.at(-1).id;
  embedded += rows.length;
  if (embedded % 10000 < pageSize) console.log(`Embedded ${embedded}`);
}
console.log(JSON.stringify({ embedded }));
