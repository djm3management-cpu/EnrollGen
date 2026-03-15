/*
  CMS / Supabase integration for SEP Lookup.
  Fetches county lists and plan data from cms_plans_PY2026.
*/

import { supabase } from "./supabase";

export async function fetchCountiesForState(state) {
  const { data, error } = await supabase.rpc("get_counties_for_state", { p_state: state });
  if (error) {
    console.error("Counties fetch error:", error);
    return [];
  }
  return (data || []).map((r) => r.county_name);
}

export async function fetchPlansFromSupabase(state, county) {
  const { data, error } = await supabase.rpc("get_plans_for_county", { p_state: state, p_county: county });
  if (error) {
    console.error("Plans fetch error:", error);
    return [];
  }
  return data || [];
}

export async function fetchCountyPlanCounts(state) {
  const { data, error } = await supabase.rpc("get_county_plan_counts", { p_state: state });
  if (error) {
    console.error("County plan counts error:", error);
    return {};
  }
  const counts = {};
  for (const row of data || []) {
    counts[row.county_name] = Number(row.plan_count);
  }
  return counts;
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
