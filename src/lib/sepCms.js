/*
  CMS / Supabase integration for SEP Lookup.
  Fetches county lists and plan data from cms_plans_PY2026.
  Prefer RPC helpers when available, but fall back to direct table queries
  so the county grid still works if the active Supabase project is missing
  those functions.
*/

import { supabase } from "./supabase";

const CMS_TABLE = "cms_plans_PY2026";
const PAGE_SIZE = 5000;

async function fetchPagedRows(makeQuery) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchCountiesDirect(state) {
  const rows = await fetchPagedRows((from, to) =>
    supabase
      .from(CMS_TABLE)
      .select('"County Name"')
      .eq("State Territory Abbreviation", state)
      .neq("County Name", "All Counties")
      .range(from, to)
  );

  return [...new Set(rows.map((row) => row["County Name"]).filter(Boolean))].sort();
}

async function fetchPlansDirect(state, county) {
  return fetchPagedRows((from, to) =>
    supabase
      .from(CMS_TABLE)
      .select("*")
      .eq("State Territory Abbreviation", state)
      .in("County Name", [county, "All Counties"])
      .neq("Sanctioned Plan", "Yes")
      .range(from, to)
  );
}

async function fetchCountyPlanCountsDirect(state) {
  const rows = await fetchPagedRows((from, to) =>
    supabase
      .from(CMS_TABLE)
      .select('"County Name", "Contract ID", "Plan ID"')
      .eq("State Territory Abbreviation", state)
      .neq("County Name", "All Counties")
      .neq("Sanctioned Plan", "Yes")
      .range(from, to)
  );

  const counts = {};
  const seenByCounty = {};

  for (const row of rows) {
    const county = row["County Name"];
    const key = `${row["Contract ID"]}-${row["Plan ID"]}`;
    if (!county) continue;

    if (!seenByCounty[county]) seenByCounty[county] = new Set();
    if (seenByCounty[county].has(key)) continue;

    seenByCounty[county].add(key);
    counts[county] = (counts[county] || 0) + 1;
  }

  return counts;
}

export async function fetchCountiesForState(state) {
  if (!state) return [];

  const { data, error } = await supabase.rpc("get_counties_for_state", { p_state: state });
  if (!error && data?.length) {
    return data.map((r) => r.county_name).filter(Boolean);
  }

  if (error) {
    console.warn("Counties RPC failed, falling back to direct query:", error);
  }

  try {
    return await fetchCountiesDirect(state);
  } catch (fallbackError) {
    console.error("Counties fetch error:", fallbackError);
    return [];
  }
}

export async function fetchPlansFromSupabase(state, county) {
  if (!state || !county) return [];

  const { data, error } = await supabase.rpc("get_plans_for_county", { p_state: state, p_county: county });
  if (!error && data?.length) {
    return data;
  }

  if (error) {
    console.warn("Plans RPC failed, falling back to direct query:", error);
  }

  try {
    return await fetchPlansDirect(state, county);
  } catch (fallbackError) {
    console.error("Plans fetch error:", fallbackError);
    return [];
  }
}

export async function fetchCountyPlanCounts(state) {
  if (!state) return {};

  const { data, error } = await supabase.rpc("get_county_plan_counts", { p_state: state });
  if (!error && data?.length) {
    const counts = {};
    for (const row of data) {
      counts[row.county_name] = Number(row.plan_count);
    }
    return counts;
  }

  if (error) {
    console.warn("County counts RPC failed, falling back to direct query:", error);
  }

  try {
    return await fetchCountyPlanCountsDirect(state);
  } catch (fallbackError) {
    console.error("County plan counts error:", fallbackError);
    return {};
  }
}

export function mapCarrierKey(parentOrg, contractName, orgMarketing) {
  const all = `${parentOrg} ${contractName} ${orgMarketing}`.toLowerCase();
  if (all.includes("unitedhealth") || all.includes("aarp")) return "uhc";
  if (
    all.includes("cvs") ||
    all.includes("aetna") ||
    all.includes("silverscript")
  )
    return "aetna";
  if (all.includes("humana")) return "humana";
  if (all.includes("centene") || all.includes("wellcare")) return "wellcare";
  if (
    all.includes("blue cross") ||
    all.includes("bluecross") ||
    all.includes("anthem") ||
    all.includes("elevance") ||
    all.includes("highmark") ||
    all.includes("health care service") ||
    all.includes("bcbs") ||
    all.includes("carefirst")
  )
    return "bcbs";
  if (all.includes("cigna")) return "cigna";
  if (all.includes("molina")) return "molina";
  if (all.includes("devoted")) return "devoted";
  if (all.includes("alignment")) return "alignment";
  if (all.includes("kaiser")) return "kaiser";
  if (all.includes("mutual of omaha")) return "mutual";
  return null;
}

export function transformCmsPlan(row) {
  const cid = row["Contract ID"] || "";
  const pbp = String(row["Plan ID"] || "").padStart(3, "0");
  const planName = row["Plan Name"] || "Unknown Plan";
  const planType = row["Plan Type"] || "";
  const snpType = row["SNP Type"] || "";
  const catType = row["Contract Category Type"] || "";
  const parentOrg = row["Parent Organization Name"] || "";
  const contractName = row["Contract Name"] || "";
  const orgMarketing = row["Organization Marketing Name"] || "";

  let stars = null;
  const rawStars =
    row["Overall Star Rating"] || row["Part C Summary Star Rating"] || "";
  if (
    rawStars &&
    rawStars !== "Not enough data available" &&
    rawStars !== "Too new to rate"
  ) {
    stars = parseFloat(rawStars);
    if (isNaN(stars)) stars = null;
  }

  const partCPrem = parseFloat(row["Part C Premium"] || "0") || 0;
  const consolidatedPrem =
    parseFloat(row["Monthly Consolidated Premium (Part C + D)"] || "0") || 0;
  const prem = consolidatedPrem || partCPrem || 0;
  const moopRaw = row["In-Network Maximum Out-of-Pocket (MOOP) Amount"] || "";
  const moop = parseFloat(moopRaw.replace(/[$,]/g, "")) || null;

  let cat = "MA";
  if (catType === "PDP") cat = "PDP";
  else if (catType === "MA-PD" || catType === "SNP") cat = "MAPD";

  let snp = null;
  if (snpType === "Dual-Eligible") snp = "D-SNP";
  else if (snpType === "Chronic or Disabling Condition") snp = "C-SNP";
  else if (snpType === "Institutional") snp = "I-SNP";

  const carrier = mapCarrierKey(parentOrg, contractName, orgMarketing);

  return {
    cid,
    pbp,
    carrier,
    name: planName,
    type: planType || (cat === "PDP" ? "PDP" : "HMO"),
    cat,
    snp,
    stars,
    prem,
    moop,
    partD: catType === "MA-PD" || catType === "PDP" || catType === "SNP",
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: [row["State Territory Abbreviation"] || ""],
    orgName: orgMarketing || contractName || parentOrg,
    countyName: row["County Name"] || "",
  };
}
