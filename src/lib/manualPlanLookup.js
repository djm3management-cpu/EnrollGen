import { CARRIERS } from "../data/sepCarriers";
import { PLAN_DB, getCountyFromZip, getPlansForState } from "../data/sepPlanDb";
import { getStateFromZip } from "./sepGeo";
import { searchCmsPlans, transformCmsPlan } from "./sepCms";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePlanNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveLookupArea(zipOrState) {
  const clean = String(zipOrState || "").trim();
  if (/^[A-Za-z]{2}$/.test(clean)) {
    return { state: clean.toUpperCase(), county: "", zip: "" };
  }

  if (/^\d{5}$/.test(clean)) {
    const state = getStateFromZip(clean);
    return {
      state: state && state !== "Unknown" ? state : "",
      county: getCountyFromZip(clean) || "",
      zip: clean,
    };
  }

  return { state: "", county: "", zip: "" };
}

function getSearchScopes(area) {
  const scopes = [];
  if (area.state && area.county) {
    scopes.push({ state: area.state, county: area.county, scope: "county" });
  }
  if (area.state) {
    scopes.push({ state: area.state, county: "", scope: "state" });
  }
  scopes.push({ state: "", county: "", scope: "national" });
  return scopes;
}

function makePlanKey(plan) {
  const state = Array.isArray(plan.states) ? plan.states[0] : "";
  return [
    plan.cid || "",
    plan.pbp || "",
    plan.name || "",
    state || "",
    plan.orgName || plan.carrier || "",
  ]
    .join("|")
    .toLowerCase();
}

function dedupePlans(plans) {
  const seen = new Set();
  const nextPlans = [];

  for (const plan of plans) {
    const key = makePlanKey(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    nextPlans.push(plan);
  }

  return nextPlans;
}

function planSearchScore(plan, term, mode, area) {
  const q = normalizeSearch(term);
  const compactQuery = normalizePlanNumber(term);
  const planNumber = normalizePlanNumber(formatPlanNumber(plan));
  const state = Array.isArray(plan.states) ? plan.states[0] : "";
  let score = 0;

  if (area.state && state === area.state) score += 20;
  if (area.county && plan.countyName === area.county) score += 15;

  if (mode === "number") {
    if (planNumber === compactQuery) score += 60;
    else if (compactQuery && planNumber.includes(compactQuery)) score += 35;
    if (normalizePlanNumber(plan.cid) === compactQuery) score += 20;
    if (normalizePlanNumber(plan.pbp) === compactQuery) score += 8;
    return score;
  }

  const name = normalizeSearch(plan.name);
  const org = normalizeSearch(plan.orgName || getPlanCarrierDisplay(plan));
  if (name === q) score += 60;
  else if (name.startsWith(q)) score += 40;
  else if (name.includes(q)) score += 20;
  if (org.includes(q)) score += 8;

  return score;
}

function filterFallbackPlans(term, mode, area) {
  const q = normalizeSearch(term);
  const compactQuery = normalizePlanNumber(term);
  const plans = area.state ? getPlansForState(area.state) : PLAN_DB;

  return plans
    .filter((plan) => {
      if (mode === "number") {
        const planNumber = normalizePlanNumber(formatPlanNumber(plan));
        return (
          planNumber.includes(compactQuery) ||
          normalizePlanNumber(plan.cid).includes(compactQuery) ||
          normalizePlanNumber(plan.pbp).includes(compactQuery)
        );
      }

      return [
        plan.name,
        plan.carrier,
        getPlanCarrierDisplay(plan),
        plan.type,
        plan.snp,
      ]
        .filter(Boolean)
        .some((value) => normalizeSearch(value).includes(q));
    })
    .map((plan) => ({
      ...plan,
      orgName: plan.orgName || getPlanCarrierDisplay(plan),
      countyName: plan.countyName || "",
      lookupSource: "fallback",
      lookupScope: area.state ? "state" : "national",
    }));
}

export function formatPlanNumber(plan) {
  const cid = String(plan?.cid || "").trim();
  const pbp = String(plan?.pbp || "").trim();
  return [cid, pbp].filter(Boolean).join("-");
}

export function getPlanCarrierDisplay(plan) {
  const carrier = CARRIERS[plan?.carrier] || null;
  return carrier?.name || plan?.orgName || plan?.carrier || "";
}

export function formatPlanPremium(plan) {
  if (plan?.prem === null || plan?.prem === undefined || plan?.prem === "") return "";
  const premium = Number(plan.prem);
  if (!Number.isFinite(premium)) return String(plan.prem);
  return premium === 0 ? "$0" : `$${premium.toFixed(2)}`;
}

export function buildPlanNotesFromLookup(plan) {
  const planNumber = formatPlanNumber(plan);
  const premium = formatPlanPremium(plan);
  const planType = [plan.type, plan.snp].filter(Boolean).join(" ");
  const state = Array.isArray(plan.states) ? plan.states[0] : "";
  const benefitPills = [
    premium ? `${premium} premium` : "",
    planType,
    plan.stars ? `${plan.stars} stars` : "",
    plan.moop ? `$${Number(plan.moop).toLocaleString()} MOOP` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    carrierName: getPlanCarrierDisplay(plan),
    planName: plan.name || "",
    planId: planNumber,
    planType,
    premium,
    benefitPills,
    planManualOverride: true,
    planContextSource: "manual",
    selectedPlanContext: {
      source: plan.lookupSource || "cms_py2026",
      scope: plan.lookupScope || "",
      planName: plan.name || "",
      carrierName: getPlanCarrierDisplay(plan),
      organizationName: plan.orgName || "",
      contractId: plan.cid || "",
      planId: plan.pbp || "",
      contractPlanId: planNumber,
      planType: plan.type || "",
      snpType: plan.snp || "",
      premium,
      moop: plan.moop || null,
      stars: plan.stars || null,
      state,
      countyName: plan.countyName || "",
      category: plan.cat || "",
    },
  };
}

export async function searchManualPlans({ term, mode = "name", zipOrState = "", limit = 8 } = {}) {
  const cleanTerm = String(term || "").trim();
  if (cleanTerm.length < 2) {
    return { plans: [], source: "empty", area: resolveLookupArea(zipOrState) };
  }

  const area = resolveLookupArea(zipOrState);
  const cmsPlans = [];

  for (const scope of getSearchScopes(area)) {
    const rows = await searchCmsPlans({
      term: cleanTerm,
      mode,
      state: scope.state,
      county: scope.county,
      limit: Math.max(limit * 3, 12),
    });

    cmsPlans.push(
      ...rows.map((row) => ({
        ...transformCmsPlan(row),
        lookupSource: "cms_py2026",
        lookupScope: scope.scope,
      }))
    );
  }

  const dedupedCmsPlans = dedupePlans(cmsPlans)
    .sort((a, b) => planSearchScore(b, cleanTerm, mode, area) - planSearchScore(a, cleanTerm, mode, area))
    .slice(0, limit);

  if (dedupedCmsPlans.length) {
    return { plans: dedupedCmsPlans, source: "cms_py2026", area };
  }

  const fallbackPlans = dedupePlans(filterFallbackPlans(cleanTerm, mode, area))
    .sort((a, b) => planSearchScore(b, cleanTerm, mode, area) - planSearchScore(a, cleanTerm, mode, area))
    .slice(0, limit);

  return { plans: fallbackPlans, source: "fallback", area };
}
