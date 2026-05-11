/*
  CMS / Supabase integration for SEP Lookup.
  Fetches county lists and plan data from cms_plans_PY2026.
  Prefer RPC helpers when available, but fall back to direct table queries
  so the county grid still works if the active Supabase project is missing
  those functions.
*/

import { supabaseCms } from "./supabase";

const CMS_TABLE = "cms_plans_PY2026";
const PAGE_SIZE = 5000;
const CMS_SUPABASE_ENABLED =
  import.meta.env.VITE_ENABLE_CMS_SUPABASE === "true" ||
  Boolean(import.meta.env.VITE_SUPABASE_CMS_URL && import.meta.env.VITE_SUPABASE_CMS_ANON_KEY);
const CMS_RPC_ENABLED = import.meta.env.VITE_ENABLE_CMS_RPC === "true";
let cmsUnavailable = false;
let fallbackCountiesByState = null;
let fallbackCountiesByStatePromise = null;

function cleanCountyName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+County$/i, "")
    .replace(/\s+Parish$/i, "");
}

async function getFallbackCountiesByState() {
  if (fallbackCountiesByState) return fallbackCountiesByState;

  if (!fallbackCountiesByStatePromise) {
    fallbackCountiesByStatePromise = import(
      "../../scripts/sep-data/cache/national_county2020.txt?raw"
    ).then(({ default: nationalCountyText }) => {
      const countiesByState = nationalCountyText
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .reduce((nextCountiesByState, line) => {
          const [state, , , , countyName] = line.split("|");
          const county = cleanCountyName(countyName);
          if (!state || !county) return nextCountiesByState;

          if (!nextCountiesByState[state]) nextCountiesByState[state] = [];
          nextCountiesByState[state].push(county);
          return nextCountiesByState;
        }, {});

      for (const counties of Object.values(countiesByState)) {
        counties.sort((a, b) => a.localeCompare(b));
      }

      fallbackCountiesByState = countiesByState;
      return countiesByState;
    });
  }

  return fallbackCountiesByStatePromise;
}

async function getFallbackCountiesForState(state) {
  const countiesByState = await getFallbackCountiesByState();
  return countiesByState[state] || [];
}

function isMissingCmsResource(error) {
  return error?.code === "PGRST202" || error?.code === "PGRST205";
}

function markCmsUnavailable(error) {
  if (isMissingCmsResource(error)) {
    cmsUnavailable = true;
    return true;
  }
  return false;
}

function shouldUseCmsSupabase() {
  return CMS_SUPABASE_ENABLED && !cmsUnavailable;
}

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
    supabaseCms
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
    supabaseCms
      .from(CMS_TABLE)
      .select("*")
      .eq("State Territory Abbreviation", state)
      .in("County Name", [county, "All Counties"])
      .neq("Sanctioned Plan", "Yes")
      .range(from, to)
  );
}

function applyPlanSearchArea(query, state, county) {
  let nextQuery = query;
  if (state) nextQuery = nextQuery.eq("State Territory Abbreviation", state);
  if (county) nextQuery = nextQuery.in("County Name", [county, "All Counties"]);
  return nextQuery;
}

function normalizePlanSearchTerm(term) {
  return String(term || "").trim().slice(0, 80);
}

function parsePlanNumberSearch(term) {
  const upper = normalizePlanSearchTerm(term).toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]/g, "");
  const contract = compact.match(/[A-Z]\d{4}/)?.[0] || "";
  const afterContract = contract ? compact.slice(compact.indexOf(contract) + contract.length) : compact;
  const planId = afterContract.match(/\d{1,3}/)?.[0] || "";

  return {
    raw: upper,
    compact,
    contract,
    planId: planId ? planId.padStart(3, "0").slice(0, 3) : "",
  };
}

function makeSearchBaseQuery() {
  return supabaseCms
    .from(CMS_TABLE)
    .select("*")
    .neq("Sanctioned Plan", "Yes");
}

async function runLimitedPlanQueries(queries, limit) {
  const responses = await Promise.all(queries.map((query) => query.limit(limit)));
  const error = responses.find((response) => response.error)?.error;
  if (error) throw error;
  return responses.flatMap((response) => response.data || []);
}

