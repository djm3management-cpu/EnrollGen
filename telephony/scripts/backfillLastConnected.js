import { createClient } from "@supabase/supabase-js";
import { backfillConnections } from "../src/backfillConnections.js";

const args = process.argv.slice(2);
if (args.some(arg => !["--apply", "--dry-run"].includes(arg)) ||
    (args.includes("--apply") && args.includes("--dry-run"))) {
  throw new Error("Usage: node scripts/backfillLastConnected.js [--dry-run | --apply]");
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_TENANT_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEFAULT_TENANT_ID) {
  throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and explicit DEFAULT_TENANT_ID");
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(JSON.stringify(await backfillConnections(db, DEFAULT_TENANT_ID, {
  apply: args.includes("--apply"),
}), null, 2));
