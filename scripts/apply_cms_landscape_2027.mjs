/** Apply the CY2027 migration using a SQL-capable Postgres connection. */
import fs from "node:fs/promises";
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString && !password) {
  throw new Error("Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD locally; the service role API key cannot run DDL");
}
const client = new pg.Client(connectionString
  ? { connectionString, ssl: { rejectUnauthorized: false } }
  : { host: "db.qzjtagnpklaxefwurorc.supabase.co", port: 5432,
      database: "postgres", user: "postgres", password,
      ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(await fs.readFile("supabase/migrations/054_cms_landscape_2027.sql", "utf8"));
  await client.query("COMMIT");
  console.log("Applied CY2027 CMS migration");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
