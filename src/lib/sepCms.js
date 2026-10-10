import { debugLog } from "./debugLog.js";
/*
  CMS / Supabase integration for SEP Lookup.
  Fetches county lists and plan data from the PY2027-only CMS view.
  Prefer RPC helpers when available, but fall back to direct table queries
  so the county grid still works if the active Supabase project is missing
  those functions.
*/

import { supabaseCms } from "./supabase";
import { applyCountyStarRatings } from "./starRatings.js";
import { fetchPagedRows } from "./cmsPaging.js";

const CMS_TABLE = "cms_plans_PY2027";
const CMS_SUPABASE_ENABLED = import.meta.env.VITE_ENABLE_CMS_SUPABASE !== "false";
// Legacy RPC functions are not guaranteed to filter by plan year.
const CMS_RPC_ENABLED = false;
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

async function fetchCountiesDirect(state) {
  const rows = await fetchPagedRows((from, to) =>
    supabaseCms
      .from(CMS_TABLE)
      .select('"County Name"')
      .eq("State Territory Abbreviation", state)
      .neq("County Name", "All Counties")
      .order("County FIPS").order("ContractPlanSegmentID")
      .range(from, to)
  );

  return [...new Set(rows.map((row) => row["County Name"]).filter(Boolean))].sort();
}

async function fetchPlansDirect(state, county) {
  const rows = await fetchPagedRows((from, to) =>
    supabaseCms
      .from(CMS_TABLE)
      .select("*")
      .eq("State Territory Abbreviation", state)
      .in("County Name", [county, "All Counties"])
      .neq("Sanctioned Plan", "Yes")
      .order("County FIPS").order("ContractPlanSegmentID")
      .range(from, to)
  );
  return attachCountyStarRatings(rows);
}

async function attachCountyStarRatings(rows) {
  const contracts = [...new Set(rows.map(row => row['Contract ID']).filter(Boolean))];
  const counties = [...new Set(rows.map(row => row['County FIPS']).filter(Boolean))];
  if (!contracts.length || !counties.length) return rows;
  const ratings = [];
  try {
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await supabaseCms.from('star_ratings_by_county')
        .select('contract_id,county_fips,overall_star_rating')
        .eq('plan_year', 2027).in('contract_id', contracts).in('county_fips', counties)
        .order('id').range(offset, offset + 999);
      if (error) throw error;
      ratings.push(...data);
      if (data.length < 1000) break;
    }
    return applyCountyStarRatings(rows, ratings);
  } catch {
    debugLog('County star rating fetch unavailable');
    return rows;
  }
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
      .select('"County Name", "ContractPlanSegmentID"')
      .eq("State Territory Abbreviation", state)
      .neq("County Name", "All Counties")
      .neq("Sanctioned Plan", "Yes")
      .order("County FIPS").order("ContractPlanSegmentID")
      .range(from, to)
  );

  const counts = {};
  const seenByCounty = {};

  for (const row of rows) {
    const county = row["County Name"];
    const key = row["ContractPlanSegmentID"];
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
      debugLog("Counties RPC failed, falling back to direct query");
    }
  }

  try {
    const counties = await fetchCountiesDirect(state);
    return counties.length ? counties : await getFallbackCountiesForState(state);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      debugLog("Counties fetch error");
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
      debugLog("Plans RPC failed, falling back to direct query");
    }
  }

  try {
    return await fetchPlansDirect(state, county);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      debugLog("Plans fetch error");
    }
    return [];
  }
}

export async function searchCmsPlans({ term, mode = "name", state = "", county = "", limit = 24 } = {}) {
  if (!normalizePlanSearchTerm(term)) return [];
  if (!shouldUseCmsSupabase()) return [];

  try {
    return await attachCountyStarRatings(await searchPlansDirect({ term, mode, state, county, limit }));
  } catch (error) {
    if (!markCmsUnavailable(error)) {
      debugLog("Plan lookup search error");
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
      debugLog("County counts RPC failed, falling back to direct query");
    }
  }

  try {
    return await fetchCountyPlanCountsDirect(state);
  } catch (fallbackError) {
    if (!markCmsUnavailable(fallbackError)) {
      debugLog("County plan counts error");
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
  if (String(row["Contract Year"]) !== "2027") {
    throw new Error("Rejected CMS plan outside PY2027");
  }
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
  const rawStars = row["Overall Star Rating"] || "";
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
    planYear: 2027,
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
    deductible: parseFloat(row["Annual Part D Deductible Amount"] || "") || null,
    countyFips: row["County FIPS"] || "",
    segmentId: row["Segment ID"] || "",
    dsnpIntegrationStatus: row["Dual Eligible SNP (D-SNP) Integration Status"] || "",
    dsnpAipIdentifier: row["D-SNP Applicable Integrated Plan (AIP) Identifier"] || "",
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
