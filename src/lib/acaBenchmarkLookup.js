import { supabase } from "./supabase";

/**
 * State-based exchange states with their own tables.
 * These don't have per-county premium data, so we return plan-level stats only.
 */
const SBE_TABLES = {
  NJ: "sbe_plans_nj_2025",
  PA: "sbe_plans_pa_2025",
  VA: "sbe_plans_va_2025",
};

function parseDollar(val) {
  if (!val || typeof val !== "string") return null;
  const n = parseFloat(val.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Look up ACA benchmark premiums for a given location.
 *
 * @param {string} stateCode — 2-letter state abbreviation
 * @param {string} [county]  — county name (required for FFE states)
 * @returns {Promise<{ silverBenchmark: number|null, cheapestBronze: number|null, silverCount: number, bronzeCount: number, source: string }|null>}
 */
export async function lookupAcaBenchmark(stateCode, county) {
  const st = (stateCode || "").toUpperCase().trim();
  if (!st) return null;

  try {
    if (SBE_TABLES[st]) {
      // SBE states don't have per-county premiums in the plans table.
      // Return deductible-based summary instead of premiums.
      const { data, error } = await supabase
        .from(SBE_TABLES[st])
        .select("metal_level, tehb_ded_inn_tier_1_individual, tehb_inn_tier_1_individual_moop")
        .eq("market_coverage", "Individual")
        .in("metal_level", ["Silver", "Bronze", "Expanded Bronze"]);

      if (error || !data?.length) return null;

      const silver = data.filter((r) => r.metal_level === "Silver");
      const bronze = data.filter((r) => r.metal_level === "Bronze" || r.metal_level === "Expanded Bronze");

      return {
        silverBenchmark: null, // no premium data in SBE plans tables
        cheapestBronze: null,
        silverCount: silver.length,
        bronzeCount: bronze.length,
        source: `SBE (${st}) — premium data not available in plan files`,
      };
    }

    // Federal exchange — query by state + county for Silver & Bronze premiums
    let query = supabase
      .from("qhp_landscape_2026")
      .select("metal_level, premium_adult_individual_age_27")
      .eq("state_code", st)
      .in("metal_level", ["Silver", "Bronze", "Expanded Bronze"]);

    if (county) {
      query = query.ilike("county_name", county.trim());
    }

    const { data, error } = await query;
    if (error || !data?.length) return null;

    // Parse premiums
    const silverPremiums = data
      .filter((r) => r.metal_level === "Silver")
      .map((r) => parseDollar(r.premium_adult_individual_age_27))
      .filter((n) => n !== null && n > 0)
      .sort((a, b) => a - b);

    const bronzePremiums = data
      .filter((r) => r.metal_level === "Bronze" || r.metal_level === "Expanded Bronze")
      .map((r) => parseDollar(r.premium_adult_individual_age_27))
      .filter((n) => n !== null && n > 0)
      .sort((a, b) => a - b);

    // Second-lowest Silver = the ACA benchmark for subsidy calculation
    const silverBenchmark = silverPremiums.length >= 2 ? silverPremiums[1] : silverPremiums[0] || null;
    const cheapestBronze = bronzePremiums[0] || null;

    return {
      silverBenchmark,
      cheapestBronze,
      silverCount: silverPremiums.length,
      bronzeCount: bronzePremiums.length,
      source: county ? `QHP ${st}, ${county}` : `QHP ${st}`,
    };
  } catch (err) {
    console.error("[acaBenchmarkLookup] Error:", err);
    return null;
  }
}

/**
 * Format benchmark data into a concise string for copilot prompt injection.
 */
export function formatBenchmarkForPrompt(benchmark) {
  if (!benchmark) return "";

  const lines = [`ACA BENCHMARK DATA (${benchmark.source}):`];

  if (benchmark.silverBenchmark) {
    lines.push(`  Second-lowest Silver premium (age 27): $${benchmark.silverBenchmark}/mo — this is the APTC benchmark`);
  }
  if (benchmark.cheapestBronze) {
    lines.push(`  Cheapest Bronze premium (age 27): $${benchmark.cheapestBronze}/mo`);
  }
  if (!benchmark.silverBenchmark && !benchmark.cheapestBronze) {
    lines.push(`  ${benchmark.silverCount} Silver plans, ${benchmark.bronzeCount} Bronze plans available (premium data not in file)`);
  }

  lines.push(
    "  Use this to frame the subsidy cliff: without enhanced PTCs, client pays full premium.",
    "  Compare to off-exchange product cost to make the value argument concrete."
  );

  return lines.join("\n");
}
