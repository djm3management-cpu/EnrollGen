/** Verify live PY2027 counts and absence of PY2026 Medicare rows. */
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString && !password) throw new Error("Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD locally");
const client = new pg.Client(connectionString
  ? { connectionString, ssl: { rejectUnauthorized: false } }
  : { host: "db.qzjtagnpklaxefwurorc.supabase.co", port: 5432,
      database: "postgres", user: "postgres", password,
      ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const checks = {
    total: "SELECT count(*)::integer AS rows FROM public.cms_plans_py2027",
    by_state: "SELECT state_code, count(*)::integer AS rows FROM public.cms_plans_py2027 GROUP BY state_code ORDER BY state_code",
    by_category: "SELECT category, count(*)::integer AS rows FROM public.cms_plans_py2027 GROUP BY category ORDER BY category",
    spot: "SELECT state_code, county_name, county_fips, category, count(*)::integer AS rows FROM public.cms_plans_py2027 WHERE (state_code='NJ' AND county_name IN ('Burlington','Camden')) OR (state_code='PA' AND county_name='Northampton') GROUP BY state_code,county_name,county_fips,category ORDER BY state_code,county_name,category",
    embedded: "SELECT count(*)::integer AS rows FROM public.cms_plan_embeddings_py2027",
    old_tables: "SELECT to_regclass('public.\"cms_plans_PY2026\"') AS quoted, to_regclass('public.cms_plans_py2026') AS unquoted",
    old_snp: "SELECT count(*)::integer AS rows FROM public.snp_plans_by_county WHERE plan_year=2026",
    old_stars: "SELECT count(*)::integer AS rows FROM public.star_ratings_by_county WHERE plan_year=2026",
    old_terminations: "SELECT count(*)::integer AS rows FROM public.plan_terminations WHERE plan_year=2026",
    old_dsnp_eae: "SELECT count(*)::integer AS rows FROM public.dsnp_eae_lookup",
    old_vectors: "SELECT count(*)::integer AS rows FROM public.cms_plan_embeddings_py2027 WHERE plan_year<>2027",
  };
  const report = {};
  for (const [name, sql] of Object.entries(checks)) report[name] = (await client.query(sql)).rows;
  console.log(JSON.stringify(report, null, 2));
  const expected = 158280;
  if (report.total[0].rows !== expected || report.embedded[0].rows !== expected ||
      report.old_tables[0].quoted || report.old_tables[0].unquoted ||
      ["old_snp", "old_stars", "old_terminations", "old_dsnp_eae", "old_vectors"].some(name => report[name][0].rows !== 0)) {
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