async function searchPlansDirect({ term, mode = "name", state = "", county = "", limit = 24 }) {
  const cleanTerm = normalizePlanSearchTerm(term);
  if (!cleanTerm) return [];

  const perQueryLimit = Math.max(4, Math.min(Number(limit) || 24, 60));
  const buildAreaQuery = () =>
    applyPlanSearchArea(makeSearchBaseQuery(), state, county);

  if (mode === "number") {
    const parsed = parsePlanNumberSearch(cleanTerm);
    const planIdVariants = parsed.planId
      ? [...new Set([parsed.planId, String(Number(parsed.planId))].filter(Boolean))]
      : [];
    const queries = [];

    if (parsed.contract && parsed.planId) {
      queries.push(
        buildAreaQuery()
          .eq("Contract ID", parsed.contract)
          .in("Plan ID", planIdVariants)
      );
    }

    if (parsed.compact.length >= 4) {
      queries.push(buildAreaQuery().ilike("ContractPlanID", `%${parsed.compact}%`));
      queries.push(buildAreaQuery().ilike("ContractPlanSegmentID", `%${parsed.compact}%`));
    }

    if (parsed.contract) {
      queries.push(buildAreaQuery().ilike("Contract ID", `%${parsed.contract}%`));
    }

    if (parsed.planId && !parsed.contract) {
      queries.push(buildAreaQuery().in("Plan ID", planIdVariants));
    }

    if (!queries.length && cleanTerm.length >= 2) {
      queries.push(buildAreaQuery().ilike("Plan ID", `%${cleanTerm}%`));
    }

    return runLimitedPlanQueries(queries, perQueryLimit);
  }

  const pattern = `%${cleanTerm}%`;
  return runLimitedPlanQueries(
    [
      buildAreaQuery().ilike("Plan Name", pattern),
      buildAreaQuery().ilike("Organization Marketing Name", pattern),
      buildAreaQuery().ilike("Contract Name", pattern),
    ],
    perQueryLimit
  );
}

async function fetchCountyPlanCountsDirect(state) {
  const rows = await fetchPagedRows((from, to) =>
    supabaseCms
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
  if (!shouldUseCmsSupabase()) return await getFallbackCountiesForState(state);

  if (CMS_RPC_ENABLED) {
    const { data, error } = await supabaseCms.rpc("get_counties_for_state", { p_state: state });
    if (!error && data?.length) {
      return data.map((r) => r.county_name).filter(Boolean);
    }

    if (error && !markCmsUnavailable(error)) {
      console.warn("Counties RPC failed, falling back to direct query:", error);
    }
  }

  try {
    const counties = await fetchCountiesDirect(state);
    return counties.length ? counties : await getFallbackCountiesForState(state);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      console.error("Counties fetch error:", fallbackError);
    }
    return await getFallbackCountiesForState(state);
  }
}

export async function fetchPlansFromSupabase(state, county) {
  if (!state || !county) return [];
  if (!shouldUseCmsSupabase()) return [];

  if (CMS_RPC_ENABLED) {
    const { data, error } = await supabaseCms.rpc("get_plans_for_county", { p_state: state, p_county: county });
    if (!error && data?.length) {
      return data;
    }

    if (error && !markCmsUnavailable(error)) {
      console.warn("Plans RPC failed, falling back to direct query:", error);
    }
  }

  try {
    return await fetchPlansDirect(state, county);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      console.error("Plans fetch error:", fallbackError);
    }
    return [];
  }
}

export async function searchCmsPlans({ term, mode = "name", state = "", county = "", limit = 24 } = {}) {
  if (!normalizePlanSearchTerm(term)) return [];
  if (!shouldUseCmsSupabase()) return [];

  try {
    return await searchPlansDirect({ term, mode, state, county, limit });
  } catch (error) {
    if (!markCmsUnavailable(error)) {
      console.error("Plan lookup search error:", error);
    }
    return [];
  }
}

export async function fetchCountyPlanCounts(state) {
  if (!state) return {};
  if (!shouldUseCmsSupabase()) return {};

  if (CMS_RPC_ENABLED) {
    const { data, error } = await supabaseCms.rpc("get_county_plan_counts", { p_state: state });
    if (!error && data?.length) {
      const counts = {};
      for (const row of data) {
        counts[row.county_name] = Number(row.plan_count);
      }
      return counts;
    }

    if (error && !markCmsUnavailable(error)) {
      console.warn("County counts RPC failed, falling back to direct query:", error);
    }
  }

  try {
    return await fetchCountyPlanCountsDirect(state);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      console.error("County plan counts error:", fallbackError);
    }
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
