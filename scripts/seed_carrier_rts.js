import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "..",
  "docs",
  "NGHS_Master_Carrier_Matrix_RTS_Tracker.csv"
);

const AGENTS = [
  {
    csvName: "Mike Shiomos",
    agent_name: "Michael Shiomos",
    agent_slug: "mike_shiomos",
    agent_npn: "20574678",
  },
  {
    csvName: "Mark Endres",
    agent_name: "Mark Endres",
    agent_slug: "mark_endres",
    agent_npn: "20856361",
  },
  {
    csvName: "Dylan Maria",
    agent_name: "Dylan Maria",
    agent_slug: "dylan_maria",
    agent_npn: "22167358",
  },
];

function requiredEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) {
    throw new Error(
      `Missing ${name}${fallbackName ? ` (or ${fallbackName})` : ""}.`
    );
  }
  return value;
}

function clean(value) {
  return String(value ?? "").trim();
}

function buildRows(records, agents) {
  return records.flatMap((record, index) => {
    const channel = clean(record.Channel);
    const carrier = clean(record.Carrier);
    const productLine = clean(record["Product Line"]);

    if (!channel || !carrier || !productLine) {
      throw new Error(
        `CSV row ${index + 2} must include Channel, Carrier, and Product Line.`
      );
    }

    return AGENTS.map((agent) => ({
      channel,
      carrier,
      product_line: productLine,
      agent_name: agent.agent_name,
      agent_npn: agent.agent_npn,
      clerk_user_id: agent.clerk_user_id,
      status: clean(record[`${agent.csvName} - Status`]),
      states: clean(record[`${agent.csvName} - States`]),
      cert_date: clean(record[`${agent.csvName} - Cert Date`]),
      notes: clean(record[`${agent.csvName} - Notes`]),
    }));
  });
}

async function main() {
  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV_PATH);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const parsed = Papa.parse(fs.readFileSync(csvPath, "utf8"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length) {
    const details = parsed.errors
      .slice(0, 5)
      .map((error) => `row ${Number(error.row) + 2}: ${error.message}`)
      .join("; ");
    throw new Error(`Unable to parse CSV: ${details}`);
  }

  const supabase = createClient(
    requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: tenantAgents, error: agentError } = await supabase
    .from("tenant_agents")
    .select("agent_slug, clerk_user_id")
    .in("agent_slug", AGENTS.map((agent) => agent.agent_slug));
  if (agentError) throw agentError;

  const rosterBySlug = new Map(
    (tenantAgents || []).map((agent) => [clean(agent.agent_slug), agent])
  );
  const agents = AGENTS.map((agent) => {
    const rosterAgent = rosterBySlug.get(agent.agent_slug);
    if (!rosterAgent?.clerk_user_id) {
      throw new Error(
        `tenant_agents is missing a Clerk identity for agent_slug ${agent.agent_slug}.`
      );
    }
    return {
      ...agent,
      clerk_user_id: rosterAgent.clerk_user_id,
    };
  });
  const rows = buildRows(parsed.data, agents);

  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const { error } = await supabase.from("carrier_rts").upsert(batch, {
      onConflict: "channel,carrier,product_line,agent_name",
    });
    if (error) throw error;
  }

  console.log(
    `Seeded ${rows.length} agent records from ${parsed.data.length} carrier rows.`
  );
}

main().catch((error) => {
  console.error(`[seed_carrier_rts] ${error.message || error}`);
  process.exitCode = 1;
});
